<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";

const router = useRouter();
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
function fmtDate(v: any) {
  try {
    if (!v) return "-";
    const d = new Date(v);
    return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return "-";
  }
}

function tagClass(status?: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("ARCH")) return "tag tag--arch";
  if (s.includes("TERM") || s.includes("CLOT")) return "tag tag--off";
  if (s.includes("ENCO") || s.includes("ACT")) return "tag tag--on";
  return "tag";
}

function normalize(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

/* =========================
   Data (search + sort)
========================= */
const pnls = computed<any[]>(() => store.pnls ?? []);

const filtered = computed<any[]>(() => {
  const query = normalize(q.value);
  let rows = pnls.value;

  if (query) {
    rows = rows.filter((p) => {
      const title = normalize(p.title);
      const model = normalize(p.model); // "Type"
      const city = normalize(p.city);
      const status = normalize(p.status);
      return (
        title.includes(query) ||
        model.includes(query) ||
        city.includes(query) ||
        status.includes(query)
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

  return rows;
});

/* =========================
   Actions (UI only)
========================= */
function createPnl() {
  console.log("TODO: create P&L");
  // plus tard: router.push("/pnl/new") ou ouverture modal
}

function pnlEdit(pnlId: string) {
  console.log("TODO: edit pnl", pnlId);
}
function pnlView(pnlId: string) {
  console.log("TODO: view pnl details", pnlId);
}
function pnlArchive(pnlId: string) {
  console.log("TODO: archive pnl", pnlId);
}
function pnlAddContract(pnlId: string) {
  console.log("TODO: add contract", pnlId);
}

function contractView(contractId: string) {
  console.log("TODO: view contract", contractId);
}
function contractEdit(contractId: string) {
  console.log("TODO: edit contract", contractId);
}
function contractArchive(contractId: string) {
  console.log("TODO: archive contract", contractId);
}
function contractDuplicate(contractId: string) {
  console.log("TODO: duplicate contract", contractId);
}
function contractCreateVariant(contractId: string) {
  console.log("TODO: create variant for contract", contractId);
}

function variantView(variantId: string) {
  console.log("TODO: view variant", variantId);
}
function variantEdit(variantId: string) {
  console.log("TODO: edit variant", variantId);
}
function variantArchive(variantId: string) {
  console.log("TODO: archive variant", variantId);
}
function variantDuplicate(variantId: string) {
  console.log("TODO: duplicate variant", variantId);
}

function openVariant(pnlId: string, contractId: string, variantId: string) {
  // rendre la variante active + sync header etc (via store)
  if ((store as any).setActivePnl) (store as any).setActivePnl(pnlId);
  if ((store as any).setActiveContract) (store as any).setActiveContract(contractId);
  if ((store as any).setActiveVariant) (store as any).setActiveVariant(variantId);
  else console.log("TODO: setActiveVariant missing in store", variantId);

  // optionnel: naviguer vers page Details / Editor
  // router.push("/details");
  console.log("Variant opened", { pnlId, contractId, variantId });
}

function goDetails() {
  // si tu as DetailsPage.vue liée à "Details"
  router.push({ name: "Details" }).catch(() => {});
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="titleBlock">
        <h1>Mes P&amp;L</h1>
        <div class="sub">Gérer P&amp;L → Contrats → Variantes</div>
      </div>

      <div class="headerActions">
        <button class="btn btn--ghost" @click="collapseAll">Tout réduire</button>
        <button class="btn btn--primary" @click="createPnl">+ Créer un P&amp;L</button>
      </div>
    </div>

    <!-- TOOLBAR -->
    <div class="toolbar card">
      <div class="search">
        <span class="icon">⌕</span>
        <input class="input" v-model="q" placeholder="Rechercher (titre, type, ville, statut)…" />
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

        <button class="btn btn--ghost" @click="store.loadPnls?.()">
          Recharger
        </button>

        <button class="btn btn--ghost" @click="goDetails">
          Détails (variante active)
        </button>
      </div>
    </div>

    <!-- LIST -->
    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="filtered.length === 0" class="card empty">
        Aucun P&amp;L trouvé.
      </div>

      <div v-for="p in filtered" :key="p.id" class="card pnl">
        <!-- PNL ROW -->
        <div class="row pnlRow">
          <button class="disclosure" @click="togglePnl(p.id)" :title="isOpen(p.id) ? 'Réduire' : 'Déplier'">
            {{ isOpen(p.id) ? "▾" : "▸" }}
          </button>

          <div class="main">
            <div class="line1">
              <div class="name">{{ p.title }}</div>
              <span :class="tagClass(p.status)">{{ p.status ?? "—" }}</span>
            </div>

            <div class="line2">
              <!-- ✅ P&L: Type - ville -->
              <span class="meta"><b>{{ p.model ?? "Type ?" }}</b> — {{ p.city ?? "-" }}</span>
              <span class="dot">•</span>
              <span class="meta">Créé : {{ fmtDate(p.createdAt) }}</span>
              <template v-if="p.client">
                <span class="dot">•</span>
                <span class="meta">Client : {{ p.client }}</span>
              </template>
            </div>
          </div>

          <div class="actions">
            <button class="iconBtn" title="Détails" @click="pnlView(p.id)">👁️</button>
            <button class="iconBtn" title="Éditer" @click="pnlEdit(p.id)">✏️</button>
            <button class="iconBtn" title="Archiver" @click="pnlArchive(p.id)">🗄️</button>
            <button class="btn btn--soft" @click="pnlAddContract(p.id)">+ Contrat</button>
          </div>
        </div>

        <!-- CHILDREN -->
        <div v-show="isOpen(p.id)" class="children">
          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div v-for="c in (p.contracts ?? [])" :key="c.id" class="contract">
            <div class="row contractRow">
              <div class="indent"></div>

              <div class="main">
                <div class="line1">
                  <!-- ✅ Contrat: titre au lieu de référence/id -->
                  <div class="name name--sm">{{ c.title ?? `Contrat` }}</div>
                  <span class="muted">— {{ c.dureeMois ?? 0 }} mois</span>
                </div>

                <div class="line2">
                  <!-- ✅ remplacements demandés -->
                  <span class="meta">Installation : <b>{{ c.installation ?? "-" }}</b></span>
                  <span class="dot">•</span>
                  <span class="meta">Terrain : <b>{{ c.terrain ?? "-" }}</b></span>
                </div>
              </div>

              <div class="actions">
                <button class="iconBtn" title="Visualiser" @click="contractView(c.id)">👁️</button>
                <button class="iconBtn" title="Éditer" @click="contractEdit(c.id)">✏️</button>
                <button class="iconBtn" title="Archiver" @click="contractArchive(c.id)">🗄️</button>
                <button class="iconBtn" title="Dupliquer" @click="contractDuplicate(c.id)">⎘</button>
                <button class="btn btn--soft" @click="contractCreateVariant(c.id)">+ Variante</button>
              </div>
            </div>

            <!-- VARIANTS -->
            <div class="variants">
              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>

              <div v-for="v in (c.variants ?? [])" :key="v.id" class="row variantRow">
                <div class="indent2"></div>

                <div class="main">
                  <div class="line1">
                    <div class="name name--xs">{{ v.title ?? "Variante" }}</div>
                    <span :class="tagClass(v.status)">{{ v.status ?? "—" }}</span>
                  </div>
                  <div v-if="v.description" class="line2">
                    <span class="meta">{{ v.description }}</span>
                  </div>
                </div>

                <div class="actions">
                  <button class="btn btn--primary btn--mini" @click="openVariant(p.id, c.id, v.id)">
                    Ouvrir
                  </button>
                  <button class="iconBtn" title="Visualiser" @click="variantView(v.id)">👁️</button>
                  <button class="iconBtn" title="Éditer" @click="variantEdit(v.id)">✏️</button>
                  <button class="iconBtn" title="Archiver" @click="variantArchive(v.id)">🗄️</button>
                  <button class="iconBtn" title="Dupliquer" @click="variantDuplicate(v.id)">⎘</button>
                </div>
              </div>
            </div>
          </div>
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

/* List rows */
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
.disclosure {
  width: 34px;
  height: 34px;
  border: 1px solid #e6e8ee;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  color: #374151;
}
.disclosure:hover {
  background: #f9fafb;
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
  font-weight: 800;
  font-size: 13px;
  color: #111827;
}
.name--sm { font-size: 12.5px; font-weight: 800; }
.name--xs { font-size: 12px; font-weight: 800; }

.meta {
  font-size: 12px;
  color: #374151;
}
.muted {
  font-size: 12px;
  color: #6b7280;
}
.dot { color: #d1d5db; }

/* Actions */
.actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.iconBtn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid #e6e8ee;
  background: #fff;
  cursor: pointer;
}
.iconBtn:hover { background: #f9fafb; }

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

.btn--ghost {
  background: transparent;
}
.btn--ghost:hover { background: #ffffff; }

.btn--soft {
  background: #f6f7f9;
}
.btn--soft:hover { background: #eef0f4; }

.btn--mini {
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12px;
}

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

/* Children tree */
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
.contractRow {
  align-items: flex-start;
}
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
  background: #fff;
}

/* Indents */
.indent { width: 12px; }
.indent2 { width: 30px; }
.indent2.muted { margin-left: 30px; }

@media (max-width: 900px) {
  .actions { justify-content: flex-start; }
}
</style>
