<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import { computed, reactive, ref, onBeforeUnmount } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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
      } catch {
        // ignore
      }
    }
    throw new Error(msg);
  }

  return res.json().catch(() => null);
}

const store = usePnlStore();

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
function normalizeEnum(opts: Opt[], value: any, fallback: any) {
  const ok = opts.some((o) => String(o.value) === String(value));
  return ok ? value : fallback;
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
function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
   P&L Search + Filters (P&L only)
========================================================= */
const q = ref("");
const filterOpen = ref(false);

const pnlStatusFilter = ref<string>("");
const pnlCityFilter = ref<string>("");
const pnlClientFilter = ref<string>("");
const pnlModelFilter = ref<string>("");

const sortPnlKey = ref<"status" | "city" | "client" | "model">("status");
const sortPnlDir = ref<"asc" | "desc">("asc");

const pnlStatusOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const s = statusKey(p?.status);
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlCityOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const v = String(p?.city ?? "");
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlClientOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const v = String(p?.client ?? "");
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
});
const pnlModelOptions = computed(() => {
  const set = new Set<string>();
  for (const p of pnls.value) {
    const v = String(p?.model ?? "");
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
});

const openPnl = reactive<Record<string, boolean>>({});
function isOpenPnl(id: string) {
  if (openPnl[id] === undefined) openPnl[id] = false;
  return openPnl[id];
}
function togglePnl(id: string) {
  openPnl[id] = !isOpenPnl(id);
}
function collapseAllPnls() {
  for (const p of pnls.value) openPnl[String(p.id)] = false;
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
      return title.includes(query) || client.includes(query) || model.includes(query) || city.includes(query) || status.includes(query) || id.includes(query);
    });
  }

  const dir = sortPnlDir.value === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const k = sortPnlKey.value;
    const av = k === "status" ? statusKey(a?.status) : String(a?.[k] ?? "");
    const bv = k === "status" ? statusKey(b?.status) : String(b?.[k] ?? "");
    return av.localeCompare(bv, "fr") * dir;
  });

  // keep active pnl on top
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

/* =========================================================
   Selection helpers
========================================================= */
function openVariantByIds(pnlId: string, contractId: string, variantId: string) {
  if ((store as any).setActivePnl) (store as any).setActivePnl(pnlId);
  if ((store as any).setActiveContract) (store as any).setActiveContract(contractId);
  if ((store as any).setActiveVariant) (store as any).setActiveVariant(variantId);
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
   EDIT/CREATE MODAL
========================================================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

const isCreate = ref(false);
const createPnlId = ref<string | null>(null);
const createContractId = ref<string | null>(null);
const createdVariantIdToSelect = ref<string | null>(null);

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
  terrain: "LHM",
  installation: "LHM",
  cab: "LHM",
  genieCivil: "LHM",
  transport: "LHM",
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
  editErr.value = null;
  isCreate.value = false;
  createPnlId.value = null;
  createContractId.value = null;
  createdVariantIdToSelect.value = null;

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
  editMode.value = mode;
  editOpen.value = true;

  if (mode === "pnl") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.client = String(data.client ?? "");
    draft.model = String(data.model ?? "");
    draft.city = String(data.city ?? "");
    draft.status = String(data.status ?? "");
    draft.createdAt = String(data.createdAt ?? "");
  }

  if (mode === "contract") {
    draft.id = String(data.id);
    draft.ref = String(data.ref ?? "");
    draft.dureeMois = toNum(data.dureeMois, 0);

    draft.cab = normalizeEnum(CHARGE_3, String(data.cab ?? "LHM"), "LHM");
    draft.installation = normalizeEnum(CHARGE_3, String(data.installation ?? "LHM"), "LHM");
    draft.genieCivil = normalizeEnum(GENIE_CIVIL_4, String(data.genieCivil ?? "LHM"), "LHM");
    draft.transport = normalizeEnum(CHARGE_3, String(data.transport ?? "LHM"), "LHM");
    draft.terrain = normalizeEnum(TERRAIN_4, String(data.terrain ?? "LHM"), "LHM");
    draft.matierePremiere = normalizeEnum(MATIERE_3, String(data.matierePremiere ?? "LHM"), "LHM");
    draft.maintenance = normalizeEnum(MAINTENANCE_4, String(data.maintenance ?? "LHM"), "LHM");
    draft.chargeuse = normalizeEnum(CHARGE_3, String(data.chargeuse ?? "LHM"), "LHM");

    draft.branchementEau = normalizeEnum(CHARGE_3, String(data.branchementEau ?? "LHM"), "LHM");
    draft.consoEau = normalizeEnum(CONSOMMATION_2, String(data.consoEau ?? "LHM"), "LHM");
    draft.branchementElec = normalizeEnum(CHARGE_3, String(data.branchementElec ?? "LHM"), "LHM");
    draft.consoElec = normalizeEnum(CONSOMMATION_2, String(data.consoElec ?? "LHM"), "LHM");

    const postes = toNum(data.postes, 1);
    draft.postes = postes === 2 ? 2 : 1;

    draft.sundayPrice = toNum(data.sundayPrice, 0);
    draft.delayPenalty = toNum(data.delayPenalty, 0);
    draft.chillerRent = toNum(data.chillerRent, 0);
  }

  if (mode === "variant") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.status = String(data.status ?? "INITIALISEE");
    draft.description = String(data.description ?? "");
  }
}

