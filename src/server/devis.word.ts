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
} from "docx";
import { prisma } from "./db";

/** ✅ Dans certaines versions de docx, AlignmentType est une valeur (pas un type) */
type DocxAlignment = (typeof AlignmentType)[keyof typeof AlignmentType];

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

/** ✅ array tolerant JSON parse */
function parseJsonArray<T = any>(raw: any): T[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * ✅ Normalize devis line items from DB:
 * accepts:
 * - ["texte..."]
 * - [{label:"texte..."}, {text:"..."}, {value:"..."}]
 * - mixed
 */
function normalizeDevisLines(raw: any): string[] {
  const arr = Array.isArray(raw) ? raw : parseJsonArray<any>(raw);
  const out: string[] = [];

  for (const it of arr) {
    if (typeof it === "string") {
      const t = it.trim();
      if (t) out.push(t);
      continue;
    }
    if (it && typeof it === "object") {
      const label = String((it as any).label ?? (it as any).text ?? (it as any).value ?? "").trim();
      if (label) out.push(label);
      continue;
    }
  }
  return out;
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

/** majorations stockées (chez toi) dans autresCouts.majorations (JSON string) */
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
  ].filter((k) => k && k !== "undefined" && k !== "null");

  for (const k of keys) {
    if (k in map) return n((map as any)[k]);
  }
  return 0;
}

/** ====== TYPO ====== */
const FONT = "Tahoma";
const SIZE = 18; // 9pt (docx = half-points)

function run(text: string, opts?: { bold?: boolean }) {
  return new TextRun({
    text: text ?? "",
    bold: !!opts?.bold,
    font: FONT,
    size: SIZE,
  });
}

function pTxt(
  text: string,
  opts?: {
    bold?: boolean;
    align?: DocxAlignment;
  }
) {
  return new Paragraph({
    alignment: opts?.align,
    children: [run(text ?? "", { bold: !!opts?.bold })],
  });
}

function blank(lines = 1) {
  const out: Paragraph[] = [];
  for (let i = 0; i < lines; i++) out.push(new Paragraph({ children: [run("")] }));
  return out;
}

