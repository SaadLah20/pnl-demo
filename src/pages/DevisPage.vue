<!-- src/pages/DevisPage.vue -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import { InformationCircleIcon, ArrowPathIcon, CheckBadgeIcon } from "@heroicons/vue/24/outline";

const store = usePnlStore();

type Tab = "SURCHARGES" | "CONTENU";
const activeTab = ref<Tab>("SURCHARGES");

const loading = ref(false);
const busy = reactive({ reload: false, save: false, apply: false });
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
  const maybe =
    n((c as any)?.quantiteM3) ||
    n((c as any)?.volumeM3) ||
    n((c as any)?.volumeTotalM3) ||
    0;

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

/* =========================
   LOAD persisted devis.* (surcharges + content)
========================= */
type LineItem = { label: string; value?: string; locked?: boolean };
type PriceExtra = { label: string; unit?: string; value: number; note?: string };

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

/* ===== charge mapping helpers ===== */
function normalizeChargeSide(v: any): "CLIENT" | "LHM" | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("client")) return "CLIENT";
  if (s.includes("lhm") || s.includes("holcim") || s.includes("lafarge")) return "LHM";
  if (s === "oui" || s === "true") return "CLIENT";
  if (s === "non" || s === "false") return "LHM";
  return null;
}

/**
 * Règle demandée:
 * - Phrase groupée "Transport et installation ... centrale" si les 3 éléments sont à la même charge
 * - Sinon split en 3 phrases et répartir selon (contract.transport / contract.installation / contract.cab)
 */
function buildCentralTransportInstallItems() {
  const c = contract.value ?? {};

  const sideTransport = normalizeChargeSide((c as any)?.transport);
  const sideInstall = normalizeChargeSide((c as any)?.installation);
  const sideCab = normalizeChargeSide((c as any)?.cab);

  const groupPhrase: LineItem = {
    label: "Transport et installation sur site d’une centrale à béton de capacité de malaxeur de 2m3;",
  };

  const pTransport: LineItem = { label: "Transport sur site d’une centrale à béton de capacité de malaxeur de 2m3;" };
  const pInstall: LineItem = { label: "Installation sur site d’une centrale à béton de capacité de malaxeur de 2m3;" };
  const pCab: LineItem = { label: "Mise à disposition d’une centrale à béton de capacité de malaxeur de 2m3;" };

  // si les 3 côtés sont explicitement identiques
  if (sideTransport && sideInstall && sideCab && sideTransport === sideInstall && sideInstall === sideCab) {
    return {
      lhm: sideTransport === "LHM" ? [groupPhrase] : [],
      client: sideTransport === "CLIENT" ? [groupPhrase] : [],
      usedGrouped: true,
    };
  }

  // sinon: distribution fine (fallback = LHM si null)
  const lhm: LineItem[] = [];
  const client: LineItem[] = [];

  const pushBySide = (side: "CLIENT" | "LHM" | null, item: LineItem) => {
    const s = side ?? "LHM";
    if (s === "CLIENT") client.push(item);
    else lhm.push(item);
  };

  pushBySide(sideTransport, pTransport);
  pushBySide(sideInstall, pInstall);
  pushBySide(sideCab, pCab);

  return { lhm, client, usedGrouped: false };
}

