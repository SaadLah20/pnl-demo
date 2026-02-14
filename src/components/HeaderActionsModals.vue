<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { nextTick } from "vue";

// ...

const dupOpen = ref(false);
const dupBusy = ref(false);
const dupErr = ref<string | null>(null);

const dupTitleRef = ref<HTMLInputElement | null>(null);

const dupDraft = reactive({
  title: "",
});

function openDuplicateVariant() {
  const v = activeVariant.value;
  const c = activeContract.value;
  if (!v?.id || !c?.id) return;

  dupErr.value = null;
  dupBusy.value = false;

  const baseTitle = String(v.title ?? "Variante");
  dupDraft.title = `${baseTitle} (copie)`;

  dupOpen.value = true;

  // ✅ focus + select pour permettre rename rapide
  nextTick(() => {
    dupTitleRef.value?.focus();
    dupTitleRef.value?.select();
  });
}

function closeDuplicate() {
  dupOpen.value = false;
  dupBusy.value = false;
  dupErr.value = null;
}

async function confirmDuplicate() {
  const v = activeVariant.value;
  const c = activeContract.value;
  if (!v?.id || !c?.id) return;

  dupErr.value = null;
  dupBusy.value = true;

  try {
const sourceId = String(v.id);

const body = {
  contractId: String(c.id),
  title: String(dupDraft.title || "Variante (copie)"),
  description: v.description ?? null,
  status: String(v.status ?? "INITIALISEE"),
  createMode: "COMPOSEE",
  composee: {
    baseVariantId: sourceId,
    // importAll n'est pas pris en compte côté backend, mais on peut le laisser
    importAll: true,
    bySection: {
      transport: sourceId,
      cab: sourceId,
      maintenance: sourceId,
      coutM3: sourceId,
      coutMensuel: sourceId,
      coutOccasionnel: sourceId,
      employes: sourceId,
      autresCouts: sourceId,
      formules: sourceId,
      devis: sourceId,
      majorations: sourceId,
    },
  },
};


    const created = await apiJson(`/variants`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const newVarId = String(created?.id ?? "");
    if (newVarId) {
      await store.loadPnls?.();
      if ((store as any).setActiveVariant) (store as any).setActiveVariant(newVarId);
      else (store as any).activeVariantId = newVarId;
    }

    closeDuplicate();
  } catch (e: any) {
    dupErr.value = e?.message ?? String(e);
  } finally {
    dupBusy.value = false;
  }
}


import VariantCreateModal, {
  type VariantCreateNextPayload,
  type VariantCreateZeroPayload,
} from "@/components/VariantCreateModal.vue";

import VariantWizardModal, {
  type ComposePayload,
  type InitieePayload,
  type VariantCreateMode,
} from "@/components/VariantWizardModal.vue";

const API = "http://localhost:3001";

async function apiJson(url: string, opts?: RequestInit) {
  const res = await fetch(API + url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });

  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    try {
      const j = await res.clone().json();
      if (typeof j?.error === "string") msg = j.error;
      else if (typeof j?.message === "string") msg = j.message;
    } catch {
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
    }
    throw new Error(msg);
  }

  return res.json().catch(() => null);
}

const store = usePnlStore();

/* =========================
   ACTIVE (robuste comme HeaderDashboard)
========================= */
const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnl = computed<any | null>(() => store.activePnl ?? null);
const activeVariant = computed<any | null>(() => store.activeVariant ?? null);

const activeContract = computed<any | null>(() => {
  const pnl = activePnl.value;
  const vId = (store as any).activeVariantId;
  if (!pnl || !pnl.contracts?.length) return null;
  if (!vId) return pnl.contracts[0] ?? null;

  return (
    pnl.contracts.find((c: any) => (c.variants ?? []).some((v: any) => String(v.id) === String(vId))) ??
    pnl.contracts[0] ??
    null
  );
});

/* =========================================================
   ENUMS (Contrat) — identique MesPnlPage
========================================================= */
type Opt = { value: any; label: string };

const CHARGE_3: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
];

const GENIE_CIVIL_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
  { value: "PARTAGE", label: "Partagé" },
];

const TERRAIN_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
  { value: "PARTAGE", label: "Partagé" },
];

const MATIERE_3: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "PRESTATAIRE", label: "Prestataire" },
];

const MAINTENANCE_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "PARTAGE_STANDARD", label: "Partage standard" },
  { value: "PARTAGE_PARTICULIER", label: "Partage particulier" },
];

