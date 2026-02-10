// src/server/devis.word.ts
import path from "path";
import fs from "fs";
import {
  AlignmentType,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  HeightRule,
} from "docx";
import { prisma } from "./db";

/** ✅ Dans certaines versions de docx, AlignmentType est une valeur (pas un type) */
type DocxAlignment = (typeof AlignmentType)[keyof typeof AlignmentType];

type BuildOptions = {
  useMajorations?: boolean; // ✅ applique majorations (MP + transport)
  useDevisSurcharges?: boolean; // ✅ applique surcharges devis par formule
};

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function fmtMoney2(x: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(x));
}

function fmtMoney0(x: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n(x));
}

function fmtDateFr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

function safeJsonParse(raw: any, fallback: any) {
  try {
    if (!raw) return fallback;
    if (typeof raw === "object") return raw;
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function roundTo5(x: number): number {
  const v = n(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v / 5) * 5;
}

function pricePerKg(prixTonne: number): number {
  const p = n(prixTonne);
  if (p <= 0) return 0;
  return p / 1000;
}

/** majorations stockées dans autresCouts.majorations (JSON string) */
function readMajorations(variant: any): Record<string, number> {
  const raw = variant?.autresCouts?.majorations;
  const obj = safeJsonParse(raw, {});
  return obj && typeof obj === "object" ? obj : {};
}
function getMajPct(key: string, maj: Record<string, number>): number {
  if (!maj) return 0;
  if (key in maj) return n((maj as any)[key]);
  return 0;
}
function applyMaj(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

/** surcharges devis (JSON map) stockées dans devis.surcharges */
function readDevisSurcharges(variant: any): Record<string, number> {
  const raw = (variant?.devis as any)?.surcharges;
  const obj = safeJsonParse(raw, {});
  const map = (obj?.surcharges ?? obj) as any;
  return map && typeof map === "object" ? map : {};
}

function getSurchargeM3(row: any, map: Record<string, number>): number {
  const keys = [
    String(row?.id ?? ""),
    String(row?.variantFormuleId ?? ""),
    String(row?.formuleId ?? ""),
    String(row?.formule?.id ?? ""),
    String(row?.formule?.label ?? ""),
  ].filter((k) => k && k !== "undefined" && k !== "null");

  for (const k of keys) {
    if (k in map) return n((map as any)[k]);
  }
  return 0;
}

/* =========================
   DOC HELPERS (Tahoma 9)
========================= */

const FONT = "Tahoma";
const SIZE_9 = 18; // docx = half-points (9pt => 18)
const ROW_HEIGHT = 360; // ✅ twips (~18pt) => lignes du tableau un peu plus hautes

function pTxt(text: string, opts?: { bold?: boolean; align?: DocxAlignment }) {
  return new Paragraph({
    alignment: opts?.align,
    children: [
      new TextRun({
        text: text ?? "",
        bold: !!opts?.bold,
        font: FONT,
        size: SIZE_9,
      }),
    ],
  });
}

function blank(lines = 1) {
  // des paragraphes vides pour créer l'espace (stable dans Word)
  return Array.from({ length: Math.max(1, lines) }).map(
    () =>
      new Paragraph({
        children: [new TextRun({ text: "", font: FONT, size: SIZE_9 })],
      })
  );
}

function sectionTitle(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: FONT, size: SIZE_9 })],
  });
}

function bulletsFromStrings(lines: string[]) {
  return (lines ?? [])
    .filter((x) => String(x ?? "").trim().length > 0)
    .map(
      (t) =>
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: String(t ?? ""), font: FONT, size: SIZE_9 })],
        })
    );
}

/**
 * ✅ robuste contre: string[] OU object[] (sinon tu as [object Object])
 * On reconstruit des phrases "comme l'onglet contenu" (au moins lisible et stable).
 */
