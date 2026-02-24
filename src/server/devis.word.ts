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
  LineRuleType,
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

/* =========================
   ✅ ARRONDIS TABLE (cohérence affichage)
   - PU affiché = round2
   - Volume affiché = round2
   - Total affiché = round2(PU_affiché × Volume_affiché)
========================= */
function round2(x: any): number {
  return Math.round((n(x) + Number.EPSILON) * 100) / 100;
}
function mul2(a: any, b: any): number {
  const aa = round2(a);
  const bb = round2(b);
  return round2(aa * bb);
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
   ✅ Interligne global ~ 1,1
========================= */

const FONT = "Tahoma";
const SIZE_9 = 18; // 9pt
const ROW_HEIGHT = 360;

// ✅ Tableau: body + totaux en Arial 10 (sauf header)
const TABLE_BODY_FONT = "Arial";
const SIZE_10 = 20; // 10pt

// ✅ 1,1 (approx) : single = 240, 1.1 ≈ 264
const SPACING_1_1 = { line: 264, lineRule: LineRuleType.AUTO };

// ✅ Largeurs colonnes table (pour donner + de place aux prix)
const COL_DESIGNATION = 52; // %
const COL_PU = 16; // %
const COL_VOL = 16; // %
const COL_MONTANT = 16; // %

function pTxt(text: string, opts?: { bold?: boolean; align?: DocxAlignment }) {
  return new Paragraph({
    alignment: opts?.align,
    spacing: SPACING_1_1,
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
    spacing: SPACING_1_1,
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
        spacing: SPACING_1_1,
        children: [new TextRun({ text: "", font: FONT, size: SIZE_9 })],
      })
  );
}