const CONSOMMATION_2: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const POSTES_2: Opt[] = [
  { value: 1, label: "1 poste" },
  { value: 2, label: "2 postes" },
];

function labelFrom(opts: Opt[], value: any) {
  const f = opts.find((o) => String(o.value) === String(value));
  return f?.label ?? (value === null || value === undefined || value === "" ? "-" : String(value));
}

function fmtDate(v: any) {
  try {
    if (!v) return "-";
    const d = new Date(v);
    return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return "-";
  }
}
function toDateInput(v: any): string {
  try {
    if (!v) return "";
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}
function fromDateInput(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return dt.toISOString();
}

/* =========================================================
   VIEW MODAL — identique MesPnlPage (pnl/contract/variant)
========================================================= */
type ViewMode = "pnl" | "contract" | "variant";
const viewOpen = ref(false);
const viewMode = ref<ViewMode>("pnl");
const viewData = ref<any>(null);

function openView(mode: ViewMode, data: any) {
  viewMode.value = mode;
  viewData.value = data;
  viewOpen.value = true;
}
function closeView() {
  viewOpen.value = false;
  viewData.value = null;
}

/* =========================================================
   EDIT MODAL — identique MesPnlPage (update only ici)
========================================================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

/** create flags (désactivés dans le header) */
const isCreate = ref(false);
const createPnlId = ref<string | null>(null);

const draft = reactive<any>({
  id: "",

  // pnl
  title: "",
  client: "",
  model: "",
  city: "",
  status: "",
  createdAt: "",
  startDate: "",

  // contract
  ref: "",
  dureeMois: 0,
  cab: "LHM",
  installation: "LHM",
  genieCivil: "LHM",
  transport: "LHM",
  terrain: "LHM",
  matierePremiere: "LHM",
  maintenance: "LHM",
  chargeuse: "LHM",
  branchementEau: "LHM",
  consoEau: "LHM",
  branchementElec: "LHM",
  consoElec: "LHM",
  postes: 1,
  sundayPrice: 0,
  delayPenalty: 0,
  chillerRent: 0,

  // variant
  description: "",
});

function resetDraft() {
  draft.id = "";

  draft.title = "";
  draft.client = "";
  draft.model = "";
  draft.city = "";
  draft.status = "";
  draft.createdAt = "";
  draft.startDate = "";

  draft.ref = "";
  draft.dureeMois = 0;

  draft.cab = "LHM";
  draft.installation = "LHM";
  draft.genieCivil = "LHM";
  draft.transport = "LHM";
  draft.terrain = "LHM";
  draft.matierePremiere = "LHM";
  draft.maintenance = "LHM";
  draft.chargeuse = "LHM";

  draft.branchementEau = "LHM";
  draft.consoEau = "LHM";
  draft.branchementElec = "LHM";
  draft.consoElec = "LHM";

  draft.postes = 1;
  draft.sundayPrice = 0;
  draft.delayPenalty = 0;
  draft.chillerRent = 0;

  draft.description = "";
}

function openEdit(mode: EditMode, data: any) {
  resetDraft();
  isCreate.value = false; // header = update only
  createPnlId.value = null;

  editMode.value = mode;
  editOpen.value = true;

  if (mode === "pnl") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.client = String(data.client ?? "");
    draft.model = String(data.model ?? "");
    draft.city = String(data.city ?? "");
    draft.status = String(data.status ?? "");
    draft.createdAt = data.createdAt ?? "";
    draft.startDate = toDateInput(data.startDate);
  }

  if (mode === "contract") {
    draft.id = String(data.id);
    draft.ref = String(data.ref ?? "");

    draft.dureeMois = Number(data.dureeMois ?? 0);
    draft.cab = String(data.cab ?? "LHM");
    draft.installation = String(data.installation ?? "LHM");
    draft.genieCivil = String(data.genieCivil ?? "LHM");
    draft.transport = String(data.transport ?? "LHM");
    draft.terrain = String(data.terrain ?? "LHM");
    draft.matierePremiere = String(data.matierePremiere ?? "LHM");
    draft.maintenance = String(data.maintenance ?? "LHM");
    draft.chargeuse = String(data.chargeuse ?? "LHM");

    draft.branchementEau = String(data.branchementEau ?? "LHM");
    draft.consoEau = String(data.consoEau ?? "LHM");
    draft.branchementElec = String(data.branchementElec ?? "LHM");
    draft.consoElec = String(data.consoElec ?? "LHM");

    draft.postes = Number(data.postes ?? 1);
    draft.sundayPrice = Number(data.sundayPrice ?? 0);
    draft.delayPenalty = Number(data.delayPenalty ?? 0);
    draft.chillerRent = Number(data.chillerRent ?? 0);
  }

  if (mode === "variant") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.status = String(data.status ?? "");
    draft.description = String(data.description ?? "");
  }
}