function openCreateContract(pnlId: string) {
  resetDraft();
  editMode.value = "contract";
  editOpen.value = true;
  isCreate.value = true;
  createPnlId.value = pnlId;
  // defaults already set
}

function openCreateVariant(contractId: string) {
  resetDraft();
  editMode.value = "variant";
  editOpen.value = true;
  isCreate.value = true;
  createContractId.value = contractId;

  draft.status = "INITIALISEE";
}

function closeEdit() {
  editOpen.value = false;
  editErr.value = null;
  editBusy.value = false;
  resetDraft();
}

async function saveEdit() {
  editErr.value = null;
  editBusy.value = true;

  try {
    // -------- PNL UPDATE
    if (editMode.value === "pnl") {
      await apiJson(`/pnls/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: String(draft.title ?? ""),
          client: draft.client === "" ? null : String(draft.client ?? ""),
          city: String(draft.city ?? ""),
          region: undefined, // backend gère, on n’envoie pas si pas utilisé
          status: String(draft.status ?? ""),
        }),
      });
    }

    // -------- CONTRACT CREATE / UPDATE
    if (editMode.value === "contract") {
      // IMPORTANT: jamais de null sur les champs Prisma non-null.
      // IMPORTANT: ne pas envoyer ref/status (ref non modifiable / status inexistant).
      const payload: any = {
        dureeMois: Math.trunc(toNum(draft.dureeMois, 0)),
        cab: normalizeEnum(CHARGE_3, draft.cab, "LHM"),
        installation: normalizeEnum(CHARGE_3, draft.installation, "LHM"),
        genieCivil: normalizeEnum(GENIE_CIVIL_4, draft.genieCivil, "LHM"),
        transport: normalizeEnum(CHARGE_3, draft.transport, "LHM"),
        terrain: normalizeEnum(TERRAIN_4, draft.terrain, "LHM"),
        matierePremiere: normalizeEnum(MATIERE_3, draft.matierePremiere, "LHM"),
        maintenance: normalizeEnum(MAINTENANCE_4, draft.maintenance, "LHM"),
        chargeuse: normalizeEnum(CHARGE_3, draft.chargeuse, "LHM"),
        branchementEau: normalizeEnum(CHARGE_3, draft.branchementEau, "LHM"),
        consoEau: normalizeEnum(CONSOMMATION_2, draft.consoEau, "LHM"),
        branchementElec: normalizeEnum(CHARGE_3, draft.branchementElec, "LHM"),
        consoElec: normalizeEnum(CONSOMMATION_2, draft.consoElec, "LHM"),
        postes: normalizeEnum(POSTES_2, Number(draft.postes ?? 1), 1),
        sundayPrice: toNum(draft.sundayPrice, 0),
        delayPenalty: toNum(draft.delayPenalty, 0),
        chillerRent: toNum(draft.chillerRent, 0),
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

    // -------- VARIANT CREATE / UPDATE
    if (editMode.value === "variant") {
      if (isCreate.value) {
        if (!createContractId.value) throw new Error("contractId manquant pour créer une variante.");

        const created: any = await apiJson(`/variants`, {
          method: "POST",
          body: JSON.stringify({
            contractId: createContractId.value,
            title: String(draft.title ?? ""),
            status: String(draft.status ?? "INITIALISEE"),
            description: draft.description === "" ? null : String(draft.description ?? ""),
          }),
        });

        const newId = created?.variant?.id ?? created?.id ?? null;
        if (newId) createdVariantIdToSelect.value = String(newId);
      } else {
        await apiJson(`/variants/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: String(draft.title ?? ""),
            status: String(draft.status ?? ""),
            description: draft.description === "" ? null : String(draft.description ?? ""),
          }),
        });
      }
    }

    // reload + keep selection
    const keepPnl = activePnlId.value;
    const keepContract = activeContractId.value;
    const keepVariant = createdVariantIdToSelect.value ?? activeVariantId.value;

    await store.loadPnls?.();

    if (keepPnl && (store as any).setActivePnl) (store as any).setActivePnl(keepPnl);
    if (keepContract && (store as any).setActiveContract) (store as any).setActiveContract(keepContract);
    if (keepVariant && (store as any).setActiveVariant) (store as any).setActiveVariant(keepVariant);

    closeEdit();
  } catch (e: any) {
    editErr.value = e?.message ?? String(e);
  } finally {
    editBusy.value = false;
  }
}

