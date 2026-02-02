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
    return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "long", day: "2-digit" }).format(d);
  } catch {
    return "-";
  }
}

function normalize(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

function tagClass(status?: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("ARCH")) return "tag tag--arch";
  if (s.includes("TERM") || s.includes("CLOT")) return "tag tag--off";
  if (s.includes("ENCO") || s.includes("ACT")) return "tag tag--on";
  return "tag";
}

function shortId(id: any) {
  const s = String(id ?? "");
  if (!s) return "-";
  return s.length <= 10 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/* =========================
   Active ids
========================= */
const activePnlId = computed(() => (store as any).activePnlId ?? store.activePnl?.id ?? null);
const activeContractId = computed(() => (store as any).activeContractId ?? store.activeContract?.id ?? null);
const activeVariantId = computed(() => (store as any).activeVariantId ?? store.activeVariant?.id ?? null);

/* =========================
   Data (search + sort + pin active)
========================= */
const pnls = computed<any[]>(() => store.pnls ?? []);

const filteredSorted = computed<any[]>(() => {
  const query = normalize(q.value);
  let rows = pnls.value;

  if (query) {
    rows = rows.filter((p) => {
      const title = normalize(p.title);
      const client = normalize(p.client);
      const model = normalize(p.model);
      const city = normalize(p.city);
      const status = normalize(p.status);
      return title.includes(query) || client.includes(query) || model.includes(query) || city.includes(query) || status.includes(query);
    });
  }

  const dir = sortDir.value === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const ka = a?.[sortKey.value];
    const kb = b?.[sortKey.value];
    if (sortKey.value === "createdAt") {
      const ta = ka ? new Date(ka).getTime() : 0;
      const tb = kb ? new Date(kb).getTime() : 0;
      return (ta - tb) * dir;
    }
    return String(ka ?? "").localeCompare(String(kb ?? ""), "fr") * dir;
  });

  // 🔥 pin active pnl at top (if present in this filtered list)
  const ap = activePnlId.value;
  if (!ap) return sorted;

  const idx = sorted.findIndex((x) => String(x.id) === String(ap));
  if (idx <= 0) return sorted;

  const active = sorted[idx];
  const rest = [...sorted.slice(0, idx), ...sorted.slice(idx + 1)];
  return [active, ...rest];
});

/* =========================
   Actions (UI only)
========================= */
function createPnl() {
  console.log("TODO: create P&L");
}
function pnlEdit(pnlId: string) {
  console.log("TODO: edit pnl", pnlId);
}
function pnlArchive(pnlId: string) {
  console.log("TODO: archive pnl", pnlId);
}
function pnlAddContract(pnlId: string) {
  console.log("TODO: add contract", pnlId);
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
  if ((store as any).setActivePnl) (store as any).setActivePnl(pnlId);
  if ((store as any).setActiveContract) (store as any).setActiveContract(contractId);
  if ((store as any).setActiveVariant) (store as any).setActiveVariant(variantId);

  // UX: déplier automatiquement le P&L actif
  open[pnlId] = true;

  console.log("Variant opened", { pnlId, contractId, variantId });
  // router.push({ name: "Details" }).catch(() => {});
}

/* =========================
   VIEW MODAL (visualiser)
========================= */
type ModalSection = { title?: string; rows: Array<{ label: string; value: any }> };
const modal = reactive({
  open: false,
  heading: "",
  subtitle: "",
  idsLine: "",
  sections: [] as ModalSection[],
});

function closeModal() {
  modal.open = false;
  modal.heading = "";
  modal.subtitle = "";
  modal.idsLine = "";
  modal.sections = [];
}

function setModal(payload: {
  heading: string;
  subtitle?: string;
  idsLine?: string;
  sections: ModalSection[];
}) {
  modal.heading = payload.heading;
  modal.subtitle = payload.subtitle ?? "";
  modal.idsLine = payload.idsLine ?? "";
  modal.sections = payload.sections;
  modal.open = true;
}

