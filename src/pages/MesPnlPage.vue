<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onActivated,
  reactive,
  ref,
  watch,
} from "vue";

import { usePnlStore } from "@/stores/pnl.store";
const activeContract = computed<any | null>(() => (store as any).activeContract ?? null);
import { contractUiTitle } from "@/services/contractTitle";
import { VARIANT_STATUS_OPTS, type VariantStatusUi } from "@/constants/variantStatus";
import { API_BASE, apiGet } from "@/api/http";

import VariantCreateModal, {
  type VariantCreateNextPayload,
  type VariantCreateZeroPayload,
} from "@/components/VariantCreateModal.vue";
import VariantWizardModal, {
  type ComposePayload,
  type InitieePayload,
  type VariantCreateMode,
} from "@/components/variantWizard/VariantWizardModal.vue";

const API = import.meta.env.VITE_API_BASE || "http://localhost:3001";


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

/** ✅ robust: si null => remove (évite incohérence) */
function persistActive(pnlId: string | null, variantId: string | null) {
  if (pnlId) localStorage.setItem(LS_ACTIVE_PNL, String(pnlId));
  else localStorage.removeItem(LS_ACTIVE_PNL);

  if (variantId) localStorage.setItem(LS_ACTIVE_VARIANT, String(variantId));
  else localStorage.removeItem(LS_ACTIVE_VARIANT);
}

function isCabFixePnl(p: any) {
  return String(p?.model ?? "").toLowerCase().includes("cab fixe");
}

function setActiveIds(
  pnlId: string | null,
  contractId: string | null,
  variantId: string | null
) {
  if (pnlId && (store as any).setActivePnl) (store as any).setActivePnl(String(pnlId));
  if (contractId && (store as any).setActiveContract) (store as any).setActiveContract(String(contractId));
  if (variantId && (store as any).setActiveVariant) (store as any).setActiveVariant(String(variantId));
  persistActive(pnlId, variantId);
}

/* =========================================================
   ✅ INITIAL SELECTION (robuste + pas d’écrasement au retour)
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
      return {
        pnlId: String(p.id),
        contractId: String(c.id),
        variantId: String(last.id),
      };
    }
  }
  return { pnlId: String(p.id), contractId: null, variantId: null };
}

function pickLatestVariantGlobal() {
  let best:
    | { pnlId: string; contractId: string; variantId: string; ts: number }
    | null = null;

  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      for (const v of c.variants ?? []) {
        const ts = toTs(v?.createdAt ?? v?.updatedAt ?? 0);
        const cand = {
          pnlId: String(p.id),
          contractId: String(c.id),
          variantId: String(v.id),
          ts,
        };

        if (!best) {
          best = cand;
          continue;
        }
        if (cand.ts && cand.ts > best.ts) {
          best = cand;
          continue;
        }
        if (!cand.ts && !best.ts) best = cand;
      }
    }
  }

  if (!best) return null;
  return { pnlId: best.pnlId, contractId: best.contractId, variantId: best.variantId };
}

function findVariantLocation(variantId: any) {
  const vid = String(variantId ?? "").trim();
  if (!vid) return null;

  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      const v = (c.variants ?? []).find((x: any) => String(x.id) === vid);
      if (v) return { pnlId: String(p.id), contractId: String(c.id), variantId: String(v.id) };
    }
  }
  return null;
}

function resolveInitialSelection() {
  const savedPnlId = localStorage.getItem(LS_ACTIVE_PNL);
  const savedVarId = localStorage.getItem(LS_ACTIVE_VARIANT);

  if (savedVarId) {
    const loc = findVariantLocation(savedVarId);
    if (loc) return loc;
  }

  if (savedPnlId) {
    const p = pnls.value.find((x: any) => String(x.id) === String(savedPnlId));
    const picked = pickLastVariantInPnl(p);
    if (picked) return picked;
  }

  const latest = pickLatestVariantGlobal();
  if (latest) return latest;

  const p0 = pnls.value[0];
  if (!p0) return null;
  return pickLastVariantInPnl(p0);
}

/** ✅ anti “double init / page blanche” */
const initBusy = ref(false);
let alive = true;

async function ensureInitialActive(reason: "mounted" | "activated" | "manual" = "manual") {
  if (initBusy.value) return;
  initBusy.value = true;

  try {
    await store.loadPnls?.();

    if (!alive) return;

    // ✅ 1) si store a déjà une variante active et elle existe => ne pas écraser
    const curVar = (store as any).activeVariantId ?? null;
    if (curVar) {
      const loc = findVariantLocation(curVar);
      if (loc) {
        openPnl[loc.pnlId] = true;
        persistActive(loc.pnlId, loc.variantId);
        // resync si besoin
        setActiveIds(loc.pnlId, loc.contractId, loc.variantId);
        return;
      }
    }

    // ✅ 2) fallback localStorage / latest / first
    const sel = resolveInitialSelection();
    if (!sel) {
      persistActive(null, null);
      return;
    }

    if (sel.pnlId) openPnl[sel.pnlId] = true;
    setActiveIds(sel.pnlId, sel.contractId, sel.variantId);
  } finally {
    initBusy.value = false;
  }
}

