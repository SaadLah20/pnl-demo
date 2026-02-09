<!-- src/pages/DevisPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import {
  InformationCircleIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

const loading = ref(false);
const busy = reactive({ reload: false, save: false, apply: false });
const error = ref<string | null>(null);

/* =========================
   Utils
========================= */
function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function money2(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(x);
}
function money0(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(x);
}
function int(v: any) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n(v));
}
function roundTo5(x: number): number {
  const v = n(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v / 5) * 5;
}
function safeJsonParse<T>(raw: any, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === "object") return raw as T;
    const parsed = JSON.parse(String(raw));
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function toJsonString(v: any, fallback: any) {
  try {
    return JSON.stringify(v ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

/* =========================
   State (variant / contract)
========================= */
const variant = computed<any | null>(() => (store as any).activeVariant ?? null);
const contract = computed<any | null>(() => (store as any).activeContract ?? null);
const pnl = computed<any | null>(() => (store as any).activePnl ?? null);

const dureeMois = computed(() => n(contract.value?.dureeMois ?? 0));
const rows = computed<any[]>(() => variant.value?.formules?.items ?? []);
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + n(r?.volumeM3), 0));

/* =========================
   Header toggles (store)
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
   Devis types
========================= */
type DevisLineItem = {
  id: string;
  label: string;
  unite: "FORFAIT" | "MOIS" | "M3" | "JOUR" | "TONNE" | "AUTRE";
  pu: number; // prix unitaire (ou montant si FORFAIT)
  qty: number;
  comment?: string;
};

function uid(prefix = "L") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/* =========================
   Row key for surcharges map
========================= */
function rowKey(r: any): string {
  return String(r?.id ?? r?.variantFormuleId ?? r?.formuleId ?? r?.formule?.id ?? "");
}

/* =========================
   Devis Draft (9 sections)
========================= */
const draft = reactive({
  applyToDashboardOnSave: true,

  meta: {
    date: "",
    titreProjet: "",
    client: "",
    site: "",
    ville: "",
    reference: "",
  } as Record<string, any>,

  intro: "",

  rappel: {
    dureeMois: 0,
    volumeTotalM3: 0,
    nbFormules: 0,
  } as Record<string, any>,

  chargeFournisseur: [] as DevisLineItem[],
  chargeClient: [] as DevisLineItem[],
  prixComplementaires: [] as DevisLineItem[],

  validiteTexte: "",
  signature: {
    nom: "",
    poste: "",
    telephone: "",
    email: "",
  } as Record<string, any>,

  // surcharges par formule: { [rowKey]: number }
  surcharges: {} as Record<string, number>,
});

/* =========================
   Base pricing helpers (for table)
========================= */
function pricePerKg(prixTonne: number): number {
  const p = n(prixTonne);
  if (p <= 0) return 0;
  return p / 1000; // DH/tonne -> DH/kg
}

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
   Majorations impact (/m3) — same logic as your previous version
========================= */
const impactMajorationM3 = computed(() => {
  const v = variant.value;
  const vol = volumeTotal.value;
  if (!v || vol <= 0) return 0;

  const d = dureeMois.value;

  const vBase = {
    ...v,
    autresCouts: {
      ...(v.autresCouts ?? {}),
      majorations: null,
    },
  };

  // IMPORTANT: computeHeaderKpis signature supports extra params, but we keep this block simple
  const kBase = computeHeaderKpis(vBase, d, null);
  const kMaj = computeHeaderKpis(v, d, null);

  const deltaCA = n((kMaj as any)?.caTotal) - n((kBase as any)?.caTotal);
  return deltaCA / vol;
});

function pvWithMajorationM3(r: any): number {
  return pvBaseM3(r) + impactMajorationM3.value;
}

function getSurcharge(r: any): number {
  const k = rowKey(r);
  return n(draft.surcharges[k] ?? 0);
}
function setSurcharge(r: any, v: any) {
  const k = rowKey(r);
  draft.surcharges[k] = n(v);
}

function pvPondereM3(r: any): number {
  const base = withMajorations.value ? pvWithMajorationM3(r) : pvBaseM3(r);
  return roundTo5(base);
}
function pvDefinitifM3(r: any): number {
  return pvPondereM3(r) + getSurcharge(r);
}

const prixMoyenDefinitif = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  const total = rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
  return total / vol;
});

const caDevisTotal = computed(() => {
  return rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
});

/* =========================
   Line items totals
========================= */
function lineTotal(it: DevisLineItem): number {
  const pu = n(it.pu);
  const qty = n(it.qty);
  if (it.unite === "FORFAIT") return pu; // pu is a lump sum
  return pu * qty;
}

function sectionTotal(list: DevisLineItem[]): number {
  return (list ?? []).reduce((s, it) => s + lineTotal(it), 0);
}