function viewPnl(p: any) {
  setModal({
    heading: `P&L — ${p?.title ?? ""}`,
    subtitle: `Client: ${p?.client ?? "-"} • Modèle: ${p?.model ?? "-"} • Ville: ${p?.city ?? "-"}`,
    idsLine: `ID P&L: ${shortId(p?.id)}`,
    sections: [
      {
        title: "Informations",
        rows: [
          { label: "Client", value: p?.client ?? "-" },
          { label: "Modèle", value: p?.model ?? "-" },
          { label: "Ville", value: p?.city ?? "-" },
          { label: "Date de création", value: fmtDate(p?.createdAt) },
          { label: "Statut", value: p?.status ?? "-" },
        ],
      },
    ],
  });
}

function viewContract(c: any, pnl?: any) {
  setModal({
    heading: `Contrat — ${c?.title ?? "Contrat"}`,
    subtitle: pnl ? `P&L: ${pnl?.title ?? "-"} • Client: ${pnl?.client ?? "-"}` : "",
    idsLine: `ID Contrat: ${shortId(c?.id)}  •  ID P&L: ${shortId(pnl?.id)}`,
    sections: [
      {
        title: "Informations",
        rows: [
          { label: "Titre", value: c?.title ?? "-" },
          { label: "Durée", value: c?.dureeMois != null ? `${c.dureeMois} mois` : "-" },
          { label: "Installation", value: c?.installation ?? "-" },
          { label: "Terrain", value: c?.terrain ?? "-" },
          { label: "Statut", value: c?.status ?? "-" },
          { label: "Date de création", value: fmtDate(c?.createdAt) },
        ],
      },
    ],
  });
}

function viewVariant(v: any, contract?: any, pnl?: any) {
  setModal({
    heading: `Variante — ${v?.title ?? "Variante"}`,
    subtitle: `${pnl?.title ? `P&L: ${pnl.title} • ` : ""}${contract?.title ? `Contrat: ${contract.title}` : ""}`,
    idsLine: `ID Variante: ${shortId(v?.id)}  •  ID Contrat: ${shortId(contract?.id)}  •  ID P&L: ${shortId(pnl?.id)}`,
    sections: [
      {
        title: "Informations",
        rows: [
          { label: "Titre", value: v?.title ?? "-" },
          { label: "Description", value: v?.description ?? "-" },
          { label: "Statut", value: v?.status ?? "-" },
          { label: "Date de création", value: fmtDate(v?.createdAt) },
        ],
      },
      {
        title: "Repères (si disponibles)",
        rows: [
          { label: "Catégorie", value: v?.category ?? "-" },
          { label: "Commentaire", value: v?.comment ?? "-" },
        ],
      },
    ],
  });
}