onMounted(() => {
  ensureInitialActive("mounted");
});

/** ✅ IMPORTANT: si route en keep-alive, onMounted ne se rejoue pas => onActivated */
onActivated(() => {
  filterOpen.value = false;
  closeMenu();
  if (!pnls.value?.length) ensureInitialActive("activated");
});

/* =========================================================
   ENUMS (Contrat)
========================================================= */
type Opt = { value: any; label: string };

const CHARGE_3: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const GENIE_CIVIL_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const TERRAIN_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const MATIERE_3: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
];

const MAINTENANCE_4: Opt[] = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
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
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
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

function statusKey(raw: any): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return "";
  if (s === "ADJUGE" || s === "ADJUGEE") return "ADJUGE";
  if (s === "EN COURS") return "ENCOURS";
  if (s === "ANNULEE") return "ANNULEE";
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

function isBlank(v: any) {
  return String(v ?? "").trim().length === 0;
}
function req(v: any, msg: string) {
  if (isBlank(v)) throw new Error(msg);
}
function reqNumGt(v: any, min: number, msg: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= min) throw new Error(msg);
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
    if ((c.variants ?? []).some((v: any) => String(v.id) === String(vId))) return c.id;
  }
  return null;
});

/* =========================================================
   UI state
========================================================= */
const q = ref("");
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
   ✅ Persist auto (corrige “retour => sélection perdue”)
========================================================= */
watch(
  () => [activePnlId.value, activeVariantId.value],
  ([p, v]) => {
    if (v) {
      const loc = findVariantLocation(v);
      if (loc) {
        openPnl[loc.pnlId] = true;
        persistActive(loc.pnlId, loc.variantId);
        return;
      }
    }
    persistActive(p ? String(p) : null, v ? String(v) : null);
  },
  { immediate: true }
);

/* =========================================================
   FILTERS / SORT (P&L ONLY)
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

/* =========================================================
   ✅ Pagination (10 P&L max par page)
========================================================= */
const perPage = 10;
const page = ref(1);

function clampPage(v: number, max: number) {
  const x = Math.floor(Number(v));
  if (!Number.isFinite(x) || x < 1) return 1;
  if (x > max) return max || 1;
  return x;
}
function goPage(p: number) {
  page.value = p;
  // (optionnel) scroll doux vers le haut de la liste
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
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
      return (
        title.includes(query) ||
        client.includes(query) ||
        model.includes(query) ||
        city.includes(query) ||
        status.includes(query)
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

  // ✅ garder le P&L actif en premier (utile avec pagination)
  const ap = activePnlId.value;
  if (ap) {
    const idx = rows.findIndex((x) => String(x.id) === String(ap));
    if (idx > 0) {
      const [p] = rows.splice(idx, 1);
      rows.unshift(p);
    }
  }

  return rows;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredPnls.value.length / perPage)));

const pagedPnls = computed(() => {
  const max = totalPages.value;
  const p = clampPage(page.value, max);
  if (p !== page.value) page.value = p;
  const start = (p - 1) * perPage;
  return filteredPnls.value.slice(start, start + perPage);
});

const pageWindow = computed(() => {
  // fenêtre courte (max 7 pages affichées)
  const max = totalPages.value;
  const cur = clampPage(page.value, max);
  const span = 7;
  const half = Math.floor(span / 2);
  let a = Math.max(1, cur - half);
  let b = Math.min(max, a + span - 1);
  a = Math.max(1, b - span + 1);
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
});

// reset page quand filtres/recherche changent
watch(
  () => [
    q.value,
    pnlStatusFilter.value,
    pnlCityFilter.value,
    pnlClientFilter.value,
    pnlModelFilter.value,
    sortPnlKey.value,
    sortPnlDir.value,
    (pnls.value?.length ?? 0),
  ],
  () => {
    page.value = 1;
  }
);

/* =========================================================
   Menus (kebab)
========================================================= */
const menuOpen = ref<string | null>(null);
function openMenu(key: string) {
  menuOpen.value = menuOpen.value === key ? null : key;
}
function closeMenu() {
  menuOpen.value = null;
}

/** ✅ FIX: listener attach/detach propre */
function onDocDown(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;

  if (t.closest?.("[data-filter-anchor]")) return;
  if (t.closest?.("[data-menu]")) return;

  filterOpen.value = false;
  closeMenu();
}

onMounted(() => document.addEventListener("mousedown", onDocDown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocDown));

/* =========================================================
   ✅ MODAL (confirm/info)
========================================================= */
const modal = reactive({
  open: false,
  title: "",
  message: "",
  mode: "confirm" as "confirm" | "info",
  onConfirm: null as null | (() => void | Promise<void>),
});
function openConfirm(title: string, message: string, onConfirm: () => void | Promise<void>) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "confirm";
  modal.onConfirm = onConfirm;
}
function openInfo(title: string, message: string) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "info";
  modal.onConfirm = null;
}
function closeModal() {
  modal.open = false;
  modal.title = "";
  modal.message = "";
  modal.onConfirm = null;
}