function normalizeLines(raw: any): string[] {
  const arr = safeJsonParse(raw, []);
  if (!Array.isArray(arr)) return [];

  return arr
    .map((it) => {
      if (typeof it === "string") return it;

      if (it && typeof it === "object") {
        const text = (it as any).text ?? (it as any).label ?? (it as any).name ?? (it as any).titre;
        const value = (it as any).value ?? (it as any).valeur ?? (it as any).amount ?? (it as any).montant;
        const unit = (it as any).unit ?? (it as any).unite ?? "";

        if (typeof text === "string" && text.trim() && (value === undefined || value === null || value === "")) {
          return text.trim();
        }

        if (typeof text === "string" && text.trim() && value !== undefined) {
          const vNum = n(value);
          const vStr = Number.isFinite(vNum) ? fmtMoney0(vNum) : String(value);
          const uStr = unit ? ` ${String(unit)}` : "";
          return `${text.trim()} : ${vStr}${uStr}`.trim();
        }

        try {
          return JSON.stringify(it);
        } catch {
          return String(it);
        }
      }

      return "";
    })
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
}

export async function buildDevisWordBuffer(variantId: string, opts?: BuildOptions): Promise<Buffer> {
  const useMajorations = opts?.useMajorations !== undefined ? !!opts.useMajorations : true;
  const useDevisSurcharges = opts?.useDevisSurcharges !== undefined ? !!opts.useDevisSurcharges : true;

  // ⚠️ any pour ne pas bloquer si tes types Prisma ne reflètent pas encore devis.*
  const v: any = await prisma.variant.findUnique({
    where: { id: variantId },
    include: {
      contract: { include: { pnl: true } },
      transport: true,
      autresCouts: true,
      mp: { include: { items: { include: { mp: true } } } },
      variantFormules: { include: { formule: { include: { items: { include: { mp: true } } } } } },
      devis: true,
    },
  });

  if (!v) throw new Error("Variante introuvable");

  const c: any = v.contract;
  const p: any = c?.pnl;

  const now = new Date();
  const date = fmtDateFr(now);

  const ville = String(p?.city ?? "");
  const pnlTitle = String(p?.title ?? "Offre de prix");
  const client = String(p?.client ?? "");

  const demarrage = p?.startDate ? fmtDateFr(new Date(p.startDate)) : "";
  const dureeMois = n(c?.dureeMois ?? 0);

  const rows = (v?.variantFormules ?? []) as any[];
  const volumeTotal = rows.reduce((s, r) => s + n(r?.volumeM3), 0);

  const devisMeta = safeJsonParse((v?.devis as any)?.meta, {});
  const intro =
    typeof (v?.devis as any)?.intro === "string" && (v.devis as any).intro.trim()
      ? String((v.devis as any).intro)
      : `Nous vous prions de trouver ci-dessous les détails de notre offre de prix pour "${pnlTitle}".`;

  const rappel = safeJsonParse((v?.devis as any)?.rappel, {});
  const dureeQuantiteTexte =
    typeof rappel?.dureeQuantiteTexte === "string" && rappel.dureeQuantiteTexte.trim()
      ? rappel.dureeQuantiteTexte
      : `Les prix sont donnés pour un volume de ${fmtMoney0(volumeTotal)} m3 et une durée de ${fmtMoney0(
          dureeMois
        )} mois. En aucun cas les volumes réalisés ne devront être inférieurs de plus de 90% du volume susmentionné.`;

  const validiteTexte =
    typeof (v?.devis as any)?.validiteTexte === "string" && (v.devis as any).validiteTexte.trim()
      ? String((v.devis as any).validiteTexte)
      : "Offre valable pour une durée d’un mois à partir de sa date d’envoi.";

  // ✅ LECTURE ROBUSTE (string[] OU object[])
  const chargeFournisseur = normalizeLines((v?.devis as any)?.chargeFournisseur);
  const chargeClient = normalizeLines((v?.devis as any)?.chargeClient);
  const prixComplementaires = normalizeLines((v?.devis as any)?.prixComplementaires);

  const sig = safeJsonParse((v?.devis as any)?.signature, {});
  const sigNom = String(sig?.nom ?? "Saad LAHLIMI");
  const sigPoste = String(sig?.poste ?? "Commercial P&L");
  const sigTel = String(sig?.telephone ?? "+212701888888");

  // --- Hydrofuge (meta) (si présent)
  const hydroPu = n(devisMeta?.hydrofugePuM3 ?? 0);
  const hydroQty = n(devisMeta?.hydrofugeQtyM3 ?? 0);

  // --- Calcul prix (CMP + transport + MOMD) + majorations + surcharge devis
  const maj = readMajorations(v);
  const surMap = readDevisSurcharges(v);

  function mpPrixUsed(mpId: string): number {
    const mpItems = v?.mp?.items ?? [];
    const found = mpItems.find((x: any) => String(x?.mpId) === String(mpId));
    if (!found) return 0;
    if (found?.prixOverride != null) return n(found.prixOverride);
    if (found?.prix != null) return n(found.prix);
    return n(found?.mp?.prix);
  }

  function cmpFormuleM3(formule: any): number {
    const compo = formule?.items ?? [];
    return (compo ?? []).reduce((s: number, it: any) => {
      const mpId = String(it?.mpId ?? "");
      const qtyKg = n(it?.qty);
      const prixT = mpPrixUsed(mpId);
      const prixKgBase = pricePerKg(prixT);

      // ✅ majorations MP uniquement si activées
      const pctMp = useMajorations ? getMajPct(`mp:${mpId}`, maj) : 0;
      const prixKg = applyMaj(prixKgBase, pctMp);

      return s + qtyKg * prixKg;
    }, 0);
  }

  const transportBase = n(v?.transport?.prixMoyen ?? 0);
  const transportUsed = useMajorations ? applyMaj(transportBase, getMajPct("transport.prixMoyen", maj)) : transportBase;

  const tableLines: Array<{ label: string; pu: number; vol: number; total: number }> = rows.map((r: any) => {
    const label = String(r?.formule?.label ?? "—");
    const vol = n(r?.volumeM3);
    const momd = n(r?.momd ?? 0);
    const cmp = cmpFormuleM3(r?.formule);

    const pv = cmp + transportUsed + momd;
    const pvArr = roundTo5(pv);

    const surcharge = useDevisSurcharges ? getSurchargeM3(r, surMap) : 0;
    const pu = pvArr + surcharge;

    return { label, pu, vol, total: pu * vol };
  });

  if (hydroPu > 0 && hydroQty > 0) {
    tableLines.push({ label: "Plus value Hydrofuge", pu: hydroPu, vol: hydroQty, total: hydroPu * hydroQty });
  }

  const totalHT = tableLines.reduce((s, x) => s + n(x.total), 0);
  const tva = totalHT * 0.2;
  const totalTTC = totalHT + tva;

  // --- Logo (plus grand surtout en hauteur)
  let logoPara: Paragraph | null = null;
  try {
    const logoPath = path.resolve(process.cwd(), "src/assets/LHM_logo.jpg");
    if (fs.existsSync(logoPath)) {
      const imgBuf = fs.readFileSync(logoPath);
      const imgData = new Uint8Array(imgBuf);

      logoPara = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: imgData,
            type: "jpg",
            transformation: { width: 180, height: 95 },
          }),
        ],
      });
    }
  } catch {
    logoPara = null;
  }

  // --- Table (proche du modèle)
  const headerRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      new TableCell({ children: [pTxt("Désignation", { bold: true })] }),
      new TableCell({ children: [pTxt("PU HT/m3", { bold: true, align: AlignmentType.RIGHT })] }),
      new TableCell({ children: [pTxt("Volume", { bold: true, align: AlignmentType.RIGHT })] }),
      new TableCell({ children: [pTxt("Montant HT", { bold: true, align: AlignmentType.RIGHT })] }),
    ],
  });

  const bodyRows = tableLines.map(
    (x) =>
      new TableRow({
        height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({ children: [pTxt(x.label)] }),
          new TableCell({ children: [pTxt(fmtMoney2(x.pu), { align: AlignmentType.RIGHT })] }),
          new TableCell({ children: [pTxt(fmtMoney2(x.vol), { align: AlignmentType.RIGHT })] }),
          new TableCell({ children: [pTxt(fmtMoney2(x.total), { align: AlignmentType.RIGHT })] }),
        ],
      })
  );

  const footRows = [
    new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({ children: [pTxt("Total :", { bold: true })] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt(fmtMoney2(totalHT), { bold: true, align: AlignmentType.RIGHT })] }),
      ],
    }),
    new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({ children: [pTxt("Montant TVA", { bold: true })] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt(fmtMoney2(tva), { bold: true, align: AlignmentType.RIGHT })] }),
      ],
    }),
    new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({ children: [pTxt("Montant TTC", { bold: true })] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt(fmtMoney2(totalTTC), { bold: true, align: AlignmentType.RIGHT })] }),
      ],
    }),
  ];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows, ...footRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
    },
  });

  // ✅ LE "headerLine" doit être un pied de page (footer)
  const footerLine = `${pnlTitle} - offre de prix - ${date}`;

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: footerLine, font: FONT, size: SIZE_9 })],
              }),
            ],
          }),
        },
        children: [
          ...(logoPara ? [logoPara, ...blank(1)] : []),

          // Ville/Date à droite
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${ville}, le ${date}`, font: FONT, size: SIZE_9 })],
          }),

          // ✅ plus d'espace entre date ... et "Offre de prix ..."
          ...blank(2),

          // ✅ Titre centré avec retour à la ligne entre "Offre de prix" et le nom du P&L
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Offre de prix", bold: true, font: FONT, size: SIZE_9 }),
              new TextRun({ break: 1, text: pnlTitle, bold: true, font: FONT, size: SIZE_9 }),
            ],
          }),

          // ✅ espace entre "offre de prix ...." et "Client..."
          ...blank(1),

          // ✅ Client aligné à gauche: "Client: xxxx" en gras
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: client ? `Client: ${client}` : "Client: —",
                bold: true,
                font: FONT,
                size: SIZE_9,
              }),
            ],
          }),

          ...blank(1),

          // Intro
          pTxt(intro),

          ...blank(1),

          // Rappel
          sectionTitle("Rappel des données du projet :"),
          ...bulletsFromStrings([
            `Quantité : ${fmtMoney0(volumeTotal)} m3`,
            `Délai : ${fmtMoney0(dureeMois)} mois`,
            ...(demarrage ? [`Démarrage : ${demarrage}`] : []),
            ...(ville ? [`Lieu : ${ville}`] : []),
          ]),

          ...blank(1),

          // Charges
          sectionTitle("A la charge de LafargeHolcim Maroc :"),
          ...(chargeFournisseur.length ? bulletsFromStrings(chargeFournisseur) : bulletsFromStrings(["—"])),

          ...blank(1),

          sectionTitle("A la charge du client :"),
          ...(chargeClient.length ? bulletsFromStrings(chargeClient) : bulletsFromStrings(["—"])),

          ...blank(1),

          // Table prix
          table,

          ...blank(1),

          // Prix complémentaires
          sectionTitle("Prix complémentaires :"),
          ...(prixComplementaires.length ? bulletsFromStrings(prixComplementaires) : bulletsFromStrings(["—"])),

          ...blank(1),

          // Durée-Quantité
          sectionTitle("Durée - Quantité :"),
          pTxt(dureeQuantiteTexte),

          ...blank(1),

          // Validité
          sectionTitle("Validité de l’offre :"),
          pTxt(validiteTexte),

          // ✅ Signature: alignée à gauche + un peu plus bas
          ...blank(3),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigNom, bold: true, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigPoste, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigTel, font: FONT, size: SIZE_9 })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
