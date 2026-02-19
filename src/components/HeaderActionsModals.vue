<!-- ✅ src/components/HeaderActionsModals.vue
     - Modals identiques à MesPnlPage (VIEW/EDIT/DUPLICATE + tabs contrat)
     - ✅ Edit PNL: dropdown status comme MesPnlPage
     - ✅ Edit Variant: dropdown status comme la création (VARIANT_STATUS_OPTS)
     - ✅ Charges: seulement 2 options (LHM / CLIENT) partout
     - Teleport body + scroll lock + ESC close
-->
<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount, onMounted, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { VARIANT_STATUS_OPTS, type VariantStatusUi } from "@/constants/variantStatus";

import VariantCreateModal, {
  type VariantCreateNextPayload,
  type VariantCreateZeroPayload,
} from "@/components/VariantCreateModal.vue";

import VariantWizardModal, {
  type ComposePayload,
  type InitieePayload,
  type VariantCreateMode,
} from "@/components/VariantWizardModal.vue";

/* =========================================================
   API
========================================================= */
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
   ACTIVE
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
   ENUMS
========================================================= */
type Opt = { value: any; label: string };

/* ✅ IMPORTANT: charges = seulement 2 options */
const CHARGE_2: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

/* ✅ mêmes 2 options pour tous les postes “charges” */
const GENIE_CIVIL_2: Opt[] = [...CHARGE_2];
const TERRAIN_2: Opt[] = [...CHARGE_2];
const MATIERE_2: Opt[] = [...CHARGE_2];
const MAINTENANCE_2: Opt[] = [...CHARGE_2];

/* Consommations (déjà 2 options) */
const CONSOMMATION_2: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const POSTES_2: Opt[] = [
  { value: 1, label: "1 poste" },
  { value: 2, label: "2 postes" },
];

/* ✅ PNL status dropdown (comme MesPnlPage) */
type PnlStatusUi = "ENCOURS" | "PERDU" | "ADJUGE" | "ARCHIVED";
const PNL_STATUS_OPTS: Array<{ value: PnlStatusUi; label: string }> = [
  { value: "ENCOURS", label: "En cours" },
  { value: "PERDU", label: "Perdu" },
  { value: "ADJUGE", label: "Adjugé" },
  { value: "ARCHIVED", label: "Archivé" },
] as const;

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
   VIEW MODAL
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
   EDIT MODAL
========================================================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

const draft = reactive<any>({
  id: "",
  title: "",
  client: "",
  model: "",
  city: "",
  status: "",
  createdAt: "",
  startDate: "",

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

  description: "",
});

function resetDraft() {
  Object.assign(draft, {
    id: "",
    title: "",
    client: "",
    model: "",
    city: "",
    status: "",
    createdAt: "",
    startDate: "",

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

    description: "",
  });
}

/* ✅ UX: tabs pour contrat */
type ContractTab = "general" | "charges" | "utilities" | "penalites";
const contractTab = ref<ContractTab>("general");

