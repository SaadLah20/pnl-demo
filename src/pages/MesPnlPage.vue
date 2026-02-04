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

/** create flags */
const isCreate = ref(false);
const createPnlId = ref<string | null>(null);      // for creating contract
const createContractId = ref<string | null>(null); // for creating variant

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
  ref: "", // non modifiable
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

  // variant create helpers (not persisted in DB)
  // Server expects: ZERO | INITIEE | COMPOSEE (anything else => simple init)
  createMode: "ZERO",
  sourceVariantId: "",       // for COMPOSEE
});

function resetDraft() {
  editErr.value = null;
  isCreate.value = false;
  createPnlId.value = null;
  createContractId.value = null;

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

  draft.createMode = "ZERO";
  draft.sourceVariantId = "";
}

function findPnlIdByContractId(contractId: string): string | null {
  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      if (String(c.id) === String(contractId)) return String(p.id);
    }
  }
  return null;
}

const composeSourceOptions = computed(() => {
  // all variants grouped by P&L, to let the user clone any variant
  const out: Array<{ id: string; label: string; pnlId: string }> = [];
  for (const p of pnls.value) {
    for (const c of p.contracts ?? []) {
      for (const v of c.variants ?? []) {
        out.push({
          id: String(v.id),
          pnlId: String(p.id),
          label: `${String(p.title ?? "P&L")} · ${String(c.ref ?? "Contrat")} · ${String(v.title ?? "Variante")}`,
        });
      }
    }
  }
  return out;
});

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

/** CREATE Contract under P&L */
function openCreateContract(pnlId: string) {
  resetDraft();
  editMode.value = "contract";
  editOpen.value = true;
  isCreate.value = true;
  createPnlId.value = pnlId;

  // defaults “raisonnables”
  draft.ref = "";         // auto
  draft.dureeMois = 0;
  draft.postes = 1;
}