const totalChargeFournisseur = computed(() => sectionTotal(draft.chargeFournisseur));
const totalChargeClient = computed(() => sectionTotal(draft.chargeClient));
const totalPrixComplementaires = computed(() => sectionTotal(draft.prixComplementaires));

/* =========================
   Default content inspired by your PDF structure
   (all editable by user)
========================= */
function defaultIntro(): string {
  const client = String(draft.meta.client ?? "").trim() || "Client";
  const proj = String(draft.meta.titreProjet ?? "").trim() || "Projet";
  return `Nous vous prions de bien vouloir trouver ci-joint notre offre de prix relative au ${proj} pour ${client}.`;
}

function defaultValidite(): string {
  return `Validité de l’offre : 30 jours à compter de la date d’émission.`;
}

function ensureHydrofugeLine() {
  // Hydrofuge is a "prix complémentaire" item (not contract)
  const exists = draft.prixComplementaires.some((x) =>
    String(x.label ?? "").toLowerCase().includes("hydrofuge")
  );

  if (exists) return;

  draft.prixComplementaires.unshift({
    id: uid("PC"),
    label: "Hydrofuge (option)",
    unite: "M3",
    pu: 45, // default example; user can edit
    qty: Math.max(0, volumeTotal.value), // default = volume total, user can edit
    comment: "PU exprimé en DH/m³. Le total dépend de la quantité saisie.",
  });
}

