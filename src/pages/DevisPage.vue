<!-- ✅ src/pages/DevisPage.vue (FICHIER COMPLET / UI-UX refonte lisible + compacte)
     Objectifs demandés :
     ✅ ZÉRO scroll horizontal sur le tableau des prix (on réduit à 4 colonnes + métriques en sous-ligne)
     ✅ Contenu en 1 colonne (plus lisible), sections compactes + listes bullet clean
     ✅ Style pro, pas chargé, actions claires
     ✅ Logique/script inchangés (mêmes fonctions/états)
-->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import {
  InformationCircleIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

type Tab = "SURCHARGES" | "CONTENU";
const activeTab = ref<Tab>("SURCHARGES");

const loading = ref(false);
const busy = reactive({ reload: false, save: false, apply: false, export: false });
const error = ref<string | null>(null);

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function money2(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}
function money0(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(x);
}
function int(v: any) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n(v));
}
function pricePerKg(prixTonne: number): number {
  const p = n(prixTonne);
  if (p <= 0) return 0;
  return p / 1000;
}
function roundTo5(x: number): number {
  const v = n(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v / 5) * 5;
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function todayFr() {
  const d = new Date();
  return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function formatDateFr(x: any) {
  try {
    if (!x) return "";
    const d = typeof x === "string" ? new Date(x) : x;
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

/* =========================
   STATE
========================= */
const pnl = computed<any | null>(() => (store as any).activePnl ?? null);
const variant = computed<any | null>(() => (store as any).activeVariant ?? null);
const contract = computed<any | null>(() => (store as any).activeContract ?? null);

const dureeMois = computed(() => n(contract.value?.dureeMois ?? 0));
const rows = computed<any[]>(() => variant.value?.formules?.items ?? []);
const volumeTotalFromFormules = computed(() => rows.value.reduce((s, r) => s + n(r?.volumeM3), 0));

const quantiteProjetM3 = computed(() => {
  const c = contract.value ?? {};
  const maybe = n((c as any)?.quantiteM3) || n((c as any)?.volumeM3) || n((c as any)?.volumeTotalM3) || 0;
  return maybe > 0 ? maybe : volumeTotalFromFormules.value;
});

/* =========================
   TOGGLES (header)
========================= */
const withMajorations = computed({
  get: () => Boolean((store as any).headerUseMajorations),
  set: (v: boolean) => (store as any).setHeaderUseMajorations(Boolean(v)),
});

const withDevisSurcharge = computed({
  get: () => Boolean((store as any).headerUseDevisSurcharge),
  set: (v: boolean) => (store as any).setHeaderUseDevisSurcharge(Boolean(v)),
});

/* =========================
   DRAFT SURCHARGES
========================= */
const draft = reactive({
  surcharges: {} as Record<string, number>,
  applyToDashboardOnSave: true,
});

function rowKey(r: any): string {
  return String(r?.id ?? r?.variantFormuleId ?? r?.formuleId ?? r?.formule?.id ?? "");
}
function getSurcharge(r: any): number {
  const k = rowKey(r);
  return n(draft.surcharges[k] ?? 0);
}
function setSurcharge(r: any, v: any) {
  const k = rowKey(r);
  draft.surcharges[k] = n(v);
}
function isRowTouched(r: any): boolean {
  return Math.abs(getSurcharge(r)) > 0;
}

/* =========================
   LOAD persisted devis.* (surcharges + content)
========================= */
type LineItem = { label: string; value?: string; locked?: boolean }; // locked=true => piloté contrat (non éditable)
type PriceExtra = { label: string; unit?: string; value: number; note?: string };

const DELAY_PENALTY_LABEL = "Pénalité de dépassement de délai (selon conditions contractuelles)";

function dropDelayPenalty(extras: PriceExtra[]): PriceExtra[] {
  return (extras ?? []).filter((x) => String(x?.label ?? "").trim() !== DELAY_PENALTY_LABEL);
}

const content = reactive({
  meta: {
    ville: "",
    date: todayISO(),
    client: "",
    titreProjet: "",
  },
  intro: "",
  rappel: {
    quantiteM3: 0,
    dureeMois: 0,
    demarrage: "",
    lieu: "",
  },
  chargeFournisseur: [] as LineItem[],
  chargeClient: [] as LineItem[],
  prixComplementaires: [] as PriceExtra[],
  dureeQuantiteTexte: "",
  validiteTexte: "",
  signature: {
    nom: "",
    poste: "",
    telephone: "",
  },
});

function safeParseJson(raw: any, fallback: any) {
  try {
    if (!raw) return fallback;
    if (typeof raw === "object") return raw;
    const p = JSON.parse(String(raw));
    return p ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeLineItems(x: any, fallback: LineItem[]): LineItem[] {
  const arr = Array.isArray(x) ? x : [];
  const out: LineItem[] = [];
  for (const it of arr) {
    const label = String(it?.label ?? it?.text ?? it?.value ?? "").trim();
    if (!label) continue;
    out.push({ label, value: typeof it?.value === "string" ? it.value : undefined, locked: Boolean(it?.locked) });
  }
  return out.length ? out : fallback;
}

function normalizePriceExtras(x: any, fallback: PriceExtra[]): PriceExtra[] {
  const arr = Array.isArray(x) ? x : [];
  const out: PriceExtra[] = [];
  for (const it of arr) {
    const label = String(it?.label ?? "").trim();
    if (!label) continue;
    out.push({
      label,
      unit: it?.unit ? String(it.unit) : undefined,
      value: n(it?.value),
      note: it?.note ? String(it.note) : undefined,
    });
  }
  return out.length ? out : fallback;
}

/* =========================
   ✅ Répartition depuis le contrat (source-of-truth) MAIS :
   - Seules les phrases liées DIRECTEMENT au contrat sont "locked"
   - Les phrases standard Word restent éditables (non locked) et ne sont pas régénérées
========================= */
type Side = "CLIENT" | "LHM";

function normalizeChargeSide(v: any): Side | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return null;

  if (s === "client" || s.includes("client")) return "CLIENT";
  if (s === "lhm" || s.includes("lhm") || s.includes("holcim") || s.includes("lafarge")) return "LHM";

  if (s === "c") return "CLIENT";
  if (s === "f" || s === "four" || s.includes("fourn")) return "LHM";

  return null;
}

// ✅ si champ vide / non reconnu => LHM
function decideSideFromContractField(fieldVal: any): Side {
  return normalizeChargeSide(fieldVal) ?? "LHM";
}

function normLabel(s: any): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeAcrossSides(lhm: LineItem[], client: LineItem[], templateSideByLabel: Record<string, Side>) {
  const mapL = new Map<string, LineItem>();
  const mapC = new Map<string, LineItem>();

  for (const it of lhm ?? []) {
    const k = normLabel(it?.label);
    if (!k) continue;
    if (!mapL.has(k)) mapL.set(k, it);
  }
  for (const it of client ?? []) {
    const k = normLabel(it?.label);
    if (!k) continue;
    if (!mapC.has(k)) mapC.set(k, it);
  }

  const allKeys = new Set([...mapL.keys(), ...mapC.keys()]);
  const outL: LineItem[] = [];
  const outC: LineItem[] = [];

  for (const k of allKeys) {
    const inL = mapL.get(k);
    const inC = mapC.get(k);

    if (inL && inC) {
      const target = templateSideByLabel[k] ?? "LHM";
      if (target === "CLIENT") outC.push(inC);
      else outL.push(inL);
      continue;
    }

    if (inL) outL.push(inL);
    if (inC) outC.push(inC);
  }

  return { lhm: outL, client: outC };
}

function buildContractTemplateLocked() {
  const c: any = contract.value ?? {};

  const LABELS = {
    groupTransportInstall: "Transport et installation sur site d’une centrale à béton de capacité de malaxeur de 2m3;",
    transportOnly: "Transport sur site d’une centrale à béton de capacité de malaxeur de 2m3;",
    installOnly: "Installation sur site d’une centrale à béton de capacité de malaxeur de 2m3;",
    cabOnly: "Mise à disposition d’une centrale à béton de capacité de malaxeur de 2m3;",

    genieCivil:
      "Travaux de génie civil de la centrale à béton et ses annexes (bassins de décantation, casiers, clôture…)",
    mp: "Fourniture des matières premières nécessaires à la fabrication des bétons ;",
    consoEau: "Consommation d’eau pour les besoins des centrales à béton ;",
    consoElec: "Consommation d’électricité pour les besoins des centrales à béton ;",
    chargeuse: "Mise à disposition d’une chargeuse de capacité suffisante pour l’alimentation de la centrale à béton ;",
    maintenance: "Maintenance (pièces et main d’œuvre) des centrales et chargeurs ;",
    terrain:
      "Mise à disposition d’un terrain plane et compacté pour l’installation de la centrale à béton. La superficie minimale du terrain est 4.000m².",

    branchements: "Branchement en Eau et Electricité aux pieds des centrales à béton ;",
    branchementEauOnly: "Branchement en Eau aux pieds des centrales à béton ;",
    branchementElecOnly: "Branchement en Electricité aux pieds des centrales à béton ;",
  };

  const templateSideByLabel: Record<string, Side> = {};
  const lhm: LineItem[] = [];
  const client: LineItem[] = [];

  const pushLocked = (label: string, side: Side) => {
    const item: LineItem = { label, locked: true };
    if (side === "CLIENT") client.push(item);
    else lhm.push(item);
    templateSideByLabel[normLabel(label)] = side;
  };

  const sideTransport = normalizeChargeSide(c.transport);
  const sideInstall = normalizeChargeSide(c.installation);
  const sideCab = normalizeChargeSide(c.cab);

  const allDefined = sideTransport != null && sideInstall != null && sideCab != null;
  const allSame = allDefined && sideTransport === sideInstall && sideInstall === sideCab;

  if (allSame) {
    pushLocked(LABELS.groupTransportInstall, sideTransport as Side);
  } else {
    pushLocked(LABELS.transportOnly, decideSideFromContractField(c.transport));
    pushLocked(LABELS.installOnly, decideSideFromContractField(c.installation));
    pushLocked(LABELS.cabOnly, decideSideFromContractField(c.cab));
  }

  pushLocked(LABELS.genieCivil, decideSideFromContractField(c.genieCivil));
  pushLocked(LABELS.mp, decideSideFromContractField(c.matierePremiere));
  pushLocked(LABELS.consoEau, decideSideFromContractField(c.consoEau));
  pushLocked(LABELS.consoElec, decideSideFromContractField(c.consoElec));
  pushLocked(LABELS.chargeuse, decideSideFromContractField(c.chargeuse));
  pushLocked(LABELS.maintenance, decideSideFromContractField(c.maintenance));
  pushLocked(LABELS.terrain, decideSideFromContractField(c.terrain));

  const sEau = normalizeChargeSide(c.branchementEau);
  const sElec = normalizeChargeSide(c.branchementElec);

  if (sEau && sElec && sEau === sElec) {
    pushLocked(LABELS.branchements, sEau);
  } else {
    pushLocked(LABELS.branchementEauOnly, decideSideFromContractField(c.branchementEau));
    pushLocked(LABELS.branchementElecOnly, decideSideFromContractField(c.branchementElec));
  }

  const tplSet = new Set(Object.keys(templateSideByLabel));
  return { lhm, client, templateSideByLabel, tplSet };
}

function buildWordDefaultsEditable() {
  const L = {
    personnel:
      "Personnels d’exploitation et de conduite de la centrale : 24 mois maximum sur un poste de 10 heures hors Dimanche et jours fériés.",
    reception: "Réception des commandes et organisation des livraisons ;",
    etudes:
      "Etudes formulations et de convenances des bétons objets de cette offre par notre laboratoire interne (une gâchée de 2m3 par formule) ;",
    autocontroles: "Autocontrôles de fabrication selon les normes Marocaines ;",
    gestion: "Gestion automatisée et informatisée du système de fabrication.",

    programme: "Programme mensuel et hebdomadaire de la semaine suivante confirmé tous les Jeudis avant 16h ;",
    confirmation: "Confirmation journalière des commandes la veille avant 16h ;",
    receptionControle: "Réception, contrôle du béton et du déchargement des camions-malaxeurs ;",
    autorisationsES:
      "Prise en charge des autorisations d’entrée et de sortie au site pour le personnel, les camions malaxeurs et les pompes ;",
    entretienVoies:
      "Entretien des voies d’accès des camions malaxeurs et camions de la matière première ;",
    autorisationsCoulage: "Prise en charge des autorisations pour le coulage des bétons.",
    labo: "Prestations de laboratoire externe pour la convenance et les contrôles courants du béton et d’agrégats selon CCTP.",
  };

  const lhm: LineItem[] = [{ label: L.personnel }, { label: L.reception }, { label: L.etudes }, { label: L.autocontroles }, { label: L.gestion }];
  const client: LineItem[] = [
    { label: L.programme },
    { label: L.confirmation },
    { label: L.receptionControle },
    { label: L.autorisationsES },
    { label: L.entretienVoies },
    { label: L.autorisationsCoulage },
    { label: L.labo },
  ];

  return { lhm, client };
}

function buildDefaultPrixComplementaires(): PriceExtra[] {
  const c = contract.value ?? {};
  const extras: PriceExtra[] = [
    {
      label: "Ouverture de centrale en dehors des horaires de travail (Poste de nuit, Jour férié & Dimanche)",
      unit: "DH HT / poste",
      value: n((c as any)?.sundayPrice) || 5000,
    },
    {
      label: "Mise à disposition de la centrale à béton et son personnel d’exploitation au-delà de la durée contractuelle",
      unit: "DH HT / mois",
      value: 150000,
    },
  ];

  const chillerRent = n((c as any)?.chillerRent);
  if (chillerRent > 0) {
    extras.push({
      label:
        "Dans le cas où la température ambiante est élevée (>30°C), pour les bétons dont la température exigée est <=30°C, l’utilisation du refroidisseur d’eau « Chiller » est nécessaire et sera facturée",
      unit: "MAD HT / mois",
      value: chillerRent,
    });
  }

  return extras;
}

/* =========================
   ✅ Dirty tracking (export = version enregistrée)
========================= */
const lastSavedSnapshot = ref<string>("");

function sortKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
    return out;
  }
  return obj;
}

function makeSnapshot(): string {
  const line = (it: any) => ({ label: String(it?.label ?? ""), locked: Boolean(it?.locked) });
  const extra = (x: any) => ({
    label: String(x?.label ?? ""),
    unit: x?.unit != null ? String(x.unit) : "",
    value: n(x?.value),
    note: x?.note != null ? String(x.note) : "",
  });

  const snap = {
    surcharges: { ...(draft.surcharges ?? {}) },
    applyToDashboardOnSave: Boolean(draft.applyToDashboardOnSave),

    meta: { ...content.meta },
    intro: String(content.intro ?? ""),
    rappel: { ...content.rappel },
    chargeFournisseur: (content.chargeFournisseur ?? []).map(line),
    chargeClient: (content.chargeClient ?? []).map(line),
    prixComplementaires: (content.prixComplementaires ?? []).map(extra),
    dureeQuantiteTexte: String(content.dureeQuantiteTexte ?? ""),
    validiteTexte: String(content.validiteTexte ?? ""),
    signature: { ...content.signature },
  };

  return JSON.stringify(sortKeys(snap));
}

const isDirty = computed(() => {
  if (!lastSavedSnapshot.value) return false;
  return makeSnapshot() !== lastSavedSnapshot.value;
});

const exportGuardOpen = ref(false);

function openExportGuardIfNeeded() {
  if (!isDirty.value) return false;
  exportGuardOpen.value = true;
  return true;
}
function closeExportGuard() {
  exportGuardOpen.value = false;
}

/* =========================
   Load / Sync
========================= */
function loadPersistedAll() {
  draft.surcharges = {};
  const v = variant.value;
  if (v?.devis?.surcharges) {
    try {
      const obj = typeof v.devis.surcharges === "object" ? v.devis.surcharges : JSON.parse(String(v.devis.surcharges));
      const map = (obj?.surcharges ?? obj) as any;
      if (map && typeof map === "object") {
        for (const [k, val] of Object.entries(map)) draft.surcharges[String(k)] = n(val);
      }
    } catch {}
  }

  const vDevis = v?.devis ?? null;
  const persistedMeta = safeParseJson((vDevis as any)?.meta, {});
  const persistedRappel = safeParseJson((vDevis as any)?.rappel, {});
  const persistedSignature = safeParseJson((vDevis as any)?.signature, {});

  const tpl = buildContractTemplateLocked();
  const wordDefaults = buildWordDefaultsEditable();

  const pnlTitle = String(pnl.value?.title ?? "").trim();
  content.meta.ville = String(persistedMeta?.ville ?? pnl.value?.city ?? "");
  content.meta.date = String(persistedMeta?.date ?? todayISO());
  content.meta.client = String(persistedMeta?.client ?? pnl.value?.client ?? "");
  content.meta.titreProjet = String(persistedMeta?.titreProjet ?? pnlTitle);

  content.intro =
    typeof (vDevis as any)?.intro === "string" && String((vDevis as any).intro).trim().length
      ? String((vDevis as any).intro)
      : `Nous vous prions de trouver ci-dessous les détails de notre offre de prix de fourniture des bétons prêts à l’emploi pour les travaux de construction des "${content.meta.titreProjet}".`;

  content.rappel.quantiteM3 = n(persistedRappel?.quantiteM3) || quantiteProjetM3.value;
  content.rappel.dureeMois = n(persistedRappel?.dureeMois) || dureeMois.value;
  content.rappel.demarrage = String(persistedRappel?.demarrage ?? formatDateFr(pnl.value?.startDate) ?? "");
  content.rappel.lieu = String(persistedRappel?.lieu ?? pnl.value?.city ?? "");

  const persistedLhmRaw = safeParseJson((vDevis as any)?.chargeFournisseur, null);
  const persistedClientRaw = safeParseJson((vDevis as any)?.chargeClient, null);
  const persistedExtrasRaw = safeParseJson((vDevis as any)?.prixComplementaires, null);

  const curLhm = normalizeLineItems(persistedLhmRaw, []);
  const curClient = normalizeLineItems(persistedClientRaw, []);

  const keepLhm = curLhm.filter((it) => !tpl.tplSet.has(normLabel(it?.label)) && !it?.locked);
  const keepClient = curClient.filter((it) => !tpl.tplSet.has(normLabel(it?.label)) && !it?.locked);

  const hasAnyPersisted = curLhm.length + curClient.length > 0;
  const baseL = hasAnyPersisted ? [] : wordDefaults.lhm;
  const baseC = hasAnyPersisted ? [] : wordDefaults.client;

  const mergedL = [...tpl.lhm, ...baseL, ...keepLhm];
  const mergedC = [...tpl.client, ...baseC, ...keepClient];

  const dedup = dedupeAcrossSides(mergedL, mergedC, tpl.templateSideByLabel);
  content.chargeFournisseur = dedup.lhm;
  content.chargeClient = dedup.client;

  const templateExtras = dropDelayPenalty(buildDefaultPrixComplementaires());
  const curExtras = dropDelayPenalty(normalizePriceExtras(persistedExtrasRaw, templateExtras));

  const tset = new Set((templateExtras ?? []).map((x) => String(x?.label ?? "").trim()).filter(Boolean));
  const keepCustomExtras = (curExtras ?? []).filter((x) => {
    const lbl = String(x?.label ?? "").trim();
    if (!lbl) return false;
    return !tset.has(lbl);
  });
  content.prixComplementaires = [...templateExtras, ...keepCustomExtras];

  const q = content.rappel.quantiteM3;
  const d = content.rappel.dureeMois;

  content.dureeQuantiteTexte =
    typeof (vDevis as any)?.dureeQuantiteTexte === "string" && String((vDevis as any).dureeQuantiteTexte).trim().length
      ? String((vDevis as any).dureeQuantiteTexte)
      : `Les prix sont donnés pour un volume de ${int(q)} m3 et une durée de ${int(d)} mois. En aucun cas les volumes réalisés ne devront être inférieurs de plus de 90% du volume susmentionné.`;

  content.validiteTexte =
    typeof (vDevis as any)?.validiteTexte === "string" && String((vDevis as any).validiteTexte).trim().length
      ? String((vDevis as any).validiteTexte)
      : "Offre valable pour une durée d’un mois à partir de sa date d’envoi.";

  content.signature.nom = String(persistedSignature?.nom ?? "Saad LAHLIMI");
  content.signature.poste = String(persistedSignature?.poste ?? "Commercial P&L");
  content.signature.telephone = String(persistedSignature?.telephone ?? "+212701888888");

  lastSavedSnapshot.value = makeSnapshot();
}

function syncDevisFromContract() {
  const tpl = buildContractTemplateLocked();

  const keepLhm = (content.chargeFournisseur ?? []).filter((it) => !it?.locked && !tpl.tplSet.has(normLabel(it?.label)));
  const keepClient = (content.chargeClient ?? []).filter((it) => !it?.locked && !tpl.tplSet.has(normLabel(it?.label)));

  const mergedL = [...tpl.lhm, ...keepLhm];
  const mergedC = [...tpl.client, ...keepClient];

  const dedup = dedupeAcrossSides(mergedL, mergedC, tpl.templateSideByLabel);
  content.chargeFournisseur = dedup.lhm;
  content.chargeClient = dedup.client;

  const templateExtras = dropDelayPenalty(buildDefaultPrixComplementaires());
  const tset = new Set((templateExtras ?? []).map((x) => String(x?.label ?? "").trim()).filter(Boolean));
  const keepCustom = (content.prixComplementaires ?? []).filter((x) => {
    const lbl = String(x?.label ?? "").trim();
    if (!lbl) return false;
    return !tset.has(lbl);
  });
  content.prixComplementaires = [...templateExtras, ...keepCustom];

  content.rappel.quantiteM3 = quantiteProjetM3.value;
  content.rappel.dureeMois = dureeMois.value;
}

/* =========================
   BASE CALCS (/m3)
========================= */
function mpPrixUsed(mpId: string): number {
  const mpItems = variant.value?.mp?.items ?? [];
  const vmp = mpItems.find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return n(vmp.prix);
  return n(vmp?.mp?.prix);
}

function cmpFormuleBaseM3(formule: any): number {
  const compo = formule?.items ?? [];
  return (compo ?? []).reduce((s: number, it: any) => {
    const mpId = String(it?.mpId ?? "");
    const qtyKg = n(it?.qty);
    const prixKg = pricePerKg(mpPrixUsed(mpId));
    return s + qtyKg * prixKg;
  }, 0);
}

const transportBaseM3 = computed(() => n(variant.value?.transport?.prixMoyen ?? 0));

function pvBaseM3(r: any): number {
  const cmp = cmpFormuleBaseM3(r?.formule);
  const momd = n(r?.momd);
  return cmp + transportBaseM3.value + momd;
}

/* =========================
   IMPACT MAJORATIONS (/m3) - header-based
========================= */
const impactMajorationM3 = computed(() => {
  const v = variant.value;
  const vol = volumeTotalFromFormules.value;
  if (!v || vol <= 0) return 0;

  const d = dureeMois.value;

  const vBase = {
    ...v,
    autresCouts: {
      ...(v.autresCouts ?? {}),
      majorations: null,
    },
  };

  const kBase = computeHeaderKpis(vBase, d, null, null, false);
  const kMaj = computeHeaderKpis(v, d, null, null, false);

  const deltaCA = n(kMaj?.caTotal) - n(kBase?.caTotal);
  return deltaCA / vol;
});

function pvWithMajorationM3(r: any): number {
  return pvBaseM3(r) + impactMajorationM3.value;
}

/* =========================
   PONDERE / DEFINITIF
========================= */
function pvPondereM3(r: any): number {
  const base = withMajorations.value ? pvWithMajorationM3(r) : pvBaseM3(r);
  return roundTo5(base);
}
function pvDefinitifM3(r: any): number {
  return pvPondereM3(r) + getSurcharge(r);
}

const prixMoyenDefinitif = computed(() => {
  const vol = volumeTotalFromFormules.value;
  if (vol <= 0) return 0;
  const total = rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
  return total / vol;
});

const caDevisTotal = computed(() => rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0));

const touchedCount = computed(() => rows.value.filter((r) => isRowTouched(r)).length);

/* =========================
   API
========================= */
async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;

  try {
    if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
    loadPersistedAll();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

function applyToDashboard() {
  busy.apply = true;
  try {
    (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
    withDevisSurcharge.value = true;
  } finally {
    busy.apply = false;
  }
}

async function saveDevis() {
  const v = variant.value;
  if (!v?.id) return;

  busy.save = true;
  error.value = null;

  try {
    if (draft.applyToDashboardOnSave) {
      (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
      withDevisSurcharge.value = true;
    }

    await (store as any).saveDevis(String(v.id), {
      surcharges: { ...draft.surcharges },

      meta: { ...content.meta },
      intro: String(content.intro ?? ""),
      rappel: { ...content.rappel },
      chargeFournisseur: content.chargeFournisseur ?? [],
      chargeClient: content.chargeClient ?? [],
      prixComplementaires: content.prixComplementaires ?? [],
      dureeQuantiteTexte: String(content.dureeQuantiteTexte ?? ""),
      validiteTexte: String(content.validiteTexte ?? ""),
      signature: { ...content.signature },
    });

    await (store as any).loadPnls();
    lastSavedSnapshot.value = makeSnapshot();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
}

async function doExportWord() {
  const v = variant.value;
  if (!v?.id) return;

  busy.export = true;
  error.value = null;
  try {
    await (store as any).exportDevisWord(String(v.id));
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.export = false;
  }
}

async function exportWord() {
  if (busy.export || busy.save) return;
  if (openExportGuardIfNeeded()) return;
  await doExportWord();
}

async function saveAndExport() {
  if (busy.export || busy.save) return;
  closeExportGuard();
  await saveDevis();
  if (error.value) return;
  await doExportWord();
}

function resetSurcharges() {
  loadPersistedAll();
  nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* ✅ Anti-pollution header preview */
onBeforeUnmount(() => {
  try {
    (store as any).setHeaderDevisSurchargesPreview(null);
  } catch {}
});

onMounted(async () => {
  await reload();
});

watch(
  () => variant.value?.id,
  () => loadPersistedAll()
);

watch(
  () => {
    const c: any = contract.value ?? null;
    return JSON.stringify({
      id: c?.id ?? null,
      cab: c?.cab ?? null,
      installation: c?.installation ?? null,
      transport: c?.transport ?? null,
      genieCivil: c?.genieCivil ?? null,
      terrain: c?.terrain ?? null,
      matierePremiere: c?.matierePremiere ?? null,
      maintenance: c?.maintenance ?? null,
      chargeuse: c?.chargeuse ?? null,
      branchementEau: c?.branchementEau ?? null,
      branchementElec: c?.branchementElec ?? null,
      consoEau: c?.consoEau ?? null,
      consoElec: c?.consoElec ?? null,
      dureeMois: c?.dureeMois ?? null,
      quantiteM3: c?.quantiteM3 ?? c?.volumeM3 ?? c?.volumeTotalM3 ?? null,
      sundayPrice: c?.sundayPrice ?? null,
      chillerRent: c?.chillerRent ?? null,
    });
  },
  (nv, ov) => {
    if (!nv || nv === ov) return;
    syncDevisFromContract();
  }
);

/* =========================
   UI helpers - content editing
========================= */
function addLine(which: "lhm" | "client") {
  const target = which === "lhm" ? content.chargeFournisseur : content.chargeClient;
  target.push({ label: "" });
}
function removeLine(which: "lhm" | "client", idx: number) {
  const target = which === "lhm" ? content.chargeFournisseur : content.chargeClient;
  const it = target[idx];
  if (it?.locked) return;
  target.splice(idx, 1);
}
function addExtra() {
  content.prixComplementaires.push({ label: "", unit: "MAD HT", value: 0 });
}
function removeExtra(idx: number) {
  content.prixComplementaires.splice(idx, 1);
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="top card">
      <div class="tleft">
        <div class="titleLine">
          <div class="title">Devis</div>
          <div class="pill" v-if="isDirty">
            <span class="dot" aria-hidden="true"></span>
            Modifié
          </div>
        </div>

        <div class="subline">
          <span class="muted">Variante</span>
          <b class="ell">{{ variant?.title ?? "—" }}</b>
          <span class="sep">•</span>
          <span class="muted">Volume</span>
          <b class="mono">{{ int(volumeTotalFromFormules) }}</b><span class="muted">m³</span>
          <span class="sep">•</span>
          <span class="muted">Prix moyen</span>
          <b class="mono">{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>
        </div>
      </div>

      <div class="tright">
        <button class="iconBtn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="ic" />
        </button>

        <button class="btn" @click="resetSurcharges" :disabled="busy.save">Réinitialiser</button>

        <button
          class="btn"
          :class="{ warnBtn: isDirty }"
          @click="exportWord"
          :disabled="busy.export || !variant?.id"
          :title="isDirty ? 'Export = dernière version enregistrée' : 'Exporter en Word'"
        >
          <ArrowDownTrayIcon class="ic" />
          {{ busy.export ? "Export..." : "Exporter Word" }}
        </button>

        <button class="btn primary" @click="saveDevis" :disabled="busy.save || !variant?.id">
          <CheckBadgeIcon class="ic" />
          {{ busy.save ? "Enregistrement..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <!-- Dirty info compact -->
    <div v-if="isDirty" class="dirtyBar">
      <ExclamationTriangleIcon class="warnIc" />
      <div class="dirtyTxt">
        <b>Changements non enregistrés.</b>
        <span class="muted">Si tu exportes maintenant, le Word utilisera la dernière version enregistrée.</span>
      </div>
      <div class="dirtyActions">
        <button class="btn mini" @click="saveDevis" :disabled="busy.save || !variant?.id">Enregistrer</button>
        <button class="btn mini" @click="exportGuardOpen = true" :disabled="busy.export || !variant?.id">
          Exporter quand même
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- Tabs (pro + simples) -->
    <div class="tabs">
      <button class="tab" :class="{ active: activeTab === 'SURCHARGES' }" @click="activeTab = 'SURCHARGES'">
        Surcharges
        <span class="badge">{{ touchedCount }}</span>
      </button>
      <button class="tab" :class="{ active: activeTab === 'CONTENU' }" @click="activeTab = 'CONTENU'">
        Contenu
      </button>
    </div>

    <!-- =========================
         TAB 1 : SURCHARGES
         ✅ 0 scroll horizontal : tableau = 4 colonnes
         (Métriques CMP/MOMD/PV pond en sous-ligne)
    ========================= -->
    <template v-if="activeTab === 'SURCHARGES'">
      <div class="card controls">
        <div class="checks">
          <label class="chk">
            <input type="checkbox" v-model="withMajorations" />
            <span>Appliquer majorations</span>
          </label>

          <label class="chk">
            <input type="checkbox" v-model="withDevisSurcharge" />
            <span>Dashboard : surcharge devis</span>
          </label>

          <label class="chk">
            <input type="checkbox" v-model="draft.applyToDashboardOnSave" />
            <span>Appliquer au dashboard lors du save</span>
          </label>
        </div>

        <div class="rightInfo">
          <div class="miniStat" v-if="withMajorations">
            <div class="k">Impact majorations</div>
            <div class="v mono">{{ money2(impactMajorationM3) }} <span class="muted">DH/m³</span></div>
          </div>

          <button class="btn" @click="applyToDashboard" :disabled="busy.apply">Appliquer au dashboard</button>
        </div>
      </div>

      <div class="card tableCard">
        <div class="tHead">
          <div>Désignation</div>
          <div class="r">Surcharge</div>
          <div class="r">PV déf.</div>
          <div class="r">Total</div>
        </div>

        <div class="tBody">
          <div v-if="rows.length === 0" class="emptyRow">Aucune formule dans cette variante.</div>

          <div v-for="r in rows" :key="rowKey(r)" class="tRow" :class="{ touched: isRowTouched(r) }">
            <!-- col 1 -->
            <div class="cell main">
              <div class="mainTop">
                <b class="ell">{{ r?.formule?.label ?? "—" }}</b>

                <!-- tooltip -->
                <span class="tipWrap">
                  <button class="tipBtn" type="button" aria-label="Détails">
                    <InformationCircleIcon class="tipIc" />
                  </button>
                  <span class="tip" role="tooltip">
                    CMP : <b class="mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</b> DH/m³<br />
                    Transport (base) : <b class="mono">{{ money2(transportBaseM3) }}</b> DH/m³<br />
                    MOMD : <b class="mono">{{ money2(r?.momd) }}</b> DH/m³<br />
                    PV Base : <b class="mono">{{ money2(pvBaseM3(r)) }}</b> DH/m³<br />
                    <template v-if="withMajorations">
                      PV Maj : <b class="mono">{{ money2(pvWithMajorationM3(r)) }}</b> DH/m³<br />
                    </template>
                    PV Pond (arrondi 5) : <b class="mono">{{ money2(pvPondereM3(r)) }}</b> DH/m³<br />
                    <span class="mutedLine">Clé: {{ rowKey(r) }}</span>
                  </span>
                </span>
              </div>

              <div class="sub">
                <span class="chip"><span class="muted">Vol</span> <b class="mono">{{ int(r?.volumeM3) }}</b> <span class="muted">m³</span></span>
                <span class="chip"><span class="muted">CMP</span> <b class="mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</b></span>
                <span class="chip"><span class="muted">MOMD</span> <b class="mono">{{ money2(r?.momd) }}</b></span>
                <span class="chip"><span class="muted">PV pond</span> <b class="mono">{{ money2(pvPondereM3(r)) }}</b></span>
              </div>
            </div>

            <!-- col 2 -->
            <div class="cell r">
              <input
                class="input num"
                type="number"
                step="1"
                :value="getSurcharge(r)"
                @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <!-- col 3 -->
            <div class="cell r">
              <span class="pillFinal mono">{{ money2(pvDefinitifM3(r)) }}</span>
            </div>

            <!-- col 4 -->
            <div class="cell r">
              <b class="mono">{{ money2(pvDefinitifM3(r) * n(r?.volumeM3)) }}</b>
            </div>
          </div>
        </div>

        <div class="tFoot">
          <div class="sumGrid">
            <div class="sumBox">
              <div class="k">Prix moyen</div>
              <div class="v mono">{{ money2(prixMoyenDefinitif) }} <span>DH/m³</span></div>
            </div>
            <div class="sumBox">
              <div class="k">Volume</div>
              <div class="v mono">{{ int(volumeTotalFromFormules) }} <span>m³</span></div>
            </div>
            <div class="sumBox">
              <div class="k">CA devis</div>
              <div class="v mono">{{ money2(caDevisTotal) }} <span>DH</span></div>
            </div>
          </div>

          <div class="muted noteLine">
            • <b>Pond</b> = PV arrondi au multiple de 5. • <b>Surcharge</b> peut être négative et s’ajoute après
            pondération.
          </div>
        </div>
      </div>
    </template>

    <!-- =========================
         TAB 2 : CONTENU
         ✅ 1 colonne, lisible
         - sections compactes
         - listes en bullets (locked) + textarea pour custom
    ========================= -->
    <template v-else>
      <div class="card section">
        <div class="sectionHead">
          <div class="lbl">En-tête</div>
          <div class="muted">{{ content.meta.ville || (pnl?.city ?? "") }}, le <b>{{ todayFr() }}</b></div>
        </div>

        <div class="grid3">
          <div>
            <div class="k">Ville</div>
            <input class="input" v-model="content.meta.ville" placeholder="Ville" />
          </div>
          <div>
            <div class="k">Date</div>
            <input class="input" v-model="content.meta.date" type="date" />
          </div>
          <div>
            <div class="k">Client</div>
            <input class="input" v-model="content.meta.client" placeholder="Client" />
          </div>
        </div>

        <div style="margin-top:10px;">
          <div class="k">Titre projet</div>
          <input class="input" v-model="content.meta.titreProjet" placeholder="Titre projet" />
        </div>
      </div>

      <div class="card section">
        <div class="lbl">Introduction</div>
        <textarea class="ta" v-model="content.intro" rows="3"></textarea>
      </div>

      <div class="card section">
        <div class="lbl">Rappel des données du projet</div>

        <div class="grid2kv">
          <div class="kv">
            <div class="k">Quantité</div>
            <div class="v"><b>{{ int(quantiteProjetM3) }}</b> <span class="muted">m³</span></div>
          </div>
          <div class="kv">
            <div class="k">Délai</div>
            <div class="v"><b>{{ int(dureeMois) }}</b> <span class="muted">mois</span></div>
          </div>
          <div class="kv">
            <div class="k">Démarrage</div>
            <div class="v"><b>{{ formatDateFr(pnl?.startDate) || "—" }}</b></div>
          </div>
          <div class="kv">
            <div class="k">Lieu</div>
            <div class="v"><b>{{ pnl?.city ?? "—" }}</b></div>
          </div>
        </div>

        <div class="muted noteLine">(Ces valeurs proviennent du PnL/contrat et ne sont pas modifiables ici.)</div>
      </div>

      <div class="card section">
        <div class="lbl">Charges & responsabilités</div>

        <div class="subLbl">À la charge de LafargeHolcim Maroc</div>
        <ul class="bullets">
          <li v-for="(it, i) in content.chargeFournisseur" :key="'lhm' + i" class="bullet">
            <template v-if="it.locked">
              <span class="lock">Contrat</span>
              <span class="txt">{{ it.label }}</span>
            </template>
            <template v-else>
              <textarea class="ta small" v-model="it.label" rows="2"></textarea>
              <button class="mini" type="button" @click="removeLine('lhm', i)">Suppr</button>
            </template>
          </li>
        </ul>
        <button class="btn miniAdd" type="button" @click="addLine('lhm')">+ Ajouter ligne</button>

        <div class="sepLine"></div>

        <div class="subLbl">À la charge du client</div>
        <ul class="bullets">
          <li v-for="(it, i) in content.chargeClient" :key="'cl' + i" class="bullet">
            <template v-if="it.locked">
              <span class="lock">Contrat</span>
              <span class="txt">{{ it.label }}</span>
            </template>
            <template v-else>
              <textarea class="ta small" v-model="it.label" rows="2"></textarea>
              <button class="mini" type="button" @click="removeLine('client', i)">Suppr</button>
            </template>
          </li>
        </ul>
        <button class="btn miniAdd" type="button" @click="addLine('client')">+ Ajouter ligne</button>
      </div>

      <div class="card section">
        <div class="lbl">Prix complémentaires</div>

        <div class="extras">
          <div v-for="(x, i) in content.prixComplementaires" :key="'ex' + i" class="exRow">
            <input class="input" v-model="x.label" placeholder="Libellé" />
            <input class="input exUnit" v-model="x.unit" placeholder="Unité" />
            <input class="input exVal" type="number" step="1" :value="x.value" readonly />
            <button class="mini" type="button" @click="removeExtra(i)">Suppr</button>
          </div>
        </div>

        <button class="btn miniAdd" type="button" @click="addExtra">+ Ajouter prix complémentaire</button>
        <div class="muted noteLine">(Le prix est verrouillé. Tu peux modifier uniquement le libellé / l’unité.)</div>
      </div>

      <div class="card section">
        <div class="lbl">Textes</div>

        <div class="subLbl">Durée - Quantité</div>
        <textarea class="ta" v-model="content.dureeQuantiteTexte" rows="3"></textarea>

        <div class="subLbl" style="margin-top:12px;">Validité de l’offre</div>
        <textarea class="ta" v-model="content.validiteTexte" rows="2"></textarea>
      </div>

      <div class="card section">
        <div class="lbl">Signature</div>
        <div class="grid3">
          <div>
            <div class="k">Nom</div>
            <input class="input" v-model="content.signature.nom" placeholder="Nom" />
          </div>
          <div>
            <div class="k">Poste</div>
            <input class="input" v-model="content.signature.poste" placeholder="Poste" />
          </div>
          <div>
            <div class="k">Téléphone</div>
            <input class="input" v-model="content.signature.telephone" placeholder="Téléphone" />
          </div>
        </div>

        <div class="muted noteLine">
          En-tête export : <b>{{ pnl?.title ?? "—" }}</b> - offre de prix - <b>{{ todayFr() }}</b>
        </div>
      </div>
    </template>

    <!-- Export guard modal -->
    <div v-if="exportGuardOpen" class="modalOverlay" @click.self="closeExportGuard">
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Export Word">
        <div class="modalTitle">
          <ExclamationTriangleIcon class="warnIc2" />
          <div>
            <div style="font-weight: 1000; color:#111827;">Exporter sans enregistrer ?</div>
            <div class="muted" style="margin-top:2px;">
              Le Word sera généré depuis <b>la dernière version enregistrée</b>. Tes changements en cours ne seront pas
              inclus.
            </div>
          </div>
        </div>

        <div class="modalActions">
          <button class="btn" type="button" @click="closeExportGuard" :disabled="busy.export || busy.save">Annuler</button>

          <button class="btn" type="button" @click="doExportWord(); closeExportGuard();" :disabled="busy.export || !variant?.id">
            Exporter quand même
          </button>

          <button class="btn primary" type="button" @click="saveAndExport" :disabled="busy.save || busy.export || !variant?.id">
            Enregistrer & exporter
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Base */
.page { padding: 12px; display:flex; flex-direction:column; gap:10px; }
.card { background:#fff; border:1px solid rgba(16,24,40,.12); border-radius:16px; padding:10px 12px; }
.muted { color:#6b7280; font-size:12px; }
.mono { font-variant-numeric: tabular-nums; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sep { color:#9ca3af; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:8px 10px; background:#fff; color:#111827; font-size:12px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.btn{
  border:1px solid rgba(16,24,40,.14);
  background:#fff;
  border-radius:12px;
  padding:7px 10px;
  font-size:11.5px;
  font-weight:1000;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.btn:hover{ background:#f9fafb; }
.btn.primary{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn.warnBtn{ border-color: rgba(245,158,11,0.55); }
.btn.mini{ padding:6px 9px; font-size:11px; }

.iconBtn{
  width:36px; height:36px;
  border-radius:12px;
  border:1px solid rgba(16,24,40,.14);
  background:#fff;
  cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
}
.iconBtn:hover{ background:#f9fafb; }
.ic{ width:16px; height:16px; }

.input { width:100%; padding:7px 9px; border:1px solid #d1d5db; border-radius:12px; font-size:12.5px; background:#fff; }
.ta{
  width:100%;
  border:1px solid #d1d5db;
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 13px;
  background:#fff;
  resize: vertical;
}
.ta.small{ font-size: 12px; }

/* Header */
.top{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.tleft{ min-width:260px; display:flex; flex-direction:column; gap:4px; }
.titleLine{ display:flex; align-items:center; gap:10px; }
.title{ font-size:15px; font-weight:1000; color:#111827; }
.pill{
  display:inline-flex; align-items:center; gap:8px;
  border:1px solid rgba(245,158,11,0.45);
  background: rgba(245,158,11,0.08);
  border-radius:999px;
  padding:4px 10px;
  font-weight:1000;
  font-size:11px;
}
.dot{ width:7px; height:7px; border-radius:999px; background: rgba(245,158,11,1); display:inline-block; }
.subline{ display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:11.5px; }
.tright{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

/* Dirty bar */
.dirtyBar{
  display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;
  border:1px solid rgba(245,158,11,0.45);
  background: rgba(245,158,11,0.08);
  border-radius:14px;
  padding:8px 10px;
}
.warnIc{ width:18px; height:18px; color: rgba(245,158,11,1); flex: 0 0 auto; margin-top: 1px; }
.dirtyTxt{ display:flex; flex-direction:column; gap:2px; min-width:240px; flex:1; }
.dirtyActions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

/* Tabs */
.tabs{ display:flex; gap:8px; flex-wrap:wrap; }
.tab{
  border:1px solid rgba(16,24,40,.12);
  background: rgba(15,23,42,.02);
  border-radius:999px;
  padding:8px 12px;
  font-size:12px;
  font-weight:1000;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.tab:hover{ background: rgba(15,23,42,.04); }
.tab.active{
  background: rgba(24,64,112,.10);
  border-color: rgba(24,64,112,.28);
  color: rgba(24,64,112,1);
}
.badge{
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(15,23,42,.08);
  font-size: 11px;
  font-weight: 1000;
  display:inline-flex; align-items:center; justify-content:center;
}

/* Controls row */
.controls{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
}
.checks{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.chk{ display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:900; color:#111827; }
.chk input{ width:15px; height:15px; border-radius:6px; }

.rightInfo{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.miniStat{
  border:1px solid rgba(16,24,40,.10);
  background: rgba(15,23,42,.02);
  border-radius:14px;
  padding:8px 10px;
}
.miniStat .k{
  font-size:10.5px; font-weight:1000; color: rgba(15,23,42,.55);
  text-transform: uppercase; letter-spacing:.02em;
}
.miniStat .v{ margin-top:3px; font-size:12.5px; font-weight:1000; color:#0f172a; }

/* ✅ Table 4 cols (no horizontal scroll) */
.tableCard{ padding:0; overflow:hidden; }
.tHead{
  display:grid;
  grid-template-columns: minmax(0, 1fr) 120px 130px 150px;
  gap:12px;
  padding:10px 12px;
  background:#fafafa;
  border-bottom:1px solid rgba(16,24,40,.10);
  font-size:10.5px;
  font-weight:1000;
  color: rgba(15,23,42,.60);
}
.tBody{ padding:0; }
.tRow{
  display:grid;
  grid-template-columns: minmax(0, 1fr) 120px 130px 150px;
  gap:12px;
  padding:10px 12px;
  border-bottom:1px solid rgba(16,24,40,.10);
  align-items:center;
}
.tRow:hover{ background: rgba(15,23,42,.02); }
.tRow.touched{
  box-shadow: inset 3px 0 0 rgba(24,64,112,0.55);
  background: rgba(24,64,112,0.03);
}
.r{ text-align:right; }
.cell{ min-width:0; }
.emptyRow{ padding:12px 12px; color:#6b7280; font-size:12px; }

/* main cell */
.mainTop{ display:flex; align-items:center; gap:8px; }
.sub{
  margin-top:6px;
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.chip{
  border:1px solid rgba(16,24,40,.10);
  background: rgba(15,23,42,.02);
  border-radius:999px;
  padding:3px 8px;
  font-size:11px;
  font-weight:900;
  color:#0f172a;
  display:inline-flex; gap:6px; align-items:center;
  max-width:100%;
}
.num{ text-align:right; }
.input.num{ font-variant-numeric: tabular-nums; }

/* PV pill */
.pillFinal{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(24,64,112,0.22);
  background: rgba(24,64,112,0.06);
  font-weight: 1000;
  color: rgba(24,64,112,1);
  white-space: nowrap;
  font-size: 12.5px;
}

/* tooltip */
.tipWrap { position: relative; display:inline-flex; align-items:center; z-index: 5; flex: 0 0 auto; }
.tipBtn{
  width: 22px; height: 22px;
  border-radius: 9px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor: default;
}
.tipIc{ width: 14px; height: 14px; color: rgba(15,23,42,0.55); }
.tip{
  position:absolute;
  left: 30px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 230px;
  max-width: 360px;
  background: rgba(17,24,39,0.96);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 7px 9px;
  border-radius: 12px;
  font-size: 11.5px;
  line-height: 1.22;
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-50%) translateX(-4px);
  z-index: 9999;
}
.tipWrap:hover .tip{ opacity: 1; transform: translateY(-50%) translateX(0px); }
.mutedLine{ display:block; margin-top: 5px; opacity: .85; }

/* Footer sums */
.tFoot{
  padding: 10px 12px;
  background: rgba(15,23,42,0.02);
  border-top: 1px solid rgba(16,24,40,0.08);
}
.sumGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 10px;
}
.sumBox{
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.75);
  border-radius: 14px;
  padding: 10px 12px;
}
.sumBox .k{
  font-size: 10.5px;
  font-weight: 1000;
  color: rgba(15,23,42,0.55);
  text-transform: uppercase;
  letter-spacing: .02em;
}
.sumBox .v{
  margin-top: 4px;
  font-size: 13px;
  font-weight: 1000;
  color: #0f172a;
}
.sumBox .v span{
  color: rgba(15,23,42,0.55);
  font-weight: 900;
  margin-left: 6px;
  font-size: 11.5px;
}
.noteLine{ margin-top:8px; }

/* Content */
.section{ display:flex; flex-direction:column; gap:10px; }
.sectionHead{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.lbl{ font-weight:1000; font-size:13px; color:#111827; }
.subLbl{ font-weight:1000; font-size:12px; color: rgba(15,23,42,.78); }
.kv{
  border:1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 10px 12px;
}
.k{ font-size: 11px; font-weight:1000; color:#6b7280; }
.v{ margin-top: 4px; }

.grid3{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.grid2kv{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }

.sepLine{ height:1px; background: rgba(16,24,40,.10); margin: 8px 0; border-radius:999px; }

.bullets{ list-style: none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.bullet{
  border:1px solid rgba(16,24,40,.10);
  background: rgba(15,23,42,.02);
  border-radius:14px;
  padding: 10px 12px;
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.lock{
  flex:0 0 auto;
  height:18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(24,64,112,0.22);
  background: rgba(24,64,112,0.06);
  color: rgba(24,64,112,1);
  font-size: 10.5px;
  font-weight: 1000;
  display:inline-flex;
  align-items:center;
}
.txt{ flex:1; color:#0f172a; font-size:12.5px; line-height:1.25; white-space: pre-wrap; }

.mini{
  border:1px solid #e5e7eb;
  background:#fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 1000;
  cursor:pointer;
  white-space:nowrap;
}
.mini:hover{ background:#f9fafb; }
.miniAdd{ align-self:flex-start; }

.extras{ display:flex; flex-direction:column; gap: 10px; }
.exRow{
  display:grid;
  grid-template-columns: 1.6fr .6fr .4fr auto;
  gap: 8px;
  align-items:center;
}
.exVal{ text-align:right; }

/* Responsive */
@media (max-width: 980px) {
  .tHead{ display:none; }

  .tRow{
    grid-template-columns: 1fr;
    gap: 10px;
    align-items:start;
  }

  .cell.r{ text-align:left; display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .cell.r::before{
    content: attr(data-label);
    font-weight:1000;
    color: rgba(15,23,42,.65);
  }

  .sumGrid{ grid-template-columns: 1fr; }
  .grid3{ grid-template-columns: 1fr; }
  .grid2kv{ grid-template-columns: 1fr; }
  .exRow{ grid-template-columns: 1fr; }
}

/* Modal */
.modalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,0.45);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index: 999999;
  padding: 16px;
}
.modalCard{
  width: min(560px, 100%);
  background:#fff;
  border: 1px solid rgba(16,24,40,0.12);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(2,6,23,0.35);
  padding: 12px 12px;
}
.modalTitle{
  display:flex;
  align-items:flex-start;
  gap: 10px;
  padding: 6px 6px 10px 6px;
}
.warnIc2{ width:18px; height:18px; color: rgba(245,158,11,1); flex: 0 0 auto; margin-top: 1px; }
.modalActions{
  display:flex;
  justify-content:flex-end;
  gap: 8px;
  flex-wrap:wrap;
  padding: 8px 6px 4px 6px;
}
</style>
