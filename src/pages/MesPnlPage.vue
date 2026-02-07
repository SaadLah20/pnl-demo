<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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

const LS_ACTIVE_PNL = "pnl.activePnlId";
const LS_ACTIVE_VARIANT = "pnl.activeVariantId";

function persistActive(pnlId: string | null, variantId: string | null) {
  if (pnlId) localStorage.setItem(LS_ACTIVE_PNL, String(pnlId));
  if (variantId) localStorage.setItem(LS_ACTIVE_VARIANT, String(variantId));
}

function setActiveIds(pnlId: string | null, contractId: string | null, variantId: string | null) {
  // IMPORTANT: on set les 3 IDs (si dispo) pour que tout se recalcul correctement
  if (pnlId && (store as any).setActivePnl) (store as any).setActivePnl(String(pnlId));
  if (contractId && (store as any).setActiveContract) (store as any).setActiveContract(String(contractId));
  if (variantId && (store as any).setActiveVariant) (store as any).setActiveVariant(String(variantId));
  persistActive(pnlId, variantId);
}

/* =========================================================
   ✅ INITIAL SELECTION
   - priorité: variante sauvegardée
   - sinon: dernier contrat/variante du pnl sauvegardé
   - sinon: dernière variante globale (par createdAt si dispo)
========================================================= */
function toTs(d: any): number {
  const t = new Date(d ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function pickLastVariantInPnl(p: any) {
  if (!p) return null;
  for (const c of p.contracts ?? []) {
    const vs = c.variants ?? [];
    if (vs.length) {
      const last = vs[vs.length - 1];
      return { pnlId: String(p.id), contractId: String(c.id), variantId: String(last.id) };
    }
  }
  return { pnlId: String(p.id), contractId: null, variantId: null };
}

function pickLatestVariantGlobal() {
  let best: { pnlId: string; contractId: string; variantId: string; ts: number } | null = null;

  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      for (const v of c.variants ?? []) {
        const ts = toTs(v?.createdAt ?? v?.updatedAt ?? 0);
        const cand = { pnlId: String(p.id), contractId: String(c.id), variantId: String(v.id), ts };

        if (!best) {
          best = cand;
          continue;
        }

        // si timestamps => max
        if (cand.ts && cand.ts > best.ts) {
          best = cand;
          continue;
        }

        // fallback si pas de dates: on prend le "dernier rencontré" (ordre API)
        if (!cand.ts && !best.ts) best = cand;
      }
    }
  }

  if (!best) return null;
  return { pnlId: best.pnlId, contractId: best.contractId, variantId: best.variantId };
}

function resolveInitialSelection() {
  const savedPnlId = localStorage.getItem(LS_ACTIVE_PNL);
  const savedVarId = localStorage.getItem(LS_ACTIVE_VARIANT);

  // 1) priorité: variante sauvegardée
  if (savedVarId) {
    for (const p of pnls.value) {
      for (const c of p.contracts ?? []) {
        const v = (c.variants ?? []).find((x: any) => String(x.id) === String(savedVarId));
        if (v) return { pnlId: String(p.id), contractId: String(c.id), variantId: String(v.id) };
      }
    }
  }

  // 2) pnl sauvegardé + dernière variante dedans
  if (savedPnlId) {
    const p = pnls.value.find((x: any) => String(x.id) === String(savedPnlId));
    const picked = pickLastVariantInPnl(p);
    if (picked) return picked;
  }

  // 3) fallback: dernière variante globale (de préférence par date)
  const latest = pickLatestVariantGlobal();
  if (latest) return latest;

  // 4) fallback ultime: premier pnl
  const p0 = pnls.value[0];
  if (!p0) return null;
  return pickLastVariantInPnl(p0);
}

async function ensureInitialActive() {
  await store.loadPnls?.();

  const sel = resolveInitialSelection();
  if (!sel) return;

  if (sel.pnlId) openPnl[sel.pnlId] = true;
  setActiveIds(sel.pnlId, sel.contractId, sel.variantId);
}

onMounted(() => {
  ensureInitialActive();
});