/** CREATE Variant under Contract */
function openCreateVariant(contractId: string) {
  resetDraft();
  editMode.value = "variant";
  editOpen.value = true;
  isCreate.value = true;
  createContractId.value = contractId;

  draft.title = "Variante";
  draft.status = "INITIALISEE";
  draft.description = "";

  draft.createMode = "ZERO";
  draft.sourceVariantId = "";
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
    // -------- PNL UPDATE
    if (editMode.value === "pnl") {
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

    // -------- CONTRACT CREATE / UPDATE
    if (editMode.value === "contract") {
      const payload = {
        // ref non modifiable et auto -> on n’envoie jamais "ref"
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

    // -------- VARIANT CREATE / UPDATE
    if (editMode.value === "variant") {
      if (isCreate.value) {
        if (!createContractId.value) throw new Error("contractId manquant pour créer une variante.");

        if (draft.createMode === "COMPOSEE" && !String(draft.sourceVariantId || "").trim()) {
          throw new Error("Variante composée: sélectionne une variante source.");
        }

        const created = await apiJson(`/variants`, {
          method: "POST",
          body: JSON.stringify({
            contractId: createContractId.value,
            title: draft.title,
            status: draft.status,
            description: draft.description,
            createMode: draft.createMode,
            sourceVariantId: draft.sourceVariantId || undefined,
          }),
        });

        // 🔥 keep newly created variant selected after reload
        const newVarId = String(created?.variant?.id ?? created?.id ?? "");
        const pnlIdForContract = findPnlIdByContractId(String(createContractId.value));
        if (newVarId) {
          (store as any).__keepAfterReload = { pnlId: pnlIdForContract, variantId: newVarId, contractId: String(createContractId.value) };
        }
      } else {
        await apiJson(`/variants/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: draft.title,
            status: draft.status,
            description: draft.description,
          }),
        });
      }
    }

    const keepPnl = activePnlId.value;
    const keepVar = activeVariantId.value;

    await store.loadPnls?.();

    const keepAfter = (store as any).__keepAfterReload as any;
    delete (store as any).__keepAfterReload;

    if (keepAfter?.pnlId && (store as any).setActivePnl) (store as any).setActivePnl(keepAfter.pnlId);
    else if (keepPnl && (store as any).setActivePnl) (store as any).setActivePnl(keepPnl);

    if (keepAfter?.variantId && (store as any).setActiveVariant) (store as any).setActiveVariant(keepAfter.variantId);
    else if (keepVar && (store as any).setActiveVariant) (store as any).setActiveVariant(keepVar);

    // ensure P&L container is opened so the user can immediately click the new variant
    if (keepAfter?.pnlId) openPnl[String(keepAfter.pnlId)] = true;

    closeEdit();
  } catch (e: any) {
    editErr.value = e?.message ?? String(e);
  } finally {
    editBusy.value = false;
  }
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
                <button class="btn btn--soft" @click="openView('contract', c)">Visualiser</button>
                <button class="btn btn--soft" @click="openEdit('contract', c)">Modifier</button>
              </div>
            </div>

            <div class="variants">
              <div class="variantsHead">
                <div class="muted">Variantes</div>
                <button class="btn btn--primary btn--mini" @click="openCreateVariant(c.id)">+ Nouvelle Variante</button>
              </div>

              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>

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
                    <span v-if="v.description" class="meta">{{ v.description }}</span>
                    <span class="idTiny">ID : {{ idShort(v.id) }}</span>
                  </div>
                </div>

                <div class="actions">
                  <button class="btn btn--primary btn--mini" @click="openVariant(p.id, c.id, v.id)">Ouvrir</button>
                  <button class="btn btn--soft" @click="openView('variant', v)">Visualiser</button>
                  <button class="btn btn--soft" @click="openEdit('variant', v)">Modifier</button>
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
                <div class="sectionTitle">Paramètres financiers</div>
                <div class="sectionGrid">
                  <div class="rowKV"><div class="k">Dim./fériés</div><div class="v"><b>{{ viewData?.sundayPrice ?? 0 }}</b></div></div>
                  <div class="rowKV"><div class="k">Pénalité délai</div><div class="v"><b>{{ viewData?.delayPenalty ?? 0 }}</b></div></div>
                  <div class="rowKV"><div class="k">Location chiller</div><div class="v"><b>{{ viewData?.chillerRent ?? 0 }}</b></div></div>
                </div>
              </div>
            </div>

            <div v-else class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v"><span :class="tagClass(viewData?.status)">{{ viewData?.status ?? "—" }}</span></div></div>
              <div v-if="viewData?.description" class="rowKV"><div class="k">Description</div><div class="v"><b>{{ viewData?.description }}</b></div></div>
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
              <div v-if="isCreate" class="f f--full">
                <div class="k">Mode de création</div>
                <select class="in" v-model="draft.createMode">
                  <option value="ZERO">Variante ZERO (toutes sections à 0)</option>
                  <option value="INITIEE">Variante INITIÉE (initiation auto pour test)</option>
                  <option value="COMPOSEE">Variante COMPOSÉE (copie d'une variante)</option>
                </select>
                <div class="hint" style="margin-top:6px">
                  <span v-if="draft.createMode === 'ZERO'">Création rapide: toutes les sections sont créées avec des valeurs 0 / vides.</span>
                  <span v-else-if="draft.createMode === 'INITIEE'">Pour l’instant: initiation aléatoire (stub) — tu remplaceras par tes règles plus tard.</span>
                  <span v-else>Obligatoire: choisir une variante source pour copier toutes les sections.</span>
                </div>
              </div>

              <div v-if="isCreate && draft.createMode === 'COMPOSEE'" class="f f--full">
                <div class="k">Variante source</div>
                <select class="in" v-model="draft.sourceVariantId">
                  <option value="">— Sélectionner —</option>
                  <option v-for="o in composeSourceOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </div>

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

/* ultra-compact one-line toolbar */
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

/* Modal */
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
