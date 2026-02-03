<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
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
   ENUMS (UI)
========================================================= */
// P&L
const PNL_MODELS = [
  { value: "CAB_FIXE_EXISTANT", label: "CAB Fixe existant" },
  { value: "CAB_FIXE_NOUVELLE", label: "CAB Fixe nouvelle" },
  { value: "CAB_MOBILE_CLIENT", label: "CAB Mobile client" },
] as const;

const PNL_STATUS = [
  { value: "ENCOURS", label: "Encours" },
  { value: "PERDU", label: "Perdu" },
  { value: "ADJUGE", label: "Adjugé" },
] as const;

// Variante
const VARIANT_STATUS = [
  { value: "INITIALISEE", label: "Initialisée" },
  { value: "ENCOURS", label: "Encours" },
  { value: "ANNULEE", label: "Annulée" },
  { value: "CLOTUREE", label: "Clôturée" },
] as const;

// Contrat (tous les enums demandés)
const CHARGE_3 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
] as const;

const GENIE_CIVIL_4 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
  { value: "PARTAGE", label: "Partagé" },
] as const;

const TERRAIN_4 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "EXISTANTE", label: "Existante" },
  { value: "PARTAGE", label: "Partagé" },
] as const;

const MATIERE_3 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "PRESTATAIRE", label: "Prestataire" },
] as const;

const MAINTENANCE_4 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
  { value: "PARTAGE_STANDARD", label: "Partage standard" },
  { value: "PARTAGE_PARTICULIER", label: "Partage particulier" },
] as const;

const EAU_ELEC_BRANCH_3 = CHARGE_3;

const CONSOMMATION_2 = [
  { value: "LHM", label: "À la charge de LHM" },
  { value: "CLIENT", label: "À la charge du client" },
] as const;

const POSTES_2 = [
  { value: "POSTE_1", label: "1 poste" },
  { value: "POSTE_2", label: "2 postes" },
] as const;

/* =========================================================
   UI STATE
========================================================= */
const q = ref("");
const sortKey = ref<"title" | "city" | "status" | "createdAt">("createdAt");
const sortDir = ref<"asc" | "desc">("desc");
const open = reactive<Record<string, boolean>>({});

