<!-- ✅ src/pages/DevisPage.vue (FICHIER COMPLET / UI-UX refonte + ✅ PV non pondéré)
     Ajustements demandés :
     ✅ Améliorer style + taille du "Total" par formule (aligné style app)
     ✅ Champ "Surcharge" plus petit + BG bleu (comme autres pages)
     ✅ Supprimer la ligne sous le titre (Variante • Vol • PMV)
     ✅ Libellés colonnes EXACTEMENT au-dessus des champs (grid alignée)
     ✅ IMPORTANT: Suppression notion "PV pondéré" (arrondi au 5) => PV déf = PV base + surcharge
-->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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
function int(v: any) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n(v));
}
function pricePerKg(prixTonne: number): number {
  const p = n(prixTonne);
  if (p <= 0) return 0;
  return p / 1000;
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

/* =========================
   TOGGLES (Dashboard preview)
========================= */
const withDevisSurcharge = computed<boolean>({
  get: () => Boolean((store as any).headerUseDevisSurcharge),
  set: (v) => (store as any).setHeaderUseDevisSurcharge?.(Boolean(v)),
});

/* =========================
   DRAFT SURCHARGES
========================= */
const draft = reactive({
  surcharges: {} as Record<string, number>,
  applyToDashboardOnSave: true,
});

/* ✅ Surcharges enregistrées (tri stable)
   - Le tri ne doit PAS bouger pendant l'édition
   - On met à jour après reload/save */
const savedSurcharges = ref<Record<string, number>>({});

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
function getSavedSurcharge(r: any): number {
  const k = rowKey(r);
  return n(savedSurcharges.value?.[k] ?? 0);
}

/* =========================
   LOAD persisted devis.* (surcharges + content)
========================= */
type LineItem = { label: string; value?: string; locked?: boolean };
type PriceExtra = { label: string; unit?: string; value: number; note?: string };
type ExtraArticle = { label: string; qty: number; pu: number };

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
    includePompage: true as boolean,
    extraPompageAuto: true as boolean,
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
  extraArticles: [] as ExtraArticle[],
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

function normalizeExtraArticles(x: any, fallback: ExtraArticle[]): ExtraArticle[] {
  const arr = Array.isArray(x) ? x : [];
  const out: ExtraArticle[] = [];
  for (const it of arr) {
    const label = String(it?.label ?? "").trim();
    if (!label) continue;
    out.push({
      label,
      qty: n(it?.qty),
      pu: n(it?.pu),
    });
  }
  return out.length ? out : fallback;
}

/* =========================
   Répartition depuis le contrat (locked)
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

// ✅ capacité centrale depuis CAB (variant.cab.capacite ou contract.cabCapacite fallback)
function getCabCapacityText(): string {
  const cab: any = (variant.value as any)?.cab ?? (contract.value as any)?.cab ?? {};
  const cap =
    String((cab as any)?.capacite ?? (cab as any)?.capacity ?? (cab as any)?.capacité ?? "").trim() ||
    String((contract.value as any)?.cabCapacite ?? (contract.value as any)?.cabCapacity ?? "").trim();

  if (!cap) return "2m3";
  return cap.replace(/\s+/g, "");
}

function buildContractTemplateLocked() {
  const c: any = contract.value ?? {};
  const cap = getCabCapacityText();

  const LABELS = {
    groupTransportInstall: `Transport et installation sur site d’une centrale à béton de capacité de malaxeur de ${cap};`,
    transportOnly: `Transport sur site d’une centrale à béton de capacité de malaxeur de ${cap};`,
    installOnly: `Installation sur site d’une centrale à béton de capacité de malaxeur de ${cap};`,
    cabOnly: `Mise à disposition d’une centrale à béton de capacité de malaxeur de ${cap};`,

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

  const lhm: LineItem[] = [
    { label: L.personnel },
    { label: L.reception },
    { label: L.etudes },
    { label: L.autocontroles },
    { label: L.gestion },
  ];
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
   Dirty tracking
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
  const ea = (a: any) => ({
    label: String(a?.label ?? ""),
    qty: n(a?.qty),
    pu: n(a?.pu),
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
    extraArticles: (content.extraArticles ?? []).map(ea),
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
   BASE CALCS (/m3)
   ✅ PV NON PONDÉRÉ: PV déf = PV base + surcharge
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

function pvDefinitifM3(r: any): number {
  return pvBaseM3(r) + getSurcharge(r);
}
function pvSavedDefinitifM3(r: any): number {
  return pvBaseM3(r) + getSavedSurcharge(r);
}

/* =========================
   ROWS + TOTALS
   ✅ Tri stable: basé sur savedSurcharges (persisté)
========================= */
const rows = computed<any[]>(() => {
  const list = (variant.value?.formules?.items ?? []).slice();
  list.sort((a: any, b: any) => pvSavedDefinitifM3(b) - pvSavedDefinitifM3(a));
  return list;
});

const volumeTotalFromFormules = computed(() => rows.value.reduce((s, r) => s + n(r?.volumeM3), 0));

const quantiteProjetM3 = computed(() => {
  const c = contract.value ?? {};
  const maybe = n((c as any)?.quantiteM3) || n((c as any)?.volumeM3) || n((c as any)?.volumeTotalM3) || 0;
  return maybe > 0 ? maybe : volumeTotalFromFormules.value;
});

const prixMoyenDefinitif = computed(() => {
  const vol = volumeTotalFromFormules.value;
  if (vol <= 0) return 0;
  const total = rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
  return total / vol;
});

const caDevisTotal = computed(() => rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0));
const touchedCount = computed(() => rows.value.filter((r) => isRowTouched(r)).length);

