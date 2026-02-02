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

/* =========================
   UI STATE
========================= */
const q = ref("");
const sortKey = ref<"title" | "city" | "status" | "createdAt">("createdAt");
const sortDir = ref<"asc" | "desc">("desc");
const open = reactive<Record<string, boolean>>({}); // pnlId -> open/closed

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

/* =========================
   Helpers
========================= */
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
function tagClass(status?: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("ARCH")) return "tag tag--arch";
  if (s.includes("TERM") || s.includes("CLOT")) return "tag tag--off";
  if (s.includes("ENCO") || s.includes("ACT")) return "tag tag--on";
  return "tag";
}

/* =========================
   Active ids
========================= */
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

/* =========================
   Data (search + sort + pin)
========================= */
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
      return title.includes(query) || model.includes(query) || city.includes(query) || status.includes(query) || client.includes(query);
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

  // ✅ pin active P&L on top (if in list)
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

/* =========================
   NAV open variant
========================= */
function openVariant(pnlId: string, contractId: string, variantId: string) {
  if ((store as any).setActivePnl) (store as any).setActivePnl(pnlId);
  if ((store as any).setActiveContract) (store as any).setActiveContract(contractId);
  if ((store as any).setActiveVariant) (store as any).setActiveVariant(variantId);
}

/* =========================
   VIEW MODAL
========================= */
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

/* =========================
   EDIT MODAL
========================= */
type EditMode = "pnl" | "contract" | "variant";
const editOpen = ref(false);
const editMode = ref<EditMode>("pnl");
const editBusy = ref(false);
const editErr = ref<string | null>(null);

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
  terrain: "",
  installation: "",

  // variant
  description: "",
});

function resetDraft() {
  editErr.value = null;
  draft.id = "";
  draft.title = "";
  draft.client = "";
  draft.model = "";
  draft.city = "";
  draft.status = "";
  draft.createdAt = "";
  draft.ref = "";
  draft.dureeMois = 0;
  draft.terrain = "";
  draft.installation = "";
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
    draft.dureeMois = Number(data.dureeMois ?? 0);
    draft.terrain = String(data.terrain ?? "");
    draft.installation = String(data.installation ?? "");
    draft.status = String(data.status ?? "");
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
      // ✅ modèle non modifiable => on n’envoie pas model
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
      await apiJson(`/contracts/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ref: draft.ref,
          dureeMois: Number(draft.dureeMois ?? 0),
          terrain: draft.terrain ? draft.terrain : null,
          installation: draft.installation ? draft.installation : null,
          status: draft.status,
        }),
      });
    }

    if (editMode.value === "variant") {
      // backend: PUT /variants/:id (déjà chez toi)
      await apiJson(`/variants/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title,
          status: draft.status,
          // description seulement si ton schema l’a (sinon ignore côté backend)
          description: draft.description,
        }),
      });
    }

    const keepPnl = activePnlId.value;
    const keepVar = activeVariantId.value;

    await store.loadPnls?.();

    // restore active (si possible)
    if (keepPnl && (store as any).setActivePnl) (store as any).setActivePnl(keepPnl);
    if (keepVar && (store as any).setActiveVariant) (store as any).setActiveVariant(keepVar);

    closeEdit();
  } catch (e: any) {
    editErr.value = e?.message ?? String(e);
  } finally {
    editBusy.value = false;
  }
}