function buildDefaultFromVariant() {
  const v = variant.value;
  const c = contract.value;
  const p = pnl.value;

  // Meta
  if (!draft.meta.date) {
    const d = new Date();
    draft.meta.date = d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  draft.meta.client = String(p?.client ?? draft.meta.client ?? "");
  draft.meta.ville = String(p?.city ?? draft.meta.ville ?? "");
  draft.meta.site = String(p?.region ?? draft.meta.site ?? "");

  if (!draft.meta.titreProjet) draft.meta.titreProjet = String(p?.title ?? "");

  // Rappel
  draft.rappel.dureeMois = n(c?.dureeMois ?? 0);
  draft.rappel.volumeTotalM3 = n(volumeTotal.value);
  draft.rappel.nbFormules = rows.value.length;

  // Intro / validité defaults if empty
  if (!String(draft.intro ?? "").trim()) draft.intro = defaultIntro();
  if (!String(draft.validiteTexte ?? "").trim()) draft.validiteTexte = defaultValidite();

  // Signature defaults
  if (!String(draft.signature.nom ?? "").trim()) draft.signature.nom = "—";
  if (!String(draft.signature.poste ?? "").trim()) draft.signature.poste = "—";

  // Charges fournisseur/client defaults (minimal, editable)
  // We keep them lightweight so you can match your PDF later.
  if (draft.chargeFournisseur.length === 0) {
    draft.chargeFournisseur = [
      { id: uid("CF"), label: "Approvisionnement matières premières", unite: "M3", pu: 0, qty: volumeTotal.value },
      { id: uid("CF"), label: "Transport (logistique)", unite: "M3", pu: transportBaseM3.value, qty: volumeTotal.value },
    ];
  }

  if (draft.chargeClient.length === 0) {
    draft.chargeClient = [
      { id: uid("CC"), label: "Mise à disposition (selon conditions chantier)", unite: "FORFAIT", pu: 0, qty: 1 },
    ];
  }

  // Hydrofuge default line
  ensureHydrofugeLine();
}

/* =========================
   Load persisted devis from variant.devis (SectionDevis)
========================= */
function loadPersistedDevis() {
  const v = variant.value;
  if (!v) return;

  const devis = v.devis ?? null;
  if (!devis) {
    // no persisted -> build defaults
    buildDefaultFromVariant();
    return;
  }

  // meta
  draft.meta = safeJsonParse<Record<string, any>>(devis.meta, draft.meta);

  // intro / validité
  draft.intro = String((devis as any).intro ?? draft.intro ?? "");
  draft.validiteTexte = String((devis as any).validiteTexte ?? draft.validiteTexte ?? "");

  // rappel
  draft.rappel = safeJsonParse<Record<string, any>>((devis as any).rappel, draft.rappel);

  // signature
  draft.signature = safeJsonParse<Record<string, any>>((devis as any).signature, draft.signature);

  // line items arrays
  const cf = safeJsonParse<DevisLineItem[]>((devis as any).chargeFournisseur, []);
  const cc = safeJsonParse<DevisLineItem[]>((devis as any).chargeClient, []);
  const pc = safeJsonParse<DevisLineItem[]>((devis as any).prixComplementaires, []);

  // normalize
  draft.chargeFournisseur = (cf ?? []).map((x) => ({
    id: String(x?.id ?? uid("CF")),
    label: String(x?.label ?? ""),
    unite: (String(x?.unite ?? "FORFAIT") as any) || "FORFAIT",
    pu: n((x as any).pu),
    qty: n((x as any).qty),
    comment: x?.comment ? String(x.comment) : undefined,
  }));

  draft.chargeClient = (cc ?? []).map((x) => ({
    id: String(x?.id ?? uid("CC")),
    label: String(x?.label ?? ""),
    unite: (String(x?.unite ?? "FORFAIT") as any) || "FORFAIT",
    pu: n((x as any).pu),
    qty: n((x as any).qty),
    comment: x?.comment ? String(x.comment) : undefined,
  }));

  draft.prixComplementaires = (pc ?? []).map((x) => ({
    id: String(x?.id ?? uid("PC")),
    label: String(x?.label ?? ""),
    unite: (String(x?.unite ?? "FORFAIT") as any) || "FORFAIT",
    pu: n((x as any).pu),
    qty: n((x as any).qty),
    comment: x?.comment ? String(x.comment) : undefined,
  }));

  // surcharges (map)
  draft.surcharges = {};
  const sur = safeJsonParse<Record<string, number>>((devis as any).surcharges, {});
  for (const [k, val] of Object.entries(sur ?? {})) {
    draft.surcharges[String(k)] = n(val);
  }

  // fill missing defaults from variant
  buildDefaultFromVariant();
}

/* =========================
   UX: Collapsible sections
========================= */
type SectionKey =
  | "meta"
  | "intro"
  | "rappel"
  | "chargeFournisseur"
  | "chargeClient"
  | "prixComplementaires"
  | "validite"
  | "signature"
  | "surcharges";

const open = reactive<Record<SectionKey, boolean>>({
  meta: true,
  intro: true,
  rappel: true,
  chargeFournisseur: true,
  chargeClient: true,
  prixComplementaires: true,
  validite: true,
  signature: true,
  surcharges: true,
});

function toggle(k: SectionKey) {
  open[k] = !open[k];
}

/* =========================
   Actions
========================= */
async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;

  try {
    if ((store as any).pnls?.length === 0) {
      await (store as any).loadPnls();
    }
    loadPersistedDevis();
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

    const payload = {
      meta: { ...draft.meta },
      intro: String(draft.intro ?? ""),
      rappel: { ...draft.rappel },

      chargeFournisseur: draft.chargeFournisseur.map((x) => ({
        ...x,
        pu: n(x.pu),
        qty: n(x.qty),
      })),
      chargeClient: draft.chargeClient.map((x) => ({
        ...x,
        pu: n(x.pu),
        qty: n(x.qty),
      })),
      prixComplementaires: draft.prixComplementaires.map((x) => ({
        ...x,
        pu: n(x.pu),
        qty: n(x.qty),
      })),

      validiteTexte: String(draft.validiteTexte ?? ""),
      signature: { ...draft.signature },

      surcharges: { ...draft.surcharges },
    };

    await (store as any).saveDevis(String(v.id), payload);

    // refresh hierarchy (ensures header/dashboard sees persisted values)
    await (store as any).loadPnls();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
}

function resetFromPersisted() {
  loadPersistedDevis();
  nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* =========================
   Line items UI helpers
========================= */
function addLine(target: "chargeFournisseur" | "chargeClient" | "prixComplementaires") {
  const list = draft[target] as DevisLineItem[];
  const prefix = target === "chargeFournisseur" ? "CF" : target === "chargeClient" ? "CC" : "PC";
  list.push({
    id: uid(prefix),
    label: "",
    unite: "FORFAIT",
    pu: 0,
    qty: 1,
  });
}

function removeLine(target: "chargeFournisseur" | "chargeClient" | "prixComplementaires", id: string) {
  const list = draft[target] as DevisLineItem[];
  const idx = list.findIndex((x) => x.id === id);
  if (idx >= 0) list.splice(idx, 1);
}

function normalizeQtyByUnite(it: DevisLineItem) {
  if (it.unite === "FORFAIT") it.qty = 1;
}

/* =========================
   Lifecycle
========================= */
onMounted(async () => {
  await reload();
});

watch(
  () => variant.value?.id,
  () => {
    loadPersistedDevis();
    // keep hydrofuge qty in sync when variant changes (still editable)
    ensureHydrofugeLine();
  }
);

watch(
  () => volumeTotal.value,
  () => {
    // only update default hydrofuge qty if user hasn't changed it drastically
    const h = draft.prixComplementaires.find((x) =>
      String(x.label ?? "").toLowerCase().includes("hydrofuge")
    );
    if (h && (h.qty === 0 || Math.abs(h.qty - volumeTotal.value) < 0.0001)) {
      h.qty = Math.max(0, volumeTotal.value);
    }
  }
);
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
          <b>{{ int(volumeTotal) }}</b><span class="muted">m³</span>

          <span class="sep">•</span>

          <span class="muted">Prix moyen devis :</span>
          <b>{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>
        </div>
      </div>

      <div class="tright">
        <button class="btn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="actIc" />
        </button>

        <button class="btn" @click="resetFromPersisted" :disabled="busy.save">Réinitialiser</button>

        <button class="btn" @click="applyToDashboard" :disabled="busy.apply">
          Appliquer sur dashboard
        </button>

        <button class="btn primary" @click="saveDevis" :disabled="busy.save || !variant?.id">
          <CheckBadgeIcon class="actIc" />
          {{ busy.save ? "Enregistrement..." : "Enregistrer devis" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- GLOBAL CONTROLS -->
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

    <!-- 1) META -->
    <div class="card">
      <div class="cardHead" @click="toggle('meta')">
        <div class="cardTitle">1) Informations (Meta)</div>
        <div class="cardHeadRight">
          <span class="muted">Données export</span>
          <ChevronUpIcon v-if="open.meta" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.meta" class="cardBody">
        <div class="formGrid">
          <div class="field">
            <div class="lbl">Date</div>
            <input class="input" type="date" v-model="draft.meta.date" />
          </div>

          <div class="field">
            <div class="lbl">Référence</div>
            <input class="input" v-model="draft.meta.reference" placeholder="Ex: OFF-2025-001" />
          </div>

          <div class="field">
            <div class="lbl">Titre projet</div>
            <input class="input" v-model="draft.meta.titreProjet" placeholder="Ex: Projet Guercif–Nador" />
          </div>

          <div class="field">
            <div class="lbl">Client</div>
            <input class="input" v-model="draft.meta.client" placeholder="Nom client" />
          </div>

          <div class="field">
            <div class="lbl">Site / Région</div>
            <input class="input" v-model="draft.meta.site" placeholder="Ex: Région / Site" />
          </div>

          <div class="field">
            <div class="lbl">Ville</div>
            <input class="input" v-model="draft.meta.ville" placeholder="Ex: Nador" />
          </div>
        </div>
      </div>
    </div>

    <!-- 2) INTRO -->
    <div class="card">
      <div class="cardHead" @click="toggle('intro')">
        <div class="cardTitle">2) Introduction</div>
        <div class="cardHeadRight">
          <span class="muted">Texte libre</span>
          <ChevronUpIcon v-if="open.intro" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.intro" class="cardBody">
        <textarea class="textarea" v-model="draft.intro" rows="3" />
      </div>
    </div>

    <!-- 3) RAPPEL -->
    <div class="card">
      <div class="cardHead" @click="toggle('rappel')">
        <div class="cardTitle">3) Rappel (Paramètres)</div>
        <div class="cardHeadRight">
          <span class="muted">Données synthèse</span>
          <ChevronUpIcon v-if="open.rappel" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.rappel" class="cardBody">
        <div class="formGrid">
          <div class="field">
            <div class="lbl">Durée (mois)</div>
            <input class="input" type="number" min="0" step="1" v-model="draft.rappel.dureeMois" />
          </div>

          <div class="field">
            <div class="lbl">Volume total (m³)</div>
            <input class="input" type="number" min="0" step="1" v-model="draft.rappel.volumeTotalM3" />
          </div>

          <div class="field">
            <div class="lbl">Nb formules</div>
            <input class="input" type="number" min="0" step="1" v-model="draft.rappel.nbFormules" />
          </div>

          <div class="field">
            <div class="lbl">Prix moyen devis (DH/m³)</div>
            <div class="pillStrong mono">{{ money2(prixMoyenDefinitif) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4) CHARGES FOURNISSEUR -->
    <div class="card">
      <div class="cardHead" @click="toggle('chargeFournisseur')">
        <div class="cardTitle">4) Charges fournisseur</div>
        <div class="cardHeadRight">
          <span class="muted">Total: {{ money0(totalChargeFournisseur) }} DH</span>
          <ChevronUpIcon v-if="open.chargeFournisseur" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.chargeFournisseur" class="cardBody">
        <div class="lineToolbar">
          <button class="btn" type="button" @click.stop="addLine('chargeFournisseur')">
            <PlusIcon class="actIc" /> Ajouter ligne
          </button>
        </div>

        <div class="lineTable">
          <div class="ltHead">
            <div class="h">Désignation</div>
            <div class="h right">Unité</div>
            <div class="h right">PU</div>
            <div class="h right">Qté</div>
            <div class="h right">Total</div>
            <div class="h"></div>
          </div>

          <div v-for="it in draft.chargeFournisseur" :key="it.id" class="ltRow">
            <input class="input" v-model="it.label" placeholder="Libellé" />
            <select class="input right" v-model="it.unite" @change="normalizeQtyByUnite(it)">
              <option value="FORFAIT">Forfait</option>
              <option value="MOIS">Mois</option>
              <option value="M3">m³</option>
              <option value="JOUR">Jour</option>
              <option value="TONNE">Tonne</option>
              <option value="AUTRE">Autre</option>
            </select>
            <input class="input right mono" type="number" step="0.01" v-model="it.pu" />
            <input class="input right mono" type="number" step="0.01" v-model="it.qty" :disabled="it.unite === 'FORFAIT'" />
            <div class="right mono strong">{{ money0(lineTotal(it)) }}</div>
            <button class="btn danger" type="button" @click="removeLine('chargeFournisseur', it.id)">
              <TrashIcon class="actIc" />
            </button>

            <div class="lineNote" v-if="it.comment">
              <span class="muted">Note:</span> {{ it.comment }}
            </div>
          </div>

          <div v-if="draft.chargeFournisseur.length === 0" class="emptyRow">
            Aucune ligne.
          </div>
        </div>
      </div>
    </div>

    <!-- 5) CHARGES CLIENT -->
    <div class="card">
      <div class="cardHead" @click="toggle('chargeClient')">
        <div class="cardTitle">5) Charges client</div>
        <div class="cardHeadRight">
          <span class="muted">Total: {{ money0(totalChargeClient) }} DH</span>
          <ChevronUpIcon v-if="open.chargeClient" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.chargeClient" class="cardBody">
        <div class="lineToolbar">
          <button class="btn" type="button" @click.stop="addLine('chargeClient')">
            <PlusIcon class="actIc" /> Ajouter ligne
          </button>
        </div>

        <div class="lineTable">
          <div class="ltHead">
            <div class="h">Désignation</div>
            <div class="h right">Unité</div>
            <div class="h right">PU</div>
            <div class="h right">Qté</div>
            <div class="h right">Total</div>
            <div class="h"></div>
          </div>

          <div v-for="it in draft.chargeClient" :key="it.id" class="ltRow">
            <input class="input" v-model="it.label" placeholder="Libellé" />
            <select class="input right" v-model="it.unite" @change="normalizeQtyByUnite(it)">
              <option value="FORFAIT">Forfait</option>
              <option value="MOIS">Mois</option>
              <option value="M3">m³</option>
              <option value="JOUR">Jour</option>
              <option value="TONNE">Tonne</option>
              <option value="AUTRE">Autre</option>
            </select>
            <input class="input right mono" type="number" step="0.01" v-model="it.pu" />
            <input class="input right mono" type="number" step="0.01" v-model="it.qty" :disabled="it.unite === 'FORFAIT'" />
            <div class="right mono strong">{{ money0(lineTotal(it)) }}</div>
            <button class="btn danger" type="button" @click="removeLine('chargeClient', it.id)">
              <TrashIcon class="actIc" />
            </button>

            <div class="lineNote" v-if="it.comment">
              <span class="muted">Note:</span> {{ it.comment }}
            </div>
          </div>

          <div v-if="draft.chargeClient.length === 0" class="emptyRow">
            Aucune ligne.
          </div>
        </div>
      </div>
    </div>

    <!-- 6) PRIX COMPLEMENTAIRES (Hydrofuge here) -->
    <div class="card">
      <div class="cardHead" @click="toggle('prixComplementaires')">
        <div class="cardTitle">6) Prix complémentaires (options)</div>
        <div class="cardHeadRight">
          <span class="muted">Total: {{ money0(totalPrixComplementaires) }} DH</span>
          <ChevronUpIcon v-if="open.prixComplementaires" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.prixComplementaires" class="cardBody">
        <div class="noteBox">
          <div class="noteTitle">
            <InformationCircleIcon class="actIc" />
            Règle (Hydrofuge & options)
          </div>
          <div class="noteText">
            • Le <b>PU</b> peut être en <b>DH/m³</b> (ex: 45).<br />
            • La <b>Quantité</b> est saisie par l’utilisateur (par défaut = volume total).<br />
            • Total = <b>PU × Quantité</b> (si unité ≠ Forfait).<br />
            • Ces prix complémentaires <b>ne sont pas liés</b> au contrat.
          </div>
        </div>

        <div class="lineToolbar">
          <button class="btn" type="button" @click.stop="addLine('prixComplementaires')">
            <PlusIcon class="actIc" /> Ajouter ligne
          </button>
        </div>

        <div class="lineTable">
          <div class="ltHead">
            <div class="h">Désignation</div>
            <div class="h right">Unité</div>
            <div class="h right">PU</div>
            <div class="h right">Qté</div>
            <div class="h right">Total</div>
            <div class="h"></div>
          </div>

          <div v-for="it in draft.prixComplementaires" :key="it.id" class="ltRow">
            <input class="input" v-model="it.label" placeholder="Libellé" />
            <select class="input right" v-model="it.unite" @change="normalizeQtyByUnite(it)">
              <option value="FORFAIT">Forfait</option>
              <option value="MOIS">Mois</option>
              <option value="M3">m³</option>
              <option value="JOUR">Jour</option>
              <option value="TONNE">Tonne</option>
              <option value="AUTRE">Autre</option>
            </select>
            <input class="input right mono" type="number" step="0.01" v-model="it.pu" />
            <input class="input right mono" type="number" step="0.01" v-model="it.qty" :disabled="it.unite === 'FORFAIT'" />
            <div class="right mono strong">{{ money0(lineTotal(it)) }}</div>
            <button class="btn danger" type="button" @click="removeLine('prixComplementaires', it.id)">
              <TrashIcon class="actIc" />
            </button>

            <textarea
              class="textarea mini"
              v-model="it.comment"
              rows="2"
              placeholder="Commentaire (optionnel)"
            />
          </div>

          <div v-if="draft.prixComplementaires.length === 0" class="emptyRow">
            Aucune ligne.
          </div>
        </div>
      </div>
    </div>

    <!-- 7) VALIDITE -->
    <div class="card">
      <div class="cardHead" @click="toggle('validite')">
        <div class="cardTitle">7) Validité</div>
        <div class="cardHeadRight">
          <span class="muted">Texte libre</span>
          <ChevronUpIcon v-if="open.validite" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.validite" class="cardBody">
        <textarea class="textarea" v-model="draft.validiteTexte" rows="2" />
      </div>
    </div>

    <!-- 8) SIGNATURE -->
    <div class="card">
      <div class="cardHead" @click="toggle('signature')">
        <div class="cardTitle">8) Signature</div>
        <div class="cardHeadRight">
          <span class="muted">Données export</span>
          <ChevronUpIcon v-if="open.signature" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.signature" class="cardBody">
        <div class="formGrid">
          <div class="field">
            <div class="lbl">Nom</div>
            <input class="input" v-model="draft.signature.nom" />
          </div>
          <div class="field">
            <div class="lbl">Poste</div>
            <input class="input" v-model="draft.signature.poste" />
          </div>
          <div class="field">
            <div class="lbl">Téléphone</div>
            <input class="input" v-model="draft.signature.telephone" />
          </div>
          <div class="field">
            <div class="lbl">Email</div>
            <input class="input" v-model="draft.signature.email" />
          </div>
        </div>
      </div>
    </div>

    <!-- 9) SURCHARGES (per formule) -->
    <div class="card cardTable">
      <div class="cardHead" @click="toggle('surcharges')">
        <div class="cardTitle">9) Surcharges par formule</div>
        <div class="cardHeadRight">
          <span class="muted">PV final = PV pondéré + surcharge</span>
          <ChevronUpIcon v-if="open.surcharges" class="chev" />
          <ChevronDownIcon v-else class="chev" />
        </div>
      </div>

      <div v-if="open.surcharges" class="tableWrap">
        <!-- header -->
        <div class="gHead theadSticky" :class="withMajorations ? 'colsMaj' : 'colsBase'" role="row">
          <div class="hCell">Désignation</div>
          <div class="hCell right">CMP</div>
          <div class="hCell right">MOMD</div>
          <div class="hCell right">Prix calculé</div>
          <div v-if="withMajorations" class="hCell right">Prix avec majorations</div>
          <div class="hCell right">Prix pondéré</div>
          <div class="hCell right">Surcharge</div>
          <div class="hCell right">Prix définitif</div>
          <div class="hCell right">Volume</div>
          <div class="hCell right">Total</div>
        </div>

        <!-- body -->
        <div class="gBody">
          <div v-if="rows.length === 0" class="emptyRow">Aucune formule dans cette variante.</div>

          <div
            v-for="r in rows"
            :key="rowKey(r)"
            class="gRow"
            :class="withMajorations ? 'colsMaj' : 'colsBase'"
            role="row"
          >
            <!-- designation -->
            <div class="cell cellMain">
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
                    <br />
                    Key : <b class="mono">{{ rowKey(r) }}</b>
                  </span>
                </span>
              </div>

              <div class="subText ell">
                Clé: <span class="mono">{{ rowKey(r) }}</span>
              </div>
            </div>

            <!-- CMP -->
            <div class="cell right">
              <div class="value mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</div>
            </div>

            <!-- MOMD -->
            <div class="cell right">
              <div class="value mono">{{ money2(r?.momd) }}</div>
            </div>

            <!-- PV base -->
            <div class="cell right">
              <div class="badgeWrap">
                <span class="priceBadge">
                  <span class="mono">{{ money2(pvBaseM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/m³</span>
                </span>
              </div>
            </div>

            <!-- PV majoré -->
            <div v-if="withMajorations" class="cell right">
              <div class="badgeWrap">
                <span class="priceBadge maj">
                  <span class="mono">{{ money2(pvWithMajorationM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/m³</span>
                </span>
              </div>
            </div>

            <!-- pondéré -->
            <div class="cell right">
              <span class="pillStrong mono">{{ money0(pvPondereM3(r)) }}</span>
            </div>

            <!-- surcharge -->
            <div class="cell right">
              <input
                class="input numInput"
                type="number"
                step="1"
                :value="getSurcharge(r)"
                @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <!-- définitif -->
            <div class="cell right">
              <span class="pillStrong mono">{{ money0(pvDefinitifM3(r)) }}</span>
            </div>

            <!-- volume -->
            <div class="cell right">
              <div class="value mono">{{ int(r?.volumeM3) }}</div>
            </div>

            <!-- total -->
            <div class="cell right">
              <div class="value mono strong">{{ money0(pvDefinitifM3(r) * n(r?.volumeM3)) }}</div>
            </div>
          </div>
        </div>

        <!-- footer -->
        <div class="gFoot">
          <div class="footLine">
            <span class="muted">Prix moyen devis :</span>
            <b class="mono">{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>

            <span class="sep">•</span>

            <span class="muted">Volume :</span>
            <b class="mono">{{ int(volumeTotal) }}</b><span class="muted">m³</span>

            <span class="sep">•</span>

            <span class="muted">CA devis :</span>
            <b class="mono">{{ money0(caDevisTotal) }}</b><span class="muted">DH</span>
          </div>
        </div>

        <div class="card hint">
          <div class="muted">
            • <b>Prix pondéré</b> = prix (base ou majoré) arrondi au multiple de 5.
            &nbsp;• <b>Surcharge</b> peut être négative et s’ajoute après pondération.
          </div>
        </div>
      </div>
    </div>

    <!-- Global summary -->
    <div class="card summary">
      <div class="sumLine">
        <div class="sumBox">
          <div class="muted">Charges fournisseur</div>
          <div class="mono strong">{{ money0(totalChargeFournisseur) }} DH</div>
        </div>
        <div class="sumBox">
          <div class="muted">Charges client</div>
          <div class="mono strong">{{ money0(totalChargeClient) }} DH</div>
        </div>
        <div class="sumBox">
          <div class="muted">Prix complémentaires</div>
          <div class="mono strong">{{ money0(totalPrixComplementaires) }} DH</div>
        </div>
        <div class="sumBox">
          <div class="muted">CA devis (formules)</div>
          <div class="mono strong">{{ money0(caDevisTotal) }} DH</div>
        </div>
      </div>
      <div class="muted" style="margin-top:8px;">
        Ce résumé est indicatif. L’export Word/PDF pourra afficher les sections exactement comme le modèle PDF.
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================
   Base layout (same visual language)
========================= */
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
.hint { margin-top: 10px; }
.summary .sumLine { display:flex; gap:10px; flex-wrap:wrap; }
.sumBox { flex: 1 1 180px; border:1px solid rgba(16,24,40,0.08); background: rgba(15,23,42,0.02); border-radius: 14px; padding: 10px; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
.btn:hover { background:#f9fafb; }
.btn.primary { background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover { background: rgba(24,64,112,1); }
.btn.danger { border-color: rgba(239,68,68,0.4); }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.textarea { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; resize: vertical; }
.textarea.mini { margin-top: 8px; }

.right { text-align:right; }
.muted { color:#6b7280; font-size:12px; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mono { font-variant-numeric: tabular-nums; }
.strong { font-weight: 950; }

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

.pillStrong{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 34px;
  padding: 0 12px;
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

.actIc{ width:18px; height:18px; }

/* =========================
   Collapsible card header
========================= */
.cardHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  cursor:pointer;
  user-select:none;
}
.cardTitle{
  font-size:13px;
  font-weight:1000;
  color:#111827;
}
.cardHeadRight{
  display:flex;
  align-items:center;
  gap:10px;
}
.chev{ width:18px; height:18px; color:#6b7280; }
.cardBody{ margin-top: 10px; }

/* Forms */
.formGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:10px;
}
@media (max-width: 980px){
  .formGrid{ grid-template-columns: 1fr; }
}
.field .lbl{
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.70);
  margin-bottom: 6px;
}

/* Note box */
.noteBox{
  border:1px solid rgba(2,132,199,0.18);
  background: rgba(2,132,199,0.06);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.noteTitle{
  display:flex;
  align-items:center;
  gap:8px;
  font-weight: 1000;
  color:#0b3b63;
  font-size:12px;
}
.noteText{
  margin-top: 6px;
  color: rgba(15,23,42,0.75);
  font-size: 12px;
  line-height: 1.35;
}

/* =========================
   Line Items table (no overlap, no horizontal scroll)
========================= */
.lineToolbar{
  display:flex;
  justify-content:flex-end;
  margin-bottom: 10px;
}
.lineTable{
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 14px;
  overflow: hidden;
}
.ltHead{
  display:grid;
  grid-template-columns: minmax(180px, 2.2fr) minmax(90px, .7fr) minmax(90px, .7fr) minmax(90px, .7fr) minmax(110px, .8fr) 52px;
  gap:10px;
  padding: 10px 12px;
  background: #fafafa;
  border-bottom: 1px solid rgba(16,24,40,0.10);
}
.ltHead .h{
  font-size: 11px;
  font-weight: 950;
  color:#6b7280;
  min-width: 0;
  line-height: 1.15;
}
.ltRow{
  display:grid;
  grid-template-columns: minmax(180px, 2.2fr) minmax(90px, .7fr) minmax(90px, .7fr) minmax(90px, .7fr) minmax(110px, .8fr) 52px;
  gap:10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
  align-items:center;
}
.ltRow:last-child{ border-bottom: none; }
.lineNote{
  grid-column: 1 / -1;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(15,23,42,0.7);
}
@media (max-width: 980px){
  .ltHead{ display:none; }
  .ltRow{
    grid-template-columns: 1fr 1fr;
  }
  .ltRow > :nth-child(1){ grid-column: 1 / -1; }
  .ltRow > :nth-child(6){ grid-column: 2 / 3; justify-self: end; }
  .lineNote{ grid-column: 1 / -1; }
}

/* =========================
   Grid table (surcharges) — no overlap / no horizontal scroll
========================= */
.tableWrap{ padding: 10px 12px 12px; }

.gHead, .gRow{
  display:grid;
  width:100%;
  column-gap: 10px;
  align-items:center;
}
.colsBase{
  grid-template-columns:
    minmax(180px, 2.2fr)
    minmax(70px, .8fr)
    minmax(70px, .8fr)
    minmax(110px, 1.1fr)
    minmax(110px, 1.0fr)
    minmax(110px, 1.0fr)
    minmax(110px, 1.0fr)
    minmax(80px, .8fr)
    minmax(120px, 1.1fr);
}
.colsMaj{
  grid-template-columns:
    minmax(180px, 2.0fr)
    minmax(70px, .75fr)
    minmax(70px, .75fr)
    minmax(110px, 1.0fr)
    minmax(120px, 1.05fr)
    minmax(110px, 0.95fr)
    minmax(110px, 0.95fr)
    minmax(110px, 0.95fr)
    minmax(80px, .75fr)
    minmax(120px, 1.05fr);
}

.gHead{
  padding: 10px 12px;
  background:#fafafa;
  border:1px solid #e5e7eb;
  border-radius: 14px;
  font-size:11px;
  font-weight: 900;
  color:#6b7280;
}
.hCell{ min-width:0; white-space: normal; line-height: 1.15; }

.gBody{ padding: 0; margin-top: 10px; border:1px solid #e5e7eb; border-radius: 14px; overflow:hidden; }
.gRow{
  padding: 10px 12px;
  border-bottom:1px solid #e5e7eb;
}
.gRow:last-child{ border-bottom:none; }
.gRow:hover{ background:#fafafa; }
.cell{ min-width:0; }
.value{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cellMain{ overflow: visible; }
.mainLine { display:flex; align-items:center; gap:8px; min-width:0; }
.subText { margin-top: 2px; font-size: 11px; color: rgba(15,23,42,0.62); }

.emptyRow{
  padding: 14px 12px;
  color:#6b7280;
  font-size:12px;
}

.gFoot{
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(15,23,42,0.02);
  border:1px solid rgba(16,24,40,0.08);
  border-radius: 14px;
}
.footLine{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }

/* Sticky header like your other pages */
.theadSticky{
  position: sticky;
  top: -14px;
  z-index: 20;
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.06);
}

/* Tooltip */
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

/* Badges (constrained) */
.badgeWrap{ display:flex; justify-content:flex-end; min-width:0; }
.priceBadge{
  display:inline-flex;
  align-items:center;
  gap: 6px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(2,132,199,0.22);
  background: rgba(2,132,199,0.08);
  color:#0b3b63;
  font-weight:1000;
  font-size:13px;
  white-space:nowrap;
  max-width: 100%;
  overflow:hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}
.priceBadge.maj{
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(16, 185, 129, 0.10);
  color: #065f46;
}
.priceBadge .dh{ font-size:11px; font-weight:900; opacity:0.9; }
.unitTag{
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.65);
  background: rgba(255,255,255,0.65);
  border: 1px solid rgba(16,24,40,0.10);
  padding: 2px 8px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.numInput{
  width: 100%;
  min-width: 0;
  max-width: 140px;
  text-align:right;
  padding-right: 10px;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

/* Responsive: surcharges rows as cards (no horizontal scroll) */
@media (max-width: 980px) {
  .colsBase, .colsMaj{
    grid-template-columns: 1fr 1fr;
    row-gap: 10px;
  }
  .gHead{ display:none; }
  .gRow{ border-bottom: none; border-top: 1px solid #e5e7eb; }
  .gRow .cell:nth-child(1){ grid-column: 1 / -1; }
  .gRow .cell{
    display:flex;
    justify-content:space-between;
    gap: 10px;
    align-items:center;
    padding: 2px 0;
  }
  .gRow .cellMain{ display:block; padding: 0; }
  .numInput{ max-width: 160px; }
}
</style>