function buildStandardCharges() {
  const c = contract.value ?? {};

  // Articles "fournisseur" (LHM) par défaut (SANS la phrase groupée transport+installation+centrale)
  const lhmStandard: LineItem[] = [
    // transport/install/cab => gérés par buildCentralTransportInstallItems()
    { label: "Travaux de génie civil de la centrale à béton et ses annexes (bassins de décantation, casiers, clôture…)" },
    { label: "Fourniture des matières premières nécessaires à la fabrication des bétons ;" },
    { label: "Consommation d’électricité pour les besoins des centrales à béton ;" },
    { label: "Personnels d’exploitation et de conduite de la centrale : 24 mois maximum sur un poste de 10 heures hors Dimanche et jours fériés." },
    { label: "Mise à disposition d’une chargeuse de capacité suffisante pour l’alimentation de la centrale à béton ;" },
    { label: "Maintenance (pièces et main d’œuvre) des centrales et chargeurs ;" },
    { label: "Réception des commandes et organisation des livraisons ;" },
    { label: "Etudes formulations et de convenances des bétons objets de cette offre par notre laboratoire interne (une gâchée de 2m3 par formule) ;" },
    { label: "Autocontrôles de fabrication selon les normes Marocaines ;" },
    { label: "Gestion automatisée et informatisée du système de fabrication." },
  ];

  const clientStandard: LineItem[] = [
    { label: "Mise à disposition d’un terrain plane et compacté pour l’installation de la centrale à béton. La superficie minimale du terrain est 5.000m²." },
    { label: "Branchement en Eau et Electricité aux pieds des centrales à béton ;" },
    { label: "Consommation d’eau pour les besoins des centrales à béton ;" },
    { label: "Programme mensuel et hebdomadaire de la semaine suivante confirmé tous les Jeudis avant 16h ;" },
    { label: "Confirmation journalière des commandes la veille avant 16h ;" },
    { label: "Réception, contrôle du béton et du déchargement des camions-malaxeurs ;" },
    { label: "Prise en charge des autorisations d’entrée et de sortie au site pour le personnel, les camions malaxeurs et les pompes ;" },
    { label: "Entretien des voies d’accès des camions malaxeurs et camions de la matière première ;" },
    { label: "Prise en charge des autorisations pour le coulage des bétons." },
    { label: "Prestations de laboratoire externe pour la convenance et les contrôles courants du béton et d’agrégats selon CCTP." },
  ];

  // inject transport/install/cab distribution
  const central = buildCentralTransportInstallItems();
  let lhm = [...central.lhm, ...lhmStandard];
  let client = [...clientStandard, ...central.client];

  // Switch logic: terrain, genieCivil, matierePremiere, maintenance, chargeuse, branchements, conso
  const switches: Array<{
    field: string;
    clientItemMatch: (it: LineItem) => boolean;
    lhmItemMatch: (it: LineItem) => boolean;
  }> = [
    {
      field: "terrain",
      clientItemMatch: (it) => it.label.toLowerCase().includes("mise à disposition d’un terrain"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("mise à disposition d’un terrain"),
    },
    {
      field: "genieCivil",
      clientItemMatch: (it) => it.label.toLowerCase().includes("travaux de génie civil"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("travaux de génie civil"),
    },
    {
      field: "matierePremiere",
      clientItemMatch: (it) => it.label.toLowerCase().includes("fourniture des matières premières"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("fourniture des matières premières"),
    },
    {
      field: "maintenance",
      clientItemMatch: (it) => it.label.toLowerCase().includes("maintenance"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("maintenance"),
    },
    {
      field: "chargeuse",
      clientItemMatch: (it) => it.label.toLowerCase().includes("mise à disposition d’une chargeuse"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("mise à disposition d’une chargeuse"),
    },
    {
      field: "branchementEau",
      clientItemMatch: (it) => it.label.toLowerCase().includes("branchement en eau"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("branchement en eau"),
    },
    {
      field: "consoEau",
      clientItemMatch: (it) => it.label.toLowerCase().includes("consommation d’eau"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("consommation d’eau"),
    },
    {
      field: "branchementElec",
      clientItemMatch: (it) => it.label.toLowerCase().includes("electricité") && it.label.toLowerCase().includes("branchement"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("electricité") && it.label.toLowerCase().includes("branchement"),
    },
    {
      field: "consoElec",
      clientItemMatch: (it) => it.label.toLowerCase().includes("consommation d’électricité"),
      lhmItemMatch: (it) => it.label.toLowerCase().includes("consommation d’électricité"),
    },
  ];

  for (const sw of switches) {
    const side = normalizeChargeSide((c as any)?.[sw.field]);
    if (!side) continue;

    if (side === "CLIENT") {
      const moved = lhm.filter(sw.lhmItemMatch);
      lhm = lhm.filter((it) => !sw.lhmItemMatch(it));
      for (const it of moved) if (!client.some((x) => x.label === it.label)) client.push(it);
    } else {
      const moved = client.filter(sw.clientItemMatch);
      client = client.filter((it) => !sw.clientItemMatch(it));
      for (const it of moved) if (!lhm.some((x) => x.label === it.label)) lhm.push(it);
    }
  }

  return { lhm, client };
}

function buildDefaultPrixComplementaires(): PriceExtra[] {
  const c = contract.value ?? {};
  const extras: PriceExtra[] = [
    { label: "Ouverture de centrale en dehors des horaires de travail (Poste de nuit, Jour férié & Dimanche)", unit: "DH HT / poste", value: n((c as any)?.sundayPrice) || 5000 },
    { label: "Mise à disposition de la centrale à béton et son personnel d’exploitation au-delà de la durée contractuelle", unit: "DH HT / mois", value: 150000 },
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

  const delayPenalty = n((c as any)?.delayPenalty);
  if (delayPenalty > 0) {
    extras.push({
      label: "Pénalité de dépassement de délai (selon conditions contractuelles)",
      unit: "MAD HT",
      value: delayPenalty,
    });
  }

  return extras;
}

function loadPersistedAll() {
  // surcharges
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

  // content
  const vDevis = v?.devis ?? null;

  const persistedMeta = safeParseJson((vDevis as any)?.meta, {});
  const persistedRappel = safeParseJson((vDevis as any)?.rappel, {});
  const persistedSignature = safeParseJson((vDevis as any)?.signature, {});

  const { lhm, client } = buildStandardCharges();

  // ✅ titreProjet = pnl.title (pas model/type)
  const pnlTitle = String(pnl.value?.title ?? "").trim();

  content.meta.ville = String(persistedMeta?.ville ?? pnl.value?.city ?? "");
  content.meta.date = String(persistedMeta?.date ?? todayISO());
  content.meta.client = String(persistedMeta?.client ?? pnl.value?.client ?? "");
  content.meta.titreProjet = String(persistedMeta?.titreProjet ?? pnlTitle);

  // ✅ intro: utilise le TITRE PnL
  content.intro =
    typeof (vDevis as any)?.intro === "string" && String((vDevis as any).intro).trim().length
      ? String((vDevis as any).intro)
      : `Nous vous prions de trouver ci-dessous les détails de notre offre de prix de fourniture des bétons prêts à l’emploi pour les travaux de construction des "${content.meta.titreProjet}".`;

  content.rappel.quantiteM3 = n(persistedRappel?.quantiteM3) || quantiteProjetM3.value;
  content.rappel.dureeMois = n(persistedRappel?.dureeMois) || dureeMois.value;

  content.rappel.demarrage = String(persistedRappel?.demarrage ?? formatDateFr(pnl.value?.startDate) ?? "");
  content.rappel.lieu = String(persistedRappel?.lieu ?? pnl.value?.city ?? "");

  content.chargeFournisseur = normalizeLineItems((vDevis as any)?.chargeFournisseur, lhm);
  content.chargeClient = normalizeLineItems((vDevis as any)?.chargeClient, client);

  content.prixComplementaires = normalizePriceExtras((vDevis as any)?.prixComplementaires, buildDefaultPrixComplementaires());

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

  // ✅ signature defaults demandé
  content.signature.nom = String(persistedSignature?.nom ?? "Saad LAHLIMI");
  content.signature.poste = String(persistedSignature?.poste ?? "Commercial P&L");
  content.signature.telephone = String(persistedSignature?.telephone ?? "+212701888888");
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

const caDevisTotal = computed(() => {
  return rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
});

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

      meta: JSON.stringify({ ...content.meta }),
      intro: String(content.intro ?? ""),
      rappel: JSON.stringify({ ...content.rappel }),
      chargeFournisseur: JSON.stringify(content.chargeFournisseur ?? []),
      chargeClient: JSON.stringify(content.chargeClient ?? []),
      prixComplementaires: JSON.stringify(content.prixComplementaires ?? []),
      dureeQuantiteTexte: String(content.dureeQuantiteTexte ?? ""),
      validiteTexte: String(content.validiteTexte ?? ""),
      signature: JSON.stringify({ ...content.signature }),
    });

    await (store as any).loadPnls();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
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

/* =========================
   UI helpers - content editing
========================= */
function addLine(which: "lhm" | "client") {
  const target = which === "lhm" ? content.chargeFournisseur : content.chargeClient;
  target.push({ label: "" });
}
function removeLine(which: "lhm" | "client", idx: number) {
  const target = which === "lhm" ? content.chargeFournisseur : content.chargeClient;
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
    <!-- TOP -->
    <div class="top">
      <div class="tleft">
        <div class="title">Devis</div>
        <div class="subline">
          <span class="muted">Variante :</span>
          <b class="ell">{{ variant?.title ?? "—" }}</b>

          <span class="sep">•</span>

          <span class="muted">Volume :</span>
          <b>{{ int(volumeTotalFromFormules) }}</b><span class="muted">m³</span>

          <span class="sep">•</span>

          <span class="muted">Prix moyen devis :</span>
          <b>{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>
        </div>
      </div>

      <div class="tright">
        <button class="btn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="actIc" />
        </button>

        <button class="btn" @click="resetSurcharges" :disabled="busy.save">Réinitialiser</button>

        <button class="btn" @click="applyToDashboard" :disabled="busy.apply" v-if="activeTab === 'SURCHARGES'">
          Appliquer au dashboard
        </button>

        <button class="btn primary" @click="saveDevis" :disabled="busy.save || !variant?.id">
          <CheckBadgeIcon class="actIc" />
          {{ busy.save ? "Enregistrement..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- TABS -->
    <div class="tabs card">
      <button class="tabBtn" :class="activeTab === 'SURCHARGES' ? 'active' : ''" @click="activeTab = 'SURCHARGES'">
        Surcharges (prix /m³)
      </button>

      <button class="tabBtn" :class="activeTab === 'CONTENU' ? 'active' : ''" @click="activeTab = 'CONTENU'">
        Contenu devis (text)
      </button>
    </div>

    <!-- TAB 1: SURCHARGES -->
    <template v-if="activeTab === 'SURCHARGES'">
      <div class="card">
        <div class="controls">
          <div class="leftControls">
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

          <div v-if="withMajorations" class="pillInfo">
            <span class="muted">Impact majorations :</span>
            <b class="mono">{{ money2(impactMajorationM3) }}</b>
            <span class="muted">DH/m³</span>
          </div>
        </div>
      </div>

      <div class="card cardTable">
        <div class="gHead theadSticky" role="row">
          <div class="hCell">Désignation</div>
          <div class="hCell right">CMP</div>
          <div class="hCell right">MOMD</div>
          <div class="hCell right">Prix</div>
          <div class="hCell right">Surcharge</div>
          <div class="hCell right">Prix déf.</div>
          <div class="hCell right">Vol.</div>
          <div class="hCell right">Total</div>
        </div>

        <div class="gBody">
          <div v-if="rows.length === 0" class="emptyRow">Aucune formule dans cette variante.</div>

          <div v-for="r in rows" :key="rowKey(r)" class="gRow" role="row">
            <div class="cell cellMain" :data-label="'Désignation'">
              <div class="mainLine">
                <b class="ell">{{ r?.formule?.label ?? "—" }}</b>

                <span class="cmtWrap">
                  <button class="cmtBtn" type="button" aria-label="Info">
                    <InformationCircleIcon class="cmtIc" />
                  </button>
                  <span class="cmtTip" role="tooltip">
                    Transport (base) : <b>{{ money2(transportBaseM3) }}</b> DH/m³
                    <br />
                    Volume : <b>{{ int(r?.volumeM3) }}</b> m³
                  </span>
                </span>
              </div>

              <div class="subText ell">
                Clé: <span class="mono">{{ rowKey(r) }}</span>
              </div>
            </div>

            <div class="cell right" :data-label="'CMP'">
              <div class="value mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</div>
            </div>

            <div class="cell right" :data-label="'MOMD'">
              <div class="value mono">{{ money2(r?.momd) }}</div>
            </div>

            <div class="cell right" :data-label="'Prix'">
              <div class="priceStack">
                <div class="pLine">
                  <span class="tag">Base</span>
                  <span class="mono pVal">{{ money0(pvBaseM3(r)) }}</span>
                  <span class="u">DH/m³</span>
                </div>
                <div v-if="withMajorations" class="pLine maj">
                  <span class="tag">Maj</span>
                  <span class="mono pVal">{{ money0(pvWithMajorationM3(r)) }}</span>
                  <span class="u">DH/m³</span>
                </div>
                <div class="pLine strong">
                  <span class="tag">Pond</span>
                  <span class="mono pVal">{{ money0(pvPondereM3(r)) }}</span>
                  <span class="u">DH/m³</span>
                </div>
              </div>
            </div>

            <div class="cell right" :data-label="'Surcharge'">
              <input
                class="input numInput"
                type="number"
                step="1"
                :value="getSurcharge(r)"
                @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <div class="cell right" :data-label="'Prix déf.'">
              <span class="pillStrong mono">{{ money0(pvDefinitifM3(r)) }}</span>
            </div>

            <div class="cell right" :data-label="'Vol.'">
              <div class="value mono">{{ int(r?.volumeM3) }}</div>
            </div>

            <div class="cell right" :data-label="'Total'">
              <div class="value mono strong">{{ money0(pvDefinitifM3(r) * n(r?.volumeM3)) }}</div>
            </div>
          </div>
        </div>

        <div class="gFoot">
          <div class="footLine">
            <span class="muted">Prix moyen devis :</span>
            <b class="mono">{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>

            <span class="sep">•</span>

            <span class="muted">Volume :</span>
            <b class="mono">{{ int(volumeTotalFromFormules) }}</b><span class="muted">m³</span>

            <span class="sep">•</span>

            <span class="muted">CA devis :</span>
            <b class="mono">{{ money0(caDevisTotal) }}</b><span class="muted">DH</span>
          </div>
        </div>
      </div>

      <div class="card hint">
        <div class="muted">
          • <b>Pond</b> = prix (base/maj) arrondi au multiple de 5.
          &nbsp;• <b>Surcharge</b> peut être négative et s’ajoute après pondération.
        </div>
      </div>
    </template>

    <!-- TAB 2: CONTENU -->
    <template v-else>
      <div class="card">
        <div class="contentTop">
          <div class="contentHead">
            <div class="lineRight">
              <span class="muted">{{ content.meta.ville || (pnl?.city ?? "") }}</span>
              <span class="muted">, le</span>
              <b>{{ todayFr() }}</b>
            </div>

            <div class="centerTitle">
              <b>Offre de prix</b>
              <div class="muted" style="margin-top:2px;">
                {{ pnl?.title ?? "—" }}
              </div>
            </div>

            <div class="lineRight">
              <b>{{ pnl?.client ?? "—" }}</b>
            </div>
          </div>

          <div class="block">
            <div class="lbl">Introduction</div>
            <textarea class="ta" v-model="content.intro" rows="3"></textarea>
          </div>

          <div class="block">
            <div class="lbl">Rappel des données du projet</div>

            <div class="grid2">
              <div class="kv">
                <div class="k">Quantité</div>
                <div class="v"><b>{{ int(quantiteProjetM3) }}</b> <span class="muted">m3</span></div>
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

            <div class="muted" style="margin-top:8px;">
              (Ces valeurs proviennent du PnL/contrat et ne sont pas modifiables ici.)
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="twoCols">
          <div class="col">
            <div class="lbl">À la charge de LafargeHolcim Maroc</div>

            <div class="list">
              <div v-for="(it, i) in content.chargeFournisseur" :key="'lhm'+i" class="li">
                <textarea class="ta small" v-model="it.label" rows="2"></textarea>
                <button class="mini" type="button" @click="removeLine('lhm', i)">Suppr</button>
              </div>
            </div>

            <button class="btn miniAdd" type="button" @click="addLine('lhm')">+ Ajouter ligne</button>
          </div>

          <div class="col">
            <div class="lbl">À la charge du client</div>

            <div class="list">
              <div v-for="(it, i) in content.chargeClient" :key="'cl'+i" class="li">
                <textarea class="ta small" v-model="it.label" rows="2"></textarea>
                <button class="mini" type="button" @click="removeLine('client', i)">Suppr</button>
              </div>
            </div>

            <button class="btn miniAdd" type="button" @click="addLine('client')">+ Ajouter ligne</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="lbl">Prix complémentaires</div>

        <div class="extras">
          <div v-for="(x, i) in content.prixComplementaires" :key="'ex'+i" class="exRow">
            <input class="input" v-model="x.label" placeholder="Libellé" />
            <input class="input exUnit" v-model="x.unit" placeholder="Unité" />
            <input class="input exVal" type="number" step="1" v-model.number="x.value" />
            <button class="mini" type="button" @click="removeExtra(i)">Suppr</button>
          </div>
        </div>

        <button class="btn miniAdd" type="button" @click="addExtra">+ Ajouter prix complémentaire</button>
      </div>

      <div class="card">
        <div class="lbl">Durée - Quantité</div>
        <textarea class="ta" v-model="content.dureeQuantiteTexte" rows="3"></textarea>

        <div class="lbl" style="margin-top:12px;">Validité de l’offre</div>
        <textarea class="ta" v-model="content.validiteTexte" rows="2"></textarea>
      </div>

      <div class="card">
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

        <div class="muted" style="margin-top:8px;">
          En-tête export : <b>{{ pnl?.title ?? "—" }}</b> - offre de prix - <b>{{ todayFr() }}</b>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* styles identiques à ta version précédente (je garde compact) */
.page { padding: 14px; display:flex; flex-direction:column; gap:12px; }

.top { display:flex; justify-content:space-between; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:4px; min-width: 240px; }
.title { font-size:18px; font-weight:900; color:#111827; }
.subline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sep { color:#9ca3af; }

.tright { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:10px 12px; }
.cardTable { padding: 0; overflow: hidden; }
.hint { padding: 10px 12px; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
.btn:hover { background:#f9fafb; }
.btn.primary { background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover { background: rgba(24,64,112,1); }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.right { text-align:right; }
.muted { color:#6b7280; font-size:12px; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mono { font-variant-numeric: tabular-nums; }
.strong { font-weight: 950; }

.actIc{ width:18px; height:18px; }

.tabs{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.tabBtn{
  border: 1px solid rgba(16,24,40,0.14);
  background: rgba(15,23,42,0.02);
  color:#111827;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
}
.tabBtn:hover{ background: rgba(15,23,42,0.04); }
.tabBtn.active{
  background: rgba(24,64,112,0.10);
  border-color: rgba(24,64,112,0.30);
  color: rgba(24,64,112,1);
}

.controls{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.leftControls{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.chk{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  font-weight:900;
  color:#111827;
  user-select:none;
}
.chk input{ width:16px; height:16px; border-radius:6px; }

.pillInfo{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-size:12px;
  font-weight:900;
  color:#111827;
}

.gHead, .gRow{
  display:grid;
  width:100%;
  column-gap: 10px;
  align-items:start;
  grid-template-columns:
    minmax(200px, 2.4fr)
    minmax(70px, .7fr)
    minmax(70px, .7fr)
    minmax(190px, 1.5fr)
    minmax(110px, .9fr)
    minmax(110px, .9fr)
    minmax(70px, .7fr)
    minmax(120px, 1fr);
}

.gHead{
  padding: 10px 12px;
  background:#fafafa;
  border-bottom: 1px solid #e5e7eb;
  font-size:11px;
  font-weight: 900;
  color:#6b7280;
}
.hCell{ min-width: 0; white-space: normal; line-height: 1.15; }

.gBody{ padding: 0; }
.gRow{
  padding: 10px 12px;
  border-bottom:1px solid #e5e7eb;
}
.gRow:hover{ background:#fafafa; }

.cell{ min-width: 0; }
.value{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cellMain{ overflow: visible; }
.mainLine { display:flex; align-items:center; gap:8px; min-width:0; }
.subText { margin-top: 2px; font-size: 11px; color: rgba(15,23,42,0.62); }

.emptyRow{ padding: 14px 12px; color:#6b7280; font-size:12px; }

.gFoot{ padding: 10px 12px; background: rgba(15,23,42,0.02); }
.footLine{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }

.theadSticky{
  position: sticky;
  top: -14px;
  z-index: 20;
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.06);
}

.cmtWrap { position: relative; display:inline-flex; align-items:center; z-index: 5; }
.cmtBtn{
  width: 26px; height: 26px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor: default;
}
.cmtIc{ width: 16px; height: 16px; color:#6b7280; }
.cmtTip{
  position:absolute;
  left: 34px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 240px;
  max-width: 360px;
  background: rgba(17,24,39,0.95);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.25;
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-50%) translateX(-4px);
  z-index: 9999;
}
.cmtWrap:hover .cmtTip{
  opacity: 1;
  transform: translateY(-50%) translateX(0px);
}

.pillStrong{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight: 1000;
  color:#111827;
  max-width: 100%;
  overflow:hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.numInput{
  width: 100%;
  min-width: 0;
  max-width: 110px;
  text-align:right;
  padding-right: 10px;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.priceStack{
  display:flex;
  flex-direction:column;
  gap: 4px;
  align-items:flex-end;
}
.pLine{
  display:flex;
  gap: 8px;
  align-items:center;
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
  font-size: 12px;
  white-space:nowrap;
}
.pLine.maj{
  border-color: rgba(16,185,129,0.18);
  background: rgba(16,185,129,0.06);
}
.pLine.strong{
  border-color: rgba(24,64,112,0.22);
  background: rgba(24,64,112,0.06);
  font-weight: 1000;
}
.tag{
  font-size: 11px;
  font-weight: 1000;
  color: rgba(15,23,42,0.65);
  background: rgba(255,255,255,0.75);
  border: 1px solid rgba(16,24,40,0.10);
  padding: 1px 8px;
  border-radius: 999px;
}
.pVal{ font-weight: 1000; }
.u{ font-size: 11px; color: rgba(15,23,42,0.60); }

@media (max-width: 980px) {
  .gHead{ display:none; }
  .gRow{
    grid-template-columns: 1fr 1fr;
    row-gap: 10px;
    border-bottom: none;
    border-top: 1px solid #e5e7eb;
  }
  .gRow > .cell:first-child{ grid-column: 1 / -1; }

  .gRow > .cell{
    display:flex;
    justify-content:space-between;
    gap: 10px;
    align-items:center;
    padding: 2px 0;
  }
  .gRow > .cell::before{
    content: attr(data-label);
    color:#6b7280;
    font-weight: 900;
    font-size: 11px;
    flex: 0 0 auto;
  }
  .gRow > .cell.cellMain{
    display:block;
    padding: 0;
  }
  .gRow > .cell.cellMain::before{ content: ""; display:none; }

  .numInput{ max-width: 180px; }
  .priceStack{ align-items: flex-end; }
}

/* Contenu */
.contentHead{ display:grid; grid-template-columns: 1fr; gap: 10px; }
.lineRight{ text-align:right; }
.centerTitle{ text-align:center; padding: 6px 0; }
.block{ margin-top: 10px; }
.lbl{ font-weight: 1000; font-size: 13px; color:#111827; margin-bottom: 6px; }
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
.grid2{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.kv{
  border:1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 10px 12px;
}
.k{ font-size: 11px; font-weight: 1000; color:#6b7280; }
.v{ margin-top: 4px; }
.twoCols{ display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.list{ display:flex; flex-direction:column; gap: 10px; }
.li{ display:flex; gap: 8px; align-items:flex-start; }
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
.miniAdd{ margin-top: 10px; }

.extras{ display:flex; flex-direction:column; gap: 10px; }
.exRow{
  display:grid;
  grid-template-columns: 1.6fr .6fr .4fr auto;
  gap: 8px;
  align-items:center;
}
.exVal{ text-align:right; }
.grid3{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
@media (max-width: 900px){
  .twoCols{ grid-template-columns: 1fr; }
  .grid2{ grid-template-columns: 1fr; }
  .grid3{ grid-template-columns: 1fr; }
  .exRow{ grid-template-columns: 1fr; }
}
</style>