function bullets(lines: string[]) {
  return (lines ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map(
      (t) =>
        new Paragraph({
          bullet: { level: 0 },
          children: [run(t)],
        })
    );
}

function sectionTitle(text: string) {
  return new Paragraph({
    children: [run(text, { bold: true })],
  });
}

/** fallback phrases (si l’utilisateur n’a rien mis dans l’onglet Contenu) */
function defaultPrixComplementaires(contract: any): string[] {
  const sunday = n(contract?.sundayPrice);
  const chiller = n(contract?.chillerRent);
  const penalty = n(contract?.delayPenalty);

  // ✅ Phrases complètes (comme tu veux sur l’onglet contenu)
  const out: string[] = [];

  out.push(
    sunday > 0
      ? `Ouverture en dehors des horaires : ${fmtMoney0(sunday)} DHS HT / poste.`
      : `Ouverture en dehors des horaires : 5 000 DHS HT / poste.`
  );

  if (chiller > 0) out.push(`Location chiller : forfait mensuel de ${fmtMoney0(chiller)} MAD HT.`);
  if (penalty > 0) out.push(`Pénalité dépassement délai : ${fmtMoney0(penalty)} MAD HT.`);

  return out;
}

export async function buildDevisWordBuffer(variantId: string): Promise<Buffer> {
  const v: any = await prisma.variant.findUnique({
    where: { id: variantId },
    include: {
      contract: { include: { pnl: true } },
      transport: true,
      autresCouts: true,
      mp: { include: { items: { include: { mp: true } } } },
      variantFormules: {
        include: {
          formule: { include: { items: { include: { mp: true } } } },
        },
      },
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
  const volumeTotalFromFormules = rows.reduce((s, r) => s + n(r?.volumeM3), 0);

  const devis = v?.devis ?? null;

  const devisMeta = safeJsonParse((devis as any)?.meta, {});
  // ✅ toggles de calcul (à brancher sur UI)
  const useMajorations = devisMeta?.useMajorations === undefined ? true : Boolean(devisMeta.useMajorations);
  const useDevisSurcharges =
    devisMeta?.useDevisSurcharges === undefined ? true : Boolean(devisMeta.useDevisSurcharges);

  const intro =
    typeof (devis as any)?.intro === "string" && String((devis as any).intro).trim()
      ? String((devis as any).intro)
      : `Nous vous prions de trouver ci-dessous les détails de notre offre de prix pour "${pnlTitle}".`;

  const rappel = safeJsonParse((devis as any)?.rappel, {});
  const quantiteM3 = n(rappel?.quantiteM3) || volumeTotalFromFormules;
  const dureeMoisRappel = n(rappel?.dureeMois) || dureeMois;
  const demarrageRappel = String(rappel?.demarrage ?? demarrage ?? "");
  const lieuRappel = String(rappel?.lieu ?? ville ?? "");

  // ✅ Texte complet (si tu l’ajoutes en DB un jour, sinon fallback)
  const dureeQuantiteTexte =
    typeof (devis as any)?.dureeQuantiteTexte === "string" && String((devis as any).dureeQuantiteTexte).trim()
      ? String((devis as any).dureeQuantiteTexte)
      : `Les prix sont donnés pour un volume de ${fmtMoney0(quantiteM3)} m3 et une durée de ${fmtMoney0(
          dureeMoisRappel
        )} mois. En aucun cas les volumes réalisés ne devront être inférieurs de plus de 90% du volume susmentionné.`;

  const validiteTexte =
    typeof (devis as any)?.validiteTexte === "string" && String((devis as any).validiteTexte).trim()
      ? String((devis as any).validiteTexte)
      : "Offre valable pour une durée d’un mois à partir de sa date d’envoi.";

  // ✅ FIX: bullets proprement depuis DB (onglet Contenu)
  const chargeFournisseur = normalizeDevisLines((devis as any)?.chargeFournisseur);
  const chargeClient = normalizeDevisLines((devis as any)?.chargeClient);

  // ✅ prixComplementaires DOIT venir de DB si existe (phrases complètes)
  const prixComplementairesFromDb = normalizeDevisLines((devis as any)?.prixComplementaires);
  const prixComplementaires =
    prixComplementairesFromDb.length > 0 ? prixComplementairesFromDb : defaultPrixComplementaires(c);

  const sig = safeJsonParse((devis as any)?.signature, {});
  const sigNom = String(sig?.nom ?? "Saad LAHLIMI");
  const sigPoste = String(sig?.poste ?? "Commercial P&L");
  const sigTel = String(sig?.telephone ?? "+212701888888");

  // --- Hydrofuge (meta) (si présent)
  const hydroPu = n(devisMeta?.hydrofugePuM3 ?? 0);
  const hydroQty = n(devisMeta?.hydrofugeQtyM3 ?? 0);

  // --- Calcul prix selon choix (majorations / surcharges devis)
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

      // ✅ appliquer majorations MP seulement si activées
      const prixKg = useMajorations ? applyMaj(prixKgBase, getMajPct(`mp:${mpId}`, maj)) : prixKgBase;

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

  // --- Logo (plus grand surtout hauteur)
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
            transformation: { width: 190, height: 90 }, // ✅ plus grand (hauteur surtout)
          }),
        ],
      });
    }
  } catch {
    logoPara = null;
  }

  // --- Table (style proche du modèle)
  const headerRow = new TableRow({
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
      children: [
        new TableCell({ children: [pTxt("Total :", { bold: true })] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt(fmtMoney2(totalHT), { bold: true, align: AlignmentType.RIGHT })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [pTxt("Montant TVA", { bold: true })] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt("")] }),
        new TableCell({ children: [pTxt(fmtMoney2(tva), { bold: true, align: AlignmentType.RIGHT })] }),
      ],
    }),
    new TableRow({
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
  });

  // ✅ “en-tête” en pied de page
  const footerLine = `${pnlTitle} - offre de prix - ${date}`;

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE },
          paragraph: {
            spacing: { after: 80 }, // petit spacing lisible
          },
        },
      },
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [run(footerLine)],
              }),
            ],
          }),
        },
        children: [
          ...(logoPara ? [logoPara, ...blank(1)] : []),

          // Ville/Date à droite
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(`${ville}, le ${date}`)],
          }),

          ...blank(1),

          // ✅ Titre centré (retour ligne obligatoire)
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run("Offre de prix", { bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run(pnlTitle, { bold: true })],
          }),

          // ✅ Client à droite (format exact)
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(`Client: ${client}`, { bold: true })],
          }),

          ...blank(1),

          // Intro
          pTxt(intro),

          ...blank(1),

          // Rappel
          sectionTitle("Rappel des données du projet :"),
          ...bullets([
            `Quantité : ${fmtMoney0(quantiteM3)} m3`,
            `Délai : ${fmtMoney0(dureeMoisRappel)} mois`,
            ...(demarrageRappel ? [`Démarrage : ${demarrageRappel}`] : []),
            ...(lieuRappel ? [`Lieu : ${lieuRappel}`] : []),
          ]),

          ...blank(1),

          // ✅ Charges (visuel comme avant)
          sectionTitle("A la charge de LafargeHolcim Maroc :"),
          ...(chargeFournisseur.length ? bullets(chargeFournisseur) : bullets(["—"])),

          ...blank(1),

          sectionTitle("A la charge du client :"),
          ...(chargeClient.length ? bullets(chargeClient) : bullets(["—"])),

          ...blank(1),

          // Table prix
          table,

          ...blank(1),

          // ✅ Prix complémentaires (toujours phrases complètes)
          sectionTitle("Prix complémentaires :"),
          ...(prixComplementaires.length ? bullets(prixComplementaires) : bullets(["—"])),

          ...blank(1),

          // Durée-Quantité
          sectionTitle("Durée - Quantité :"),
          pTxt(dureeQuantiteTexte),

          ...blank(1),

          // Validité
          sectionTitle("Validité de l’offre :"),
          pTxt(validiteTexte),

          // ✅ Espace avant signature (comme demandé)
          ...blank(2),

          // ✅ Signature: retour ligne après chaque info + à droite
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(sigNom, { bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(sigPoste)],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(sigTel)],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