/* =========================================================
   Actions
========================================================= */
function openVariant(pnlId: string, contractId: string, variantId: string) {
  openPnl[String(pnlId)] = true;
  setActiveIds(String(pnlId), String(contractId), String(variantId));
}

async function deleteVariant(variantId: string) {
  openConfirm("Supprimer", "Supprimer définitivement cette variante ?", async () => {
    closeModal();
    try {
      await apiJson(`/variants/${variantId}`, { method: "DELETE" });
      localStorage.removeItem(LS_ACTIVE_VARIANT);
      await ensureInitialActive("manual");
    } catch (e: any) {
      openInfo("Erreur", e?.message ?? "Suppression impossible");
    }
  });
}

async function deleteContract(contractId: string) {
  openConfirm("Supprimer", "Supprimer définitivement ce contrat et toutes ses variantes ?", async () => {
    closeModal();
    try {
      await apiJson(`/contracts/${contractId}`, { method: "DELETE" });
      localStorage.removeItem(LS_ACTIVE_VARIANT);
      await ensureInitialActive("manual");
    } catch (e: any) {
      openInfo("Erreur", e?.message ?? "Suppression impossible");
    }
  });
}

async function deletePnl(pnlId: string) {
  openConfirm("Supprimer", "Supprimer définitivement ce P&L (contrats + variantes) ?", async () => {
    closeModal();
    try {
      await apiJson(`/pnls/${pnlId}`, { method: "DELETE" });
      localStorage.removeItem(LS_ACTIVE_PNL);
      localStorage.removeItem(LS_ACTIVE_VARIANT);
      await ensureInitialActive("manual");
    } catch (e: any) {
      openInfo("Erreur", e?.message ?? "Suppression impossible");
    }
  });
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
  closeMenu();
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
const createPnlId = ref<string | null>(null);

/* ✅ models fixes */
const PNL_MODELS = ["CAB Mobile", "CAB fixe - existante", "CAB fixe - nouvelle"] as const;

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
  draft.sundayPrice = 5000;
  draft.delayPenalty = 150000;
  draft.chillerRent = 150000;

  draft.description = "";
}

function openEdit(mode: EditMode, data: any) {
  resetDraft();
  isCreate.value = false;
  createPnlId.value = null;

  editMode.value = mode;
  editOpen.value = true;
  closeMenu();

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
  draft.model = PNL_MODELS[0];
  draft.startDate = new Date().toISOString().slice(0, 10);
}

