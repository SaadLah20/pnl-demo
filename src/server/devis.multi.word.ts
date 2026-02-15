// src/server/devis.multi.word.ts (FICHIER COMPLET / docx-compatible + mutualisation sections + charges communes + prix compl. filtrés + ✅ prix compl commun en bas + ✅ majorations PV global)
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
  useMajorations?: boolean;
  useDevisSurcharges?: boolean;
  meta?: any; // optionnel (override)
};

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function fmtMoney2(x: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(x));
}

function fmtMoney0(x: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n(x));
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

/* =========================
   majorations / surcharges
========================= */

function readMajorations(variant: any): Record<string, number> {
  const raw = variant?.autresCouts?.majorations ?? (variant?.autresCouts as any)?.majorations ?? null;
  const obj = safeJsonParse(raw, {});
  return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
}
function getMajPct(key: string, maj: Record<string, number>): number {
  if (!maj) return 0;
  if (key in maj) return n((maj as any)[key]);
  return 0;
}
function getFirstMajPct(keys: string[], maj: Record<string, number>): number {
  for (const k of keys) {
    const v = getMajPct(k, maj);
    if (v) return v;
  }
  return 0;
}
function applyMaj(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

function readDevisSurcharges(variant: any): Record<string, number> {
  const raw = (variant?.devis as any)?.surcharges;
  const obj = safeJsonParse(raw, {});
  const map = (obj?.surcharges ?? obj) as any;
  return map && typeof map === "object" ? (map as Record<string, number>) : {};
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
   DOC HELPERS (compat + spacing propre)
========================= */

const FONT = "Tahoma";
const SIZE_9 = 18; // 9pt
const SIZE_10 = 20; // 10pt
const SIZE_12 = 24; // 12pt

const TABLE_BODY_FONT = "Arial";
const ROW_HEIGHT = 360;

// ✅ spacing anti “trous”
const LINE = 240;
const AFTER_P = 60;
const AFTER_TITLE = 90;
const AFTER_BULLET = 30;

function pTxt(text: string, opts?: { bold?: boolean; align?: DocxAlignment; size?: number }) {
  return new Paragraph({
    alignment: opts?.align,
    spacing: { before: 0, after: AFTER_P, line: LINE },
    children: [
      new TextRun({
        text: text ?? "",
        bold: !!opts?.bold,
        font: FONT,
        size: opts?.size ?? SIZE_9,
      }),
    ],
  });
}

function pTxtBody(text: string, opts?: { bold?: boolean; align?: DocxAlignment }) {
  return new Paragraph({
    alignment: opts?.align,
    spacing: { before: 0, after: 0, line: LINE },
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
        spacing: { before: 0, after: 0, line: LINE },
        children: [new TextRun({ text: "", font: FONT, size: SIZE_9 })],
      })
  );
}

function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { before: 0, after: AFTER_TITLE, line: LINE },
    children: [new TextRun({ text, bold: true, font: FONT, size: SIZE_10 })],
  });
}

function propositionTitle(text: string) {
  return new Paragraph({
    spacing: { before: 160, after: 140, line: LINE },
    children: [new TextRun({ text, bold: true, font: FONT, size: SIZE_12 })],
  });
}

// ✅ Puces cercle vide
const HOLLOW_BULLET_REF = "HOLLOW_BULLET";

function bulletsFromStrings(lines: string[]) {
  return (lines ?? [])
    .filter((x) => String(x ?? "").trim().length > 0)
    .map(
      (t) =>
        new Paragraph({
          numbering: { reference: HOLLOW_BULLET_REF, level: 0 },
          spacing: { before: 0, after: AFTER_BULLET, line: LINE },
          children: [new TextRun({ text: String(t ?? ""), font: FONT, size: SIZE_9 })],
        })
    );
}

