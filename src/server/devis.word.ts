// src/server/devis.word.ts
import path from "path";
import fs from "fs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
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
const SIZE_9 = 18; // 9pt
const ROW_HEIGHT = 360;

// ✅ Tableau: body + totaux en Arial 10 (sauf header)
const TABLE_BODY_FONT = "Arial";
const SIZE_10 = 20; // 10pt

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

function pTxtBody(text: string, opts?: { bold?: boolean; align?: DocxAlignment }) {
  return new Paragraph({
    alignment: opts?.align,
    children: [
      new TextRun({
        text: text ?? "",
        bold: !!opts?.bold,
        font: TABLE_BODY_FONT,
        size: SIZE_10,
      }),
    ],
  });
}

function blank(lines = 1) {
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

// ✅ Puces cercle vide SANS décalage: numbering personnalisé (○) + indent fixe
const HOLLOW_BULLET_REF = "HOLLOW_BULLET";

function bulletsFromStrings(lines: string[]) {
  return (lines ?? [])
    .filter((x) => String(x ?? "").trim().length > 0)
    .map(
      (t) =>
        new Paragraph({
          numbering: { reference: HOLLOW_BULLET_REF, level: 0 },
          children: [new TextRun({ text: String(t ?? ""), font: FONT, size: SIZE_9 })],
        })
    );
}

/**
 * ✅ robuste contre: string[] OU object[]
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

/* =========================
   ✅ EXTRA ARTICLES (hors formules) -> lignes du tableau
========================= */
type ExtraArticleNorm = { label: string; pu: number; qty: number }; // qty<=0 => afficher "-" et pas de total

function normalizeExtraArticles(raw: any): ExtraArticleNorm[] {
  const arr = safeJsonParse(raw, []);
  if (!Array.isArray(arr)) return [];

  const out: ExtraArticleNorm[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;

    const label =
      String(
        (it as any).label ??
          (it as any).libelle ??
          (it as any).designation ??
          (it as any).name ??
          (it as any).titre ??
          ""
      ).trim();

    if (!label) continue;

    const pu = n((it as any).puM3 ?? (it as any).pu ?? (it as any).prix ?? (it as any).price ?? 0);
    const qty = n((it as any).qtyM3 ?? (it as any).qty ?? (it as any).volume ?? (it as any).qte ?? 0);

    // si pu=0 on garde quand même (tu peux vouloir une ligne visible), mais total sera "-"
    out.push({ label, pu, qty });
  }

  return out;
}

function buildLogoHeader(): Header | null {
  try {
    const logoPath = path.resolve(process.cwd(), "src/assets/LHM_logo.jpg");
    if (!fs.existsSync(logoPath)) return null;

    const imgBuf = fs.readFileSync(logoPath);
    const imgData = new Uint8Array(imgBuf);

    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: imgData,
              type: "jpg",
              transformation: { width: 180, height: 95 },
            }),
          ],
        }),
        ...blank(1),
      ],
    });
  } catch {
    return null;
  }
}

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "C0C0C0" },
};

// ✅ Bordures "OFF" (pour masquer la zone colonnes 1-2 sur TVA/TTC)
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

// ✅ helper cellule centrée verticalement
function cell(
  children: Paragraph[],
  opts?: {
    columnSpan?: number;
    borders?: any;
  }
) {
  return new TableCell({
    children,
    columnSpan: opts?.columnSpan,
    verticalAlign: VerticalAlign.CENTER, // ✅ centrage vertical
    borders: opts?.borders,
  });
}