function openCreateContract(pnlId: string) {
  const pnl = pnls.value.find((x: any) => String(x.id) === String(pnlId));
  if (pnl && isCabFixePnl(pnl)) return; // CAB FIXE => contrat auto backend
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

/* ✅ obligation: model requis en création P&L */
const canSaveEdit = computed(() => {
  if (editBusy.value) return false;
  if (editMode.value === "pnl" && isCreate.value) {
    return String(draft.model ?? "").trim().length > 0;
  }
  return true;
});

async function saveEdit() {
  editErr.value = null;
  editBusy.value = true;

  try {
    /* =========================
       PNL
    ========================= */
    if (editMode.value === "pnl") {
      req(draft.title, "Titre P&L obligatoire.");
      req(draft.city, "Ville obligatoire.");
      req(draft.status, "Statut obligatoire.");
      req(draft.startDate, "Date de démarrage obligatoire.");
      req(draft.model, "Veuillez choisir un modèle.");

      const cabFixe = isCabFixePnl({ model: draft.model });

      if (!cabFixe) {
        req(draft.client, "Client obligatoire.");
      } else {
        draft.client = "";
      }

      if (isCreate.value) {
        const created = await apiJson(`/pnls`, {
          method: "POST",
          body: JSON.stringify({
            title: draft.title,
            client: cabFixe ? null : draft.client,
            city: draft.city,
            status: draft.status,
            model: draft.model,
            startDate: fromDateInput(draft.startDate),
          }),
        });

        const newPnlId = String(created?.pnl?.id ?? created?.id ?? "");
        await store.loadPnls?.();

        if (newPnlId) {
          openPnl[newPnlId] = true;
          setActiveIds(newPnlId, null, null);
          page.value = 1;
        }

        closeEdit();
        return;
      }

      await apiJson(`/pnls/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title,
          client: cabFixe ? null : draft.client,
          city: draft.city,
          status: draft.status,
          startDate: fromDateInput(draft.startDate),
        }),
      });
    }

    /* =========================
       CONTRACT
    ========================= */
    if (editMode.value === "contract") {
      reqNumGt(draft.dureeMois, 0, "Durée (mois) doit être > 0.");
      req(draft.cab, "Cab obligatoire.");
      req(draft.installation, "Installation obligatoire.");
      req(draft.genieCivil, "Génie civil obligatoire.");
      req(draft.transport, "Transport obligatoire.");
      req(draft.terrain, "Terrain obligatoire.");
      req(draft.matierePremiere, "Matière première obligatoire.");
      req(draft.maintenance, "Maintenance obligatoire.");
      req(draft.chargeuse, "Chargeuse obligatoire.");
      req(draft.branchementEau, "Branchement eau obligatoire.");
      req(draft.consoEau, "Consommation eau obligatoire.");
      req(draft.branchementElec, "Branchement électricité obligatoire.");
      req(draft.consoElec, "Consommation électricité obligatoire.");
      reqNumGt(draft.postes, 0, "Nombre de postes obligatoire.");

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

    /* =========================
       VARIANT
    ========================= */
    if (editMode.value === "variant") {
      req(draft.title, "Titre de la variante obligatoire.");
      req(draft.status, "Statut de la variante obligatoire.");

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
          contractTitle: contractUiTitle(c),
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

function openCreateVariant(contractId: string) {
  createContractId.value = contractId;
  createDefaultTitle.value = "Variante";
  createOpen.value = true;
  closeMenu();
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

  // ✅ ramener sur la 1ère page (P&L actif remonte en haut)
  page.value = 1;
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

/** ✅ important: éviter effets après unmount (page blanche / états bizarres) */
onBeforeUnmount(() => {
  alive = false;
});
</script>

<template>
  <div class="page">
    <div class="subHeader">
      <div class="subLeft">
        <div class="title">Mes P&amp;L</div>

        <div class="searchMini" title="Recherche P&L">
          <span class="sIc">⌕</span>
          <input class="sIn" v-model="q" placeholder="Rechercher P&L…" />
        </div>
      </div>

      <div class="subRight">
        <button class="chipBtn chipBtn--pnl" @click="openCreatePnl">+ P&amp;L</button>

        <button class="chipBtn" @click="collapseAllPnls" title="Tout réduire">Réduire</button>

        <button class="chipIcon" data-filter-anchor @click="filterOpen = !filterOpen" title="Filtres / Tri">⚙</button>

        <button class="chipIcon" @click="store.loadPnls?.()" title="Recharger">↻</button>

        <div v-if="filterOpen" class="popover" data-filter-anchor>
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

            <button class="chipBtn" @click="resetPnlFilters">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="pagedPnls.length === 0" class="card empty">Aucun P&amp;L trouvé.</div>

      <div
        v-for="p in pagedPnls"
        :key="p.id"
        class="card pnl"
        :class="{ activePnl: String(p.id) === String(activePnlId ?? '') }"
      >
        <div class="row pnlRow">
          <button class="disc" @click="togglePnl(p.id)" :aria-expanded="isOpenPnl(p.id)">
            {{ isOpenPnl(p.id) ? "▾" : "▸" }}
          </button>

          <div class="main">
            <div class="line1">
              <span class="lvl lvl--pnl">P&amp;L</span>
              <div class="name name--pnl">{{ p.title }}</div>
              <span :class="tagClass(p.status)">{{ p.status ?? "—" }}</span>
              <span v-if="p.id === activePnlId" class="pill">ACTIF</span>
            </div>

            <div class="line2">
              <span class="meta"><span class="k">Client:</span> <b>{{ p.client ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Modèle:</span> <b>{{ p.model ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Ville:</span> <b>{{ p.city ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Créé:</span> <b>{{ fmtDate(p.createdAt) }}</b></span>
            </div>
          </div>

          <div class="actions">
            <button
              v-if="!isCabFixePnl(p)"
              class="chipBtn chipBtn--contract"
              @click="openCreateContract(p.id)"
              title="Créer un contrat"
            >
              + Contrat
            </button>

            <div class="menu" data-menu>
              <button class="chipIcon" @click="openMenu(`pnl:${p.id}`)" title="Actions">⋯</button>
              <div v-if="menuOpen === `pnl:${p.id}`" class="menuPop">
                <button class="menuItem" @click="openView('pnl', p)">Visualiser</button>
                <button class="menuItem" @click="openEdit('pnl', p)">Modifier</button>
                <div class="menuSep"></div>
                <button class="menuItem danger" @click="deletePnl(p.id)">Supprimer</button>
              </div>
            </div>
          </div>
        </div>

        <div v-show="isOpenPnl(p.id)" class="children">
          <div class="sectionHead">
            <div class="sectionTitle">Contrats</div>
            <div class="sectionHint">{{ (p.contracts ?? []).length }} contrat(s)</div>
          </div>

          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div
            v-for="c in (p.contracts ?? [])"
            :key="c.id"
            class="contract"
            :class="{ activeContract: String(c.id) === String(activeContractId ?? '') }"
          >
            <div class="row contractRow">
              <div class="tree"><div class="branch"></div><div class="node"></div></div>

              <div class="main">
                <div class="line1">
                  <span class="lvl lvl--contract">Contrat</span>
                  <div class="name name--sm">{{ contractUiTitle(c) }}</div>
                  <span v-if="c.id === activeContractId" class="pill">ACTIF</span>

                  <span class="meta">
                    <span class="dot">•</span>
                    <span class="k">Durée:</span> <b>{{ c.dureeMois ?? 0 }}</b> mois
                    <span class="dot">•</span>
                    <span class="k">Postes:</span> <b>{{ labelFrom(POSTES_2, c.postes) }}</b>
                  </span>
                </div>
              </div>

              <div class="actions">
                <button class="chipBtn chipBtn--variant" @click="openCreateVariant(c.id)" title="Créer une variante">
                  + Variante
                </button>

                <div class="menu" data-menu>
                  <button class="chipIcon" @click="openMenu(`contract:${c.id}`)" title="Actions">⋯</button>
                  <div v-if="menuOpen === `contract:${c.id}`" class="menuPop">
                    <button class="menuItem" @click="openView('contract', c)">Visualiser</button>
                    <button class="menuItem" @click="openEdit('contract', c)">Modifier</button>
                    <div class="menuSep"></div>
                    <button class="menuItem danger" @click="deleteContract(c.id)">Supprimer</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="variantsHead">
              <div class="sectionTitle sectionTitle--xs">Variantes</div>
              <div class="sectionHint">{{ (c.variants ?? []).length }} variante(s)</div>
            </div>

            <div class="variants indent2">
              <div
                v-for="v in (c.variants ?? [])"
                :key="v.id"
                class="row variantRow"
                :class="{ activeVariant: String(v.id) === String(activeVariantId ?? '') }"
              >
                <div class="tree tree--deep"><div class="branch"></div><div class="node"></div></div>

                <div class="main">
                  <div class="line1">
                    <span class="lvl lvl--variant">Variante</span>
                    <div class="name name--xs">{{ v.title ?? "Variante" }}</div>
                    <span :class="tagClass(v.status)">{{ v.status ?? "—" }}</span>
                    <span v-if="String(v.id) === String(activeVariantId ?? '')" class="pill pill--green">ACTIVE</span>
                  </div>

                  <div class="line2">
                    <span class="meta">
                      <span class="k">Description:</span>
                      <span class="desc">{{ v.description ?? "-" }}</span>
                    </span>
                  </div>
                </div>

                <div class="actions">
                  <button class="chipBtn chipBtn--open" @click="openVariant(p.id, c.id, v.id)">Ouvrir</button>

                  <div class="menu" data-menu>
                    <button class="chipIcon" @click="openMenu(`variant:${v.id}`)" title="Actions">⋯</button>
                    <div v-if="menuOpen === `variant:${v.id}`" class="menuPop">
                      <button class="menuItem" @click="openView('variant', v)">Visualiser</button>
                      <button class="menuItem" @click="openEdit('variant', v)">Modifier</button>
                      <div class="menuSep"></div>
                      <button class="menuItem danger" @click="deleteVariant(v.id)">Supprimer</button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ✅ Pagination footer -->
      <div v-if="filteredPnls.length > 0" class="pagerCard">
        <div class="pagerLeft">
          <span class="pagerInfo">
            {{ Math.min((page - 1) * 10 + 1, filteredPnls.length) }}–{{
              Math.min(page * 10, filteredPnls.length)
            }}
            / {{ filteredPnls.length }}
          </span>
        </div>

        <div class="pagerBtns">
          <button class="pgBtn" :disabled="page <= 1" @click="goPage(1)" title="Première">«</button>
          <button class="pgBtn" :disabled="page <= 1" @click="goPage(page - 1)" title="Précédente">‹</button>

          <button
            v-for="p in pageWindow"
            :key="p"
            class="pgBtn"
            :class="{ on: p === page }"
            @click="goPage(p)"
          >
            {{ p }}
          </button>

          <button class="pgBtn" :disabled="page >= totalPages" @click="goPage(page + 1)" title="Suivante">›</button>
          <button class="pgBtn" :disabled="page >= totalPages" @click="goPage(totalPages)" title="Dernière">»</button>
        </div>
      </div>
    </div>

    <!-- CONFIRM/INFO MODAL -->
    <teleport to="body">
      <div v-if="modal.open" class="ovl" role="dialog" aria-modal="true" @mousedown.self="closeModal()">
        <div class="dlg">
          <div class="dlgHdr">
            <div class="dlgTtl">{{ modal.title }}</div>
            <button class="x" type="button" @click="closeModal()" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <div class="dlgMsg">{{ modal.message }}</div>
          </div>

          <div class="dlgFtr">
            <button class="btn2" type="button" @click="closeModal()">Fermer</button>
            <button
              v-if="modal.mode === 'confirm'"
              class="btn2 pri"
              type="button"
              @click="modal.onConfirm && modal.onConfirm()"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </teleport>

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
            <button class="chipBtn" @click="closeView()">Fermer</button>
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
                <div class="k">Modèle</div>
                <select v-if="isCreate" class="in" v-model="draft.model">
                  <option value="" disabled>Choisir un modèle…</option>
                  <option v-for="m in PNL_MODELS" :key="m" :value="m">{{ m }}</option>
                </select>
                <input v-else class="in in--disabled" v-model="draft.model" disabled />
              </div>

              <div class="f">
                <div class="k">Date de démarrage</div>
                <input class="in" type="date" v-model="draft.startDate" />
              </div>
              <div class="f">
                <div class="k">Date de création</div>
                <input class="in in--disabled" :value="fmtDate(draft.createdAt)" disabled />
              </div>
            </div>

            <div v-else-if="editMode === 'contract'" class="stack">
              <div class="sectionBox">
                <div class="sectionTitle">Synthèse</div>
                <div class="formGrid sectionForm">
                  <div class="f">
                    <div class="k">Référence (auto)</div>
                    <input class="in in--disabled" :value="draft.ref || (isCreate ? 'Générée automatiquement' : '-')" disabled />
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
                  <div class="f"><div class="k">Cab</div><select class="in" v-model="draft.cab"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Installation</div><select class="in" v-model="draft.installation"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Génie civil</div><select class="in" v-model="draft.genieCivil"><option v-for="o in GENIE_CIVIL_4" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Transport jusqu’au chantier</div><select class="in" v-model="draft.transport"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Terrain</div><select class="in" v-model="draft.terrain"><option v-for="o in TERRAIN_4" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Matière première</div><select class="in" v-model="draft.matierePremiere"><option v-for="o in MATIERE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Maintenance</div><select class="in" v-model="draft.maintenance"><option v-for="o in MAINTENANCE_4" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Chargeuse</div><select class="in" v-model="draft.chargeuse"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Eau</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Branchement Eau</div><select class="in" v-model="draft.branchementEau"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Consommation Eau</div><select class="in" v-model="draft.consoEau"><option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Électricité</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Branchement Électricité</div><select class="in" v-model="draft.branchementElec"><option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                  <div class="f"><div class="k">Consommation Électricité</div><select class="in" v-model="draft.consoElec"><option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Paramètres financiers</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Prix dimanches / fériés</div><input class="in r" type="number" step="0.01" v-model.number="draft.sundayPrice" /></div>
                  <div class="f"><div class="k">Forfait pénalité délai</div><input class="in r" type="number" step="0.01" v-model.number="draft.delayPenalty" /></div>
                  <div class="f"><div class="k">Location Chiller</div><input class="in r" type="number" step="0.01" v-model.number="draft.chillerRent" /></div>
                </div>
              </div>
            </div>

            <div v-else class="formGrid">
              <div class="f">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre de la variante" />
              </div>

              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.status">
                  <option v-for="s in VARIANT_STATUS_OPTS" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
              </div>

              <div class="f f--full">
                <div class="k">Description</div>
                <textarea class="in" rows="4" v-model="draft.description" placeholder="Description (optionnelle)"></textarea>
              </div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="chipBtn" :disabled="editBusy" @click="closeEdit()">Annuler</button>
            <button class="chipBtn chipBtn--primary" :disabled="editBusy || !canSaveEdit" @click="saveEdit()">
              {{ editBusy ? "Enregistrement…" : isCreate ? "Créer" : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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
  :contract="activeContract"
  :all-variants="allVariantsFlat"
  @close="closeWizardModal"
  @submit-initiee="handleSaveInitiee"
  @submit-composee="handleSaveComposee"
/>
  </div>
</template>

<style scoped>
/* ✅ CSS = ton CSS original complet (inchangé) */
.page {
  --navy: #184070;
  --cyan: #20b8e8;

  --holcim-navy: #184070;
  --holcim-cyan: #7b9da7;
  --holcim-green: #65814d;

  --holcim-open-bg: rgba(24, 64, 112, 0.08);
  --holcim-open-bd: rgba(24, 64, 112, 0.2);
  --holcim-open-tx: rgba(24, 64, 112, 0.92);

  /* ✅ active accents */
  --active-pnl: rgba(32, 184, 232, 1);
  --active-contract: rgba(24, 64, 112, 1);
  --active-variant: rgba(123, 191, 58, 1);

  /* ✅ fond légèrement différent du HeaderDashboard */
  --bg: #eef3fa;
  --card: #ffffff;
  --border: rgba(16, 24, 40, 0.12);
  --muted: rgba(15, 23, 42, 0.65);

  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
  box-sizing: border-box;

  background: linear-gradient(180deg, #f2f6fc 0%, var(--bg) 100%);
}

/* Header sticky */
.subHeader {
  position: sticky;
  top: var(--hd-offset, -15px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(244, 246, 251, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 6px 8px;
}

.subLeft {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.title {
  font-size: 13px;
  font-weight: 950;
  color: var(--navy);
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.searchMini {
  min-width: 280px;
  max-width: 460px;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px 10px;
}
.sIc {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
}
.sIn {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 12.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.88);
}

.subRight {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  position: relative;
}

/* Buttons / chips */
.chipBtn {
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid var(--border);
  background: #ffffff;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
  color: rgba(15, 23, 42, 0.9);
}
.chipBtn:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}

/* primary (✅ fix visibilité “Créer”) */
.chipBtn--primary {
  background: var(--holcim-navy) !important;
  border-color: var(--holcim-navy) !important;
  color: #ffffff !important;
  box-shadow: 0 6px 18px rgba(24, 64, 112, 0.18);
}
.chipBtn--primary:hover {
  background: #14345c !important;
  border-color: #14345c !important;
}
.chipBtn--primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background: var(--holcim-navy) !important;
  border-color: var(--holcim-navy) !important;
  color: #fff !important;
}

/* +P&L */
.chipBtn--pnl {
  background: var(--holcim-navy);
  border-color: var(--holcim-navy);
  color: #fff;
  box-shadow: 0 6px 18px rgba(24, 64, 112, 0.16);
}
.chipBtn--pnl:hover {
  background: #14345c;
  border-color: #14345c;
}

/* +Contrat */
.chipBtn--contract {
  background: var(--holcim-green);
  border-color: var(--holcim-green);
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(123, 191, 58, 0.18);
}
.chipBtn--contract:hover {
  background: #67a931;
  border-color: #67a931;
}

/* +Variante */
.chipBtn--variant {
  background: var(--holcim-cyan);
  border-color: var(--holcim-cyan);
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(32, 184, 232, 0.18);
}
.chipBtn--variant:hover {
  background: #18a7d4;
  border-color: #18a7d4;
}

.chipBtn--open {
  background: var(--holcim-open-bg);
  border-color: var(--holcim-open-bd);
  color: var(--holcim-open-tx);
}
.chipBtn--open:hover {
  background: rgba(24, 64, 112, 0.14);
  border-color: rgba(24, 64, 112, 0.28);
}

.chipIcon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #ffffff;
  cursor: pointer;
  font-weight: 950;
}
.chipIcon:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}

/* Popover filters */
.popover {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(620px, calc(100vw - 24px));
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
  padding: 8px;
  z-index: 80;
}
.popGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: center;
}
.sel {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  background: #fff;
}

/* Cards list */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 10px;
  box-shadow: 0 1px 0 rgba(17, 24, 39, 0.03);
  overflow: visible;
  position: relative;
}
.card--error {
  border-color: #fecaca;
  background: #fff5f5;
}
.empty {
  text-align: center;
  color: rgba(15, 23, 42, 0.6);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.pnlRow {
  align-items: stretch;
}

.disc {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  color: rgba(15, 23, 42, 0.7);
  flex: 0 0 auto;
}
.disc:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.line1 {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.line2 {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.name {
  font-weight: 950;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.92);
}
.name--pnl {
  font-size: 14px; /* ✅ titre P&L plus visible */
  font-weight: 1000;
  letter-spacing: 0.15px;
}
.name--sm {
  font-size: 12.5px;
}
.name--xs {
  font-size: 12px;
}

.meta {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.78);
}
.k {
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
}
.dot {
  color: rgba(15, 23, 42, 0.18);
}

.actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  flex: 0 0 auto;
}

/* tags */
.tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: rgba(15, 23, 42, 0.75);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 900;
}
.tag--on {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(34, 197, 94, 0.08);
  color: rgba(21, 128, 61, 1);
}
.tag--arch,
.tag--off {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.12);
  color: rgba(15, 23, 42, 0.62);
}

.pill {
  font-size: 10.5px;
  font-weight: 950;
  letter-spacing: 0.2px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(32, 184, 232, 0.25);
  background: rgba(32, 184, 232, 0.1);
  color: rgba(15, 23, 42, 0.82);
}
.pill--green {
  border-color: rgba(34, 197, 94, 0.25);
  background: rgba(34, 197, 94, 0.1);
  color: rgba(21, 128, 61, 1);
}

/* Children */
.children {
  margin-top: 10px;
  border-top: 1px dashed rgba(16, 24, 40, 0.14);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sectionHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}
.sectionTitle {
  font-size: 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.78);
  text-transform: uppercase;
  letter-spacing: 0.35px;
}
.sectionTitle--xs {
  font-size: 11px;
}
.sectionHint {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
}

/* Active visibility */
.pnl {
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}
.pnl.activePnl {
  border-color: rgba(32, 184, 232, 0.55);
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.14), 0 14px 35px rgba(17, 24, 39, 0.08);
}
.pnl.activePnl::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 5px;
  border-radius: 10px;
  background: var(--active-pnl);
}

.contract {
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 14px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.78);
  position: relative;
}
.contract.activeContract {
  border-color: rgba(24, 64, 112, 0.42);
  background: rgba(24, 64, 112, 0.035);
  box-shadow: 0 0 0 4px rgba(24, 64, 112, 0.1);
}
.contract.activeContract::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 5px;
  border-radius: 10px;
  background: var(--active-contract);
}
.contractRow {
  align-items: flex-start;
}

.variantsHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-left: 38px;
  margin-right: 2px;
}

.variants {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.indent2 {
  margin-left: 38px;
}

.variantRow {
  padding: 8px 10px;
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 14px;
  background: #ffffff;
  position: relative;
}

/* ✅ Active variante = vrai BG vert “ouvert” (plus lisible que ton actuel) */
.variantRow.activeVariant {
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.16) 0%, rgba(34, 197, 94, 0.10) 100%) !important;
  border-color: rgba(34, 197, 94, 0.55) !important;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16), 0 12px 30px rgba(34, 197, 94, 0.10);
}
.variantRow.activeVariant::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 8px;
  bottom: 8px;
  width: 5px;
  border-radius: 10px;
  background: rgba(34, 197, 94, 1) !important;
}

.desc {
  display: inline-block;
  max-width: 680px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tree */
.tree {
  width: 26px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tree .branch {
  position: absolute;
  left: 50%;
  top: -10px;
  bottom: -10px;
  width: 2px;
  background: rgba(15, 23, 42, 0.12);
  transform: translateX(-50%);
}
.tree .node {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #fff;
  border: 2px solid rgba(15, 23, 42, 0.25);
}
.tree--deep {
  width: 38px;
}

/* Menu kebab */
.menu {
  position: relative;
}
.menuPop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  top: auto;
  min-width: 170px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
  padding: 6px;
  z-index: 200;
}

.menuItem {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.86);
}
.menuItem:hover {
  background: rgba(32, 184, 232, 0.1);
}
.menuSep {
  height: 1px;
  background: rgba(16, 24, 40, 0.1);
  margin: 6px 0;
}
.menuItem.danger {
  color: rgba(185, 28, 28, 0.98);
}
.menuItem.danger:hover {
  background: rgba(220, 38, 38, 0.1);
}

/* Modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 100200;
}
.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 36px);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}
.modalHead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.03);
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.modalTitle {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.modalSub {
  color: rgba(15, 23, 42, 0.45);
  font-size: 11px;
  font-weight: 800;
}
.xBtn {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  border-radius: 12px;
  width: 34px;
  height: 34px;
  cursor: pointer;
}
.xBtn:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}
.modalBody {
  padding: 14px;
  overflow: auto;
  flex: 1 1 auto;
}
.modalFoot {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.02);
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rowKV {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 12px;
  align-items: start;
}
.rowKV .k {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 900;
}
.rowKV .v {
  font-size: 12.5px;
  color: rgba(15, 23, 42, 0.92);
  font-weight: 800;
}

.formGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.f--full {
  grid-column: 1 / -1;
}
.in {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.in:focus {
  border-color: rgba(32, 184, 232, 0.45);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.14);
}
.in--disabled {
  background: rgba(15, 23, 42, 0.04);
  color: rgba(15, 23, 42, 0.55);
}
.r {
  text-align: right;
}

.alert {
  border: 1px solid #fecaca;
  background: #fff5f5;
  color: #991b1b;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 12px;
  font-weight: 900;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sectionBox {
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.02);
  padding: 10px;
}
.sectionForm {
  margin-top: 2px;
}
.muted {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
}

/* Confirm/Info modal */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 100200;
}
.dlg {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}
.dlgHdr {
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.dlgTtl {
  font-weight: 950;
  color: #0f172a;
}
.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
}
.x:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}
.dlgBody {
  padding: 12px;
}
.dlgMsg {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.85);
  line-height: 1.45;
}
.dlgFtr {
  padding: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}
.btn2 {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  cursor: pointer;
}
.btn2:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}
.btn2.pri {
  background: rgba(24, 64, 112, 0.12);
  border-color: rgba(24, 64, 112, 0.28);
  color: rgba(24, 64, 112, 1);
}
.btn2.pri:hover {
  background: rgba(24, 64, 112, 0.18);
  border-color: rgba(24, 64, 112, 0.38);
}

/* ✅ Fix anomaly: ne force plus une couleur rouge sur le CTA du footer */
.modalFoot > button:last-child {
  background: var(--holcim-navy) !important;
  border-color: var(--holcim-navy) !important;
  color: #fff !important;
}
.modalFoot > button:last-child:hover {
  background: #14345c !important;
  border-color: #14345c !important;
}
.modalFoot > button:last-child:disabled {
  opacity: 0.65;
}

/* Deep fix: CTA dans les modals enfants */
:deep(.chipBtn--primary),
:deep(button.chipBtn--primary),
:deep(button.pri),
:deep(.pri),
:deep(.primary),
:deep(.btnPrimary),
:deep(.btn-primary) {
  background: var(--holcim-navy) !important;
  border-color: var(--holcim-navy) !important;
  color: #fff !important;
}
:deep(.chipBtn--primary:hover),
:deep(button.chipBtn--primary:hover),
:deep(button.pri:hover),
:deep(.pri:hover),
:deep(.primary:hover),
:deep(.btnPrimary:hover),
:deep(.btn-primary:hover) {
  background: #14345c !important;
  border-color: #14345c !important;
}

/* ✅ Pagination */
.pagerCard {
  margin-top: 2px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pagerInfo {
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.72);
}
.pagerBtns {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.pgBtn {
  height: 34px;
  min-width: 34px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  font-weight: 950;
  cursor: pointer;
  color: rgba(15, 23, 42, 0.82);
}
.pgBtn:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.22);
}
.pgBtn.on {
  background: rgba(24, 64, 112, 0.12);
  border-color: rgba(24, 64, 112, 0.28);
  color: rgba(24, 64, 112, 1);
}
.pgBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 900px) {
  .subHeader {
    flex-wrap: wrap;
    gap: 8px;
  }
  .searchMini {
    min-width: 0;
    width: 100%;
  }
  .popGrid {
    grid-template-columns: 1fr;
  }
  .rowKV {
    grid-template-columns: 140px 1fr;
  }
  .formGrid {
    grid-template-columns: 1fr;
  }
  .variantsHead {
    margin-left: 0;
  }
  .indent2 {
    margin-left: 0;
  }
  .pagerCard {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