/* close on backdrop click only */
function onBackdrop(e: MouseEvent) {
  if ((e.target as HTMLElement)?.classList?.contains("modalBackdrop")) closeModal();
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="titleBlock">
        <h1>Mes P&amp;L</h1>
        <div class="sub">Hiérarchie : <b>P&amp;L</b> → <b>Contrats</b> → <b>Variantes</b></div>
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

        <button class="btn btn--ghost" @click="store.loadPnls?.()">Recharger</button>
      </div>
    </div>

    <!-- LIST -->
    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card card--error"><b>Erreur :</b> {{ store.error }}</div>

    <div v-else class="list">
      <div v-if="filteredSorted.length === 0" class="card empty">Aucun P&amp;L trouvé.</div>

      <div
        v-for="p in filteredSorted"
        :key="p.id"
        class="card pnl"
        :class="{ 'isActivePnl': String(p.id) === String(activePnlId) }"
      >
        <!-- PNL ROW -->
        <div class="row pnlRow">
          <button class="disclosure" @click="togglePnl(p.id)" :title="isOpen(p.id) ? 'Réduire' : 'Déplier'">
            {{ isOpen(p.id) ? "▾" : "▸" }}
          </button>

          <div class="treeMark">
            <div class="pill">P&amp;L</div>
            <div class="vLine"></div>
          </div>

          <div class="main">
            <div class="line1">
              <div class="name">
                {{ p.title }}
                <span v-if="String(p.id) === String(activePnlId)" class="activeBadge">Actif</span>
              </div>
              <span :class="tagClass(p.status)">{{ p.status ?? "—" }}</span>
            </div>

            <div class="line2">
              <span class="meta"><span class="metaLabel">Client :</span> <b>{{ p.client ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="metaLabel">Modèle :</span> <b>{{ p.model ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="metaLabel">Ville :</span> <b>{{ p.city ?? "-" }}</b></span>
              <span class="dot">•</span>
              <span class="meta"><span class="metaLabel">Créé le :</span> <b>{{ fmtDate(p.createdAt) }}</b></span>
            </div>
          </div>

          <!-- ✅ actions déplacées + différenciées -->
          <div class="actions actionsPnl">
            <button class="btn btn--soft btn--mini" @click="viewPnl(p)">Visualiser</button>
            <button class="iconBtn" title="Éditer" @click="pnlEdit(p.id)">✏️</button>
            <button class="iconBtn" title="Archiver" @click="pnlArchive(p.id)">🗄️</button>
            <button class="btn btn--ghost btn--mini" @click="pnlAddContract(p.id)">+ Contrat</button>
          </div>
        </div>

        <!-- CHILDREN -->
        <div v-show="isOpen(p.id)" class="children">
          <div v-if="(p.contracts ?? []).length === 0" class="muted">Aucun contrat.</div>

          <div
            v-for="c in (p.contracts ?? [])"
            :key="c.id"
            class="contract"
            :class="{ 'isActiveContract': String(c.id) === String(activeContractId) }"
          >
            <div class="row contractRow">
              <div class="indent"></div>

              <div class="treeMark treeMark--child">
                <div class="pill pill--c">Contrat</div>
                <div class="vLine"></div>
              </div>

              <div class="main">
                <div class="line1">
                  <div class="name name--sm">
                    {{ c.title ?? "Contrat" }}
                    <span v-if="String(c.id) === String(activeContractId)" class="activeBadge activeBadge--soft">Actif</span>
                  </div>
                  <span class="muted">— {{ c.dureeMois ?? 0 }} mois</span>
                </div>

                <div class="line2">
                  <span class="meta"><span class="metaLabel">Installation :</span> <b>{{ c.installation ?? "-" }}</b></span>
                  <span class="dot">•</span>
                  <span class="meta"><span class="metaLabel">Terrain :</span> <b>{{ c.terrain ?? "-" }}</b></span>
                </div>
              </div>

              <div class="actions actionsContract">
                <button class="btn btn--soft btn--mini" @click="viewContract(c, p)">Visualiser</button>
                <button class="iconBtn" title="Éditer" @click="contractEdit(c.id)">✏️</button>
                <button class="iconBtn" title="Archiver" @click="contractArchive(c.id)">🗄️</button>
                <button class="iconBtn" title="Dupliquer" @click="contractDuplicate(c.id)">⎘</button>
                <button class="btn btn--ghost btn--mini" @click="contractCreateVariant(c.id)">+ Variante</button>
              </div>
            </div>

            <!-- VARIANTS -->
            <div class="variants">
              <div v-if="(c.variants ?? []).length === 0" class="muted indent2">Aucune variante.</div>

              <div
                v-for="v in (c.variants ?? [])"
                :key="v.id"
                class="row variantRow"
                :class="{ 'isActiveVariant': String(v.id) === String(activeVariantId) }"
              >
                <div class="indent2"></div>

                <div class="treeMark treeMark--leaf">
                  <div class="pill pill--v">Var.</div>
                </div>

                <div class="main">
                  <div class="line1">
                    <div class="name name--xs">
                      {{ v.title ?? "Variante" }}
                      <span v-if="String(v.id) === String(activeVariantId)" class="activeBadge activeBadge--strong">Active</span>
                    </div>
                    <span :class="tagClass(v.status)">{{ v.status ?? "—" }}</span>
                  </div>
                  <div v-if="v.description" class="line2">
                    <span class="meta">{{ v.description }}</span>
                  </div>
                </div>

                <div class="actions actionsVariant">
                  <button class="btn btn--primary btn--mini" @click="openVariant(p.id, c.id, v.id)">Ouvrir</button>
                  <button class="btn btn--soft btn--mini" @click="viewVariant(v, c, p)">Visualiser</button>
                  <button class="iconBtn" title="Éditer" @click="variantEdit(v.id)">✏️</button>
                  <button class="iconBtn" title="Archiver" @click="variantArchive(v.id)">🗄️</button>
                  <button class="iconBtn" title="Dupliquer" @click="variantDuplicate(v.id)">⎘</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- /children -->
      </div>
    </div>

    <!-- MODAL -->
    <teleport to="body">
      <div v-if="modal.open" class="modalBackdrop" @click="onBackdrop">
        <div class="modalCard" role="dialog" aria-modal="true">
          <div class="modalHead">
            <div class="modalTitle">
              <div class="mh">{{ modal.heading }}</div>
              <div v-if="modal.subtitle" class="msub">{{ modal.subtitle }}</div>
            </div>
            <button class="iconBtn" title="Fermer" @click="closeModal">✕</button>
          </div>

          <div class="modalBody">
            <div v-for="(sec, i) in modal.sections" :key="i" class="mSection">
              <div v-if="sec.title" class="mSecTitle">{{ sec.title }}</div>

              <!-- ✅ labels alignés -->
              <div class="kv">
                <div v-for="(r, j) in sec.rows" :key="j" class="kvRow">
                  <div class="kvLabel">{{ r.label }}</div>
                  <div class="kvValue">{{ r.value }}</div>
                </div>
              </div>
            </div>

            <!-- ✅ IDs petits, en bas, secondaires -->
            <div v-if="modal.idsLine" class="idsLine">
              {{ modal.idsLine }}
            </div>
          </div>

          <div class="modalFoot">
            <button class="btn btn--ghost" @click="closeModal">Fermer</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f3f4f6;
  min-height: 100%;
}

/* Header */
.header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.titleBlock h1 { margin:0; font-size:18px; letter-spacing:.2px; }
.sub { margin-top:4px; font-size:12px; color:#6b7280; }
.headerActions { display:flex; gap:8px; align-items:center; }

/* Card */
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 1px 0 rgba(17, 24, 39, 0.03);
}
.card--error { border-color:#fecaca; background:#fff5f5; }
.empty { text-align:center; color:#6b7280; }

/* Toolbar */
.toolbar { display:flex; justify-content:space-between; align-items:stretch; gap:12px; flex-wrap:wrap; }
.search {
  flex:1; min-width:280px; display:flex; align-items:center; gap:8px;
  border:1px solid #e5e7eb; border-radius:12px; padding:8px 10px; background:#f9fafb;
}
.icon { color:#6b7280; font-size:12px; }
.input { border:0; outline:0; background:transparent; width:100%; font-size:13px; }
.sort { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.field { display:flex; flex-direction:column; gap:6px; }
.label { font-size:11px; color:#6b7280; }
.select { border:1px solid #e5e7eb; border-radius:12px; padding:8px 10px; font-size:13px; background:#fff; }

/* List rows */
.list { display:flex; flex-direction:column; gap:10px; }
.row { display:flex; gap:10px; align-items:center; }

/* Hierarchy markers */
.treeMark {
  width: 54px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:6px;
}
.treeMark--child { width: 64px; }
.treeMark--leaf { width: 54px; }
.pill {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  font-weight: 800;
}
.pill--c { background:#eef2ff; border-color:#c7d2fe; color:#3730a3; }
.pill--v { background:#ecfeff; border-color:#a5f3fc; color:#155e75; }

.vLine { width:2px; flex:1; background:linear-gradient(#e5e7eb, transparent); border-radius:2px; }

.pnlRow { align-items: stretch; }
.disclosure {
  width: 34px; height: 34px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  color: #374151;
}
.disclosure:hover { background:#f9fafb; }

.main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.line1 { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.line2 { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

.name { font-weight: 900; font-size: 13px; color:#111827; display:flex; align-items:center; gap:8px; }
.name--sm { font-size:12.5px; font-weight:900; }
.name--xs { font-size:12px; font-weight:900; }

.meta { font-size: 12px; color:#374151; }
.metaLabel { color:#6b7280; font-weight:700; }
.muted { font-size:12px; color:#6b7280; }
.dot { color:#d1d5db; }

/* Active badges */
.activeBadge{
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
  font-weight: 900;
}
.activeBadge--soft{
  border-color:#bae6fd;
  background:#eff6ff;
  color:#1e40af;
}
.activeBadge--strong{
  border-color:#a7f3d0;
  background:#ecfdf5;
  color:#065f46;
}

/* Actions */
.actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.actionsPnl { align-items:flex-start; }
.actionsContract { align-items:flex-start; }
.actionsVariant { align-items:flex-start; }

.iconBtn {
  width: 34px; height: 34px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}
.iconBtn:hover { background:#f9fafb; }

.btn {
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}
.btn:hover { background:#f9fafb; }
.btn--mini { padding: 7px 10px; border-radius: 10px; font-size: 12px; }
.btn--primary { background:#0b7a35; border-color:#0b7a35; color:#fff; }
.btn--primary:hover { background:#096a2e; }
.btn--ghost { background: transparent; }
.btn--ghost:hover { background:#ffffff; }
.btn--soft { background:#f3f4f6; }
.btn--soft:hover { background:#e5e7eb; }

/* Tags */
.tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  color: #374151;
  background: #f9fafb;
}
.tag--on { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
.tag--arch, .tag--off { border-color:#e5e7eb; background:#f9fafb; color:#6b7280; }

/* Children tree */
.children {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.contract {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  padding: 10px;
  background: #f9fafb;
}
.contractRow { align-items:flex-start; }

.variants { margin-top: 8px; display:flex; flex-direction:column; gap:8px; }
.variantRow {
  padding: 8px 10px;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #ffffff;
}

.indent { width: 12px; }
.indent2 { width: 30px; }

/* ✅ Active highlighting */
.pnl.isActivePnl {
  border-color: #86efac;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.10);
  background: linear-gradient(180deg, #ffffff, #fbfffb);
}
.contract.isActiveContract {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.10);
}
.variantRow.isActiveVariant {
  border-color: #34d399;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.12);
}

/* MODAL */
.modalBackdrop{
  position:fixed; inset:0;
  background: rgba(17,24,39,.45);
  display:flex; align-items:center; justify-content:center;
  padding: 18px;
  z-index: 50;
}
.modalCard{
  width: min(820px, 98vw);
  max-height: 85vh;
  overflow: auto;
  background:#fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 15px 40px rgba(0,0,0,.18);
}
.modalHead{
  display:flex; justify-content:space-between; align-items:flex-start; gap:10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #eef2f7;
}
.mh{ font-weight: 900; font-size: 15px; color:#111827; }
.msub{ margin-top:4px; font-size: 12px; color:#6b7280; }
.modalBody{ padding: 12px 14px 8px; display:flex; flex-direction:column; gap:14px; }
.mSection{ border: 1px solid #eef2f7; border-radius: 14px; padding: 10px; background:#fcfcfd; }
.mSecTitle{ font-weight: 900; font-size: 12px; color:#111827; margin-bottom: 8px; }

.kv{ display:flex; flex-direction:column; gap:6px; }
.kvRow{
  display:grid;
  grid-template-columns: 170px 1fr; /* ✅ labels proches + alignés */
  gap: 10px;
  align-items: start;
}
.kvLabel{
  font-size: 12px;
  color:#6b7280;
  font-weight: 800;
}
.kvValue{
  font-size: 12px;
  color:#111827;
  font-weight: 700;
  word-break: break-word;
}

.idsLine{
  font-size: 11px;
  color:#6b7280;
  padding: 4px 2px 0;
}

.modalFoot{
  display:flex; justify-content:flex-end; gap:8px;
  padding: 10px 14px 14px;
  border-top: 1px solid #eef2f7;
}

@media (max-width: 900px) {
  .actions { justify-content: flex-start; }
  .kvRow { grid-template-columns: 140px 1fr; }
}
</style>