/** string[] OU object[]  (✅ option dropZero: supprime les items value<=0) */
function normalizeLines(raw: any, opts?: { dropZero?: boolean }): string[] {
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

        // ✅ filtre: si value numérique <=0, on ignore (pour prix complémentaires / pénalités)
        if (opts?.dropZero && value !== undefined && value !== null && value !== "") {
          const vNum0 = Number(value);
          if (Number.isFinite(vNum0) && vNum0 <= 0) return "";
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
          spacing: { before: 0, after: 0, line: LINE },
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

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

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
    verticalAlign: (VerticalAlign.CENTER as any) ?? undefined,
    borders: opts?.borders,
    width: opts?.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
  });
}

type KV = { k: string; v: string };
const KV_EMPTY: KV = { k: " ", v: " " };

function kvTable(items: KV[]) {
  const safe: KV[] = [];
  for (const it of items ?? []) {
    if (it && typeof it.k === "string" && typeof it.v === "string") safe.push({ k: it.k, v: it.v });
  }
  while (safe.length < 4) safe.push({ ...KV_EMPTY });

  const a0: KV = safe[0] ?? KV_EMPTY;
  const a1: KV = safe[1] ?? KV_EMPTY;
  const a2: KV = safe[2] ?? KV_EMPTY;
  const a3: KV = safe[3] ?? KV_EMPTY;

  const row = (a: KV, b: KV) =>
    new TableRow({
      children: [
        cell([pTxt(a.k, { bold: true }), pTxt(a.v, { bold: true, size: SIZE_10 })], { borders: TABLE_BORDERS, widthPct: 50 }),
        cell([pTxt(b.k, { bold: true }), pTxt(b.v, { bold: true, size: SIZE_10 })], { borders: TABLE_BORDERS, widthPct: 50 }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [row(a0, a1), row(a2, a3)],
  });
}

function norm(s: any): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/* =========================
   Pénalités (tolérant)
========================= */
function getPenalitesLines(v: any): string[] {
  const devis: any = v?.devis ?? {};
  const rappel = safeJsonParse(devis?.rappel, {});

  const raw1 = devis?.penalitesTexte;
  if (typeof raw1 === "string" && raw1.trim()) return [raw1.trim()];

  const raw2 = rappel?.penalitesTexte;
  if (typeof raw2 === "string" && raw2.trim()) return [raw2.trim()];

  // fallback: penalites (liste) — on peut filtrer les value 0 si objets
  return normalizeLines(devis?.penalites, { dropZero: true });
}

/* =========================
   Prix complémentaires : règle demandée
   ✅ si toutes les pénalités/prix du contrat sont à 0 => PAS de bloc
   - On prend devis.prixComplementaires si présent
   - Sinon, on construit depuis le contrat (champs connus / heuristique)
========================= */

function contractHasAnyExtraPrices(contract: any): boolean {
  const c: any = contract ?? {};
  // on scanne des champs usuels "Price/Rent/Penal..."
  for (const [k, v] of Object.entries(c)) {
    const key = String(k);
    if (!/(price|rent|penal|penalty)/i.test(key)) continue;
    const num = Number(v as any);
    if (Number.isFinite(num) && num > 0) return true;
  }
  return false;
}

function buildExtrasFromContract(contract: any): string[] {
  const c: any = contract ?? {};
  const out: string[] = [];

  // champs connus chez toi (vu dans DevisPage)
  const sundayPrice = n(c?.sundayPrice);
  const chillerRent = n(c?.chillerRent);

  if (sundayPrice > 0) {
    out.push(
      `Ouverture de centrale en dehors des horaires de travail (Poste de nuit, Jour férié & Dimanche) : ${fmtMoney0(
        sundayPrice
      )} DH HT / poste`
    );
  }

  // si tu as un champ contractuel pour dépassement durée (on supporte plusieurs noms possibles)
  const overrunMonthly =
    n((c as any)?.overrunMonthlyPrice) ||
    n((c as any)?.beyondDurationMonthlyPrice) ||
    n((c as any)?.penaltyAfterDurationMonthly) ||
    n((c as any)?.monthlyOverrunPenalty) ||
    0;

  if (overrunMonthly > 0) {
    out.push(
      `Mise à disposition de la centrale à béton et son personnel d’exploitation au-delà de la durée contractuelle : ${fmtMoney0(
        overrunMonthly
      )} DH HT / mois`
    );
  }

  if (chillerRent > 0) {
    out.push(
      `Dans le cas où la température ambiante est élevée (>30°C), pour les bétons dont la température exigée est <=30°C, l’utilisation du refroidisseur d’eau « Chiller » est nécessaire et sera facturée : ${fmtMoney0(
        chillerRent
      )} MAD HT / mois`
    );
  }

  return out;
}

/* =========================
   Charges communes (mutualisation)
========================= */

function intersectLines(all: string[][]): string[] {
  const lists = (all ?? []).map((x) => (x ?? []).map(norm).filter(Boolean));
  if (!lists.length) return [];
  const base = lists[0] ?? [];
  const others = lists.slice(1).map((x) => new Set(x));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const s of base) {
    if (!s || seen.has(s)) continue;
    let ok = true;
    for (const set of others) {
      if (!set.has(s)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.push(s);
      seen.add(s);
    }
  }
  return out;
}

function subtractLines(lines: string[], common: string[]): string[] {
  const set = new Set((common ?? []).map(norm).filter(Boolean));
  return (lines ?? [])
    .map(norm)
    .filter((x) => x && !set.has(x));
}

/* =========================
   MAIN
========================= */

export async function buildDevisMultiWordBuffer(variantIds: string[], opts?: BuildOptions): Promise<Buffer> {
  const useMajorations = opts?.useMajorations !== undefined ? !!opts.useMajorations : true;
  const useDevisSurcharges = opts?.useDevisSurcharges !== undefined ? !!opts.useDevisSurcharges : true;
  const metaOverride = opts?.meta ?? null;

  const ids = (variantIds ?? []).map((x) => String(x)).filter(Boolean);
  if (!ids.length) throw new Error("Aucune variante sélectionnée.");

  const variants: any[] = await prisma.variant.findMany({
    where: { id: { in: ids } },
    include: {
      contract: { include: { pnl: true } },
      transport: true,
      autresCouts: true,
      mp: { include: { items: { include: { mp: true } } } },
      variantFormules: { include: { formule: { include: { items: { include: { mp: true } } } } } },
      devis: true,
    },
  });

  if (!variants.length) throw new Error("Aucune variante trouvée.");

  // ✅ règle: 1 variante par contrat
  const byContract = new Map<string, any>();
  for (const v of variants) {
    const cid = String(v?.contractId ?? v?.contract?.id ?? "");
    if (!cid) continue;
    if (byContract.has(cid)) throw new Error("Règle non respectée: une seule variante par contrat (duplicat détecté).");
    byContract.set(cid, v);
  }

  const sorted = [...variants].sort((a: any, b: any) => {
    const ca = String(a?.contract?.title ?? a?.contract?.id ?? "");
    const cb = String(b?.contract?.title ?? b?.contract?.id ?? "");
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
  });

  const first = sorted[0] as any;
  const c0: any = first?.contract;
  const p0: any = c0?.pnl;

  const now = new Date();
  const date = fmtDateFr(now);

  const ville = String(metaOverride?.ville ?? p0?.city ?? "");
  const client = String(metaOverride?.client ?? p0?.client ?? "");
  const projet = String(metaOverride?.titreProjet ?? p0?.title ?? "Projet");

  const intro =
    typeof metaOverride?.intro === "string" && metaOverride.intro.trim()
      ? String(metaOverride.intro)
      : `Nous vous prions de trouver ci-dessous nos propositions de prix relatives au projet "${projet}".`;

  const validiteTexte =
    typeof metaOverride?.validiteTexte === "string" && metaOverride.validiteTexte.trim()
      ? String(metaOverride.validiteTexte)
      : "Propositions valables pour une durée d’un mois à partir de la date d’envoi.";

  const sig = safeJsonParse(metaOverride?.signature ?? (first?.devis as any)?.signature, {});
  const sigNom = String(sig?.nom ?? "Saad LAHLIMI");
  const sigPoste = String(sig?.poste ?? "Commercial P&L");
  const sigTel = String(sig?.telephone ?? "+212701888888");

  const logoHeader = buildLogoHeader();
  const footerLine = `${projet} - propositions de prix - ${date}`;

  type DocChild = Paragraph | Table;
  const docChildren: DocChild[] = [];

  type VariantComputed = {
    idx: number;
    volumeTotal: number;
    dureeMois: number;
    demarrage: string;
    lieu: string;

    dureeQuantiteTexte: string;
    penalitesLines: string[];

    // charges (complètes) + diff (calculées après)
    chargeFournisseurAll: string[];
    chargeClientAll: string[];
    chargeFournisseurDiff: string[];
    chargeClientDiff: string[];

    // prix complémentaires par variante (filtrés)
    prixComplementaires: string[];
    pcKey: string;

    table: Table;

    rappelKey: string;
    dqKey: string;
    penalKey: string;
  };

  const computedList: VariantComputed[] = [];

  for (let idx = 0; idx < sorted.length; idx++) {
    const v: any = sorted[idx];
    const c: any = v?.contract;
    const p: any = c?.pnl;

    const demarrage = p?.startDate ? fmtDateFr(new Date(p.startDate)) : "";
    const dureeMois = n(c?.dureeMois ?? 0);
    const lieu = String(ville || p?.city || "");

    const rows = (v?.variantFormules ?? []) as any[];
    const volumeTotal = rows.reduce((s: number, r: any) => s + n(r?.volumeM3), 0);

    const devisMeta = safeJsonParse((v?.devis as any)?.meta, {});
    const rappel = safeJsonParse((v?.devis as any)?.rappel, {});
    const dureeQuantiteTexte =
      typeof rappel?.dureeQuantiteTexte === "string" && rappel.dureeQuantiteTexte.trim()
        ? String(rappel.dureeQuantiteTexte)
        : `Les prix sont donnés pour un volume de ${fmtMoney0(volumeTotal)} m3 et une durée de ${fmtMoney0(
            dureeMois
          )} mois. En aucun cas les volumes réalisés ne devront être inférieurs de plus de 90% du volume susmentionné.`;

    const chargeFournisseurAll = normalizeLines((v?.devis as any)?.chargeFournisseur);
    const chargeClientAll = normalizeLines((v?.devis as any)?.chargeClient);

    // ✅ Prix complémentaires: on filtre les items value<=0
    let prixComplementaires = normalizeLines((v?.devis as any)?.prixComplementaires, { dropZero: true });

    // ✅ Si le contrat n’a AUCUN prix/pénalité (>0), on FORCE à vide (pas de bloc)
    const hasAnyExtraPrice = contractHasAnyExtraPrices(c);
    if (!hasAnyExtraPrice) {
      prixComplementaires = [];
    } else {
      // si rien n’est persisté côté devis, on construit depuis le contrat (champs connus)
      if (!prixComplementaires.length) {
        const built = buildExtrasFromContract(c);
        prixComplementaires = built.filter((x) => norm(x));
      }
      // si tout est 0 ou vide après filtre => pas de bloc
      prixComplementaires = (prixComplementaires ?? []).map(norm).filter(Boolean);
    }

    const penalitesLines = getPenalitesLines(v);

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
        const prixKg = pctMp ? applyMaj(prixKgBase, pctMp) : prixKgBase;

        return s + qtyKg * prixKg;
      }, 0);
    }

    const transportBase = n(v?.transport?.prixMoyen ?? 0);
    const transportPct = useMajorations ? getFirstMajPct(["transport.prixMoyen", "transport", "transportPct"], maj) : 0;
    const transportUsed = transportPct ? applyMaj(transportBase, transportPct) : transportBase;

    const pvGlobalPct = useMajorations
      ? getFirstMajPct(["pv", "pv.m3", "devis.pv", "devis.pvM3", "global", "globalPct", "majorationGlobale"], maj)
      : 0;

    // (optionnel) MOMD majoré si présent
    const momdPctKey = ["momd", "momd.m3", "mainOeuvre", "mo", "momdPct"];

    const tableLines: Array<{ label: string; pu: number; vol: number; total: number }> = rows.map((r: any) => {
      const label = String(r?.formule?.label ?? "—");
      const vol = n(r?.volumeM3);

      const momdBase = n(r?.momd ?? 0);
      const momdPct = useMajorations ? getFirstMajPct(momdPctKey, maj) : 0;
      const momdUsed = momdPct ? applyMaj(momdBase, momdPct) : momdBase;

      const cmp = cmpFormuleM3(r?.formule);

      // ✅ base PV
      const pvBase = cmp + transportUsed + momdUsed;

      // ✅ majoration PV globale (sinon tu seras “moins que la réalité” vs DevisPage)
      const pvMaj = pvGlobalPct ? applyMaj(pvBase, pvGlobalPct) : pvBase;

      const pvArr = roundTo5(pvMaj);

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

    const headerRow = new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxt("Désignation", { bold: true })]),
        cell([pTxt("PU HT/m3", { bold: true, align: AlignmentType.RIGHT })]),
        cell([pTxt("Volume", { bold: true, align: AlignmentType.RIGHT })]),
        cell([pTxt("Montant HT", { bold: true, align: AlignmentType.RIGHT })]),
      ],
    });

    const bodyRows = tableLines.map(
      (x) =>
        new TableRow({
          height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
          children: [
            cell([pTxtBody(x.label)]),
            cell([pTxtBody(fmtMoney2(x.pu), { align: AlignmentType.RIGHT })]),
            cell([pTxtBody(fmtMoney2(x.vol), { align: AlignmentType.RIGHT })]),
            cell([pTxtBody(fmtMoney2(x.total), { align: AlignmentType.RIGHT })]),
          ],
        })
    );

    const totalRow = new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxtBody("Total :", { bold: true, align: AlignmentType.CENTER })], { columnSpan: 2 }),
        cell([pTxtBody(fmtMoney2(volumeTotal), { align: AlignmentType.RIGHT })]),
        cell([pTxtBody(fmtMoney2(totalHT), { align: AlignmentType.RIGHT })]),
      ],
    });

    const tvaRow = new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS }),
        cell([pTxtBody("Montant TVA", { bold: true, align: AlignmentType.LEFT })]),
        cell([pTxtBody(fmtMoney2(tva), { align: AlignmentType.RIGHT })]),
      ],
    });

    const ttcRow = new TableRow({
      height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell([pTxtBody("")], { columnSpan: 2, borders: NO_BORDERS }),
        cell([pTxtBody("Montant TTC", { bold: true, align: AlignmentType.LEFT })]),
        cell([pTxtBody(fmtMoney2(totalTTC), { align: AlignmentType.RIGHT })]),
      ],
    });

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows, totalRow, tvaRow, ttcRow],
      borders: TABLE_BORDERS,
    });

    const rappelKey = `${fmtMoney0(volumeTotal)}|${fmtMoney0(dureeMois)}|${norm(demarrage)}|${norm(lieu)}`;
    const dqKey = norm(dureeQuantiteTexte);
    const penalKey = (penalitesLines ?? []).map(norm).filter(Boolean).join("\n");

    const pcKey = (prixComplementaires ?? []).map(norm).filter(Boolean).join("\n");

    computedList.push({
      idx,
      volumeTotal,
      dureeMois,
      demarrage,
      lieu,
      dureeQuantiteTexte,
      penalitesLines,
      chargeFournisseurAll: chargeFournisseurAll.map(norm).filter(Boolean),
      chargeClientAll: chargeClientAll.map(norm).filter(Boolean),
      chargeFournisseurDiff: [],
      chargeClientDiff: [],
      prixComplementaires,
      pcKey,
      table,
      rappelKey,
      dqKey,
      penalKey,
    });
  }

  if (!computedList.length) throw new Error("Aucune donnée calculée (liste vide).");
  const cFirst = computedList[0]!;

  // ===== Mutualisation : Rappel / Durée-Quantité / Pénalités
  const hasCommonRappel = computedList.length > 1 && computedList.every((x) => x.rappelKey === cFirst.rappelKey);
  const hasCommonDQ = computedList.length > 1 && !!cFirst.dqKey && computedList.every((x) => x.dqKey === cFirst.dqKey);

  const hasAnyPen = computedList.some((x) => (x.penalitesLines ?? []).some((s) => norm(s)));
  const hasCommonPen = hasAnyPen && computedList.length > 1 && computedList.every((x) => x.penalKey === cFirst.penalKey);

  // ===== Mutualisation : Charges & responsabilités communes
  const commonLhm = computedList.length > 1 ? intersectLines(computedList.map((x) => x.chargeFournisseurAll)) : [];
  const commonClient = computedList.length > 1 ? intersectLines(computedList.map((x) => x.chargeClientAll)) : [];

  for (const x of computedList) {
    x.chargeFournisseurDiff = subtractLines(x.chargeFournisseurAll, commonLhm);
    x.chargeClientDiff = subtractLines(x.chargeClientAll, commonClient);
  }

  const hasCommonCharges = commonLhm.length + commonClient.length > 0;

  // ===== Mutualisation : Prix complémentaires
  const hasAnyPc = computedList.some((x) => (x.prixComplementaires ?? []).length > 0);
  const hasCommonPc = hasAnyPc && computedList.length > 1 && computedList.every((x) => x.pcKey === cFirst.pcKey);
  const pcFirst = hasAnyPc ? cFirst : null;

  // ===== Cover
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 0, line: LINE },
      children: [new TextRun({ text: `${ville ? `${ville}, ` : ""}le ${date}`, font: FONT, size: SIZE_9 })],
    }),

    ...blank(1),

    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 60, line: LINE },
      children: [new TextRun({ text: "Propositions de prix", bold: true, font: FONT, size: SIZE_12 })],
    }),

    pTxt(projet, { bold: true, size: SIZE_10 }),

    ...blank(1),

    pTxt(client ? `Client : ${client}` : "Client : —", { bold: true }),

    ...blank(1),

    pTxt(intro),

    sectionTitle("Contenu :"),
    ...bulletsFromStrings([
      "Les propositions ci-dessous sont présentées selon la répartition des charges et des responsabilités entre les parties.",
      "Chaque proposition présente : rappel (quantité/durée), répartition des charges, prix.",
    ])
  );

  // ===== Rappel commun (en haut) si identique
  if (hasCommonRappel) {
    docChildren.push(
      ...blank(1),
      sectionTitle("Rappel des données du projet :"),
      kvTable([
        { k: "Quantité", v: `${fmtMoney0(cFirst.volumeTotal)} m³` },
        { k: "Délai", v: `${fmtMoney0(cFirst.dureeMois)} mois` },
        { k: "Démarrage", v: cFirst.demarrage || "—" },
        { k: "Lieu", v: cFirst.lieu || "—" },
      ])
    );
  }

  // ===== Bloc commun charges avant propositions
  if (hasCommonCharges) {
    docChildren.push(...blank(1), sectionTitle("Charges & responsabilités communes :"));

    if (commonLhm.length) {
      docChildren.push(pTxt("À la charge de LafargeHolcim Maroc :", { bold: true }));
      docChildren.push(...bulletsFromStrings(commonLhm));
    }

    if (commonClient.length) {
      if (commonLhm.length) docChildren.push(...blank(1));
      docChildren.push(pTxt("À la charge du client :", { bold: true }));
      docChildren.push(...bulletsFromStrings(commonClient));
    }
  }

  // ===== Propositions
  for (let i = 0; i < computedList.length; i++) {
    const it = computedList[i]!;
    if (i > 0) docChildren.push(...blank(2));

    const hasDiffCharges = it.chargeFournisseurDiff.length + it.chargeClientDiff.length > 0;

    docChildren.push(
      propositionTitle(`Proposition ${i + 1}`),

      ...(hasCommonRappel
        ? []
        : ([
            sectionTitle("Rappel des données du projet :"),
            kvTable([
              { k: "Quantité", v: `${fmtMoney0(it.volumeTotal)} m³` },
              { k: "Délai", v: `${fmtMoney0(it.dureeMois)} mois` },
              { k: "Démarrage", v: it.demarrage || "—" },
              { k: "Lieu", v: it.lieu || "—" },
            ]),
            ...blank(1),
          ] as DocChild[])),

      // ✅ Dans les propositions, on n’affiche que ce qui diffère
      ...(hasDiffCharges
        ? ([
            sectionTitle("Charges & responsabilités (spécifiques) :"),

            ...(it.chargeFournisseurDiff.length
              ? ([pTxt("À la charge de LafargeHolcim Maroc :", { bold: true }), ...bulletsFromStrings(it.chargeFournisseurDiff)] as DocChild[])
              : ([] as DocChild[])),

            ...(it.chargeClientDiff.length
              ? ([
                  ...(it.chargeFournisseurDiff.length ? blank(1) : []),
                  pTxt("À la charge du client :", { bold: true }),
                  ...bulletsFromStrings(it.chargeClientDiff),
                ] as DocChild[])
              : ([] as DocChild[])),

            ...blank(1),
          ] as DocChild[])
        : ([] as DocChild[])),

      sectionTitle("Prix :"),
      it.table,

      // ✅ Prix complémentaires :
      // - si commun => NE PAS l'afficher par proposition (il sera en bas)
      // - si non commun => afficher seulement s'il y en a
      ...(hasCommonPc
        ? ([] as DocChild[])
        : it.prixComplementaires.length
          ? ([
              ...blank(1),
              sectionTitle("Prix complémentaires :"),
              ...bulletsFromStrings(it.prixComplementaires),
            ] as DocChild[])
          : ([] as DocChild[])),

      ...(hasCommonDQ
        ? []
        : ([
            ...blank(1),
            sectionTitle("Durée - Quantité :"),
            pTxt(it.dureeQuantiteTexte),
          ] as DocChild[])),

      ...(hasCommonPen || !((it.penalitesLines ?? []).some((s) => norm(s)))
        ? []
        : ([
            ...blank(1),
            sectionTitle("Pénalités :"),
            ...(it.penalitesLines.length > 1 ? bulletsFromStrings(it.penalitesLines) : [pTxt(it.penalitesLines[0] ?? "—")]),
          ] as DocChild[]))
    );
  }

  // ===== ✅ Prix complémentaires communs EN BAS (avant Textes/Durée-Quantité)
  if (hasAnyPc && hasCommonPc && pcFirst) {
    docChildren.push(...blank(2), sectionTitle("Prix complémentaires :"), ...bulletsFromStrings(pcFirst.prixComplementaires));
  }

  // ===== Textes communs en bas (si identiques)
  if (hasCommonDQ || hasCommonPen) {
    docChildren.push(...blank(2), sectionTitle("Textes :"));

    if (hasCommonDQ) {
      docChildren.push(sectionTitle("Durée - Quantité :"), pTxt(cFirst.dureeQuantiteTexte));
    }

    if (hasCommonPen) {
      const lines = cFirst.penalitesLines ?? [];
      docChildren.push(
        ...blank(1),
        sectionTitle("Pénalités :"),
        ...(lines.length > 1 ? bulletsFromStrings(lines) : [pTxt(lines[0] ?? "—")])
      );
    }
  }

  // ===== Validité + signature
  docChildren.push(
    ...blank(2),
    sectionTitle("Validité de l’offre :"),
    pTxt(validiteTexte),

    ...blank(4),

    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: LINE },
      children: [new TextRun({ text: sigNom, bold: true, font: FONT, size: SIZE_10 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: LINE },
      children: [new TextRun({ text: sigPoste, bold: true, font: FONT, size: SIZE_9 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: LINE },
      children: [new TextRun({ text: sigTel, bold: true, font: FONT, size: SIZE_9 })],
    })
  );

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
                paragraph: { indent: { left: 360, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        headers: logoHeader ? { default: logoHeader, first: logoHeader, even: logoHeader } : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: LINE },
                children: [new TextRun({ text: footerLine, font: FONT, size: SIZE_9 })],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