function openEdit(mode: EditMode, data: any) {
  resetDraft();

  editMode.value = mode;
  editOpen.value = true;
  editErr.value = null;
  contractTab.value = "general";

  if (mode === "pnl") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.client = String(data.client ?? "");
    draft.model = String(data.model ?? "");
    draft.city = String(data.city ?? "");
    draft.status = String(data.status ?? "ENCOURS");
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
    draft.status = String(data.status ?? "ENCOURS");
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
   DUPLICATE VARIANT
========================================================= */
const dupOpen = ref(false);
const dupBusy = ref(false);
const dupErr = ref<string | null>(null);
const dupTitleRef = ref<HTMLInputElement | null>(null);

const dupDraft = reactive<{
  title: string;
  status: VariantStatusUi;
  description: string;
}>({
  title: "",
  status: "ENCOURS",
  description: "",
});

const dupTitleLen = computed(() => String(dupDraft.title ?? "").trim().length);
const dupTitleOk = computed(() => dupTitleLen.value >= 2 && dupTitleLen.value <= 80);

function openDuplicateVariant() {
  const v = activeVariant.value;
  const c = activeContract.value;
  if (!v?.id || !c?.id) return;

  dupErr.value = null;
  dupBusy.value = false;

  const baseTitle = String(v.title ?? "Variante");
  dupDraft.title = `${baseTitle} (copie)`;
  dupDraft.status = String(v.status ?? "ENCOURS") as VariantStatusUi;
  dupDraft.description = String(v.description ?? "");

  dupOpen.value = true;

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

function resetDupTitle() {
  const v = activeVariant.value;
  const baseTitle = String(v?.title ?? "Variante");
  dupDraft.title = `${baseTitle} (copie)`;
  dupDraft.status = String(activeVariant.value?.status ?? "ENCOURS") as VariantStatusUi;
  dupDraft.description = String(activeVariant.value?.description ?? "");

  nextTick(() => {
    dupTitleRef.value?.focus();
    dupTitleRef.value?.select();
  });
}

async function confirmDuplicate() {
  const v = activeVariant.value;
  const c = activeContract.value;
  if (!v?.id || !c?.id) return;

  const title = String(dupDraft.title ?? "").trim();
  if (!title) {
    dupErr.value = "Le titre est requis.";
    return;
  }
  if (!dupTitleOk.value) {
    dupErr.value = "Titre invalide (2 à 80 caractères).";
    return;
  }

  dupErr.value = null;
  dupBusy.value = true;

  try {
    const sourceId = String(v.id);

    const body = {
      contractId: String(c.id),
      title,
      description: (dupDraft.description ?? "").trim() || null,
      status: dupDraft.status,

      createMode: "COMPOSEE",
      composee: {
        baseVariantId: sourceId,
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

/* =========================================================
   VARIANT CREATION (2-step) — unchanged
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
  status: VariantStatusUi;
  createMode: "ZERO" | "INITIEE" | "COMPOSEE";
}>({
  contractId: "",
  title: "Variante",
  description: null,
  status: "ENCOURS",
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
  createBase.status = String((payload as any).status ?? "ENCOURS") as VariantStatusUi;
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
   EXPOSE
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

/* =========================================================
   GLOBAL MODAL UX (ESC + body scroll lock)
========================================================= */
const anyModalOpen = computed(
  () => viewOpen.value || editOpen.value || dupOpen.value || createOpen.value || wizardOpen.value
);

function onEsc(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (dupOpen.value) return closeDuplicate();
  if (editOpen.value) return closeEdit();
  if (viewOpen.value) return closeView();
  if (wizardOpen.value) return closeWizardModal();
  if (createOpen.value) return closeCreateModal();
}

watch(anyModalOpen, (v) => {
  const cls = "modalLock";
  const html = document.documentElement;
  const body = document.body;
  if (v) {
    html.classList.add(cls);
    body.classList.add(cls);
  } else {
    html.classList.remove(cls);
    body.classList.remove(cls);
  }
});

onMounted(() => document.addEventListener("keydown", onEsc));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onEsc);
  document.documentElement.classList.remove("modalLock");
  document.body.classList.remove("modalLock");
});

defineExpose({
  openViewPnl,
  openEditPnl,
  openViewContract,
  openEditContract,
  openNewVariant: openCreateVariantFromHeader,
  openEditVariant: openEditVariantFromHeader,
  openDuplicateVariant,
});
</script>

<template>
  <Teleport to="body">
    <!-- =========================
         VIEW MODAL (nicer + sections)
    ========================= -->
    <div v-if="viewOpen" class="modalOverlay" @click.self="closeView()">
      <div class="modalCard modalCard--view" role="dialog" aria-modal="true">
        <div class="modalHead">
          <div class="modalTitle">
            <b v-if="viewMode === 'pnl'">Détails P&amp;L</b>
            <b v-else-if="viewMode === 'contract'">Détails Contrat</b>
            <b v-else>Détails Variante</b>
            <div class="modalSub">
              <span v-if="viewMode === 'pnl'">{{ viewData?.client ?? "-" }}</span>
              <span v-else-if="viewMode === 'contract'">{{ viewData?.ref ?? "-" }}</span>
              <span v-else>{{ viewData?.status ?? "-" }}</span>
            </div>
          </div>

          <button class="x" type="button" @click="closeView()" aria-label="Fermer">✕</button>
        </div>

        <div class="modalBody">
          <!-- PNL -->
          <div v-if="viewMode === 'pnl'" class="viewGrid">
            <div class="sec">
              <div class="sec__t">Général</div>
              <div class="kv2">
                <div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div>
                <div class="k">Client</div><div class="v">{{ viewData?.client ?? "-" }}</div>
                <div class="k">Ville</div><div class="v">{{ viewData?.city ?? "-" }}</div>
                <div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div>
              </div>
            </div>

            <div class="sec">
              <div class="sec__t">Dates</div>
              <div class="kv2">
                <div class="k">Créé le</div><div class="v">{{ fmtDate(viewData?.createdAt) }}</div>
                <div class="k">Démarrage</div><div class="v">{{ fmtDate(viewData?.startDate) }}</div>
                <div class="k">Modèle</div><div class="v">{{ viewData?.model ?? "-" }}</div>
              </div>
            </div>
          </div>

          <!-- CONTRACT -->
          <div v-else-if="viewMode === 'contract'" class="viewGrid">
            <div class="sec">
              <div class="sec__t">Général</div>
              <div class="kv2">
                <div class="k">Référence</div><div class="v">{{ viewData?.ref ?? "-" }}</div>
                <div class="k">Durée</div><div class="v">{{ viewData?.dureeMois ?? 0 }} mois</div>
                <div class="k">Postes</div><div class="v">{{ labelFrom(POSTES_2, viewData?.postes) }}</div>
              </div>
            </div>

            <div class="sec">
              <div class="sec__t">Charges</div>
              <div class="kv2">
                <div class="k">Cab</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.cab) }}</div>
                <div class="k">Installation</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.installation) }}</div>
                <div class="k">Génie civil</div><div class="v">{{ labelFrom(GENIE_CIVIL_2, viewData?.genieCivil) }}</div>
                <div class="k">Transport</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.transport) }}</div>
                <div class="k">Terrain</div><div class="v">{{ labelFrom(TERRAIN_2, viewData?.terrain) }}</div>
                <div class="k">Matière</div><div class="v">{{ labelFrom(MATIERE_2, viewData?.matierePremiere) }}</div>
                <div class="k">Maintenance</div><div class="v">{{ labelFrom(MAINTENANCE_2, viewData?.maintenance) }}</div>
                <div class="k">Chargeuse</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.chargeuse) }}</div>
              </div>
            </div>

            <div class="sec">
              <div class="sec__t">Eau &amp; Électricité</div>
              <div class="kv2">
                <div class="k">Branchement Eau</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.branchementEau) }}</div>
                <div class="k">Conso Eau</div><div class="v">{{ labelFrom(CONSOMMATION_2, viewData?.consoEau) }}</div>
                <div class="k">Branchement Élec</div><div class="v">{{ labelFrom(CHARGE_2, viewData?.branchementElec) }}</div>
                <div class="k">Conso Élec</div><div class="v">{{ labelFrom(CONSOMMATION_2, viewData?.consoElec) }}</div>
              </div>
            </div>

            <div class="sec">
              <div class="sec__t">Pénalités &amp; Options</div>
              <div class="kv2">
                <div class="k">Dimanches/Fériés</div><div class="v">{{ viewData?.sundayPrice ?? 0 }}</div>
                <div class="k">Pénalité délai</div><div class="v">{{ viewData?.delayPenalty ?? 0 }}</div>
                <div class="k">Location Chiller</div><div class="v">{{ viewData?.chillerRent ?? 0 }}</div>
              </div>
            </div>
          </div>

          <!-- VARIANT -->
          <div v-else class="viewGrid">
            <div class="sec">
              <div class="sec__t">Général</div>
              <div class="kv2">
                <div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div>
                <div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div>
              </div>
            </div>

            <div class="sec">
              <div class="sec__t">Description</div>
              <div class="descBox">{{ viewData?.description ?? "-" }}</div>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn" @click="closeView()">Fermer</button>
        </div>
      </div>
    </div>

    <!-- =========================
         DUPLICATE VARIANT (better)
    ========================= -->
    <div v-if="dupOpen" class="modalOverlay" @click.self="closeDuplicate()">
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalHead">
          <div class="modalTitle">
            <b>Dupliquer la variante</b>
            <div class="modalSub">
              <span>{{ activeVariant?.title ?? "-" }}</span>
              <span class="sep">•</span>
              <span>{{ activeContract?.ref ?? activeContract?.title ?? "-" }}</span>
            </div>
          </div>
          <button class="x" type="button" @click="closeDuplicate()" aria-label="Fermer">✕</button>
        </div>

        <div class="modalBody">
          <div v-if="dupErr" class="err">{{ dupErr }}</div>

          <div class="grid">
            <div class="f f--full">
              <div class="kRow">
                <div class="k">Titre de la nouvelle variante</div>
                <div class="hint" :class="{ bad: !dupTitleOk }">{{ dupTitleLen }}/80</div>
              </div>

              <input
                ref="dupTitleRef"
                class="in"
                v-model="dupDraft.title"
                :class="{ inBad: !dupTitleOk && dupTitleLen > 0 }"
                placeholder="Ex: Variante X (copie)"
              />

              <div class="grid" style="margin-top:10px;">
                <div class="f">
                  <div class="k">Statut</div>
                  <select class="in" v-model="dupDraft.status">
                    <option v-for="o in VARIANT_STATUS_OPTS" :key="o.value" :value="o.value">
                      {{ o.label }}
                    </option>
                  </select>
                </div>

                <div class="f f--full">
                  <div class="k">Description</div>
                  <textarea class="in" rows="4" v-model="dupDraft.description" placeholder="Optionnel"></textarea>
                </div>
              </div>

              <div class="miniActions">
                <button class="btn btn--ghost" type="button" @click="resetDupTitle" :disabled="dupBusy">
                  Reset
                </button>
                <div class="miniNote">
                  Astuce: tu peux renommer vite puis <b>Entrée</b>.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn" :disabled="dupBusy" @click="closeDuplicate()">Annuler</button>
          <button class="btn btn--primary" :disabled="dupBusy || !dupTitleOk" @click="confirmDuplicate()">
            {{ dupBusy ? "Duplication…" : "Créer la copie" }}
          </button>
        </div>
      </div>
    </div>

    <!-- =========================
         EDIT MODAL (organized)
    ========================= -->
    <div v-if="editOpen" class="modalOverlay" @click.self="closeEdit()">
      <div class="modalCard modalCard--edit" role="dialog" aria-modal="true">
        <div class="modalHead">
          <div class="modalTitle">
            <b v-if="editMode === 'pnl'">Modifier P&amp;L</b>
            <b v-else-if="editMode === 'contract'">Modifier Contrat</b>
            <b v-else>Modifier Variante</b>
            <div class="modalSub">
              <span v-if="editMode === 'pnl'">{{ draft.client || "—" }}</span>
              <span v-else-if="editMode === 'contract'">{{ activeContract?.ref ?? "—" }}</span>
              <span v-else>{{ draft.status || "—" }}</span>
            </div>
          </div>

          <button class="x" type="button" @click="closeEdit()" aria-label="Fermer">✕</button>
        </div>

        <!-- ✅ tabs uniquement pour contrat -->
        <div v-if="editMode === 'contract'" class="tabs">
          <button class="tab" :class="{ on: contractTab === 'general' }" @click="contractTab = 'general'">
            Général
          </button>
          <button class="tab" :class="{ on: contractTab === 'charges' }" @click="contractTab = 'charges'">
            Charges
          </button>
          <button class="tab" :class="{ on: contractTab === 'utilities' }" @click="contractTab = 'utilities'">
            Eau &amp; Élec
          </button>
          <button class="tab" :class="{ on: contractTab === 'penalites' }" @click="contractTab = 'penalites'">
            Pénalités
          </button>
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
              <select class="in" v-model="draft.status">
                <option v-for="o in PNL_STATUS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
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
          <div v-else-if="editMode === 'contract'">
            <div v-if="contractTab === 'general'" class="grid">
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
            </div>

            <div v-else-if="contractTab === 'charges'" class="grid">
              <div class="f">
                <div class="k">Cab</div>
                <select class="in" v-model="draft.cab">
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Installation</div>
                <select class="in" v-model="draft.installation">
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Génie civil</div>
                <select class="in" v-model="draft.genieCivil">
                  <option v-for="o in GENIE_CIVIL_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Transport</div>
                <select class="in" v-model="draft.transport">
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Terrain</div>
                <select class="in" v-model="draft.terrain">
                  <option v-for="o in TERRAIN_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Matière première</div>
                <select class="in" v-model="draft.matierePremiere">
                  <option v-for="o in MATIERE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Maintenance</div>
                <select class="in" v-model="draft.maintenance">
                  <option v-for="o in MAINTENANCE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Chargeuse</div>
                <select class="in" v-model="draft.chargeuse">
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>

            <div v-else-if="contractTab === 'utilities'" class="grid">
              <div class="f">
                <div class="k">Branchement Eau</div>
                <select class="in" v-model="draft.branchementEau">
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
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
                  <option v-for="o in CHARGE_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Consommation Électricité</div>
                <select class="in" v-model="draft.consoElec">
                  <option v-for="o in CONSOMMATION_2" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>

            <div v-else class="grid">
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
          </div>

          <!-- VARIANT -->
          <div v-else class="grid">
            <div class="f">
              <div class="k">Titre</div>
              <input class="in" v-model="draft.title" />
            </div>
            <div class="f">
              <div class="k">Statut</div>
              <select class="in" v-model="draft.status">
                <option v-for="o in VARIANT_STATUS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="f f--full">
              <div class="k">Description</div>
              <textarea class="in" rows="5" v-model="draft.description"></textarea>
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
         VARIANT CREATE + WIZARD (unchanged)
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
/* ✅ body scroll lock */
:global(html.modalLock),
:global(body.modalLock) {
  overflow: hidden;
}