function isOpen(pnlId: string) {
  if (open[pnlId] === undefined) open[pnlId] = false;
  return open[pnlId];
}
function togglePnl(pnlId: string) {
  open[pnlId] = !isOpen(pnlId);
}
function collapseAll() {
  for (const p of store.pnls ?? []) open[p.id] = false;
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
function toIsoDateInput(v: any) {
  try {
    if (!v) return "";
    const d = new Date(v);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}
function idShort(id: any) {
  const s = String(id ?? "");
  if (!s) return "";
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function tagClass(status?: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("ARCH") || s.includes("PERDU") || s.includes("ANNUL")) return "tag tag--arch";
  if (s.includes("CLOT") || s.includes("CLOSE")) return "tag tag--off";
  if (s.includes("ENCO") || s.includes("ADJ") || s.includes("ACT")) return "tag tag--on";
  return "tag";
}
function numOr0(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: any) {
  const n = numOr0(v);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MAD", maximumFractionDigits: 2 }).format(n);
}
function pick<T extends Record<string, any>>(obj: T, keys: string[]) {
  const out: any = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}
function labelFromEnum(opts: readonly { value: string; label: string }[], value: any) {
  const v = String(value ?? "");
  const found = (opts as any[]).find((x) => x.value === v);
  return found?.label ?? (v ? v : "-");
}

/* =========================================================
   Active ids
========================================================= */
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
   Data
========================================================= */
const pnls = computed<any[]>(() => store.pnls ?? []);

const filtered = computed<any[]>(() => {
  const query = normalize(q.value);
  let rows = pnls.value;

  if (query) {
    rows = rows.filter((p) => {
      const title = normalize(p.title);
      const model = normalize(p.model);
      const city = normalize(p.city);
      const status = normalize(p.status);
      const client = normalize(p.client);
      const region = normalize(p.region);
      return (
        title.includes(query) ||
        model.includes(query) ||
        city.includes(query) ||
        status.includes(query) ||
        client.includes(query) ||
        region.includes(query)
      );
    });
  }

  const dir = sortDir.value === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const ka = a?.[sortKey.value];
    const kb = b?.[sortKey.value];
    if (sortKey.value === "createdAt") {
      const ta = ka ? new Date(ka).getTime() : 0;
      const tb = kb ? new Date(kb).getTime() : 0;
      return (ta - tb) * dir;
    }
    return String(ka ?? "").localeCompare(String(kb ?? ""), "fr") * dir;
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

/* =========================================================
   NAV open variant
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
   EDIT MODAL
========================================================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

const draft = reactive<any>({
  id: "",

  // P&L
  title: "",
  model: "CAB_FIXE_EXISTANT",
  createdAt: "",
  client: "",
  status: "ENCOURS",
  startDatePlanned: "", // date prévue (affichée)
  city: "",
  region: "",

  // Contrat
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
  postes: "POSTE_1",
  sundayPrice: 0,
  delayPenalty: 0,
  chillerRent: 0,

  // Variante
  vTitle: "",
  vDescription: "",
  vStatus: "INITIALISEE",
});

function resetDraft() {
  editErr.value = null;

  draft.id = "";

  draft.title = "";
  draft.model = "CAB_FIXE_EXISTANT";
  draft.createdAt = "";
  draft.client = "";
  draft.status = "ENCOURS";
  draft.startDatePlanned = "";
  draft.city = "";
  draft.region = "";

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
  draft.postes = "POSTE_1";
  draft.sundayPrice = 0;
  draft.delayPenalty = 0;
  draft.chillerRent = 0;

  draft.vTitle = "";
  draft.vDescription = "";
  draft.vStatus = "INITIALISEE";
}

function openEdit(mode: EditMode, data: any) {
  resetDraft();
  editMode.value = mode;
  editOpen.value = true;

  if (mode === "pnl") {
    draft.id = String(data.id);
    draft.title = String(data.title ?? "");
    draft.model = String(data.model ?? "CAB_FIXE_EXISTANT");
    draft.createdAt = String(data.createdAt ?? "");
    draft.client = String(data.client ?? "");
    draft.status = String(data.status ?? "ENCOURS");
    draft.startDatePlanned = toIsoDateInput(data.startDatePlanned ?? data.startDate ?? "");
    draft.city = String(data.city ?? "");
    draft.region = String(data.region ?? "");
  }

  if (mode === "contract") {
    draft.id = String(data.id);
    draft.ref = String(data.ref ?? "");
    draft.dureeMois = Number(data.dureeMois ?? 0);

    // enums
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
    draft.postes = String(data.postes ?? "POSTE_1");

    // numbers
    draft.sundayPrice = Number(data.sundayPrice ?? 0);
    draft.delayPenalty = Number(data.delayPenalty ?? 0);
    draft.chillerRent = Number(data.chillerRent ?? 0);
  }

  if (mode === "variant") {
    draft.id = String(data.id);
    draft.vTitle = String(data.title ?? "");
    draft.vDescription = String(data.description ?? "");
    draft.vStatus = String(data.status ?? "INITIALISEE");
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
      // SAFE payload (pour éviter erreurs backend si champs non gérés)
      // Quand ton API supporte startDatePlanned/region => on activera l'envoi.
      const payload = {
        title: draft.title,
        client: draft.client,
        city: draft.city,
        status: draft.status,
        model: draft.model,
        // startDatePlanned: draft.startDatePlanned || null,
        // region: draft.region || null,
      };
      await apiJson(`/pnls/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }

    if (editMode.value === "contract") {
      // enums -> string
      await apiJson(`/contracts/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ref: draft.ref,
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
          postes: draft.postes,

          sundayPrice: Number(draft.sundayPrice ?? 0),
          delayPenalty: Number(draft.delayPenalty ?? 0),
          chillerRent: Number(draft.chillerRent ?? 0),
        }),
      });
    }

    if (editMode.value === "variant") {
      await apiJson(`/variants/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.vTitle,
          description: draft.vDescription,
          status: draft.vStatus,
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
   Action placeholders
========================================================= */
function createPnl() {
  console.log("TODO: create P&L (wizard pnl -> contract -> variant)");
}
function pnlArchive(pnlId: string) {
  console.log("TODO: archive pnl", pnlId);
}
function contractArchive(contractId: string) {
  console.log("TODO: archive contract", contractId);
}
function variantArchive(variantId: string) {
  console.log("TODO: archive variant", variantId);
}
</script>

<template>
  <div class="page">
    <div class="header">
      <div class="titleBlock">
        <h1>Mes P&amp;L</h1>
        <div class="sub">Hiérarchie : P&amp;L → Contrats → Variantes</div>
      </div>

      <div class="headerActions">
        <button class="btn btn--ghost" @click="collapseAll">Tout réduire</button>
        <button class="btn btn--ghost" @click="store.loadPnls?.()">Recharger</button>
        <button class="btn btn--primary" @click="createPnl">+ Créer un P&amp;L</button>
      </div>
    </div>

    <div class="toolbar card">
      <div class="search">
        <span class="icon">⌕</span>
        <input class="input" v-model="q" placeholder="Rechercher (titre, client, modèle, ville, statut)…" />
      </div>

      <div class="sort">
        <div class="field">
          <div class="label">Trier par</div>
          <select class="select" v-model="sortKey">
            <option value="createdAt">Date</option>
            <option value="title">Titre</option>
            <option value="city">Ville</option>
            <option value="status">Statut</option>
          </select>
        </div>

        <div class="field">
          <div class="label">Ordre</div>
          <select class="select" v-model="sortDir">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="filtered.length === 0" class="card empty">Aucun P&amp;L trouvé.</div>

      <div v-for="p in filtered" :key="p.id" class="card pnl" :class="{ activePnl: p.id === activePnlId }">
        <div class="row pnlRow">
          <button class="disclosure" @click="togglePnl(p.id)" :title="isOpen(p.id) ? 'Réduire' : 'Déplier'">
            {{ isOpen(p.id) ? "▾" : "▸" }}
          </button>

          <div class="main">
            <div class="line1">
              <div class="name">{{ p.title }}</div>
              <span :class="tagClass(p.status)">{{ p.status ?? "—" }}</span>
              <span v-if="p.id === activePnlId" class="pill">ACTIF</span>
            </div>

            <div class="line2">
              <span class="meta"><span class="k">Client :</span> <b>{{ p.client ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="k">Modèle :</span> <b>{{ labelFromEnum(PNL_MODELS as any, p.model) }}</b></span>
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
            <button class="btn btn--ghost danger" @click="pnlArchive(p.id)">Archiver</button>
          </div>
        </div>

        <div v-show="isOpen(p.id)" class="children">
          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div v-for="c in (p.contracts ?? [])" :key="c.id" class="contract" :class="{ activeContract: c.id === activeContractId }">
            <div class="row contractRow">
              <div class="tree">
                <div class="branch"></div>
                <div class="node"></div>
              </div>

              <div class="main">
                <div class="line1">
                  <div class="name name--sm">Contrat</div>
                  <span class="meta">
                    <span class="k">Réf :</span> <b>{{ c.ref ?? "-" }}</b>
                    <span class="dot">•</span>
                    <span class="k">Durée :</span> <b>{{ c.dureeMois ?? 0 }}</b> mois
                  </span>
                  <span v-if="c.id === activeContractId" class="pill pill--blue">ACTIF</span>
                </div>

                <div class="line2">
                  <span class="meta"><span class="k">Cab :</span> <b>{{ labelFromEnum(CHARGE_3 as any, c.cab) }}</b></span>
                  <span class="dot">•</span>
                  <span class="meta"><span class="k">Transport :</span> <b>{{ labelFromEnum(CHARGE_3 as any, c.transport) }}</b></span>
                  <span class="idTiny">ID : {{ idShort(c.id) }}</span>
                </div>
              </div>

              <div class="actions">
                <button class="btn btn--soft" @click="openView('contract', c)">Visualiser</button>
                <button class="btn btn--soft" @click="openEdit('contract', c)">Modifier</button>
                <button class="btn btn--ghost danger" @click="contractArchive(c.id)">Archiver</button>
              </div>
            </div>

            <div class="variants">
              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>

              <div v-for="v in (c.variants ?? [])" :key="v.id" class="row variantRow" :class="{ activeVariant: v.id === activeVariantId }">
                <div class="tree tree--deep">
                  <div class="branch"></div>
                  <div class="node"></div>
                </div>

                <div class="main">
                  <div class="line1">
                    <div class="name name--xs">{{ v.title ?? "Variante" }}</div>
                    <span :class="tagClass(v.status)">{{ labelFromEnum(VARIANT_STATUS as any, v.status) }}</span>
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
                  <button class="btn btn--ghost danger" @click="variantArchive(v.id)">Archiver</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- MODALS -->
    <Teleport to="body">
      <!-- VIEW -->
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
            <!-- PNL VIEW -->
            <div v-if="viewMode === 'pnl'" class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Client</div><div class="v"><b>{{ viewData?.client ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Modèle</div><div class="v"><b>{{ labelFromEnum(PNL_MODELS as any, viewData?.model) }}</b></div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v"><b>{{ labelFromEnum(PNL_STATUS as any, viewData?.status) }}</b></div></div>
              <div class="rowKV"><div class="k">Ville</div><div class="v"><b>{{ viewData?.city ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Région</div><div class="v"><b>{{ viewData?.region ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Démarrage prévu</div><div class="v"><b>{{ fmtDate(viewData?.startDatePlanned ?? viewData?.startDate) }}</b></div></div>
              <div class="rowKV"><div class="k">Créé le</div><div class="v"><b>{{ fmtDate(viewData?.createdAt) }}</b></div></div>
            </div>

            <!-- CONTRACT VIEW (compact grid) -->
            <div v-else-if="viewMode === 'contract'" class="kv">
              <div class="rowKV"><div class="k">Réf</div><div class="v"><b>{{ viewData?.ref ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Durée (mois)</div><div class="v"><b>{{ viewData?.dureeMois ?? 0 }}</b></div></div>

              <div class="divider"></div>

              <div class="grid2">
                <div class="rowKV"><div class="k">Cab</div><div class="v"><b>{{ labelFromEnum(CHARGE_3 as any, viewData?.cab) }}</b></div></div>
                <div class="rowKV"><div class="k">Installation</div><div class="v"><b>{{ labelFromEnum(CHARGE_3 as any, viewData?.installation) }}</b></div></div>

                <div class="rowKV"><div class="k">Génie civil</div><div class="v"><b>{{ labelFromEnum(GENIE_CIVIL_4 as any, viewData?.genieCivil) }}</b></div></div>
                <div class="rowKV"><div class="k">Transport</div><div class="v"><b>{{ labelFromEnum(CHARGE_3 as any, viewData?.transport) }}</b></div></div>

                <div class="rowKV"><div class="k">Terrain</div><div class="v"><b>{{ labelFromEnum(TERRAIN_4 as any, viewData?.terrain) }}</b></div></div>
                <div class="rowKV"><div class="k">Matière 1ère</div><div class="v"><b>{{ labelFromEnum(MATIERE_3 as any, viewData?.matierePremiere) }}</b></div></div>

                <div class="rowKV"><div class="k">Maintenance</div><div class="v"><b>{{ labelFromEnum(MAINTENANCE_4 as any, viewData?.maintenance) }}</b></div></div>
                <div class="rowKV"><div class="k">Chargeuse</div><div class="v"><b>{{ labelFromEnum(CHARGE_3 as any, viewData?.chargeuse) }}</b></div></div>

                <div class="rowKV"><div class="k">Br. Eau</div><div class="v"><b>{{ labelFromEnum(EAU_ELEC_BRANCH_3 as any, viewData?.branchementEau) }}</b></div></div>
                <div class="rowKV"><div class="k">Conso Eau</div><div class="v"><b>{{ labelFromEnum(CONSOMMATION_2 as any, viewData?.consoEau) }}</b></div></div>

                <div class="rowKV"><div class="k">Br. Élec</div><div class="v"><b>{{ labelFromEnum(EAU_ELEC_BRANCH_3 as any, viewData?.branchementElec) }}</b></div></div>
                <div class="rowKV"><div class="k">Conso Élec</div><div class="v"><b>{{ labelFromEnum(CONSOMMATION_2 as any, viewData?.consoElec) }}</b></div></div>

                <div class="rowKV"><div class="k">Postes</div><div class="v"><b>{{ labelFromEnum(POSTES_2 as any, viewData?.postes) }}</b></div></div>
                <div class="rowKV"><div class="k">Dim./fériés</div><div class="v"><b>{{ money(viewData?.sundayPrice) }}</b></div></div>

                <div class="rowKV"><div class="k">Pénalité délai</div><div class="v"><b>{{ money(viewData?.delayPenalty) }}</b></div></div>
                <div class="rowKV"><div class="k">Location chiller</div><div class="v"><b>{{ money(viewData?.chillerRent) }}</b></div></div>
              </div>
            </div>

            <!-- VARIANT VIEW -->
            <div v-else class="kv">
              <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Statut</div><div class="v"><b>{{ labelFromEnum(VARIANT_STATUS as any, viewData?.status) }}</b></div></div>
              <div class="rowKV"><div class="k">Description</div><div class="v"><b>{{ viewData?.description ?? "-" }}</b></div></div>
              <div class="rowKV"><div class="k">Contrat</div><div class="v"><b>{{ idShort(viewData?.contractId) }}</b></div></div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" @click="closeView()">Fermer</button>
          </div>
        </div>
      </div>

      <!-- EDIT -->
      <div v-if="editOpen" class="modalOverlay" @click.self="closeEdit()">
        <div class="modal">
          <div class="modalHead">
            <div class="modalTitle">
              <b v-if="editMode === 'pnl'">Modifier — P&amp;L</b>
              <b v-else-if="editMode === 'contract'">Modifier — Contrat</b>
              <b v-else>Modifier — Variante</b>
              <div class="modalSub idTiny">ID : {{ idShort(draft.id) }}</div>
            </div>
            <button class="xBtn" @click="closeEdit()">✕</button>
          </div>

          <div class="modalBody">
            <div v-if="editErr" class="alert"><b>Erreur :</b> {{ editErr }}</div>

            <!-- PNL EDIT -->
            <div v-if="editMode === 'pnl'" class="formGrid">
              <div class="f f--full">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre du P&L" />
              </div>

              <div class="f">
                <div class="k">Modèle</div>
                <select class="in" v-model="draft.model">
                  <option v-for="o in PNL_MODELS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.status">
                  <option v-for="o in PNL_STATUS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Client</div>
                <input class="in" v-model="draft.client" placeholder="Client" />
              </div>

              <div class="f">
                <div class="k">Ville</div>
                <input class="in" v-model="draft.city" placeholder="Ville" />
              </div>

              <div class="f">
                <div class="k">Région</div>
                <input class="in" v-model="draft.region" placeholder="Région" />
                <div class="hint">Affiché ici. Active l’enregistrement côté API quand ta table/route est prête.</div>
              </div>

              <div class="f">
                <div class="k">Date prévue démarrage</div>
                <input class="in" type="date" v-model="draft.startDatePlanned" />
                <div class="hint">Affiché ici. Active l’enregistrement côté API quand prêt.</div>
              </div>

              <div class="f">
                <div class="k">Date de création</div>
                <input class="in in--disabled" :value="fmtDate(draft.createdAt)" disabled />
              </div>
            </div>

            <!-- CONTRACT EDIT (ENUMS) -->
            <div v-else-if="editMode === 'contract'" class="formGrid">
              <div class="f">
                <div class="k">Réf</div>
                <input class="in" v-model="draft.ref" placeholder="Référence contrat" />
              </div>
              <div class="f">
                <div class="k">Durée (mois)</div>
                <input class="in r" type="number" step="1" v-model.number="draft.dureeMois" />
              </div>

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

              <div class="f">
                <div class="k">Branchement Eau</div>
                <select class="in" v-model="draft.branchementEau">
                  <option v-for="o in EAU_ELEC_BRANCH_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Consommation Eau</div>
                <select class="in" v-model="draft.consoEau">
                  <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Branchement Électricité</div>
                <select class="in" v-model="draft.branchementElec">
                  <option v-for="o in EAU_ELEC_BRANCH_3" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f">
                <div class="k">Consommation Électricité</div>
                <select class="in" v-model="draft.consoElec">
                  <option v-for="o in CONSOMMATION_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Nombre de postes</div>
                <select class="in" v-model="draft.postes">
                  <option v-for="o in POSTES_2" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div class="f">
                <div class="k">Prix complémentaire (dim./fériés)</div>
                <input class="in r" type="number" step="0.01" v-model.number="draft.sundayPrice" />
              </div>

              <div class="f">
                <div class="k">Forfait retard (délai dépassé)</div>
                <input class="in r" type="number" step="0.01" v-model.number="draft.delayPenalty" />
              </div>

              <div class="f">
                <div class="k">Location Chiller</div>
                <input class="in r" type="number" step="0.01" v-model.number="draft.chillerRent" />
              </div>

              <div class="f f--full hint">
                Articles supplémentaires : on les ajoutera après (table items ordonnée côté contrat).
              </div>
            </div>

            <!-- VARIANT EDIT -->
            <div v-else class="formGrid">
              <div class="f f--full">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.vTitle" placeholder="Titre de la variante" />
              </div>
              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.vStatus">
                  <option v-for="o in VARIANT_STATUS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div class="f f--full">
                <div class="k">Description</div>
                <textarea class="in" rows="4" v-model="draft.vDescription" placeholder="Description"></textarea>
              </div>
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" :disabled="editBusy" @click="closeEdit()">Annuler</button>
            <button class="btn btn--primary" :disabled="editBusy" @click="saveEdit()">
              {{ editBusy ? "Enregistrement…" : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f6f7f9;
  min-height: 100%;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.titleBlock h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.2px;
}
.sub { margin-top: 4px; font-size: 12px; color: #6b7280; }
.headerActions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.card {
  background: #fff;
  border: 1px solid #e6e8ee;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 1px 0 rgba(17, 24, 39, 0.03);
}
.card--error { border-color: #fecaca; background: #fff5f5; }
.empty { text-align: center; color: #6b7280; }

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 12px;
  flex-wrap: wrap;
}
.search {
  flex: 1;
  min-width: 280px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e6e8ee;
  border-radius: 12px;
  padding: 8px 10px;
  background: #fafbfc;
}
.icon { color: #6b7280; font-size: 12px; }
.input {
  border: 0;
  outline: 0;
  background: transparent;
  width: 100%;
  font-size: 13px;
}
.sort { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 11px; color: #6b7280; }
.select {
  border: 1px solid #e6e8ee;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 13px;
  background: #fff;
}

.list { display: flex; flex-direction: column; gap: 10px; }
.pnl { background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%); }
.pnl.activePnl { border-color: #bbf7d0; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.10); }

.row { display: flex; gap: 10px; align-items: center; }
.pnlRow { align-items: stretch; }

.disclosure {
  width: 34px;
  height: 34px;
  border: 1px solid #e6e8ee;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  color: #374151;
}
.disclosure:hover { background: #f9fafb; }

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.name { font-weight: 700; font-size: 14px; color: #111827; }
.name--sm { font-size: 13px; }
.name--xs { font-size: 12.5px; }

.line2 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
}
.meta .k { color: #6b7280; font-weight: 500; }
.dot { color: #d1d5db; }
.idTiny { margin-left: auto; color: #9ca3af; font-size: 11px; }

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid #e6e8ee;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover { background: #f9fafb; }
.btn--primary { background: #111827; color: #fff; border-color: #111827; }
.btn--primary:hover { background: #0b1220; }
.btn--ghost { background: transparent; }
.btn--soft { background: #f3f4f6; border-color: #e5e7eb; }
.btn--mini { padding: 7px 9px; }
.danger { color: #b91c1c; border-color: #fecaca; background: #fff5f5; }
.danger:hover { background: #ffecec; }

.pill {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #111827;
}
.pill--blue { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
.pill--green { background: #ecfdf5; border-color: #bbf7d0; color: #065f46; }

.tag {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
}
.tag--arch { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
.tag--off { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.tag--on { background: #ecfdf5; border-color: #bbf7d0; color: #065f46; }

.children { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.contract { border: 1px dashed #e5e7eb; border-radius: 14px; padding: 10px; background: #fff; }
.contract.activeContract { border-color: #bfdbfe; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10); }
.muted { color: #6b7280; font-size: 12px; }
.indent2 { padding-left: 38px; }
.variants { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.variantRow { border: 1px solid #eef2f7; border-radius: 14px; padding: 10px; background: #fcfcfd; }
.variantRow.activeVariant { border-color: #bbf7d0; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.10); }

.tree { width: 28px; position: relative; display: flex; align-items: center; justify-content: center; }
.tree .branch {
  position: absolute;
  left: 50%;
  top: -10px;
  bottom: -10px;
  width: 2px;
  background: #e5e7eb;
  transform: translateX(-50%);
}
.tree .node { width: 10px; height: 10px; border-radius: 999px; background: #fff; border: 2px solid #d1d5db; }
.tree--deep { width: 38px; }

/* =========================
   MODAL: compact + scroll inside
========================= */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  z-index: 10000;
}

.modal {
  width: min(880px, 100%);
  max-height: calc(100vh - 28px); /* ✅ prevents overflow top/bottom */
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden; /* header/footer sticky works with body scroll */
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}

.modalHead {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  background: #fafafa;
  border-bottom: 1px solid #eef2f7;
}

.modalTitle { display: flex; flex-direction: column; gap: 3px; }
.modalSub { color: #9ca3af; font-size: 11px; }

.xBtn {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  width: 34px;
  height: 34px;
  cursor: pointer;
}
.xBtn:hover { background: #f9fafb; }

.modalBody {
  padding: 12px 14px;
  overflow: auto;         /* ✅ internal scroll */
  flex: 1 1 auto;
}

.modalFoot {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #eef2f7;
  background: #fcfcfd;
}

/* View */
.kv { display: flex; flex-direction: column; gap: 10px; }
.rowKV {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 10px;
  align-items: center;
}
.rowKV .k { font-size: 12px; color: #6b7280; }
.rowKV .v { font-size: 13px; color: #111827; }
.divider { height: 1px; background: #eef2f7; margin: 6px 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }

/* Edit form */
.alert {
  padding: 10px 12px;
  border: 1px solid #fecaca;
  background: #fff5f5;
  border-radius: 12px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #991b1b;
}
.formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.f { display: flex; flex-direction: column; gap: 6px; }
.f--full { grid-column: 1 / -1; }
.f .k { font-size: 12px; color: #6b7280; }
.in {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.in:focus { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12); }
.in--disabled { background: #f9fafb; color: #6b7280; }
.r { text-align: right; }
.hint { font-size: 11px; color: #9ca3af; }

@media (max-width: 920px) {
  .formGrid { grid-template-columns: 1fr; }
  .grid2 { grid-template-columns: 1fr; }
  .rowKV { grid-template-columns: 130px 1fr; }
}
</style>