/* =========================================================
   ENUMS (Contrat)
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

/* =========================================================
   Helpers
========================================================= */
function normalize(s: any) {
  return String(s ?? "").toLowerCase().trim();
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
function idShort(id: any) {
  const s = String(id ?? "");
  if (!s) return "";
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function statusKey(raw: any): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return "";
  if (s === "ADJUGE" || s === "ADJUGEE") return "ADJUGE";
  if (s === "EN COURS") return "ENCOURS";
  if (s === "INITIALISEE") return "INITIALISEE";
  if (s === "ANNULEE") return "ANNULEE";
  if (s === "CLOTUREE") return "CLOTUREE";
  if (s === "ARCHIVE") return "ARCHIVED";
  return s;
}
function tagClass(status?: string) {
  const s = statusKey(status);
  if (s.includes("ARCH")) return "tag tag--arch";
  if (s.includes("TERM") || s.includes("CLOT") || s.includes("CLOSED")) return "tag tag--off";
  if (s.includes("ENCO") || s.includes("ACT") || s.includes("ADJ")) return "tag tag--on";
  return "tag";
}

/* =========================================================
   Data
========================================================= */
const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnlId = computed(() => (store as any).activePnlId ?? null);
const activeVariantId = computed(() => (store as any).activeVariantId ?? null);

const activeContractId = computed(() => {
  const pnl = (store as any).activePnl;
  const vId = activeVariantId.value;
  if (!pnl || !vId) return null;
  for (const c of pnl.contracts ?? []) {
    if ((c.variants ?? []).some((v: any) => v.id === vId)) return c.id;
  }
  return null;
});

/* =========================================================
   UI state
========================================================= */
const q = ref(""); // search P&L only
const openPnl = reactive<Record<string, boolean>>({});

function isOpenPnl(id: string) {
  if (openPnl[id] === undefined) openPnl[id] = false;
  return openPnl[id];
}
function togglePnl(id: string) {
  openPnl[id] = !isOpenPnl(id);
}
function collapseAllPnls() {
  for (const p of pnls.value) openPnl[p.id] = false;
}

/* =========================================================
   FILTERS/ SORT (P&L ONLY)
========================================================= */
const filterOpen = ref(false);

const pnlStatusFilter = ref<string>("");
const pnlCityFilter = ref<string>("");
const pnlClientFilter = ref<string>("");
const pnlModelFilter = ref<string>("");

const sortPnlKey = ref<"status" | "city" | "client" | "model">("status");
const sortPnlDir = ref<"asc" | "desc">("asc");

const pnlCityOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const c = String(p?.city ?? "").trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlClientOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const c = String(p?.client ?? "").trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlModelOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const m = String(p?.model ?? "").trim();
    if (m) set.add(m);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlStatusOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const s = statusKey(p?.status);
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});

function resetPnlFilters() {
  q.value = "";
  pnlStatusFilter.value = "";
  pnlCityFilter.value = "";
  pnlClientFilter.value = "";
  pnlModelFilter.value = "";
  sortPnlKey.value = "status";
  sortPnlDir.value = "asc";
}

const filteredPnls = computed<any[]>(() => {
  let rows = pnls.value;

  if (pnlStatusFilter.value) rows = rows.filter((p) => statusKey(p?.status) === pnlStatusFilter.value);
  if (pnlCityFilter.value) rows = rows.filter((p) => String(p?.city ?? "") === pnlCityFilter.value);
  if (pnlClientFilter.value) rows = rows.filter((p) => String(p?.client ?? "") === pnlClientFilter.value);
  if (pnlModelFilter.value) rows = rows.filter((p) => String(p?.model ?? "") === pnlModelFilter.value);

  const query = normalize(q.value);
  if (query) {
    rows = rows.filter((p) => {
      const title = normalize(p?.title);
      const client = normalize(p?.client);
      const model = normalize(p?.model);
      const city = normalize(p?.city);
      const status = normalize(p?.status);
      const id = normalize(p?.id);
      return (
        title.includes(query) ||
        client.includes(query) ||
        model.includes(query) ||
        city.includes(query) ||
        status.includes(query) ||
        id.includes(query)
      );
    });
  }

  const dir = sortPnlDir.value === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const k = sortPnlKey.value;
    const av = k === "status" ? statusKey(a?.status) : String(a?.[k] ?? "");
    const bv = k === "status" ? statusKey(b?.status) : String(b?.[k] ?? "");
    return av.localeCompare(bv, "fr") * dir;
  });

  const ap = activePnlId.value;
  if (ap) {
    const idx = rows.findIndex((x) => x.id === ap);
    if (idx > 0) {
      const [p] = rows.splice(idx, 1);
      rows.unshift(p);
    }
  }

  return rows;
});

