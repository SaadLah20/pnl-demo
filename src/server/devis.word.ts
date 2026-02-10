// src/server/devis.word.ts
import path from "path";
import fs from "fs";
import {
  AlignmentType,
  Document,
  Header,
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
    String(row?.formule?.label ?? ""),
  ].filter((k) => k && k !== "undefined" && k !== "null");

  for (const k of keys) {
    if (k in map) return n((map as any)[k]);
  }
  return 0;
}

function pTxt(text: string, opts?: { bold?: boolean; align?: DocxAlignment; size?: number }) {
  return new Paragraph({
    alignment: opts?.align,
    children: [
      new TextRun({
        text: text ?? "",
        bold: !!opts?.bold,
        size: opts?.size ? opts.size * 2 : undefined, // docx = half-points
      }),
    ],
  });
}

function blank() {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

function bullets(lines: string[]) {
  return (lines ?? [])
    .filter(Boolean)
    .map(
      (t) =>
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: String(t ?? "") })],
        })
    );
}

function sectionTitle(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
  });
}

export async function buildDevisWordBuffer(variantId: string): Promise<Buffer> {
  // ⚠️ On utilise "any" pour ne pas bloquer si tes types Prisma ne reflètent pas encore les champs devis.*
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

  // --- meta (le modèle joint)
  const now = new Date();
  const date = fmtDateFr(now);

  const ville = String(p?.city ?? "");
  const pnlTitle = String(p?.title ?? "Offre de prix");
  const client = String(p?.client ?? "");

  // démarrage = Pnl.startDate (si présent)
  const demarrage = p?.startDate ? fmtDateFr(new Date(p.startDate)) : "";

  const dureeMois = n(c?.dureeMois ?? 0);

  // ⚠️ volume total : somme des volumes des formules
  const rows = (v?.variantFormules ?? []) as any[];
  const volumeTotal = rows.reduce((s, r) => s + n(r?.volumeM3), 0);

  // --- Contenu texte (si tu ajoutes les champs en DB, sinon fallback)
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

  const chargeFournisseur = safeJsonParse((v?.devis as any)?.chargeFournisseur, []) as string[];
  const chargeClient = safeJsonParse((v?.devis as any)?.chargeClient, []) as string[];
  const prixComplementaires = safeJsonParse((v?.devis as any)?.prixComplementaires, []) as string[];

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
    // priorité: override -> prix
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

      const pctMp = getMajPct(`mp:${mpId}`, maj);
      const prixKg = applyMaj(prixKgBase, pctMp);

      return s + qtyKg * prixKg;
    }, 0);
  }

  const transportBase = n(v?.transport?.prixMoyen ?? 0);
  const transportMaj = applyMaj(transportBase, getMajPct("transport.prixMoyen", maj));

  const tableLines: Array<{ label: string; pu: number; vol: number; total: number }> = rows.map((r: any) => {
    const label = String(r?.formule?.label ?? "—");
    const vol = n(r?.volumeM3);
    const momd = n(r?.momd ?? 0);
    const cmp = cmpFormuleM3(r?.formule);

    const pv = cmp + transportMaj + momd;
    const pvArr = roundTo5(pv);

    const surcharge = getSurchargeM3(r, surMap);
    const pu = pvArr + surcharge;

    return { label, pu, vol, total: pu * vol };
  });

  if (hydroPu > 0 && hydroQty > 0) {
    tableLines.push({ label: "Plus value Hydrofuge", pu: hydroPu, vol: hydroQty, total: hydroPu * hydroQty });
  }

  const totalHT = tableLines.reduce((s, x) => s + n(x.total), 0);
  // ⚠️ TVA: adapte si besoin (20% ici)
  const tva = totalHT * 0.2;
  const totalTTC = totalHT + tva;

  // --- Logo (optionnel) ✅ type + Uint8Array pour éviter TS2345
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
            transformation: { width: 160, height: 70 },
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

  // --- Doc header (en-tête)
  const headerLine = `${pnlTitle} - offre de prix - ${date}`;

  const doc = new Document({
    sections: [
      {
        headers: {
          /** ✅ TS2353: docx attend un Header, pas un objet { children: [...] } */
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: headerLine })],
              }),
            ],
          }),
        },
        children: [
          ...(logoPara ? [logoPara, blank()] : []),

          // Ville/Date à droite
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${ville}, le ${date}` })],
          }),

          blank(),

          // Titre centré
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Offre de prix", bold: true }),
              new TextRun({ text: "\n" }),
              new TextRun({ text: pnlTitle, bold: true }),
            ],
          }),

          // Client à droite
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: client, bold: true })],
          }),

          blank(),

          // Intro
          pTxt(intro),

          blank(),

          // Rappel
          sectionTitle("Rappel des données du projet :"),
          ...bullets([
            `Quantité : ${fmtMoney0(volumeTotal)} m3`,
            `Délai : ${fmtMoney0(dureeMois)} mois`,
            ...(demarrage ? [`Démarrage : ${demarrage}`] : []),
            ...(ville ? [`Lieu : ${ville}`] : []),
          ]),

          blank(),

          // Charges
          sectionTitle("A la charge de LafargeHolcim Maroc :"),
          ...(chargeFournisseur?.length ? bullets(chargeFournisseur) : bullets(["—"])),

          blank(),

          sectionTitle("A la charge du client :"),
          ...(chargeClient?.length ? bullets(chargeClient) : bullets(["—"])),

          blank(),

          // Table prix
          table,

          blank(),

          // Prix complémentaires
          sectionTitle("Prix complémentaires :"),
          ...(prixComplementaires?.length
            ? bullets(prixComplementaires)
            : bullets([
                ...(n(c?.sundayPrice) > 0
                  ? [`Ouverture en dehors horaires : ${fmtMoney0(n(c.sundayPrice))} dhs ht/poste`]
                  : ["Ouverture en dehors horaires : 5.000,00 dhs ht/poste"]),
                ...(n(c?.chillerRent) > 0 ? [`Chiller : forfait mensuel de ${fmtMoney0(n(c.chillerRent))} MAD HT`] : []),
                ...(n(c?.delayPenalty) > 0
                  ? [`Pénalité dépassement délai : ${fmtMoney0(n(c.delayPenalty))} MAD HT`]
                  : []),
              ])),

          blank(),

          // Durée-Quantité
          sectionTitle("Durée - Quantité :"),
          pTxt(dureeQuantiteTexte),

          blank(),

          // Validité
          sectionTitle("Validité de l’offre :"),
          pTxt(validiteTexte),

          blank(),

          // Signature (droite)
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: sigNom, bold: true }),
              new TextRun({ text: "\n" }),
              new TextRun({ text: sigPoste }),
              new TextRun({ text: "\n" }),
              new TextRun({ text: sigTel }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