/* ========= Overlay ========= */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000000;
  padding: 12px;
  animation: fadeIn 120ms ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ========= Card ========= */
.modalCard {
  width: min(980px, 100%);
  max-height: calc(100vh - 24px);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: translateY(0);
  animation: popIn 140ms ease;
}
@keyframes popIn {
  from { transform: translateY(6px) scale(0.99); opacity: 0.85; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* sizes per mode */
.modalCard--view { width: min(980px, 100%); }
.modalCard--edit { width: min(1040px, 100%); }

/* ========= Head / Foot sticky ========= */
.modalHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.10);
  background: linear-gradient(to bottom, rgba(243, 246, 251, 0.9), rgba(255, 255, 255, 0.9));
}
.modalTitle b {
  font-size: 13px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.92);
}
.modalSub {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.58);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sep { opacity: 0.5; }

.x {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  border-radius: 10px;
  width: 30px;
  height: 30px;
  cursor: pointer;
}
.x:hover {
  background: rgba(32, 184, 232, 0.10);
  border-color: rgba(32, 184, 232, 0.22);
}

.modalBody {
  flex: 1 1 auto;
  overflow: auto;
  padding: 12px 14px;
  -webkit-overflow-scrolling: touch;
}

.modalFoot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(255, 255, 255, 0.96);
}