function closeEdit() {
  editOpen.value = false;
  editBusy.value = false;
  editErr.value = null;
}

async function saveEdit() {
  editErr.value = null;
  editBusy.value = true;

  try {
    if (editMode.value === "pnl") {
      await apiJson(`/pnls/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title,
          client: draft.client,
          city: draft.city,
          status: draft.status,
          startDate: fromDateInput(draft.startDate),
        }),
      });
    }

    if (editMode.value === "contract") {
      const payload = {
        dureeMois: Number(draft.dureeMois ?? 0),
        cab: draft.cab,
        installation: draft.installation,
        genieCivil: draft.genieCivil,
        transport: draft.transport,
        terrain: draft.terrain,
        matierePremiere: draft.matierePremiere,
        maintenance: draft.maintenance,
        chargeuse: draft.chargeuse,
        branchementEau: draft.branchementEau,
        consoEau: draft.consoEau,
        branchementElec: draft.branchementElec,
        consoElec: draft.consoElec,
        postes: Number(draft.postes ?? 1),
        sundayPrice: Number(draft.sundayPrice ?? 0),
        delayPenalty: Number(draft.delayPenalty ?? 0),
        chillerRent: Number(draft.chillerRent ?? 0),
      };

      await apiJson(`/contracts/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }

    if (editMode.value === "variant") {
      await apiJson(`/variants/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title,
          status: draft.status,
          description: draft.description,
        }),
      });
    }

    const keepPnl = String((store as any).activePnlId ?? "");
    const keepVar = String((store as any).activeVariantId ?? "");

    await store.loadPnls?.();

    if (keepPnl && (store as any).setActivePnl) (store as any).setActivePnl(keepPnl);
    if (keepVar && (store as any).setActiveVariant) (store as any).setActiveVariant(keepVar);

    closeEdit();
  } catch (e: any) {
    editErr.value = e?.message ?? String(e);
  } finally {
    editBusy.value = false;
  }
}

/* =========================================================
   VARIANT CREATION (2-step modals) — identique MesPnlPage
========================================================= */
const allVariantsFlat = computed(() => {
  const out: Array<{ id: string; title: string; contractTitle?: string | null; pnlTitle?: string | null }> = [];
  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      for (const v of c.variants ?? []) {
        out.push({
          id: String(v.id),
          title: String(v.title ?? "Variante"),
          contractTitle: String(c.ref ?? "Contrat"),
          pnlTitle: String(p.title ?? "P&L"),
        });
      }
    }
  }
  return out;
});

const createOpen = ref(false);
const createContractId = ref<string | null>(null);
const createDefaultTitle = ref<string | undefined>(undefined);

const wizardOpen = ref(false);
const wizardMode = ref<VariantCreateMode>("INITIEE");

const createBase = reactive<{
  contractId: string;
  title: string;
  description: string | null;
  status: "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";
  createMode: "ZERO" | "INITIEE" | "COMPOSEE";
}>({
  contractId: "",
  title: "Variante",
  description: null,
  status: "INITIALISEE",
  createMode: "ZERO",
});

function openCreateVariantFromHeader() {
  const c = activeContract.value;
  if (!c?.id) return;

  createContractId.value = String(c.id);
  createDefaultTitle.value = "Variante";
  createOpen.value = true;
}

function closeCreateModal() {
  createOpen.value = false;
}
function closeWizardModal() {
  wizardOpen.value = false;
}

async function afterVariantCreated(newVariantId: string) {
  await store.loadPnls?.();
  if ((store as any).setActiveVariant) (store as any).setActiveVariant(String(newVariantId));
  else (store as any).activeVariantId = String(newVariantId);
}

async function handleCreateSave(payload: VariantCreateZeroPayload) {
  const created = await apiJson(`/variants`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const newVarId = String(created?.variant?.id ?? created?.id ?? "");
  if (newVarId) await afterVariantCreated(newVarId);

  createOpen.value = false;
}

function handleCreateNext(payload: VariantCreateNextPayload) {
  createBase.contractId = payload.contractId;
  createBase.title = payload.title;
  createBase.description = payload.description;
  createBase.status = payload.status;
  createBase.createMode = payload.createMode;

  wizardMode.value = payload.createMode;
  createOpen.value = false;
  wizardOpen.value = true;
}

async function handleSaveInitiee(payload: InitieePayload) {
  const body = {
    contractId: createBase.contractId,
    title: createBase.title,
    description: createBase.description,
    status: createBase.status,
    createMode: "INITIEE",
    initiee: payload,
  };

  const created = await apiJson(`/variants`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const newVarId = String(created?.variant?.id ?? created?.id ?? "");
  if (newVarId) await afterVariantCreated(newVarId);

  wizardOpen.value = false;
}

async function handleSaveComposee(payload: ComposePayload) {
  const body = {
    contractId: createBase.contractId,
    title: createBase.title,
    description: createBase.description,
    status: createBase.status,
    createMode: "COMPOSEE",
    composee: payload,
  };

  const created = await apiJson(`/variants`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const newVarId = String(created?.variant?.id ?? created?.id ?? "");
  if (newVarId) await afterVariantCreated(newVarId);

  wizardOpen.value = false;
}

/* =========================================================
   EXPOSE: API pour HeaderDashboard
========================================================= */
function openViewPnl() {
  const p = activePnl.value;
  if (!p?.id) return;
  openView("pnl", p);
}
function openEditPnl() {
  const p = activePnl.value;
  if (!p?.id) return;
  openEdit("pnl", p);
}

function openViewContract() {
  const c = activeContract.value;
  if (!c?.id) return;
  openView("contract", c);
}
function openEditContract() {
  const c = activeContract.value;
  if (!c?.id) return;
  openEdit("contract", c);
}

function openEditVariantFromHeader() {
  const v = activeVariant.value;
  if (!v?.id) return;
  openEdit("variant", v);
}

defineExpose({
  // P&L
  openViewPnl,
  openEditPnl,
  // Contrat
  openViewContract,
  openEditContract,
  // Variante
  openNewVariant: openCreateVariantFromHeader,
  openEditVariant: openEditVariantFromHeader,
  openDuplicateVariant,

});

</script>

<template>
  <Teleport to="body">
    <!-- =========================
         VIEW MODAL
    ========================= -->
    <div v-if="viewOpen" class="modalOverlay" @click.self="closeView()">
      <div class="modalCard">
        <div class="modalHead">
          <b v-if="viewMode === 'pnl'">Détails P&amp;L</b>
          <b v-else-if="viewMode === 'contract'">Détails Contrat</b>
          <b v-else>Détails Variante</b>
          <button class="x" type="button" @click="closeView()">✕</button>
        </div>

        <div class="modalBody">
          <div v-if="viewMode === 'pnl'" class="kv">
            <div class="rowKV"><div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Client</div><div class="v">{{ viewData?.client ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Ville</div><div class="v">{{ viewData?.city ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Modèle</div><div class="v">{{ viewData?.model ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Créé le</div><div class="v">{{ fmtDate(viewData?.createdAt) }}</div></div>
            <div class="rowKV"><div class="k">Démarrage</div><div class="v">{{ fmtDate(viewData?.startDate) }}</div></div>
          </div>

          <div v-else-if="viewMode === 'contract'" class="kv">
            <div class="rowKV"><div class="k">Référence</div><div class="v">{{ viewData?.ref ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Durée</div><div class="v">{{ viewData?.dureeMois ?? 0 }} mois</div></div>
            <div class="rowKV"><div class="k">Postes</div><div class="v">{{ labelFrom(POSTES_2, viewData?.postes) }}</div></div>
            <div class="rowKV"><div class="k">Cab</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.cab) }}</div></div>
            <div class="rowKV"><div class="k">Installation</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.installation) }}</div></div>
            <div class="rowKV"><div class="k">Génie civil</div><div class="v">{{ labelFrom(GENIE_CIVIL_4, viewData?.genieCivil) }}</div></div>
            <div class="rowKV"><div class="k">Transport</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.transport) }}</div></div>
            <div class="rowKV"><div class="k">Terrain</div><div class="v">{{ labelFrom(TERRAIN_4, viewData?.terrain) }}</div></div>
            <div class="rowKV"><div class="k">Matière première</div><div class="v">{{ labelFrom(MATIERE_3, viewData?.matierePremiere) }}</div></div>
            <div class="rowKV"><div class="k">Maintenance</div><div class="v">{{ labelFrom(MAINTENANCE_4, viewData?.maintenance) }}</div></div>
            <div class="rowKV"><div class="k">Chargeuse</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.chargeuse) }}</div></div>
            <div class="rowKV"><div class="k">Branchement Eau</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.branchementEau) }}</div></div>
            <div class="rowKV"><div class="k">Consommation Eau</div><div class="v">{{ labelFrom(CONSOMMATION_2, viewData?.consoEau) }}</div></div>
            <div class="rowKV"><div class="k">Branchement Électricité</div><div class="v">{{ labelFrom(CHARGE_3, viewData?.branchementElec) }}</div></div>
            <div class="rowKV"><div class="k">Consommation Électricité</div><div class="v">{{ labelFrom(CONSOMMATION_2, viewData?.consoElec) }}</div></div>
            <div class="rowKV"><div class="k">Prix dimanches/fériés</div><div class="v">{{ viewData?.sundayPrice ?? 0 }}</div></div>
            <div class="rowKV"><div class="k">Pénalité délai</div><div class="v">{{ viewData?.delayPenalty ?? 0 }}</div></div>
            <div class="rowKV"><div class="k">Location Chiller</div><div class="v">{{ viewData?.chillerRent ?? 0 }}</div></div>
          </div>

          <div v-else class="kv">
            <div class="rowKV"><div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div></div>
            <div class="rowKV"><div class="k">Description</div><div class="v">{{ viewData?.description ?? "-" }}</div></div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn" @click="closeView()">Fermer</button>
        </div>
      </div>
    </div>

    <!-- ✅ DUPLICATE VARIANT -->
<div v-if="dupOpen" class="modalOverlay" @click.self="closeDuplicate()">
  <div class="modalCard">
    <div class="modalHead">
      <b>Dupliquer la variante</b>
      <button class="x" type="button" @click="closeDuplicate()">✕</button>
    </div>

    <div class="modalBody">
      <div v-if="dupErr" class="err">{{ dupErr }}</div>

      <div class="grid">
        <div class="f f--full">
          <div class="k">Titre de la nouvelle variante</div>
          <input ref="dupTitleRef" class="in" v-model="dupDraft.title" />
        </div>
      </div>
    </div>

    <div class="modalFoot">
      <button class="btn" :disabled="dupBusy" @click="closeDuplicate()">Annuler</button>
      <button class="btn btn--primary" :disabled="dupBusy" @click="confirmDuplicate()">
        {{ dupBusy ? "Duplication…" : "Créer la copie" }}
      </button>
    </div>
  </div>
</div>

    <!-- =========================
         EDIT MODAL (update only)
    ========================= -->
    <div v-if="editOpen" class="modalOverlay" @click.self="closeEdit()">
      <div class="modalCard">
        <div class="modalHead">
          <b v-if="editMode === 'pnl'">Modifier P&amp;L</b>
          <b v-else-if="editMode === 'contract'">Modifier Contrat</b>
          <b v-else>Modifier Variante</b>
          <button class="x" type="button" @click="closeEdit()">✕</button>
        </div>

        <div class="modalBody">
          <div v-if="editErr" class="err">{{ editErr }}</div>

          <!-- PNL -->
          <div v-if="editMode === 'pnl'" class="grid">
            <div class="f">
              <div class="k">Titre</div>
              <input class="in" v-model="draft.title" />
            </div>
            <div class="f">
              <div class="k">Client</div>
              <input class="in" v-model="draft.client" />
            </div>
            <div class="f">
              <div class="k">Ville</div>
              <input class="in" v-model="draft.city" />
            </div>
            <div class="f">
              <div class="k">Statut</div>
              <input class="in" v-model="draft.status" />
            </div>
            <div class="f">
              <div class="k">Démarrage</div>
              <input class="in" type="date" v-model="draft.startDate" />
            </div>
            <div class="f">
              <div class="k">Créé le</div>
              <input class="in in--disabled" :value="fmtDate(draft.createdAt)" disabled />
            </div>
          </div>
          <!-- CONTRACT -->
          <div v-else-if="editMode === 'contract'" class="grid">
            <div class="f">
              <div class="k">Durée (mois)</div>
              <input class="in" type="number" v-model="draft.dureeMois" />
            </div>
            <div class="f">
              <div class="k">Postes</div>
              <select class="in" v-model="draft.postes">
                <option v-for="o in POSTES_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Cab</div>
              <select class="in" v-model="draft.cab">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Installation</div>
              <select class="in" v-model="draft.installation">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Génie civil</div>
              <select class="in" v-model="draft.genieCivil">
                <option v-for="o in GENIE_CIVIL_4" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Transport</div>
              <select class="in" v-model="draft.transport">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Terrain</div>
              <select class="in" v-model="draft.terrain">
                <option v-for="o in TERRAIN_4" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Matière première</div>
              <select class="in" v-model="draft.matierePremiere">
                <option v-for="o in MATIERE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Maintenance</div>
              <select class="in" v-model="draft.maintenance">
                <option v-for="o in MAINTENANCE_4" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Chargeuse</div>
              <select class="in" v-model="draft.chargeuse">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Branchement Eau</div>
              <select class="in" v-model="draft.branchementEau">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Consommation Eau</div>
              <select class="in" v-model="draft.consoEau">
                <option v-for="o in CONSOMMATION_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Branchement Électricité</div>
              <select class="in" v-model="draft.branchementElec">
                <option v-for="o in CHARGE_3" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f">
              <div class="k">Consommation Électricité</div>
              <select class="in" v-model="draft.consoElec">
                <option v-for="o in CONSOMMATION_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <div class="f">
              <div class="k">Prix dimanches/fériés</div>
              <input class="in" type="number" v-model="draft.sundayPrice" />
            </div>
            <div class="f">
              <div class="k">Pénalité délai</div>
              <input class="in" type="number" v-model="draft.delayPenalty" />
            </div>
            <div class="f">
              <div class="k">Location Chiller</div>
              <input class="in" type="number" v-model="draft.chillerRent" />
            </div>
          </div>

          <!-- VARIANT -->
          <div v-else class="grid">
            <div class="f">
              <div class="k">Titre</div>
              <input class="in" v-model="draft.title" />
            </div>
            <div class="f">
              <div class="k">Statut</div>
              <input class="in" v-model="draft.status" />
            </div>
            <div class="f f--full">
              <div class="k">Description</div>
              <textarea class="in" rows="4" v-model="draft.description"></textarea>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn" :disabled="editBusy" @click="closeEdit()">Annuler</button>
          <button class="btn btn--primary" :disabled="editBusy" @click="saveEdit()">
            {{ editBusy ? "Enregistrement…" : "Enregistrer" }}
          </button>
        </div>
      </div>
    </div>

    <!-- =========================
         VARIANT CREATE + WIZARD
    ========================= -->
    <VariantCreateModal
      :open="createOpen"
      :contract-id="createContractId"
      :default-title="createDefaultTitle"
      @close="closeCreateModal"
      @save="handleCreateSave"
      @next="handleCreateNext"
    />

    <VariantWizardModal
      :open="wizardOpen"
      :mode="wizardMode"
      :all-variants="allVariantsFlat"
      @close="closeWizardModal"
      @submit-initiee="handleSaveInitiee"
      @submit-composee="handleSaveComposee"
    />
  </Teleport>
</template>

<style scoped>
/* ✅ ultra safe au-dessus du header (9999) */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000000;
}

.modalCard {
  width: min(860px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);          /* ✅ clé */
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;                        /* ✅ évite le débordement */
  display: flex;                           /* ✅ permet scroll body */
  flex-direction: column;
}

.modalHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
}
.x {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  border-radius: 10px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.modalBody {
  flex: 1 1 auto;                          /* ✅ prend le reste */
  overflow: auto;                          /* ✅ scroll interne */
  padding: 12px 14px;
  -webkit-overflow-scrolling: touch;
}
.err {
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.22);
  color: rgba(185, 28, 28, 0.98);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 10px;
}

.kv {
  display: grid;
  gap: 8px;
}
.rowKV {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 10px;
  align-items: baseline;
}
.k {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.62);
}
.v {
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.88);
  word-break: break-word;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.f--full {
  grid-column: 1 / -1;
}
.in {
  width: 100%;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 900;
  outline: none;
}
.in--disabled {
  background: rgba(15, 23, 42, 0.03);
}
.in:focus {
  border-color: rgba(32, 184, 232, 0.35);
}

.modalFoot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
}

/* ✅ Grille: le contrat devient vite trop large -> 1 colonne plus tôt */
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

/* (Optionnel) rend les labels "view" lisibles sur mobile */
@media (max-width: 820px) {
  .rowKV {
    grid-template-columns: 1fr;
  }
}

.btn {
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.btn--primary {
  background: #184070;
  border-color: rgba(24, 64, 112, 0.35);
  color: #fff;
}

@media (max-width: 820px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .rowKV {
    grid-template-columns: 1fr;
  }
}
</style>