/* =========================================================
   Keyboard
========================================================= */
const onKey = (ev: KeyboardEvent) => {
  if (ev.key === "Escape") {
    if (viewOpen.value) closeView();
    if (editOpen.value) closeEdit();
    if (filterOpen.value) filterOpen.value = false;
  }
};
window.addEventListener("keydown", onKey);
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="titleBlock">
        <h1>Mes P&amp;L</h1>
      </div>

      <div class="headerActions">
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

      <div class="filterWrap">
        <button class="btn btn--soft btn--mini" @click="filterOpen = !filterOpen" title="Filtres">⚙</button>

        <div v-if="filterOpen" class="popover">
          <div class="popGrid">
            <select class="sel" v-model="pnlStatusFilter" title="Statut">
              <option value="">Statut: Tous</option>
              <option v-for="s in pnlStatusOptions" :key="s" :value="s">{{ s }}</option>
            </select>

            <select class="sel" v-model="pnlCityFilter" title="Ville">
              <option value="">Ville: Toutes</option>
              <option v-for="s in pnlCityOptions" :key="s" :value="s">{{ s }}</option>
            </select>

            <select class="sel" v-model="pnlClientFilter" title="Client">
              <option value="">Client: Tous</option>
              <option v-for="s in pnlClientOptions" :key="s" :value="s">{{ s }}</option>
            </select>

            <select class="sel" v-model="pnlModelFilter" title="Modèle">
              <option value="">Modèle: Tous</option>
              <option v-for="s in pnlModelOptions" :key="s" :value="s">{{ s }}</option>
            </select>

            <div class="sortRow">
              <select class="sel" v-model="sortPnlKey" title="Trier par">
                <option value="status">Trier: Statut</option>
                <option value="city">Trier: Ville</option>
                <option value="client">Trier: Client</option>
                <option value="model">Trier: Modèle</option>
              </select>
              <button class="btn btn--soft btn--mini" @click="sortPnlDir = sortPnlDir === 'asc' ? 'desc' : 'asc'">
                {{ sortPnlDir === "asc" ? "↑" : "↓" }}
              </button>
            </div>
          </div>

          <div class="popFoot">
            <button
              class="btn btn--ghost btn--mini"
              @click="
                pnlStatusFilter = '';
                pnlCityFilter = '';
                pnlClientFilter = '';
                pnlModelFilter = '';
              "
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- LIST -->
    <div v-if="filteredPnls.length === 0" class="card empty">
      Aucun P&amp;L.
    </div>

    <div v-else class="list">
      <div v-for="p in filteredPnls" :key="p.id" class="card">
        <div class="row pnlRow">
          <div class="main">
            <div class="line1">
              <button class="btn btn--ghost btn--mini" @click="togglePnl(p.id)" title="Ouvrir/Fermer">
                {{ isOpenPnl(p.id) ? "▾" : "▸" }}
              </button>
              <div class="name">{{ p.title || "Sans titre" }}</div>
              <span :class="tagClass(p.status)">{{ statusKey(p.status) || (p.status ?? "—") }}</span>
              <span class="meta">Client: <b>{{ p.client || "-" }}</b></span>
              <span class="meta">Ville: <b>{{ p.city || "-" }}</b></span>
              <span class="meta">Modèle: <b>{{ p.model || "-" }}</b></span>
            </div>

            <div class="line2">
              <span class="meta idTiny">ID: {{ idShort(p.id) }}</span>
              <span class="meta">Créé: <b>{{ fmtDate(p.createdAt) }}</b></span>
              <span class="meta">Contrats: <b>{{ (p.contracts ?? []).length }}</b></span>
              <span class="meta">Variantes: <b>{{ (p.contracts ?? []).reduce((s: number, c: any) => s + (c.variants?.length ?? 0), 0) }}</b></span>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn--soft" @click="openView('pnl', p)">👁</button>
            <button class="btn btn--soft" @click="openEdit('pnl', p)">✎</button>
            <button class="btn btn--primary" @click="openCreateContract(p.id)">+ Nouveau Contrat</button>
          </div>
        </div>

        <!-- CONTRACTS -->
        <div v-if="isOpenPnl(p.id)" class="contracts">
          <div v-if="(p.contracts ?? []).length === 0" class="empty tiny">Aucun contrat.</div>

          <div v-for="c in p.contracts ?? []" :key="c.id" class="contractBox">
            <div class="contractHead">
              <div class="contractTitle">
                <div class="name name--sm">Contrat — {{ c.ref || idShort(c.id) }}</div>
                <div class="meta tiny">
                  Durée: <b>{{ c.dureeMois ?? 0 }}</b> mois · Postes: <b>{{ labelFrom(POSTES_2, c.postes) }}</b>
                </div>
              </div>

              <div class="actions">
                <button class="btn btn--soft btn--mini" @click="openView('contract', c)">👁</button>
                <button class="btn btn--soft btn--mini" @click="openEdit('contract', c)">✎</button>
              </div>
            </div>

            <!-- VARIANTS -->
            <div class="variants">
              <div class="variantsHead">
                <div class="meta tiny">Variantes</div>
                <button class="btn btn--primary btn--mini" @click="openCreateVariant(c.id)">+ Nouvelle Variante</button>
              </div>

              <div v-if="(c.variants ?? []).length === 0" class="empty tiny">Aucune variante.</div>

              <div v-for="v in c.variants ?? []" :key="v.id" class="variantRow" :class="{ active: v.id === activeVariantId }">
                <button class="variantMain" @click="openVariantByIds(p.id, c.id, v.id)">
                  <div class="name name--xs">{{ v.title || "Sans titre" }}</div>
                  <div class="meta tiny">
                    <span :class="tagClass(v.status)">{{ statusKey(v.status) || (v.status ?? "—") }}</span>
                    <span class="idTiny">ID: {{ idShort(v.id) }}</span>
                  </div>
                </button>
                <div class="actions">
                  <button class="btn btn--soft btn--mini" @click="openView('variant', v)">👁</button>
                  <button class="btn btn--soft btn--mini" @click="openEdit('variant', v)">✎</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODALS -->
    <Teleport to="body">
      <!-- VIEW MODAL -->
      <div v-if="viewOpen" class="modalOverlay" @click.self="closeView()">
        <div class="modal">
          <div class="modalHead">
            <div class="modalTitle">
              <b v-if="viewMode === 'pnl'">Visualiser — P&amp;L</b>
              <b v-else-if="viewMode === 'contract'">Visualiser — Contrat</b>
              <b v-else>Visualiser — Variante</b>
              <div class="modalSub idTiny">ID : {{ idShort(viewData?.id) }}</div>
            </div>
            <button class="xBtn" @click="closeView()">✕</button>
          </div>

          <div class="modalBody">
            <div v-if="viewMode === 'pnl'" class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Client</div><div class="v"><b>{{ viewData?.client ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Modèle</div><div class="v"><b>{{ viewData?.model ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Ville</div><div class="v"><b>{{ viewData?.city ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v"><span :class="tagClass(viewData?.status)">{{ viewData?.status ?? "—" }}</span></div></div>
              <div class="rowKV"><div class="k">Date de création</div><div class="v"><b>{{ fmtDate(viewData?.createdAt) }}</b></div></div>
            </div>

            <div v-else-if="viewMode === 'contract'" class="kv">
              <div class="sectionBox">
                <div class="sectionTitle">Synthèse</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Référence</div><div class="v"><b>{{ viewData?.ref ?? "-" }}</b></div></div>
                  <div class="rowKV"><div class="k">Durée (mois)</div><div class="v"><b>{{ viewData?.dureeMois ?? 0 }}</b></div></div>
                  <div class="rowKV"><div class="k">Postes</div><div class="v"><b>{{ labelFrom(POSTES_2, viewData?.postes) }}</b></div></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Responsabilités</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Cab</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.cab) }}</b></div></div>
                  <div class="rowKV"><div class="k">Installation</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.installation) }}</b></div></div>
                  <div class="rowKV"><div class="k">Génie civil</div><div class="v"><b>{{ labelFrom(GENIE_CIVIL_4, viewData?.genieCivil) }}</b></div></div>
                  <div class="rowKV"><div class="k">Transport</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.transport) }}</b></div></div>
                  <div class="rowKV"><div class="k">Terrain</div><div class="v"><b>{{ labelFrom(TERRAIN_4, viewData?.terrain) }}</b></div></div>
                  <div class="rowKV"><div class="k">Matière première</div><div class="v"><b>{{ labelFrom(MATIERE_3, viewData?.matierePremiere) }}</b></div></div>
                  <div class="rowKV"><div class="k">Maintenance</div><div class="v"><b>{{ labelFrom(MAINTENANCE_4, viewData?.maintenance) }}</b></div></div>
                  <div class="rowKV"><div class="k">Chargeuse</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.chargeuse) }}</b></div></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Eau</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Branchement eau</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.branchementEau) }}</b></div></div>
                  <div class="rowKV"><div class="k">Conso eau</div><div class="v"><b>{{ labelFrom(CONSOMMATION_2, viewData?.consoEau) }}</b></div></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Électricité</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Branchement élec</div><div class="v"><b>{{ labelFrom(CHARGE_3, viewData?.branchementElec) }}</b></div></div>
                  <div class="rowKV"><div class="k">Conso élec</div><div class="v"><b>{{ labelFrom(CONSOMMATION_2, viewData?.consoElec) }}</b></div></div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Financier</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Prix dimanches</div><div class="v"><b>{{ viewData?.sundayPrice ?? 0 }}</b></div></div>
                  <div class="rowKV"><div class="k">Pénalité délai</div><div class="v"><b>{{ viewData?.delayPenalty ?? 0 }}</b></div></div>
                  <div class="rowKV"><div class="k">Location Chiller</div><div class="v"><b>{{ viewData?.chillerRent ?? 0 }}</b></div></div>
                </div>
              </div>
            </div>

            <div v-else class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v"><span :class="tagClass(viewData?.status)">{{ viewData?.status ?? "—" }}</span></div></div>
              <div class="rowKV"><div class="k">Description</div><div class="v"><b>{{ viewData?.description ?? "-" }}</b></div></div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" @click="closeView()">Fermer</button>
          </div>
        </div>
      </div>

      <!-- EDIT/CREATE MODAL -->
      <div v-if="editOpen" class="modalOverlay" @click.self="closeEdit()">
        <div class="modal">
          <div class="modalHead">
            <div class="modalTitle">
              <b v-if="editMode === 'pnl'">{{ isCreate ? "Créer" : "Modifier" }} — P&amp;L</b>
              <b v-else-if="editMode === 'contract'">{{ isCreate ? "Créer" : "Modifier" }} — Contrat</b>
              <b v-else>{{ isCreate ? "Créer" : "Modifier" }} — Variante</b>
              <div class="modalSub idTiny" v-if="!isCreate">ID : {{ idShort(draft.id) }}</div>
              <div class="modalSub idTiny" v-else>Création</div>
            </div>
            <button class="xBtn" @click="closeEdit()">✕</button>
          </div>

          <div class="modalBody">
            <div v-if="editErr" class="alert"><b>Erreur :</b> {{ editErr }}</div>

            <!-- PNL -->
            <div v-if="editMode === 'pnl'" class="formGrid">
              <div class="f">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre du P&L" />
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
                  <div class="f"><div class="k">Cab</div>
                    <select class="in" v-model="draft.cab">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Installation</div>
                    <select class="in" v-model="draft.installation">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Génie civil</div>
                    <select class="in" v-model="draft.genieCivil">
                      <option v-for="o in GENIE_CIVIL_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Transport jusqu’au chantier</div>
                    <select class="in" v-model="draft.transport">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Terrain</div>
                    <select class="in" v-model="draft.terrain">
                      <option v-for="o in TERRAIN_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Matière première</div>
                    <select class="in" v-model="draft.matierePremiere">
                      <option v-for="o in MATIERE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Maintenance</div>
                    <select class="in" v-model="draft.maintenance">
                      <option v-for="o in MAINTENANCE_4" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>

                  <div class="f"><div class="k">Chargeuse</div>
                    <select class="in" v-model="draft.chargeuse">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Eau</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Branchement Eau</div>
                    <select class="in" v-model="draft.branchementEau">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div class="f"><div class="k">Consommation Eau</div>
                    <select class="in" v-model="draft.consoEau">
                      <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Électricité</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Branchement Électricité</div>
                    <select class="in" v-model="draft.branchementElec">
                      <option v-for="o in CHARGE_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div class="f"><div class="k">Consommation Électricité</div>
                    <select class="in" v-model="draft.consoElec">
                      <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="sectionBox">
                <div class="sectionTitle">Paramètres financiers</div>
                <div class="formGrid sectionForm">
                  <div class="f"><div class="k">Prix dimanches / fériés</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.sundayPrice" />
                  </div>
                  <div class="f"><div class="k">Forfait pénalité délai</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.delayPenalty" />
                  </div>
                  <div class="f"><div class="k">Location Chiller</div>
                    <input class="in r" type="number" step="0.01" v-model.number="draft.chillerRent" />
                  </div>
                </div>
              </div>
            </div>

            <!-- VARIANT -->
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
                <textarea class="in ta" v-model="draft.description" rows="5" placeholder="Description (optionnel)"></textarea>
              </div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" :disabled="editBusy" @click="closeEdit()">Annuler</button>
            <button class="btn btn--primary" :disabled="editBusy" @click="saveEdit()">
              {{ editBusy ? "Enregistrement…" : (isCreate ? "Créer" : "Enregistrer") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page { padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f6f7f9; min-height: 100%; box-sizing: border-box; }

.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.titleBlock h1 { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
.headerActions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.card { background: #fff; border: 1px solid #e6e8ee; border-radius: 14px; padding: 12px; box-shadow: 0 1px 0 rgba(17,24,39,0.03); overflow: visible; }
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

.meta { font-size: 12px; color: #6b7280; }
.tiny { font-size: 11px; color: #6b7280; }
.idTiny { font-size: 11px; color: #9ca3af; }

.actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }

.btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 8px 10px; cursor: pointer; font-weight: 800; font-size: 12px; color: #111827; }
.btn:hover { background: #f9fafb; }
.btn--ghost { background: transparent; }
.btn--soft { background: #f3f4f6; border-color: #eceef4; }
.btn--primary { background: #111827; color: #fff; border-color: #111827; }
.btn--primary:hover { background: #0b1220; }
.btn--mini { padding: 6px 8px; border-radius: 10px; font-size: 12px; }
.btn:disabled { opacity: .6; cursor: not-allowed; }

.tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; border: 1px solid #e5e7eb; background: #fff; font-size: 11px; font-weight: 900; color: #111827; }
.tag--on { border-color: #bbf7d0; background: #ecfdf5; }
.tag--off { border-color: #e5e7eb; background: #f3f4f6; color: #6b7280; }
.tag--arch { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }

.toolbarOneLine { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; }
.searchMini { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 6px 10px; }
.searchMini .icon { color: #9ca3af; font-weight: 900; }
.input { border: none; outline: none; width: 100%; font-weight: 700; font-size: 12px; color: #111827; background: transparent; }

.filterWrap { position: relative; flex: 0 0 auto; }
.popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.12);
  padding: 10px;
  min-width: 340px;
}
.popGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sel { border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 8px 10px; font-weight: 800; font-size: 12px; color: #111827; outline: none; width: 100%; }
.sortRow { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; }
.popFoot { margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px; }

.contracts { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.contractBox { border: 1px solid #eef2f7; border-radius: 14px; padding: 10px; background: #fbfbfd; }
.contractHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.contractTitle { display: flex; flex-direction: column; gap: 2px; }

.variants { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.variantsHead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-left: 4px; }
.variantRow { display: flex; gap: 8px; align-items: stretch; border: 1px solid #eef2f7; background: #fff; border-radius: 12px; overflow: hidden; }
.variantRow.active { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
.variantMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 10px; text-align: left; border: none; background: transparent; cursor: pointer; }
.variantMain:hover { background: #f9fafb; }

.modalOverlay {
  position: fixed; inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 84px 18px 18px;
  z-index: 99999;
}
.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 102px);
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

.alert { border: 1px solid #fecaca; background: #fff5f5; color: #7f1d1d; padding: 10px 12px; border-radius: 12px; font-size: 12px; margin-bottom: 10px; }

.kv { display: flex; flex-direction: column; gap: 8px; }
.rowKV { display: grid; grid-template-columns: 160px 1fr; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid #eef2f7; border-radius: 12px; background: #fff; }
.rowKV .k { font-size: 12px; font-weight: 900; color: #111827; }
.rowKV .v { font-size: 12px; color: #111827; min-width: 0; }

.stack { display: flex; flex-direction: column; gap: 10px; }
.sectionBox { border: 1px solid #eef2f7; background: #fbfbfd; border-radius: 14px; padding: 10px; }
.sectionTitle { font-weight: 900; font-size: 12px; color: #111827; margin-bottom: 6px; }
.sectionGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.f { display: flex; flex-direction: column; gap: 6px; }
.f--full { grid-column: 1 / -1; }
.k { font-size: 12px; font-weight: 900; color: #111827; }
.in { border: 1px solid #e5e7eb; border-radius: 12px; padding: 9px 10px; font-size: 12px; font-weight: 800; outline: none; background: #fff; }
.in--disabled { background: #f3f4f6; color: #6b7280; }
.ta { resize: vertical; }
.r { text-align: right; }
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