/* =========================
   Extra articles (hors formules)
========================= */
const EXTRA_POMPAGE_LABEL = "Prestation de pompage";
const EXTRA_HYDROFUGE_LABEL = "Hydrofuge";

function isPompageArticle(a: any): boolean {
  const lbl = String(a?.label ?? "").toLowerCase().trim();
  return lbl === "pompage" || lbl === "prestation de pompage" || lbl.includes("pompage");
}
function isHydrofugeArticle(a: any): boolean {
  const lbl = String(a?.label ?? "").toLowerCase().trim();
  return lbl === "hydrofuge" || lbl.includes("hydrofuge");
}

function baseVolumeForExtras(): number {
  return quantiteProjetM3.value > 0 ? quantiteProjetM3.value : volumeTotalFromFormules.value;
}

function computePompageFromTransport(): { qty: number; pu: number } {
  const t: any = variant.value?.transport ?? {};
  const pct = n(t?.volumePompePct ?? 0);
  const pu = n(t?.prixVentePompe ?? 0);

  const baseVol = baseVolumeForExtras();
  const qty = pct > 0 ? (baseVol * pct) / 100 : 0;

  return { qty, pu };
}

function defaultExtraArticles(): ExtraArticle[] {
  const p = computePompageFromTransport();
  return [
    { label: EXTRA_HYDROFUGE_LABEL, qty: 0, pu: 50 },
    { label: EXTRA_POMPAGE_LABEL, qty: n(p.qty), pu: n(p.pu) },
  ];
}

/** ✅ Si extraPompageAuto=true, on met à jour les valeurs du pompage depuis Transport
    - IMPORTANT: on n'insère JAMAIS la ligne si elle a été supprimée (pas de réinjection) */
function syncPompageValuesIfAuto(list: ExtraArticle[]) {
  if (!Boolean(content.meta.extraPompageAuto)) return;

  const idx = (list ?? []).findIndex((x) => isPompageArticle(x));
  if (idx < 0) return; // supprimé => ne revient pas

  const p = computePompageFromTransport();

  if (n(p.qty) > 0) (list[idx] as any).qty = n(p.qty);
  if (n(p.pu) > 0) (list[idx] as any).pu = n(p.pu);

  if (!String((list[idx] as any)?.label ?? "").trim()) (list[idx] as any).label = EXTRA_POMPAGE_LABEL;
}

/** ✅ Dès qu'un utilisateur modifie le pompage, on "décroche" du Transport */
function onExtraEdited(a: any) {
  if (!a) return;
  if (isPompageArticle(a)) content.meta.extraPompageAuto = false;
}

function canonicalExtraArticlesForSave(list: ExtraArticle[]): ExtraArticle[] {
  return (list ?? [])
    .map((x) => ({ label: String(x?.label ?? "").trim(), qty: n(x?.qty), pu: n(x?.pu) }))
    .filter((x) => x.label.length > 0);
}