export async function buildDevisWordBuffer(variantId: string, opts?: BuildOptions): Promise<Buffer> {
  const useMajorations = opts?.useMajorations !== undefined ? !!opts.useMajorations : true;
  const useDevisSurcharges = opts?.useDevisSurcharges !== undefined ? !!opts.useDevisSurcharges : true;

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

  const chargeFournisseur = normalizeLines((v?.devis as any)?.chargeFournisseur);
  const chargeClient = normalizeLines((v?.devis as any)?.chargeClient);
  const prixComplementaires = normalizeLines((v?.devis as any)?.prixComplementaires);

  const sig = safeJsonParse((v?.devis as any)?.signature, {});
  const sigNom = String(sig?.nom ?? "Saad LAHLIMI");
  const sigPoste = String(sig?.poste ?? "Commercial P&L");
  const sigTel = String(sig?.telephone ?? "+212701888888");

  // ✅ Extra articles: priorité à devis.extraArticles sinon fallback meta.extraArticles
  const extraArticles = normalizeExtraArticles((v?.devis as any)?.extraArticles ?? devisMeta?.extraArticles ?? []);

  const hydroPu = n(devisMeta?.hydrofugePuM3 ?? 0);
  const hydroQty = n(devisMeta?.hydrofugeQtyM3 ?? 0);

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

      const pctMp = useMajorations ? getMajPct(`mp:${mpId}`, maj) : 0;
      const prixKg = applyMaj(prixKgBase, pctMp);

      return s + qtyKg * prixKg;
    }, 0);
  }

  const transportBase = n(v?.transport?.prixMoyen ?? 0);
  const transportUsed = useMajorations ? applyMaj(transportBase, getMajPct("transport.prixMoyen", maj)) : transportBase;

  // ✅ qty===0 => afficher "-" sur volume/montant et ne pas compter dans totalHT
  const tableLines: Array<{ label: string; pu: number; vol: number; total: number; isDash?: boolean }> = rows.map(
    (r: any) => {
      const label = String(r?.formule?.label ?? "—");
      const vol = n(r?.volumeM3);
      const momd = n(r?.momd ?? 0);
      const cmp = cmpFormuleM3(r?.formule);

      const pv = cmp + transportUsed + momd;
      const pvArr = roundTo5(pv);

      const surcharge = useDevisSurcharges ? getSurchargeM3(r, surMap) : 0;
      const pu = pvArr + surcharge;

      return { label, pu, vol, total: pu * vol, isDash: false };
    }
  );

  // (Optionnel) ancienne hydrofuge via meta (si tu le gardes)
  if (hydroPu > 0) {
    // si hydroQty <= 0 => dash (comme ton exemple)
    const isDash = !(hydroQty > 0);
    tableLines.push({
      label: "Plus value Hydrofuge",
      pu: hydroPu,
      vol: hydroQty > 0 ? hydroQty : 0,
      total: hydroQty > 0 ? hydroPu * hydroQty : 0,
      isDash,
    });
  }

  // ✅ injection extra articles (hors formules)
  for (const x of extraArticles) {
    const isDash = !(x.qty > 0);
    tableLines.push({
      label: x.label,
      pu: x.pu,
      vol: x.qty > 0 ? x.qty : 0,
      total: x.qty > 0 ? x.pu * x.qty : 0,
      isDash,
    });
  }

  // ✅ totaux uniquement sur lignes "réelles" (vol>0)
  const totalHT = tableLines.reduce((s, x) => s + (x.vol > 0 ? n(x.total) : 0), 0);
  const tva = totalHT * 0.2;
  const totalTTC = totalHT + tva;

  // =========================
  // TABLE (4 colonnes)
  // =========================
  const headerRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxt("Désignation", { bold: true })]),
      cell([pTxt("PU HT/m3", { bold: true, align: AlignmentType.RIGHT })]),
      cell([pTxt("Volume", { bold: true, align: AlignmentType.RIGHT })]),
      cell([pTxt("Montant HT", { bold: true, align: AlignmentType.RIGHT })]),
    ],
  });

  const bodyRows = tableLines.map((x) => {
    const volTxt = x.isDash ? "-" : fmtMoney2(x.vol);
    const totTxt = x.isDash ? "-" : fmtMoney2(x.total);

    return new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxtBody(x.label)]),
        cell([pTxtBody(fmtMoney2(x.pu), { align: AlignmentType.RIGHT })]),
        cell([pTxtBody(volTxt, { align: AlignmentType.RIGHT })]),
        cell([pTxtBody(totTxt, { align: AlignmentType.RIGHT })]),
      ],
    });
  });

  // ✅ Total : libellé gras / chiffres non gras
  const totalRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("Total :", { bold: true, align: AlignmentType.CENTER })], { columnSpan: 2 }),
      cell([pTxtBody(fmtMoney2(volumeTotal), { bold: false, align: AlignmentType.RIGHT })]),
      cell([pTxtBody(fmtMoney2(totalHT), { bold: false, align: AlignmentType.RIGHT })]),
    ],
  });

  // ✅ TVA/TTC : continuité colonnes 3-4
  // ✅ Et bordures supprimées sur la zone colonnes 1-2 (cellule fusionnée)
  const tvaRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS }),
      cell([pTxtBody("Montant TVA", { bold: true, align: AlignmentType.LEFT })]),
      cell([pTxtBody(fmtMoney2(tva), { bold: false, align: AlignmentType.RIGHT })]),
    ],
  });

  const ttcRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS }),
      cell([pTxtBody("Montant TTC", { bold: true, align: AlignmentType.LEFT })]),
      cell([pTxtBody(fmtMoney2(totalTTC), { bold: false, align: AlignmentType.RIGHT })]),
    ],
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows, totalRow, tvaRow, ttcRow],
    borders: TABLE_BORDERS,
  });

  const footerLine = `${pnlTitle} - offre de prix - ${date}`;
  const logoHeader = buildLogoHeader();

  const doc = new Document({
    // ✅ numbering "cercle vide" avec indent stable (pas de décalage à droite)
    numbering: {
      config: [
        {
          reference: HOLLOW_BULLET_REF,
          levels: [
            {
              level: 0,
              format: "bullet",
              text: "○",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 360 }, // ✅ indent stable (~0,63cm)
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        headers: logoHeader
          ? {
              default: logoHeader,
              first: logoHeader,
              even: logoHeader,
            }
          : undefined,
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
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${ville}, le ${date}`, font: FONT, size: SIZE_9 })],
          }),

          ...blank(3),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Offre de prix", bold: true, font: FONT, size: SIZE_9 }),
              new TextRun({ break: 1, text: pnlTitle, bold: true, font: FONT, size: SIZE_9 }),
            ],
          }),

          ...blank(2),

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

          pTxt(intro),

          ...blank(1),

          sectionTitle("Rappel des données du projet :"),
          ...bulletsFromStrings([
            `Quantité : ${fmtMoney0(volumeTotal)} m3`,
            `Délai : ${fmtMoney0(dureeMois)} mois`,
            ...(demarrage ? [`Démarrage : ${demarrage}`] : []),
            ...(ville ? [`Lieu : ${ville}`] : []),
          ]),

          ...blank(1),

          sectionTitle("A la charge de LafargeHolcim Maroc :"),
          ...(chargeFournisseur.length ? bulletsFromStrings(chargeFournisseur) : bulletsFromStrings(["—"])),

          ...blank(1),

          sectionTitle("A la charge du client :"),
          ...(chargeClient.length ? bulletsFromStrings(chargeClient) : bulletsFromStrings(["—"])),

          ...blank(1),

          // ✅ Titre du tableau des prix
          sectionTitle("Prix :"),
          ...blank(1),

          table,

          ...blank(1),

          sectionTitle("Prix complémentaires :"),
          ...(prixComplementaires.length ? bulletsFromStrings(prixComplementaires) : bulletsFromStrings(["—"])),

          ...blank(1),

          sectionTitle("Durée - Quantité :"),
          pTxt(dureeQuantiteTexte),

          ...blank(1),

          sectionTitle("Validité de l’offre :"),
          pTxt(validiteTexte),

          ...blank(5),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigNom, bold: true, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigPoste, bold: true, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigTel, bold: true, font: FONT, size: SIZE_9 })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