/* ========= Error ========= */
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

/* ========= View layout ========= */
.viewGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 900px) {
  .viewGrid { grid-template-columns: 1fr; }
}
.sec {
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 14px;
  padding: 10px 10px 8px;
  background: rgba(243, 246, 251, 0.55);
}
.sec__t {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.70);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.35px;
}
.kv2 {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 8px 10px;
  align-items: baseline;
}
@media (max-width: 700px) {
  .kv2 { grid-template-columns: 1fr; }
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
.descBox {
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.86);
  white-space: pre-wrap;
}

/* ========= Forms ========= */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
}
.f--full { grid-column: 1 / -1; }

.kRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.hint {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}
.hint.bad { color: rgba(185, 28, 28, 0.95); }

.in {
  width: 100%;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 900;
  outline: none;
  background: #fff;
}
.in--disabled { background: rgba(15, 23, 42, 0.03); }
.in:focus {
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.10);
}
.inBad {
  border-color: rgba(220, 38, 38, 0.30);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.10);
}

.miniActions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.miniNote {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}

/* ========= Tabs (contract) ========= */
.tabs {
  display: flex;
  gap: 6px;
  padding: 10px 14px 0;
  background: rgba(255, 255, 255, 0.96);
}
.tab {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  color: rgba(15, 23, 42, 0.72);
}
.tab.on {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.25);
  color: rgba(15, 23, 42, 0.86);
}

/* ========= Buttons ========= */
.btn {
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.btn:hover {
  background: rgba(32, 184, 232, 0.10);
  border-color: rgba(32, 184, 232, 0.22);
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }

.btn--primary {
  background: #184070;
  border-color: rgba(24, 64, 112, 0.35);
  color: #fff;
}
.btn--primary:hover {
  background: #163a66;
  border-color: rgba(24, 64, 112, 0.45);
}
.btn--ghost {
  background: transparent;
}
</style>