/* =========================
   Load / Sync
========================= */
function loadPersistedAll() {
  draft.surcharges = {};
  savedSurcharges.value = {};

  const v = variant.value;
  if (v?.devis?.surcharges) {
    try {
      const obj = typeof v.devis.surcharges === "object" ? v.devis.surcharges : JSON.parse(String(v.devis.surcharges));
      const map = (obj?.surcharges ?? obj) as any;
      if (map && typeof map === "object") {
        for (const [k, val] of Object.entries(map)) {
          const nk = String(k);
          const nv = n(val);
          draft.surcharges[nk] = nv;
          savedSurcharges.value[nk] = nv;
        }
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

  const metaHasExtraArticles = persistedMeta && Object.prototype.hasOwnProperty.call(persistedMeta, "extraArticles");
  const persistedExtraRaw = metaHasExtraArticles ? (persistedMeta as any).extraArticles : null;

  content.meta.includePompage = persistedMeta?.includePompage === false ? false : true;

  const hasAutoFlag = persistedMeta && Object.prototype.hasOwnProperty.call(persistedMeta, "extraPompageAuto");
  content.meta.extraPompageAuto = metaHasExtraArticles ? Boolean((persistedMeta as any)?.extraPompageAuto) : true;
  if (metaHasExtraArticles && !hasAutoFlag) content.meta.extraPompageAuto = false;

  content.extraArticles = normalizeExtraArticles(persistedExtraRaw, defaultExtraArticles());
  syncPompageValuesIfAuto(content.extraArticles);

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

  syncPompageValuesIfAuto(content.extraArticles);
}

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

      meta: {
        ...content.meta,
        extraArticles: canonicalExtraArticlesForSave(content.extraArticles),
      },
      intro: String(content.intro ?? ""),
      rappel: { ...content.rappel },
      chargeFournisseur: content.chargeFournisseur ?? [],
      chargeClient: content.chargeClient ?? [],
      prixComplementaires: content.prixComplementaires ?? [],
      dureeQuantiteTexte: String(content.dureeQuantiteTexte ?? ""),
      validiteTexte: String(content.validiteTexte ?? ""),
      signature: { ...content.signature },
    });

    savedSurcharges.value = { ...draft.surcharges };

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

/* Anti-pollution header preview */
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

watch(
  () => JSON.stringify(variant.value?.transport ?? {}),
  () => {
    syncPompageValuesIfAuto(content.extraArticles);
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

function addExtraArticle() {
  content.extraArticles.push({ label: "", qty: 0, pu: 0 });
}

function removeExtraArticle(idx: number) {
  const it = content.extraArticles[idx];
  const isPompe = isPompageArticle(it);

  content.extraArticles.splice(idx, 1);

  if (isPompe) content.meta.extraPompageAuto = false;
}

function extraArticleTotal(a: ExtraArticle): number {
  return n(a?.qty) * n(a?.pu);
}
function extraArticlesTotalHT(): number {
  return (content.extraArticles ?? []).reduce((s, a) => s + extraArticleTotal(a), 0);
}

/* =========================
   NAV RAPIDE (CONTENU)
========================= */
const CONTENT_SECTIONS = [
  { id: "c-head", label: "En-tête" },
  { id: "c-intro", label: "Introduction" },
  { id: "c-rappel", label: "Rappel" },
  { id: "c-charges", label: "Charges" },
  { id: "c-prix", label: "Prix compl." },
  { id: "c-articles", label: "Articles" },
  { id: "c-textes", label: "Textes" },
  { id: "c-sign", label: "Signature" },
] as const;

const activeSectionId = ref<string>("c-head");

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  activeSectionId.value = id;
}

function onContentScrollSpy() {
  const tops: { id: string; top: number }[] = [];

  for (const s of CONTENT_SECTIONS) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    tops.push({ id: s.id, top: r.top });
  }

  if (tops.length === 0) return;

  let best: { id: string; top: number } | null = null;
  for (const t of tops) {
    if (!best) {
      best = t;
      continue;
    }
    if (Math.abs(t.top - 92) < Math.abs(best.top - 92)) {
      best = t;
    }
  }

  if (!best) return;
  activeSectionId.value = best.id;
}
</script>

<template>
  <div class="page" @scroll.passive="activeTab === 'CONTENU' ? onContentScrollSpy() : null">
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

        <!-- ✅ SUPPRIMÉ (comme demandé)
        <div class="subline"> ... </div>
        -->
      </div>

      <div class="tright">
        <!-- ✅ Toggle onglet compact -->
        <div class="seg" role="tablist" aria-label="Onglets devis">
          <button
            class="segBtn"
            :class="{ active: activeTab === 'SURCHARGES' }"
            @click="activeTab = 'SURCHARGES'"
            role="tab"
            :aria-selected="activeTab === 'SURCHARGES'"
          >
            Surcharges
            <span class="segBadge">{{ touchedCount }}</span>
          </button>
          <button
            class="segBtn"
            :class="{ active: activeTab === 'CONTENU' }"
            @click="activeTab = 'CONTENU'"
            role="tab"
            :aria-selected="activeTab === 'CONTENU'"
          >
            Contenu
          </button>
        </div>

        <div class="miniKpis">
          <span class="miniK">
            CA
            <b class="mono">{{ money2(caDevisTotal) }}</b>
            <span class="muted">DH</span>
          </span>
        </div>

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

    <div v-if="isDirty" class="dirtyBar">
      <ExclamationTriangleIcon class="warnIc" />
      <div class="dirtyTxt">
        <b>Changements non enregistrés.</b>
        <span class="muted">Exporter = dernière version enregistrée.</span>
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

    <!-- TAB 1 : SURCHARGES -->
    <template v-if="activeTab === 'SURCHARGES'">
      <div class="card controls">
        <div class="controlsLeft">
          <span class="hintLine">
            <span class="hintDot">•</span>
            <span>Les <b>majorations</b> ne sont pas simulées ici (elles doivent être appliquées dans la variante).</span>

            <span class="tipWrap">
              <button class="tipBtn" type="button" aria-label="Détails majorations">
                <InformationCircleIcon class="tipIc" />
              </button>
              <span class="tip" role="tooltip">
                Les majorations ne changent pas le devis automatiquement.<br />
                Si tu veux qu’elles impactent les prix, applique-les au niveau de la <b>variante</b>.
              </span>
            </span>
          </span>
        </div>

        <div class="controlsRight">
          <label class="chk">
            <input type="checkbox" v-model="withDevisSurcharge" />
            <span>Dashboard : surcharge devis</span>
          </label>

          <label class="chk">
            <input type="checkbox" v-model="draft.applyToDashboardOnSave" />
            <span>Appliquer au save</span>
          </label>

          <button class="btn" @click="applyToDashboard" :disabled="busy.apply">Appliquer</button>
        </div>
      </div>

      <!-- ✅ List style -->
      <div class="card listCard">
        <div class="listHead">
          <div class="lh">Formules</div>

          <!-- ✅ Libellés EXACTEMENT alignés au-dessus des champs -->
          <div class="rhGrid" aria-hidden="true">
            <div class="rhCol">Surcharge</div>
            <div class="rhCol">PV déf.</div>
            <div class="rhCol">Total</div>
          </div>
        </div>

        <div class="list">
          <div v-if="rows.length === 0" class="empty">Aucune formule dans cette variante.</div>

          <div v-for="r in rows" :key="rowKey(r)" class="item" :class="{ touched: isRowTouched(r) }">
            <div class="ileft">
              <div class="ititle">
                <b class="iname ell">{{ r?.formule?.label ?? "—" }}</b>

                <span class="tipWrap">
                  <button class="tipBtn" type="button" aria-label="Détails formule">
                    <InformationCircleIcon class="tipIc" />
                  </button>
                  <span class="tip" role="tooltip">
                    CMP : <b class="mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</b> DH/m³<br />
                    Transport (base) : <b class="mono">{{ money2(transportBaseM3) }}</b> DH/m³<br />
                    MOMD : <b class="mono">{{ money2(r?.momd) }}</b> DH/m³<br />
                    PV Base : <b class="mono">{{ money2(pvBaseM3(r)) }}</b> DH/m³<br />
                    PV déf. : <b class="mono">{{ money2(pvDefinitifM3(r)) }}</b> DH/m³<br />
                    <span class="mutedLine">Clé: {{ rowKey(r) }}</span>
                  </span>
                </span>
              </div>

              <div class="chips">
                <span class="chip"><span class="muted">Vol</span> <b class="mono">{{ int(r?.volumeM3) }}</b> <span class="muted">m³</span></span>
                <span class="chip"><span class="muted">CMP</span> <b class="mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</b></span>
                <span class="chip"><span class="muted">MOMD</span> <b class="mono">{{ money2(r?.momd) }}</b></span>
                <span class="chip"><span class="muted">PV base</span> <b class="mono">{{ money2(pvBaseM3(r)) }}</b></span>
              </div>
            </div>

            <!-- ✅ Grid identique à la header (labels au-dessus) -->
            <div class="iright">
              <div class="cellMini" data-label="Surcharge">
                <input
                  class="inputSurcharge mono"
                  type="number"
                  step="1"
                  :value="getSurcharge(r)"
                  @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
                />
              </div>

              <div class="cellMini" data-label="PV déf.">
                <span class="pillFinal mono">{{ money2(pvDefinitifM3(r)) }}</span>
              </div>

              <div class="cellMini" data-label="Total">
                <!-- ✅ Total plus "app-like" (pill), taille cohérente -->
                <span class="pillTotal mono">{{ money2(pvDefinitifM3(r) * n(r?.volumeM3)) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="listFoot">
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
            • <b>PV déf.</b> = PV base (CMP + Transport + MOMD) + <b>Surcharge</b>. • La surcharge peut être négative.
          </div>
        </div>
      </div>
    </template>

    <!-- TAB 2 : CONTENU -->
    <template v-else>
      <div class="contentLayout">
        <aside class="sideNav">
          <div class="sideTitle">Navigation</div>
          <button
            v-for="s in CONTENT_SECTIONS"
            :key="s.id"
            class="sideBtn"
            :class="{ active: activeSectionId === s.id }"
            type="button"
            @click="scrollToId(s.id)"
          >
            {{ s.label }}
          </button>

          <div class="sideHint muted">Astuce : la navigation rapide en bas reste disponible.</div>
        </aside>

        <main class="contentMain" @scroll.passive="onContentScrollSpy">
          <div class="card section" id="c-head">
            <div class="sectionHead">
              <div class="lbl">En-tête</div>
              <div class="muted">{{ content.meta.ville || (pnl?.city ?? "") }}, le <b>{{ todayFr() }}</b></div>
            </div>

            <div class="grid3">
              <div class="field">
                <div class="k">Ville</div>
                <input class="input" v-model="content.meta.ville" placeholder="Ville" />
              </div>
              <div class="field">
                <div class="k">Date</div>
                <input class="input" v-model="content.meta.date" type="date" />
              </div>
              <div class="field">
                <div class="k">Client</div>
                <input class="input" v-model="content.meta.client" placeholder="Client" />
              </div>
            </div>

            <div class="field">
              <div class="k">Titre projet</div>
              <input class="input" v-model="content.meta.titreProjet" placeholder="Titre projet" />
            </div>
          </div>

          <div class="card section" id="c-intro">
            <div class="lbl">Introduction</div>
            <textarea class="ta" v-model="content.intro" rows="3"></textarea>
          </div>

          <div class="card section" id="c-rappel">
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

          <div class="card section" id="c-charges">
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

          <div class="card section" id="c-prix">
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

          <div class="card section" id="c-articles">
            <div class="lbl">Articles hors formules</div>

            <div class="extras">
              <div v-for="(a, i) in content.extraArticles" :key="'ea' + i" class="exRow">
                <input class="input" v-model="a.label" placeholder="Libellé" @input="onExtraEdited(a)" />

                <input
                  class="input exUnit"
                  type="number"
                  step="0.01"
                  :placeholder="isHydrofugeArticle(a) ? '-' : ''"
                  :value="isHydrofugeArticle(a) && n(a.qty) === 0 ? '' : a.qty"
                  @input="
                    (e) => {
                      const raw = (e.target as HTMLInputElement).value;
                      a.qty = raw === '' ? 0 : n(raw);
                      onExtraEdited(a);
                    }
                  "
                />

                <input class="input exVal" type="number" step="0.01" v-model.number="a.pu" @input="onExtraEdited(a)" />
                <button class="mini" type="button" @click="removeExtraArticle(i)">Suppr</button>
              </div>
            </div>

            <button class="btn miniAdd" type="button" @click="addExtraArticle">+ Ajouter article</button>
            <div class="muted noteLine">
              (Le prix est en m³. Le pompage est initialisé depuis Transport, puis devient 100% éditable après modification/enregistrement.)
            </div>

            <div class="sepLine"></div>

            <div class="grid2kv">
              <div class="kv">
                <div class="k">Total HT (articles)</div>
                <div class="v"><b class="mono">{{ money2(extraArticlesTotalHT()) }}</b> <span class="muted">DH</span></div>
              </div>
            </div>
          </div>

          <div class="card section" id="c-textes">
            <div class="lbl">Textes</div>

            <div class="subLbl">Durée - Quantité</div>
            <textarea class="ta" v-model="content.dureeQuantiteTexte" rows="3"></textarea>

            <div class="subLbl" style="margin-top: 12px">Validité de l’offre</div>
            <textarea class="ta" v-model="content.validiteTexte" rows="2"></textarea>
          </div>

          <div class="card section" id="c-sign">
            <div class="lbl">Signature</div>
            <div class="grid3">
              <div class="field">
                <div class="k">Nom</div>
                <input class="input" v-model="content.signature.nom" placeholder="Nom" />
              </div>
              <div class="field">
                <div class="k">Poste</div>
                <input class="input" v-model="content.signature.poste" placeholder="Poste" />
              </div>
              <div class="field">
                <div class="k">Téléphone</div>
                <input class="input" v-model="content.signature.telephone" placeholder="Téléphone" />
              </div>
            </div>

            <div class="muted noteLine">
              En-tête export : <b>{{ pnl?.title ?? "—" }}</b> - offre de prix - <b>{{ todayFr() }}</b>
            </div>
          </div>

          <div class="bottomNav">
            <button class="bnavBtn" type="button" @click="scrollToId('c-head')">Haut</button>
            <button class="bnavBtn" type="button" @click="scrollToId('c-charges')">Charges</button>
            <button class="bnavBtn" type="button" @click="scrollToId('c-articles')">Articles</button>
            <button class="bnavBtn" type="button" @click="scrollToId('c-sign')">Signature</button>
          </div>
        </main>
      </div>
    </template>

    <!-- Export guard modal -->
    <div v-if="exportGuardOpen" class="modalOverlay" @click.self="closeExportGuard">
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Export Word">
        <div class="modalTitle">
          <ExclamationTriangleIcon class="warnIc2" />
          <div>
            <div style="font-weight: 1000; color: #111827">Exporter sans enregistrer ?</div>
            <div class="muted" style="margin-top: 2px">
              Le Word sera généré depuis <b>la dernière version enregistrée</b>. Tes changements en cours ne seront pas inclus.
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
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.62);
  --b: rgba(16,24,40,0.12);
  --soft: rgba(15,23,42,0.04);

  padding: 12px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.page, .page *{ box-sizing: border-box; }

.card { background:#fff; border:1px solid var(--b); border-radius:16px; padding:10px 12px; }
.muted { color: var(--muted); font-size:12px; }
.mono { font-variant-numeric: tabular-nums; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.sep { color:#9ca3af; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:8px 10px; background:#fff; color:#111827; font-size:12px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

/* Buttons */
.btn{
  border:1px solid var(--b);
  background:#fff;
  border-radius:12px;
  padding:7px 10px;
  font-size:11.5px;
  font-weight:900;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
  color: var(--text);
}
.btn:hover{ background: rgba(15,23,42,0.03); }
.btn.primary{ background: rgba(15,23,42,0.92); border-color: rgba(15,23,42,0.65); color:#fff; }
.btn.primary:hover{ filter: brightness(1.05); }
.btn.warnBtn{ border-color: rgba(245,158,11,0.55); }
.btn.mini{ padding:6px 9px; font-size:11px; }

.iconBtn{
  width:36px; height:36px;
  border-radius:12px;
  border:1px solid var(--b);
  background:#fff;
  cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
}
.iconBtn:hover{ background: rgba(15,23,42,0.03); }
.ic{ width:16px; height:16px; }

.input {
  width:100%;
  padding:8px 10px;
  border:1px solid rgba(226,232,240,0.95);
  border-radius:12px;
  font-size:12.5px;
  background:#fff;
  outline:none;
  line-height: 1.2;
}
.input:focus{
  border-color: rgba(15,23,42,0.55);
  box-shadow: 0 0 0 3px rgba(15,23,42,.10);
}
.ta{
  width:100%;
  border:1px solid rgba(226,232,240,0.95);
  border-radius: 14px;
  padding: 8px 10px;
  font-size: 13px;
  background:#fff;
  resize: vertical;
  outline:none;
  line-height:1.25;
}
.ta:focus{
  border-color: rgba(15,23,42,0.55);
  box-shadow: 0 0 0 3px rgba(15,23,42,.10);
}
.ta.small{ font-size: 12px; }

/* Header */
.top{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.tleft{ min-width:260px; display:flex; flex-direction:column; gap:4px; }
.titleLine{ display:flex; align-items:center; gap:10px; }
.title{ font-size:15px; font-weight:950; color: var(--text); }
.pill{
  display:inline-flex; align-items:center; gap:8px;
  border:1px solid rgba(245,158,11,0.45);
  background: rgba(245,158,11,0.08);
  border-radius:999px;
  padding:4px 10px;
  font-weight:900;
  font-size:11px;
}
.dot{ width:7px; height:7px; border-radius:999px; background: rgba(245,158,11,1); display:inline-block; }
.tright{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

/* Segmented tabs in header */
.seg{
  display:inline-flex;
  border: 1px solid var(--b);
  background: rgba(15,23,42,0.02);
  border-radius: 999px;
  padding: 3px;
  gap: 3px;
}
.segBtn{
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  color: rgba(15,23,42,.75);
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.segBtn:hover{ background: rgba(15,23,42,0.03); }
.segBtn.active{
  background: rgba(15,23,42,0.92);
  color: #fff;
}
.segBadge{
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  font-size: 11px;
  font-weight: 950;
  display:inline-flex; align-items:center; justify-content:center;
}

/* mini kpi inline */
.miniKpis{ display:flex; align-items:center; gap:10px; }
.miniK{
  display:inline-flex;
  align-items:baseline;
  gap:6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--b);
  background: rgba(15,23,42,0.02);
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(15,23,42,.80);
}
.miniK b{ color: var(--text); font-weight: 950; }

/* Dirty bar */
.dirtyBar{
  display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;
  border:1px solid rgba(245,158,11,0.45);
  background: rgba(245,158,11,0.08);
  border-radius:14px;
  padding:8px 10px;
}
.warnIc{ width:18px; height:18px; color: rgba(245,158,11,1); flex: 0 0 auto; margin-top: 1px; }
.dirtyTxt{ display:flex; flex-direction:column; gap:2px; min-width:220px; flex:1; }
.dirtyActions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

/* Controls compact */
.controls{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  padding: 10px 12px;
}
.controlsLeft{ flex:1; min-width: 260px; }
.controlsRight{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.chk{ display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:900; color: var(--text); }
.chk input{ width:15px; height:15px; border-radius:6px; }

.hintLine{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size: 12px;
  color: rgba(15,23,42,.75);
  flex-wrap:wrap;
}
.hintDot{ color: rgba(148,163,184,1); font-weight: 950; }

/* Tooltip */
.tipWrap { position: relative; display:inline-flex; align-items:center; z-index: 5; flex: 0 0 auto; }
.tipBtn{
  width: 20px; height: 20px;
  border-radius: 8px;
  border: 1px solid rgba(226,232,240,0.95);
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor: default;
}
.tipIc{ width: 13px; height: 13px; color: rgba(15,23,42,0.55); }
.tip{
  position:absolute;
  left: 28px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 240px;
  max-width: 380px;
  background: rgba(17,24,39,0.96);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 8px 10px;
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

/* List style */
.listCard{ padding: 0; overflow:hidden; }
.listHead{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(226,232,240,0.85);
  background: rgba(15,23,42,0.02);
}
.lh{ font-weight: 950; color: var(--text); font-size: 12px; }

/* ✅ Header columns aligned with fields */
.rhGrid{
  display:grid;
  grid-template-columns: 92px 132px 160px; /* must match .iright */
  gap: 10px;
  align-items:end;
}
.rhCol{
  text-align:right;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15,23,42,0.55);
  white-space: nowrap;
}

.list{ display:flex; flex-direction:column; gap:8px; padding: 10px 12px; }
.empty{ padding: 12px 0; color: var(--muted); font-size: 12px; }

.item{
  border:1px solid rgba(226,232,240,0.9);
  border-radius: 14px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.item:hover{ background: rgba(15,23,42,0.02); }
.item.touched{
  border-color: rgba(15,23,42,0.25);
  box-shadow: inset 3px 0 0 rgba(15,23,42,0.55);
  background: rgba(15,23,42,0.02);
}
.ileft{ display:flex; flex-direction:column; gap:6px; min-width:0; flex:1; }
.ititle{ display:flex; align-items:center; gap:8px; min-width:0; }
.iname{ font-weight: 950; font-size: 13.5px; color: var(--text); }

.chips{ display:flex; flex-wrap:wrap; gap:6px; }
.chip{
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
  border-radius:999px;
  padding:2px 7px;
  font-size:10.5px;
  font-weight:900;
  color: var(--text);
  display:inline-flex;
  gap:6px;
  align-items:center;
  max-width:100%;
}

/* ✅ Right side as grid (exactly aligned with header labels) */
.iright{
  display:grid;
  grid-template-columns: 92px 132px 160px; /* must match .rhGrid */
  gap: 10px;
  align-items:center;
  flex:0 0 auto;
}
.cellMini{ text-align:right; min-width:0; }

/* ✅ Surcharge input: smaller + blue bg (like other pages) */
.inputSurcharge{
  width: 92px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(2,132,199,0.26);
  background: rgba(2,132,199,0.06);
  padding: 0 9px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
}
.inputSurcharge:focus{
  border-color: rgba(2,132,199,0.55);
  box-shadow: 0 0 0 3px rgba(2,132,199,0.12);
}

/* PV */
.pillFinal{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.18);
  background: rgba(15,23,42,0.06);
  font-weight: 950;
  color: rgba(15,23,42,1);
  white-space: nowrap;
  font-size: 12px;
}

/* ✅ Total pill: smaller, consistent with app */
.pillTotal{
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(2,132,199,0.18);
  background: rgba(2,132,199,0.06);
  font-weight: 950;
  color: rgba(15,23,42,0.92);
  white-space: nowrap;
  font-size: 12px;
}

/* Footer sums */
.listFoot{
  padding: 10px 12px 12px;
  background: rgba(15,23,42,0.02);
  border-top: 1px solid rgba(226,232,240,0.85);
}
.sumGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 10px;
}
.sumBox{
  border: 1px solid rgba(226,232,240,0.95);
  background: rgba(255,255,255,0.85);
  border-radius: 14px;
  padding: 8px 10px;
}
.sumBox .k{
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(15,23,42,0.55);
  text-transform: uppercase;
  letter-spacing: .02em;
}
.sumBox .v{
  margin-top: 4px;
  font-size: 13px;
  font-weight: 950;
  color: var(--text);
}
.sumBox .v span{
  color: rgba(15,23,42,0.55);
  font-weight: 900;
  margin-left: 6px;
  font-size: 11.5px;
}
.noteLine{ margin-top:8px; }

/* Content layout */
.contentLayout{
  display:grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  align-items:start;
}

/* Side nav */
.sideNav{
  position: sticky;
  top: 10px;
  border: 1px solid rgba(226,232,240,0.95);
  background: rgba(15,23,42,0.02);
  border-radius: 16px;
  padding: 10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.sideTitle{
  font-weight: 950;
  font-size: 12px;
  color: var(--text);
  margin-bottom: 2px;
}
.sideBtn{
  width:100%;
  text-align:left;
  border: 1px solid rgba(226,232,240,0.95);
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  color: rgba(15,23,42,.82);
}
.sideBtn:hover{ background: rgba(15,23,42,0.03); }
.sideBtn.active{
  border-color: rgba(15,23,42,0.30);
  background: rgba(15,23,42,0.06);
  color: var(--text);
}
.sideHint{ margin-top: 6px; font-size: 11px; }

.contentMain{
  display:flex;
  flex-direction:column;
  gap:10px;
  min-width:0;
}

.section{ display:flex; flex-direction:column; gap:10px; }
.sectionHead{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.lbl{ font-weight:950; font-size:13px; color: var(--text); }
.subLbl{ font-weight:950; font-size:12px; color: rgba(15,23,42,.78); }

.field .k{ margin-bottom: 4px; }
.k{ font-size: 11px; font-weight:950; color: rgba(15,23,42,.55); }
.v{ margin-top: 4px; }

.grid3{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; min-width:0; }
.grid2kv{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; min-width:0; }

.kv{
  border:1px solid rgba(226,232,240,0.95);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 8px 10px;
}

.sepLine{ height:1px; background: rgba(226,232,240,0.95); margin: 8px 0; border-radius:999px; }

.bullets{ list-style: none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.bullet{
  border:1px solid rgba(226,232,240,0.95);
  background: rgba(15,23,42,0.02);
  border-radius:14px;
  padding: 8px 10px;
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.lock{
  flex:0 0 auto;
  height:18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.18);
  background: rgba(15,23,42,0.06);
  color: rgba(15,23,42,1);
  font-size: 10.5px;
  font-weight: 950;
  display:inline-flex;
  align-items:center;
}
.txt{ flex:1; color: var(--text); font-size:12.5px; line-height:1.25; white-space: pre-wrap; min-width:0; }

.mini{
  border:1px solid rgba(226,232,240,0.95);
  background:#fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 950;
  cursor:pointer;
  white-space:nowrap;
}
.mini:hover{ background: rgba(15,23,42,0.03); }
.miniAdd{ align-self:flex-start; }

.extras{ display:flex; flex-direction:column; gap: 10px; min-width:0; }
.exRow{
  display:grid;
  grid-template-columns: 1.6fr .6fr .4fr auto;
  gap: 8px;
  align-items:center;
  min-width:0;
}
.exRow > *{ min-width:0; }
.exVal{ text-align:right; }

/* Bottom nav */
.bottomNav{
  position: sticky;
  bottom: 10px;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  justify-content:flex-end;
  padding: 10px 0 0;
}
.bnavBtn{
  border:1px solid rgba(226,232,240,0.95);
  background:#fff;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
  cursor:pointer;
}
.bnavBtn:hover{ background: rgba(15,23,42,0.03); }

/* Responsive */
@media (max-width: 980px) {
  .contentLayout{ grid-template-columns: 1fr; }
  .sideNav{ position: relative; top:auto; }
  .grid3{ grid-template-columns: 1fr; }
  .grid2kv{ grid-template-columns: 1fr; }
  .exRow{ grid-template-columns: 1fr; }

  /* mobile: right side becomes flex-like with labels above */
  .rhGrid{ display:none; } /* header cols hidden */
  .iright{
    width:100%;
    grid-template-columns: 1fr 1fr 1fr;
  }
  .cellMini{ text-align:left; }
  .cellMini::before{
    content: attr(data-label);
    display:block;
    font-size: 10.5px;
    font-weight: 950;
    color: rgba(15,23,42,.55);
    margin-bottom: 4px;
  }
  .inputSurcharge{ width: 100%; }
  .pillFinal, .pillTotal{ width: 100%; justify-content: flex-start; }
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
  border: 1px solid var(--b);
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