function sectionTitle(text: string) {
  return new Paragraph({
    spacing: SPACING_1_1,
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
          spacing: SPACING_1_1,
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
          spacing: SPACING_1_1,
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

// ✅ Bordures un peu + épaisses
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 3, color: "C0C0C0" },
  insideVertical: { style: BorderStyle.SINGLE, size: 3, color: "C0C0C0" },
};

// ✅ Bordures "OFF" (pour masquer la zone colonnes 1-2 sur TVA/TTC)
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

// ✅ helper cellule centrée verticalement + largeur en %
function cell(
  children: Paragraph[],
  opts?: {
    columnSpan?: number;
    borders?: any;
    widthPct?: number;
  }
) {
  return new TableCell({
    children,
    columnSpan: opts?.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    borders: opts?.borders,
    width: opts?.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
  });
}

function parseIsoDateToFr(x: any): string | null {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return fmtDateFr(d);
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
  const dateNowFr = fmtDateFr(now);

  const devisMeta = safeJsonParse((v?.devis as any)?.meta, {});

  // ✅ meta overrides si présents
  const ville = String(devisMeta?.ville ?? p?.city ?? "");
  const pnlTitle = String(devisMeta?.titreProjet ?? p?.title ?? "Offre de prix");
  const client = String(devisMeta?.client ?? p?.client ?? "");

  const metaDateFr = parseIsoDateToFr(devisMeta?.date);
  const dateFr = metaDateFr ?? dateNowFr;

  const demarrage =
    String(safeJsonParse((v?.devis as any)?.rappel, {})?.demarrage ?? "").trim() ||
    (p?.startDate ? fmtDateFr(new Date(p.startDate)) : "");

  const dureeMois = n(c?.dureeMois ?? safeJsonParse((v?.devis as any)?.rappel, {})?.dureeMois ?? 0);

  const rows = (v?.variantFormules ?? []) as any[];
  const volumeTotalFormules = rows.reduce((s, r) => s + n(r?.volumeM3), 0);

  const intro =
    typeof (v?.devis as any)?.intro === "string" && String((v.devis as any).intro).trim()
      ? String((v.devis as any).intro)
      : `Nous vous prions de trouver ci-dessous les détails de notre offre de prix de fourniture des bétons prêts à l’emploi pour les travaux de construction des "${pnlTitle}".`;

  const rappel = safeJsonParse((v?.devis as any)?.rappel, {});
  const quantiteProjet = n(rappel?.quantiteM3) > 0 ? n(rappel?.quantiteM3) : volumeTotalFormules;

  // ✅ IMPORTANT: ces textes sont à la racine (comme ton saveDevis)
  const dureeQuantiteTexte =
    typeof (v?.devis as any)?.dureeQuantiteTexte === "string" && String((v.devis as any).dureeQuantiteTexte).trim()
      ? String((v.devis as any).dureeQuantiteTexte)
      : `Les prix sont donnés pour un volume de ${fmtMoney0(quantiteProjet)} m3 et une durée de ${fmtMoney0(
          dureeMois
        )} mois. En aucun cas les volumes réalisés ne devront être inférieurs de plus de 90% du volume susmentionné.`;

  const validiteTexte =
    typeof (v?.devis as any)?.validiteTexte === "string" && String((v.devis as any).validiteTexte).trim()
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

  // (Optionnel) ancien hydrofuge legacy via meta
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

  // =========================
  // LIGNES TABLE
  // ✅ COHÉRENCE AFFICHAGE:
  //    - pu affiché: round2
  //    - vol affiché: round2
  //    - total: round2(pu_affiché × vol_affiché)
  // =========================
  const formuleLines: Array<{ label: string; pu: number; vol: number; total: number; isDash?: boolean }> = rows.map(
    (r: any) => {
      const label = String(r?.formule?.label ?? "—");
      const volReal = n(r?.volumeM3);
      const momd = n(r?.momd ?? 0);
      const cmp = cmpFormuleM3(r?.formule);

      const pvBase = cmp + transportUsed + momd;
      const surcharge = useDevisSurcharges ? getSurchargeM3(r, surMap) : 0;

      const puReal = pvBase + surcharge;

      // ✅ valeurs affichées
      const pu = round2(puReal);
      const vol = round2(volReal);

      // ✅ total cohérent avec affichage
      const total = mul2(pu, vol);

      return { label, pu, vol, total, isDash: false };
    }
  );

  // ✅ Tri DU TABLEAU DES PRIX sur les formules uniquement (PU décroissant)
  formuleLines.sort((a, b) => n(b.pu) - n(a.pu));

  const tableLines = [...formuleLines];

  // legacy hydrofuge (si gardé)
  if (hydroPu > 0) {
    const isDash = !(hydroQty > 0);
    const pu2 = round2(hydroPu);
    const vol2 = hydroQty > 0 ? round2(hydroQty) : 0;

    tableLines.push({
      label: "Plus value Hydrofuge",
      pu: pu2,
      vol: vol2,
      total: hydroQty > 0 ? mul2(pu2, vol2) : 0,
      isDash,
    });
  }

  // ✅ extras (hors formules)
  for (const x of extraArticles) {
    const isDash = !(x.qty > 0);
    const pu2 = round2(x.pu);
    const vol2 = x.qty > 0 ? round2(x.qty) : 0;

    tableLines.push({
      label: x.label,
      pu: pu2,
      vol: vol2,
      total: x.qty > 0 ? mul2(pu2, vol2) : 0,
      isDash,
    });
  }

  // ✅ totaux uniquement sur lignes "réelles" (vol>0)
  const totalHT = tableLines.reduce((s, x) => s + (x.vol > 0 ? n(x.total) : 0), 0);
  const totalVolumeShown = tableLines.reduce((s, x) => s + (x.vol > 0 ? n(x.vol) : 0), 0);

  const tva = totalHT * 0.2;
  const totalTTC = totalHT + tva;

  // =========================
  // TABLE (4 colonnes)
  // ✅ Colonnes prix centrées
  // ✅ Largeur prix un peu + large, désignation un peu - large
  // =========================
  const headerRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxt("Désignation", { bold: true, align: AlignmentType.LEFT })], { widthPct: COL_DESIGNATION }),
      cell([pTxt("PU HT/m3", { bold: true, align: AlignmentType.CENTER })], { widthPct: COL_PU }),
      cell([pTxt("Volume", { bold: true, align: AlignmentType.CENTER })], { widthPct: COL_VOL }),
      cell([pTxt("Montant HT", { bold: true, align: AlignmentType.CENTER })], { widthPct: COL_MONTANT }),
    ],
  });

  const bodyRows = tableLines.map((x) => {
    const volTxt = x.isDash ? "-" : fmtMoney2(x.vol);
    const totTxt = x.isDash ? "-" : fmtMoney2(x.total);

    return new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxtBody(x.label, { align: AlignmentType.LEFT })], { widthPct: COL_DESIGNATION }),
        cell([pTxtBody(fmtMoney2(x.pu), { align: AlignmentType.CENTER })], { widthPct: COL_PU }),
        cell([pTxtBody(volTxt, { align: AlignmentType.CENTER })], { widthPct: COL_VOL }),
        cell([pTxtBody(totTxt, { align: AlignmentType.CENTER })], { widthPct: COL_MONTANT }),
      ],
    });
  });

  // ✅ Total : libellé gras / chiffres non gras
  const totalRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("Total :", { bold: true, align: AlignmentType.CENTER })], { columnSpan: 2, widthPct: COL_DESIGNATION + COL_PU }),
      cell([pTxtBody(fmtMoney2(totalVolumeShown), { bold: false, align: AlignmentType.CENTER })], { widthPct: COL_VOL }),
      cell([pTxtBody(fmtMoney2(totalHT), { bold: false, align: AlignmentType.CENTER })], { widthPct: COL_MONTANT }),
    ],
  });

  // ✅ TVA/TTC : continuité colonnes 3-4
  // ✅ Et bordures supprimées sur la zone colonnes 1-2 (cellule fusionnée)
  const tvaRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS, widthPct: COL_DESIGNATION + COL_PU }),
      cell([pTxtBody("Montant TVA", { bold: true, align: AlignmentType.CENTER })], { widthPct: COL_VOL }),
      cell([pTxtBody(fmtMoney2(tva), { bold: false, align: AlignmentType.CENTER })], { widthPct: COL_MONTANT }),
    ],
  });

  const ttcRow = new TableRow({
    height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
    children: [
      cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS, widthPct: COL_DESIGNATION + COL_PU }),
      cell([pTxtBody("Montant TTC", { bold: true, align: AlignmentType.CENTER })], { widthPct: COL_VOL }),
      cell([pTxtBody(fmtMoney2(totalTTC), { bold: false, align: AlignmentType.CENTER })], { widthPct: COL_MONTANT }),
    ],
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows, totalRow, tvaRow, ttcRow],
    borders: TABLE_BORDERS,
  });

  const footerLine = `${pnlTitle} - offre de prix - ${dateFr}`;
  const logoHeader = buildLogoHeader();

  const doc = new Document({
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
                  indent: { left: 360, hanging: 360 },
                  spacing: SPACING_1_1,
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
                spacing: SPACING_1_1,
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: footerLine, font: FONT, size: SIZE_9 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            spacing: SPACING_1_1,
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${ville}, le ${dateFr}`, font: FONT, size: SIZE_9 })],
          }),

          ...blank(3),

          new Paragraph({
            spacing: SPACING_1_1,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Offre de prix", bold: true, font: FONT, size: SIZE_9 }),
              new TextRun({ break: 1, text: pnlTitle, bold: true, font: FONT, size: SIZE_9 }),
            ],
          }),

          ...blank(2),

          new Paragraph({
            spacing: SPACING_1_1,
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
            `Quantité : ${fmtMoney0(quantiteProjet)} m3`,
            `Délai : ${fmtMoney0(dureeMois)} mois`,
            ...(demarrage ? [`Démarrage : ${demarrage}`] : []),
            ...(String(rappel?.lieu ?? "").trim()
              ? [`Lieu : ${String(rappel?.lieu).trim()}`]
              : ville
              ? [`Lieu : ${ville}`]
              : []),
          ]),

          ...blank(1),

          sectionTitle("A la charge de LafargeHolcim Maroc :"),
          ...(chargeFournisseur.length ? bulletsFromStrings(chargeFournisseur) : bulletsFromStrings(["—"])),

          ...blank(1),

          sectionTitle("A la charge du client :"),
          ...(chargeClient.length ? bulletsFromStrings(chargeClient) : bulletsFromStrings(["—"])),

          ...blank(1),

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
            spacing: SPACING_1_1,
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigNom, bold: true, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            spacing: SPACING_1_1,
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigPoste, bold: true, font: FONT, size: SIZE_9 })],
          }),
          new Paragraph({
            spacing: SPACING_1_1,
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: sigTel, bold: true, font: FONT, size: SIZE_9 })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}