/* click-outside popover */
function onDocDown(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest?.("[data-filter-anchor]")) return;
  filterOpen.value = false;
}
document.addEventListener("mousedown", onDocDown);
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocDown));

/* =========================================================
   Actions
========================================================= */
function openVariant(pnlId: string, contractId: string, variantId: string) {
  // ✅ rend la variante active + ouvre le PNL dans la liste
  openPnl[String(pnlId)] = true;
  setActiveIds(String(pnlId), String(contractId), String(variantId));
}

async function deleteVariant(variantId: string) {
  if (!confirm("Supprimer définitivement cette variante ?")) return;

  try {
    await apiJson(`/variants/${variantId}`, { method: "DELETE" });
    localStorage.removeItem(LS_ACTIVE_VARIANT);
    await ensureInitialActive();
  } catch (e: any) {
    alert(e?.message ?? "Suppression impossible");
  }
}

async function deleteContract(contractId: string) {
  if (!confirm("Supprimer définitivement ce contrat et toutes ses variantes ?")) return;
  await apiJson(`/contracts/${contractId}`, { method: "DELETE" });
  localStorage.removeItem(LS_ACTIVE_VARIANT);
  await ensureInitialActive();
}

async function deletePnl(pnlId: string) {
  if (!confirm("Supprimer définitivement ce P&L (contrats + variantes) ?")) return;
  await apiJson(`/pnls/${pnlId}`, { method: "DELETE" });
  localStorage.removeItem(LS_ACTIVE_PNL);
  localStorage.removeItem(LS_ACTIVE_VARIANT);
  await ensureInitialActive();
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
   EDIT MODAL (PNL / CONTRACT / VARIANT UPDATE ONLY)
========================================================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

/** create flags */
const isCreate = ref(false);
const createPnlId = ref<string | null>(null); // for creating contract

const draft = reactive<any>({
  id: "",

  // pnl
  title: "",
  client: "",
  model: "",
  city: "",
  status: "",
  createdAt: "",

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
  isCreate.value = false;
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

function openCreatePnl() {
  resetDraft();
  editMode.value = "pnl";
  editOpen.value = true;
  isCreate.value = true;
  createPnlId.value = null;

  draft.id = "";
  draft.title = "Nouveau P&L";
  draft.client = "";
  draft.city = "";
  draft.status = "ENCOURS";
  draft.model = draft.model || "MODEL";
}

function openCreateContract(pnlId: string) {
  resetDraft();
  editMode.value = "contract";
  editOpen.value = true;
  isCreate.value = true;
  createPnlId.value = pnlId;
  draft.ref = "";
  draft.dureeMois = 0;
  draft.postes = 1;
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
      if (isCreate.value) {
        const created = await apiJson(`/pnls`, {
          method: "POST",
          body: JSON.stringify({
            title: draft.title,
            client: draft.client,
            city: draft.city,
            status: draft.status,
            model: draft.model,
          }),
        });

        const newPnlId = String(created?.pnl?.id ?? created?.id ?? "");
        await store.loadPnls?.();

        if (newPnlId) {
          openPnl[newPnlId] = true;
          setActiveIds(newPnlId, null, null);
        }

        closeEdit();
        return;
      }

      await apiJson(`/pnls/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title,
          client: draft.client,
          city: draft.city,
          status: draft.status,
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

      if (isCreate.value) {
        if (!createPnlId.value) throw new Error("pnlId manquant pour créer un contrat.");
        await apiJson(`/contracts`, {
          method: "POST",
          body: JSON.stringify({
            pnlId: createPnlId.value,
            ...payload,
          }),
        });
      } else {
        await apiJson(`/contracts/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
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

    const keepPnl = activePnlId.value;
    const keepVar = activeVariantId.value;

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
   VARIANT CREATION (2-step modals)
========================================================= */
function findPnlIdByContractId(contractId: string): string | null {
  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      if (String(c.id) === String(contractId)) return String(p.id);
    }
  }
  return null;
}

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

function openCreateVariant(contractId: string) {
  createContractId.value = contractId;
  createDefaultTitle.value = "Variante";
  createOpen.value = true;
}

function closeCreateModal() {
  createOpen.value = false;
}

function closeWizardModal() {
  wizardOpen.value = false;
}

async function afterVariantCreated(contractId: string, newVariantId: string) {
  const pnlIdForContract = findPnlIdByContractId(contractId);
  const keepAfter = { pnlId: pnlIdForContract, contractId, variantId: newVariantId };

  await store.loadPnls?.();

  setActiveIds(keepAfter?.pnlId ?? null, keepAfter?.contractId ?? null, keepAfter?.variantId ?? null);

  if (keepAfter?.pnlId) openPnl[String(keepAfter.pnlId)] = true;
}

async function handleCreateSave(payload: VariantCreateZeroPayload) {
  const created = await apiJson(`/variants`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const newVarId = String(created?.variant?.id ?? created?.id ?? "");
  if (newVarId) await afterVariantCreated(payload.contractId, newVarId);

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
  if (newVarId) await afterVariantCreated(createBase.contractId, newVarId);

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
  if (newVarId) await afterVariantCreated(createBase.contractId, newVarId);

  wizardOpen.value = false;
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="titleBlock">
        <h1>Mes P&amp;L</h1>
      </div>

      <div class="headerActions">
        <button class="btn btn--primary btn--mini" @click="openCreatePnl">+ Nouveau P&amp;L</button>
        <button class="btn btn--ghost" @click="collapseAllPnls">Tout réduire</button>
        <button class="btn btn--ghost" @click="store.loadPnls?.()">Recharger</button>
      </div>
    </div>

    <!-- ONE-LINE COMPACT SEARCH + FILTER BUTTON (P&L ONLY) -->
    <div class="toolbarOneLine card">
      <div class="searchMini">
        <span class="icon">⌕</span>
        <input class="input" v-model="q" placeholder="Rechercher P&L…" />
      </div>

      <div class="filterWrap" data-filter-anchor>
        <button class="btn btn--soft btn--mini" @click="filterOpen = !filterOpen" title="Filtres">⚙</button>

        <div v-if="filterOpen" class="popover">
          <div class="popGrid">
            <select class="sel" v-model="pnlStatusFilter" title="Statut">
              <option value="">Statut: Tous</option>
              <option v-for="s in pnlStatusOptions" :key="s" :value="s">{{ s }}</option>
            </select>

            <select class="sel" v-model="pnlCityFilter" title="Ville">
              <option value="">Ville: Toutes</option>
              <option v-for="c in pnlCityOptions" :key="c" :value="c">{{ c }}</option>
            </select>

            <select class="sel" v-model="pnlClientFilter" title="Client">
              <option value="">Client: Tous</option>
              <option v-for="c in pnlClientOptions" :key="c" :value="c">{{ c }}</option>
            </select>

            <select class="sel" v-model="pnlModelFilter" title="Modèle">
              <option value="">Modèle: Tous</option>
              <option v-for="m in pnlModelOptions" :key="m" :value="m">{{ m }}</option>
            </select>

            <select class="sel" v-model="sortPnlKey" title="Trier par">
              <option value="status">Tri: Statut</option>
              <option value="city">Tri: Ville</option>
              <option value="client">Tri: Client</option>
              <option value="model">Tri: Modèle</option>
            </select>

            <select class="sel" v-model="sortPnlDir" title="Ordre">
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>

            <button class="btn btn--ghost btn--mini" @click="resetPnlFilters">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <!-- LIST -->
    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="filteredPnls.length === 0" class="card empty">Aucun P&amp;L trouvé.</div>

      <div v-for="p in filteredPnls" :key="p.id" class="card pnl" :class="{ activePnl: p.id === activePnlId }">
        <div class="row pnlRow">
          <button class="disclosure" @click="togglePnl(p.id)">{{ isOpenPnl(p.id) ? "▾" : "▸" }}</button>

          <div class="main">
            <div class="line1">
              <div class="name">{{ p.title }}</div>
              <span :class="tagClass(p.status)">{{ p.status ?? "—" }}</span>
              <span v-if="p.id === activePnlId" class="pill">ACTIF</span>
            </div>

            <div class="line2">
              <span class="meta"><span class="k">Client :</span> <b>{{ p.client ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Modèle :</span> <b>{{ p.model ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Ville :</span> <b>{{ p.city ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Créé le :</span> <b>{{ fmtDate(p.createdAt) }}</b></span>
              <span class="idTiny">ID : {{ idShort(p.id) }}</span>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn--soft" @click="openView('pnl', p)">Visualiser</button>
            <button class="btn btn--soft" @click="openEdit('pnl', p)">Modifier</button>
            <button class="btn btn--ghost btn--mini" @click="deletePnl(p.id)">Supprimer</button>
          </div>
        </div>

        <div v-show="isOpenPnl(p.id)" class="children">
          <div class="childrenHead">
            <div class="muted">Contrats</div>
            <button class="btn btn--primary btn--mini" @click="openCreateContract(p.id)">+ Nouveau Contrat</button>
          </div>

          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div
            v-for="c in (p.contracts ?? [])"
            :key="c.id"
            class="contract"
            :class="{ activeContract: c.id === activeContractId }"
          >
            <div class="row contractRow">
              <div class="tree"><div class="branch"></div><div class="node"></div></div>

              <div class="main">
                <div class="line1">
                  <div class="name name--sm">Contrat</div>
                  <span class="meta">
                    <span class="k">Réf :</span> <b>{{ c.ref ?? "-" }}</b>
                    <span class="dot">•</span>
                    <span class="k">Durée :</span> <b>{{ c.dureeMois ?? 0 }}</b> mois
                    <span class="dot">•</span>
                    <span class="k">Postes :</span> <b>{{ labelFrom(POSTES_2, c.postes) }}</b>
                  </span>
                </div>

                <div class="line2">
                  <span class="meta"><span class="k">Cab :</span> <b>{{ labelFrom(CHARGE_3, c.cab) }}</b></span>
                  <span class="dot">•</span>
                  <span class="meta"><span class="k">Terrain :</span> <b>{{ labelFrom(TERRAIN_4, c.terrain) }}</b></span>
                  <span class="idTiny">ID : {{ idShort(c.id) }}</span>
                </div>
              </div>

              <div class="actions">
                <button class="btn btn--primary btn--mini" @click="openCreateVariant(c.id)">+ Nouvelle Variante</button>
                <button class="btn btn--soft" @click="openView('contract', c)">Visualiser</button>
                <button class="btn btn--soft" @click="openEdit('contract', c)">Modifier</button>
                <button class="btn btn--ghost btn--mini" @click="deleteContract(c.id)">Supprimer</button>
              </div>
            </div>

            <div class="variantsHead">
              <div class="muted">Variantes</div>
              <div class="muted">{{ (c.variants ?? []).length }} variante(s)</div>
            </div>

            <div class="variants indent2">
              <div
                v-for="v in (c.variants ?? [])"
                :key="v.id"
                class="row variantRow"
                :class="{ activeVariant: v.id === activeVariantId }"
              >
                <div class="tree tree--deep"><div class="branch"></div><div class="node"></div></div>

                <div class="main">
                  <div class="line1">
                    <div class="name name--xs">{{ v.title ?? "Variante" }}</div>
                    <span :class="tagClass(v.status)">{{ v.status ?? "—" }}</span>
                    <span v-if="v.id === activeVariantId" class="pill pill--green">ACTIVE</span>
                  </div>

                  <div class="line2">
                    <span class="meta"><span class="k">Description :</span> {{ v.description ?? "-" }}</span>
                    <span class="idTiny">ID : {{ idShort(v.id) }}</span>
                  </div>
                </div>

                <div class="actions">
                  <!-- ✅ Ouvrir => rend active (fix) -->
                  <button class="btn btn--primary btn--mini" @click="openVariant(p.id, c.id, v.id)">Ouvrir</button>
                  <button class="btn btn--soft" @click="openView('variant', v)">Visualiser</button>
                  <button class="btn btn--soft" @click="openEdit('variant', v)">Modifier</button>
                  <button class="btn btn--ghost btn--mini" @click="deleteVariant(v.id)">Supprimer</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW MODAL -->
    <Teleport to="body">
      <div v-if="viewOpen" class="modalOverlay" @click.self="closeView()">
        <div class="modal">
          <div class="modalHead">
            <div class="modalTitle">
              <b v-if="viewMode === 'pnl'">Détails P&amp;L</b>
              <b v-else-if="viewMode === 'contract'">Détails Contrat</b>
              <b v-else>Détails Variante</b>
              <div class="modalSub">Lecture seule</div>
            </div>
            <button class="xBtn" @click="closeView()">✕</button>
          </div>

          <div class="modalBody">
            <div v-if="viewMode === 'pnl'" class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Client</div><div class="v">{{ viewData?.client ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Ville</div><div class="v">{{ viewData?.city ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Modèle</div><div class="v">{{ viewData?.model ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Créé le</div><div class="v">{{ fmtDate(viewData?.createdAt) }}</div></div>
              <div class="rowKV"><div class="k">ID</div><div class="v">{{ viewData?.id ?? "-" }}</div></div>
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
              <div class="rowKV"><div class="k">ID</div><div class="v">{{ viewData?.id ?? "-" }}</div></div>
            </div>

            <div v-else class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v">{{ viewData?.title ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v">{{ viewData?.status ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">Description</div><div class="v">{{ viewData?.description ?? "-" }}</div></div>
              <div class="rowKV"><div class="k">ID</div><div class="v">{{ viewData?.id ?? "-" }}</div></div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" @click="closeView()">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- EDIT MODAL -->
    <Teleport to="body">
      <div v-if="editOpen" class="modalOverlay" @click.self="closeEdit()">
        <div class="modal">
          <div class="modalHead">
            <div class="modalTitle">
              <b v-if="editMode === 'pnl'">{{ isCreate ? "Créer P&L" : "Modifier P&L" }}</b>
              <b v-else-if="editMode === 'contract'">{{ isCreate ? "Créer Contrat" : "Modifier Contrat" }}</b>
              <b v-else>Modifier Variante</b>
              <div class="modalSub">Édition</div>
            </div>
            <button class="xBtn" @click="closeEdit()">✕</button>
          </div>

          <div class="modalBody">
            <div v-if="editErr" class="alert"><b>Erreur :</b> {{ editErr }}</div>

            <!-- PNL -->
            <div v-if="editMode === 'pnl'" class="formGrid">
              <div class="f">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre P&L" />
              </div>
              <div class="f">
                <div class="k">Client</div>
                <input class="in" v-model="draft.client" placeholder="Nom du client" />
              </div>
              <div class="f">
                <div class="k">Ville</div>
                <input class="in" v-model="draft.city" placeholder="Ville" />
              </div>
              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.status">
                  <option value="ENCOURS">ENCOURS</option>
                  <option value="PERDU">PERDU</option>
                  <option value="ADJUGE">ADJUGÉ</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Modèle (non modifiable)</div>
                <input class="in in--disabled" v-model="draft.model" disabled />
              </div>
              <div class="f">
                <div class="k">Date de création</div>
                <input class="in in--disabled" :value="fmtDate(draft.createdAt)" disabled />
              </div>
            </div>

            <!-- CONTRACT -->
            <div v-else-if="editMode === 'contract'" class="stack">
              <div class="sectionBox">
                <div class="sectionTitle">Synthèse</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Référence (auto)</div>
                    <input
                      class="in in--disabled"
                      :value="draft.ref || (isCreate ? 'Générée automatiquement' : '-')"
                      disabled
                    />
                  </div>
                  <div class="f">
                    <div class="k">Durée (mois)</div>
                    <input class="in r" type="number" step="1" v-model.number="draft.dureeMois" />
                  </div>
                  <div class="f">
                    <div class="k">Nombre de postes</div>
                    <select class="in" v-model.number="draft.postes">
                      <option v-for="o in POSTES_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Responsabilités</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Cab</div>
                    <select class="in" v-model="draft.cab">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Installation</div>
                    <select class="in" v-model="draft.installation">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Génie civil</div>
                    <select class="in" v-model="draft.genieCivil">
                      <option v-for="o in GENIE_CIVIL_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Transport jusqu’au chantier</div>
                    <select class="in" v-model="draft.transport">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Terrain</div>
                    <select class="in" v-model="draft.terrain">
                      <option v-for="o in TERRAIN_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Matière première</div>
                    <select class="in" v-model="draft.matierePremiere">
                      <option v-for="o in MATIERE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Maintenance</div>
                    <select class="in" v-model="draft.maintenance">
                      <option v-for="o in MAINTENANCE_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f">
                    <div class="k">Chargeuse</div>
                    <select class="in" v-model="draft.chargeuse">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Eau</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Branchement Eau</div>
                    <select class="in" v-model="draft.branchementEau">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div class="f">
                    <div class="k">Consommation Eau</div>
                    <select class="in" v-model="draft.consoEau">
                      <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Électricité</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Branchement Électricité</div>
                    <select class="in" v-model="draft.branchementElec">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div class="f">
                    <div class="k">Consommation Électricité</div>
                    <select class="in" v-model="draft.consoElec">
                      <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Paramètres financiers</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Prix dimanches / fériés</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.sundayPrice" />
                  </div>
                  <div class="f">
                    <div class="k">Forfait pénalité délai</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.delayPenalty" />
                  </div>
                  <div class="f">
                    <div class="k">Location Chiller</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.chillerRent" />
                  </div>
                </div>
              </div>
            </div>

            <!-- VARIANT UPDATE -->
            <div v-else class="formGrid">
              <div class="f">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre de la variante" />
              </div>
              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.status">
                  <option value="INITIALISEE">INITIALISÉE</option>
                  <option value="ENCOURS">ENCOURS</option>
                  <option value="ANNULEE">ANNULÉE</option>
                  <option value="CLOTUREE">CLÔTURÉE</option>
                </select>
              </div>
              <div class="f f--full">
                <div class="k">Description</div>
                <textarea class="in" rows="4" v-model="draft.description" placeholder="Description (optionnelle)"></textarea>
              </div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" :disabled="editBusy" @click="closeEdit()">Annuler</button>
            <button class="btn btn--primary" :disabled="editBusy" @click="saveEdit()">
              {{ editBusy ? "Enregistrement…" : isCreate ? "Créer" : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ✅ NEW VARIANT MODALS -->
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
  </div>
</template>

<style scoped>
/* (identique à ton style actuel, gardé volontairement) */
.page { padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f6f7f9; min-height: 100%; box-sizing: border-box; }

.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.titleBlock h1 { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
.headerActions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.card { background: #fff; border: 1px solid #e6e8ee; border-radius: 14px; padding: 12px; box-shadow: 0 1px 0 rgba(17,24,39,0.03); overflow: visible; }
.card--error { border-color: #fecaca; background: #fff5f5; }
.empty { text-align: center; color: #6b7280; }

.list { display: flex; flex-direction: column; gap: 10px; }

.row { display: flex; gap: 10px; align-items: center; }
.pnlRow { align-items: stretch; }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.line1 { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.line2 { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.name { font-weight: 900; font-size: 13px; color: #111827; }
.name--sm { font-size: 12.5px; font-weight: 900; }
.name--xs { font-size: 12px; font-weight: 900; }

.meta { font-size: 12px; color: #374151; }
.k { color: #6b7280; font-weight: 600; }
.muted { font-size: 12px; color: #6b7280; }
.dot { color: #d1d5db; }
.idTiny { font-size: 11px; color: #9ca3af; margin-left: 6px; }

.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }

.disclosure { width: 34px; height: 34px; border: 1px solid #e6e8ee; border-radius: 10px; background: #fff; cursor: pointer; color: #374151; }
.disclosure:hover { background: #f9fafb; }

.btn { border-radius: 12px; padding: 9px 12px; font-size: 13px; border: 1px solid #e6e8ee; background: #fff; cursor: pointer; }
.btn:hover { background: #f9fafb; }
.btn--primary { background: #0b7a35; border-color: #0b7a35; color: #fff; }
.btn--primary:hover { background: #096a2e; }
.btn--ghost { background: transparent; }
.btn--ghost:hover { background: #ffffff; }
.btn--soft { background: #f6f7f9; }
.btn--soft:hover { background: #eef0f4; }
.btn--mini { padding: 6px 9px; border-radius: 10px; font-size: 12px; line-height: 16px; }

.tag { font-size: 11px; padding: 4px 8px; border-radius: 999px; border: 1px solid #e6e8ee; color: #374151; background: #fafbfc; }
.tag--on { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
.tag--arch, .tag--off { border-color: #e5e7eb; background: #f9fafb; color: #6b7280; }

.pill { font-size: 10.5px; font-weight: 900; letter-spacing: 0.2px; padding: 3px 8px; border-radius: 999px; border: 1px solid #e5e7eb; background: #fff; color: #111827; }
.pill--green { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }

.pnl { background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%); }
.pnl.activePnl { border-color: #bbf7d0; box-shadow: 0 0 0 3px rgba(34,197,94,0.10); }

.contract { border: 1px solid #eef0f4; border-radius: 12px; padding: 10px; background: #fcfcfd; }
.contract.activeContract { border-color: #bfdbfe; box-shadow: 0 0 0 3px rgba(59,130,246,0.10); }
.contractRow { align-items: flex-start; }

.variantRow { padding: 8px 10px; border: 1px solid #eef0f4; border-radius: 12px; background: #ffffff; }
.variantRow.activeVariant { border-color: #bbf7d0; background: #fbfffb; }

.children { margin-top: 10px; border-top: 1px dashed #e6e8ee; padding-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.childrenHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 2px 0 4px; }
.variants { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.variantsHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-left: 38px; margin-right: 2px; }
.indent2 { margin-left: 38px; }

.tree { width: 26px; position: relative; display: flex; align-items: center; justify-content: center; }
.tree .branch { position: absolute; left: 50%; top: -10px; bottom: -10px; width: 2px; background: #e5e7eb; transform: translateX(-50%); }
.tree .node { width: 10px; height: 10px; border-radius: 999px; background: #fff; border: 2px solid #d1d5db; }
.tree--deep { width: 38px; }
.tree--deep .branch { background: #e5e7eb; }

.toolbarOneLine { padding: 6px 8px; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow: visible; }
.searchMini {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 6px;
  border: 1px solid #e6e8ee; border-radius: 10px;
  padding: 4px 8px; background: #fafbfc;
}
.icon { font-size: 11px; line-height: 1; color: #6b7280; }
.input { min-width: 0; border: 0; outline: 0; background: transparent; width: 100%; font-size: 12.5px; line-height: 16px; padding: 0; }

.filterWrap { position: relative; flex: 0 0 auto; overflow: visible; }
.popover {
  position: absolute; right: 0; top: calc(100% + 6px);
  width: min(560px, calc(100% + 260px));
  max-width: calc(100vw - 24px);
  background: #fff; border: 1px solid #e6e8ee; border-radius: 12px;
  box-shadow: 0 18px 45px rgba(0,0,0,0.12);
  padding: 8px; z-index: 50;
}
.popGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; align-items: center; }
.sel { min-width: 0; border: 1px solid #e6e8ee; border-radius: 10px; padding: 5px 8px; font-size: 12px; line-height: 16px; background: #fff; }

.modalOverlay {
  position: fixed; inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 18px;
  z-index: 9999;
}
.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 36px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  display: flex; flex-direction: column;
}
.modalHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 12px 14px; background: #fafafa; border-bottom: 1px solid #eef2f7; }
.modalTitle { display: flex; flex-direction: column; gap: 3px; }
.modalSub { color: #9ca3af; font-size: 11px; }
.xBtn { border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; width: 34px; height: 34px; cursor: pointer; }
.xBtn:hover { background: #f9fafb; }
.modalBody { padding: 14px; overflow: auto; flex: 1 1 auto; }
.modalFoot { padding: 12px 14px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #eef2f7; background: #fcfcfd; }

.kv { display: flex; flex-direction: column; gap: 12px; }
.rowKV { display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: start; }
.rowKV .k { font-size: 12px; color: #6b7280; font-weight: 700; }
.rowKV .v { font-size: 12.5px; color: #111827; }

.formGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.f { display: flex; flex-direction: column; gap: 6px; }
.f--full { grid-column: 1 / -1; }
.in { border: 1px solid #e5e7eb; border-radius: 12px; padding: 9px 10px; font-size: 13px; outline: none; background: #fff; }
.in:focus { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99,102,241,0.10); }
.in--disabled { background: #f9fafb; color: #6b7280; }
.r { text-align: right; }

.alert { border: 1px solid #fecaca; background: #fff5f5; color: #991b1b; border-radius: 12px; padding: 10px; margin-bottom: 12px; }

.stack { display: flex; flex-direction: column; gap: 12px; }
.sectionBox { border: 1px solid #eef0f4; border-radius: 14px; background: #fcfcfd; padding: 10px; }
.sectionTitle { font-size: 12px; font-weight: 900; color: #111827; margin-bottom: 8px; }
.sectionGrid { display: grid; grid-template-columns: 1fr; gap: 8px; }
.sectionForm { margin-top: 2px; }

@media (max-width: 900px) {
  .actions { justify-content: flex-start; }
  .rowKV { grid-template-columns: 140px 1fr; }
  .formGrid { grid-template-columns: 1fr; }
  .toolbarOneLine { flex-wrap: wrap; }
  .popover { right: auto; left: 0; }
  .popGrid { grid-template-columns: 1fr; }
  .variantsHead { margin-left: 0; }
}
</style>