/* =========================
   Action placeholders (create / archive)
========================= */
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
    <!-- HEADER -->
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

    <!-- TOOLBAR -->
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

    <!-- LIST -->
    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="filtered.length === 0" class="card empty">Aucun P&amp;L trouvé.</div>

      <div
        v-for="p in filtered"
        :key="p.id"
        class="card pnl"
        :class="{ activePnl: p.id === activePnlId }"
      >
        <!-- PNL ROW -->
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
            <button class="btn btn--ghost danger" @click="pnlArchive(p.id)">Archiver</button>
          </div>
        </div>

        <!-- CHILDREN -->
        <div v-show="isOpen(p.id)" class="children">
          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div
            v-for="c in (p.contracts ?? [])"
            :key="c.id"
            class="contract"
            :class="{ activeContract: c.id === activeContractId }"
          >
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
                  <span class="meta"><span class="k">Installation :</span> <b>{{ c.installation ?? "-" }}</b></span>
                  <span class="dot">•</span>
                  <span class="meta"><span class="k">Terrain :</span> <b>{{ c.terrain ?? "-" }}</b></span>
                  <span class="idTiny">ID : {{ idShort(c.id) }}</span>
                </div>
              </div>

              <div class="actions">
                <button class="btn btn--soft" @click="openView('contract', c)">Visualiser</button>
                <button class="btn btn--soft" @click="openEdit('contract', c)">Modifier</button>
                <button class="btn btn--ghost danger" @click="contractArchive(c.id)">Archiver</button>
              </div>
            </div>

            <!-- VARIANTS -->
            <div class="variants">
              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>

              <div
                v-for="v in (c.variants ?? [])"
                :key="v.id"
                class="row variantRow"
                :class="{ activeVariant: v.id === activeVariantId }"
              >
                <div class="tree tree--deep">
                  <div class="branch"></div>
                  <div class="node"></div>
                </div>

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
                  <button class="btn btn--ghost danger" @click="variantArchive(v.id)">Archiver</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

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
          <!-- PNL -->
          <div v-if="viewMode === 'pnl'" class="kv">
            <div class="rowKV"><div class="k">Titre</div><div class="v"><b>{{ viewData?.title ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Client</div><div class="v"><b>{{ viewData?.client ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Modèle</div><div class="v"><b>{{ viewData?.model ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Ville</div><div class="v"><b>{{ viewData?.city ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Statut</div><div class="v"><span :class="tagClass(viewData?.status)">{{ viewData?.status ?? "—" }}</span></div></div>
            <div class="rowKV"><div class="k">Date de création</div><div class="v"><b>{{ fmtDate(viewData?.createdAt) }}</b></div></div>
          </div>

          <!-- CONTRACT -->
          <div v-else-if="viewMode === 'contract'" class="kv">
            <div class="rowKV"><div class="k">Référence</div><div class="v"><b>{{ viewData?.ref ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Durée (mois)</div><div class="v"><b>{{ viewData?.dureeMois ?? 0 }}</b></div></div>
            <div class="rowKV"><div class="k">Terrain</div><div class="v"><b>{{ viewData?.terrain ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Installation</div><div class="v"><b>{{ viewData?.installation ?? "-" }}</b></div></div>
            <div class="rowKV"><div class="k">Statut</div><div class="v"><span :class="tagClass(viewData?.status)">{{ viewData?.status ?? "—" }}</span></div></div>
          </div>

          <!-- VARIANT -->
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

    <!-- EDIT MODAL -->
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

          <!-- EDIT PNL -->
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
                <option value="ACTIVE">ACTIVE</option>
                <option value="ENCOURS">ENCOURS</option>
                <option value="ARCHIVED">ARCHIVED</option>
                <option value="CLOSED">CLOSED</option>
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

          <!-- EDIT CONTRACT -->
          <div v-else-if="editMode === 'contract'" class="formGrid">
            <div class="f">
              <div class="k">Référence</div>
              <input class="in" v-model="draft.ref" placeholder="REF / Code contrat" />
            </div>
            <div class="f">
              <div class="k">Durée (mois)</div>
              <input class="in r" type="number" step="1" v-model.number="draft.dureeMois" />
            </div>
            <div class="f">
              <div class="k">Terrain</div>
              <input class="in" v-model="draft.terrain" placeholder="Ex: CHU Agadir" />
            </div>
            <div class="f">
              <div class="k">Installation</div>
              <input class="in" v-model="draft.installation" placeholder="Ex: Fixe / Mobile" />
            </div>
            <div class="f">
              <div class="k">Statut</div>
              <select class="in" v-model="draft.status">
                <option value="ACTIVE">ACTIVE</option>
                <option value="ENCOURS">ENCOURS</option>
                <option value="ARCHIVED">ARCHIVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          </div>

          <!-- EDIT VARIANT -->
          <div v-else class="formGrid">
            <div class="f">
              <div class="k">Titre</div>
              <input class="in" v-model="draft.title" placeholder="Titre de la variante" />
            </div>
            <div class="f">
              <div class="k">Statut</div>
              <select class="in" v-model="draft.status">
                <option value="ACTIVE">ACTIVE</option>
                <option value="ENCOURS">ENCOURS</option>
                <option value="ARCHIVED">ARCHIVED</option>
                <option value="CLOSED">CLOSED</option>
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
            {{ editBusy ? "Enregistrement…" : "Enregistrer" }}
          </button>
        </div>
      </div>
    </div>

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

/* Header */
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
.sub {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}
.headerActions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

/* Card */
.card {
  background: #fff;
  border: 1px solid #e6e8ee;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 1px 0 rgba(17, 24, 39, 0.03);
}
.card--error {
  border-color: #fecaca;
  background: #fff5f5;
}
.empty {
  text-align: center;
  color: #6b7280;
}

/* Toolbar */
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
.icon {
  color: #6b7280;
  font-size: 12px;
}
.input {
  border: 0;
  outline: 0;
  background: transparent;
  width: 100%;
  font-size: 13px;
}
.sort {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 11px;
  color: #6b7280;
}
.select {
  border: 1px solid #e6e8ee;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 13px;
  background: #fff;
}

/* List */
.list { display: flex; flex-direction: column; gap: 10px; }

.pnl {
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}
.pnl.activePnl {
  border-color: #bbf7d0;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.10);
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
}
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
  font-weight: 900;
  font-size: 13px;
  color: #111827;
}
.name--sm { font-size: 12.5px; font-weight: 900; }
.name--xs { font-size: 12px; font-weight: 900; }

.meta { font-size: 12px; color: #374151; }
.k { color: #6b7280; font-weight: 600; }
.muted { font-size: 12px; color: #6b7280; }
.dot { color: #d1d5db; }
.idTiny { font-size: 11px; color: #9ca3af; margin-left: 6px; }

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Buttons */
.btn {
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13px;
  border: 1px solid #e6e8ee;
  background: #fff;
  cursor: pointer;
}
.btn:hover { background: #f9fafb; }
.btn--primary {
  background: #0b7a35;
  border-color: #0b7a35;
  color: #fff;
}
.btn--primary:hover { background: #096a2e; }
.btn--ghost { background: transparent; }
.btn--ghost:hover { background: #ffffff; }
.btn--soft { background: #f6f7f9; }
.btn--soft:hover { background: #eef0f4; }
.btn--mini { padding: 7px 10px; border-radius: 10px; font-size: 12px; }
.danger { border-color: #fecaca; color: #b91c1c; }

/* Tags */
.tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e6e8ee;
  color: #374151;
  background: #fafbfc;
}
.tag--on {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
.tag--arch, .tag--off {
  border-color: #e5e7eb;
  background: #f9fafb;
  color: #6b7280;
}

/* Pills (active markers) */
.pill {
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.2px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #111827;
}
.pill--green {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
.pill--blue {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

/* Tree / children */
.children {
  margin-top: 10px;
  border-top: 1px dashed #e6e8ee;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.contract {
  border: 1px solid #eef0f4;
  border-radius: 12px;
  padding: 10px;
  background: #fcfcfd;
}
.contract.activeContract {
  border-color: #bfdbfe;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10);
}
.contractRow { align-items: flex-start; }

.variants {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.variantRow {
  padding: 8px 10px;
  border: 1px solid #eef0f4;
  border-radius: 12px;
  background: #ffffff;
}
.variantRow.activeVariant {
  border-color: #bbf7d0;
  background: #fbfffb;
}

.indent2 { margin-left: 38px; }

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
  background: #e5e7eb;
  transform: translateX(-50%);
}
.tree .node {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #fff;
  border: 2px solid #d1d5db;
}
.tree--deep { width: 38px; }
.tree--deep .branch { background: #e5e7eb; }

/* Modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}
.modal {
  width: min(720px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.modalHead {
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

.modalBody { padding: 14px; }
.modalFoot {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #eef2f7;
  background: #fcfcfd;
}

/* View KV layout (tight label/value, no big gap) */
.kv { display: flex; flex-direction: column; gap: 10px; }
.rowKV {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 12px;
  align-items: start;
}
.rowKV .k { font-size: 12px; color: #6b7280; font-weight: 700; }
.rowKV .v { font-size: 12.5px; color: #111827; }

/* Form */
.formGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.f { display: flex; flex-direction: column; gap: 6px; }
.f--full { grid-column: 1 / -1; }
.in {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.in:focus { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99,102,241,0.10); }
.in--disabled { background: #f9fafb; color: #6b7280; }
.r { text-align: right; }

.alert {
  border: 1px solid #fecaca;
  background: #fff5f5;
  color: #991b1b;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 12px;
}

@media (max-width: 900px) {
  .actions { justify-content: flex-start; }
  .rowKV { grid-template-columns: 140px 1fr; }
  .formGrid { grid-template-columns: 1fr; }
}
</style>
