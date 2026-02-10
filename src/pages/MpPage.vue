<!-- ✅ src/pages/MpPage.vue (FICHIER COMPLET / compact + sticky header + search + UX override/restore) -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

// Heroicons
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
});

const rootEl = ref<HTMLElement | null>(null);

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}

/* =========================
   ACTIVE
========================= */
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const dureeMois = computed(() => toNum((contract.value as any)?.dureeMois ?? 0));
const variantTitle = computed(() => String((variant.value as any)?.title ?? (variant.value as any)?.name ?? "Variante"));
const contractTitle = computed(() => {
  const c: any = contract.value as any;
  const client = c?.client ?? c?.clientName ?? null;
  const name = c?.title ?? c?.name ?? "Contrat";
  const bits = [client, name].filter(Boolean);
  return bits.length ? bits.join(" — ") : "Contrat";
});

/* =========================
   DATA
========================= */
type MpRow = {
  variantMpId: string;
  mpId: string;
  categorie: string;
  label: string;
  unite: string;
  fournisseur: string;
  prixCatalogue: number;
  prixModifie: number | null; // (override)
  prixUtilise: number; // = modifié si existe sinon catalogue
};

const mpRows = computed<MpRow[]>(() => {
  const items = (variant.value as any)?.mp?.items ?? [];
  return items.map((it: any) => {
    const mp = it?.mp ?? {};
    const prixCatalogue = toNum(mp?.prix);

    // compat: it.prixOverride (préféré) sinon it.prix (legacy)
    const raw = it?.prixOverride ?? it?.prix ?? null;
    const prixModifie = raw == null ? null : toNum(raw);

    return {
      variantMpId: String(it?.id ?? ""),
      mpId: String(it?.mpId ?? mp?.id ?? ""),
      categorie: String(mp?.categorie ?? "").trim(),
      label: String(mp?.label ?? "").trim(),
      unite: String(mp?.unite ?? "").trim(),
      fournisseur: String(mp?.fournisseur ?? "").trim(),
      prixCatalogue,
      prixModifie,
      prixUtilise: prixModifie ?? prixCatalogue,
    };
  });
});

/* =========================
   UI FILTERS
========================= */
const ui = reactive({
  q: "",
  groupByCategorie: true,
});

function hay(r: MpRow) {
  return `${r.categorie} ${r.label} ${r.fournisseur} ${r.unite}`.toLowerCase();
}

const filteredRows = computed(() => {
  const q = ui.q.trim().toLowerCase();
  let rows = mpRows.value;
  if (q) rows = rows.filter((r) => hay(r).includes(q));
  return rows;
});

const grouped = computed(() => {
  if (!ui.groupByCategorie) return [{ key: "__ALL__", title: "Toutes", rows: filteredRows.value }];

  const map = new Map<string, MpRow[]>();
  for (const r of filteredRows.value) {
    const k = r.categorie || "Autre";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }

  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, "fr"));
  return keys.map((k) => ({
    key: k,
    title: k,
    rows: (map.get(k) ?? []).sort((a, b) => a.label.localeCompare(b.label, "fr")),
  }));
});

const stats = computed(() => {
  const total = mpRows.value.length;
  const shown = filteredRows.value.length;
  const modif = mpRows.value.filter((r) => r.prixModifie != null).length;
  return { total, shown, modif };
});

/* =========================
   EDIT STATE (prix modifié only)
========================= */
type EditState = {
  editing: boolean;
  draft: number;
  saving: boolean;
  error: string | null;
};

const edit = reactive<Record<string, EditState>>({});

function ensureEdit(key: string, initial: number | null): EditState {
  const k = String(key);
  if (!edit[k]) {
    edit[k] = {
      editing: false,
      draft: initial == null ? 0 : toNum(initial),
      saving: false,
      error: null,
    };
  }
  return edit[k];
}
function eOf(r: MpRow) {
  return ensureEdit(r.variantMpId, r.prixModifie);
}

watch(
  () => mpRows.value.map((r) => ({ id: r.variantMpId, v: r.prixModifie })),
  (arr) => {
    for (const x of arr) {
      const e = ensureEdit(x.id, x.v);
      if (!e.editing) e.draft = x.v == null ? 0 : toNum(x.v);
      if (e.error && x.v != null && toNum(x.v) === toNum(e.draft)) e.error = null;
    }
  },
  { immediate: true }
);

function stopAllEdits() {
  for (const k of Object.keys(edit)) {
    const e = edit[k];
    if (!e) continue;
    e.editing = false;
    e.error = null;
  }
}

/* click-outside => ferme édition */
function onDocPointerDown(ev: PointerEvent) {
  const root = rootEl.value;
  if (!root) return;
  const target = ev.target as Node | null;
  if (!target) return;
  if (!root.contains(target)) stopAllEdits();
}
onMounted(() => document.addEventListener("pointerdown", onDocPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocPointerDown));

function startEdit(row: MpRow) {
  const e = ensureEdit(row.variantMpId, row.prixModifie);
  e.error = null;
  e.draft = row.prixModifie == null ? 0 : toNum(row.prixModifie);
  e.editing = true;
}

async function save(row: MpRow) {
  const e = ensureEdit(row.variantMpId, row.prixModifie);
  e.error = null;

  const val = toNum(e.draft);
  if (val <= 0) {
    e.error = "Prix modifié invalide.";
    return;
  }

  e.saving = true;
  try {
    await store.updateVariantMp(row.variantMpId, { prix: val });
    e.editing = false;
  } catch (err: any) {
    e.error = err?.message ?? String(err);
  } finally {
    e.saving = false;
  }
}

/* =========================
   RESTORE MODAL (prix modifié = catalogue)
========================= */
const restoreModal = reactive<{
  open: boolean;
  row: MpRow | null;
  saving: boolean;
  error: string | null;
}>({
  open: false,
  row: null,
  saving: false,
  error: null,
});

function openRestoreModal(row: MpRow) {
  if (row.prixModifie == null) return;
  restoreModal.open = true;
  restoreModal.row = row;
  restoreModal.saving = false;
  restoreModal.error = null;
  stopAllEdits();
}
function closeRestoreModal() {
  restoreModal.open = false;
  restoreModal.row = null;
  restoreModal.saving = false;
  restoreModal.error = null;
}

async function confirmRestore() {
  const row = restoreModal.row;
  if (!row) return;

  const newVal = toNum(row.prixCatalogue);
  if (newVal <= 0) {
    restoreModal.error = "Prix catalogue invalide, impossible de restaurer.";
    return;
  }

  restoreModal.saving = true;
  restoreModal.error = null;

  try {
    await store.updateVariantMp(row.variantMpId, { prix: newVal }); // modifié = catalogue
    closeRestoreModal();
  } catch (e: any) {
    restoreModal.error = e?.message ?? String(e);
  } finally {
    restoreModal.saving = false;
  }
}

/* =========================
   ACTIONS
========================= */
async function reload() {
  stopAllEdits();
  await store.loadPnls();
}
</script>

<template>
  <div class="page" ref="rootEl">
    <!-- ✅ Sticky header (compact, cohérent) -->
    <div class="head">
      <div class="headL">
        <div class="h1">MP</div>
        <div class="sub" v-if="variant">
          <span class="pill" :title="variantTitle">{{ variantTitle }}</span>
          <span class="dot">•</span>
          <span class="pill" :title="contractTitle">{{ contractTitle }}</span>
          <span v-if="dureeMois" class="dot">•</span>
          <span v-if="dureeMois" class="pill">{{ dureeMois }} mois</span>
        </div>
        <div class="sub muted" v-else>Aucune variante active.</div>
      </div>

      <div class="headR">
        <button class="btn" :disabled="store.loading" @click="reload" title="Recharger">
          <ArrowPathIcon class="ic" />
          <span>Recharger</span>
        </button>
      </div>
    </div>

    <div v-if="store.loading" class="alert info">
      <ArrowPathIcon class="ic spin" />
      <div>Chargement…</div>
    </div>
    <div v-else-if="store.error" class="alert err">
      <ExclamationTriangleIcon class="ic" />
      <div><b>Erreur :</b> {{ store.error }}</div>
    </div>

    <template v-else>
      <div class="card" v-if="!variant">
        <div class="muted">Sélectionne une variante depuis le Dashboard.</div>
      </div>

      <div class="card" v-else>
        <!-- Tools row (compact) -->
        <div class="tools">
          <div class="search">
            <MagnifyingGlassIcon class="sic" />
            <input v-model="ui.q" class="sin" placeholder="Rechercher (MP, fournisseur, unité, catégorie)…" />
            <button v-if="ui.q" class="sclear" @click="ui.q = ''" title="Effacer">×</button>
          </div>

          <label class="toggle" title="Grouper par catégorie">
            <input type="checkbox" v-model="ui.groupByCategorie" />
            <span>Catégories</span>
          </label>

          <div class="meta muted">
            <b>{{ stats.shown }}</b>/{{ stats.total }} • Modif: <b>{{ stats.modif }}</b>
          </div>
        </div>

        <div v-if="filteredRows.length === 0" class="empty muted">Aucun résultat.</div>

        <template v-else>
          <div v-for="g in grouped" :key="g.key" class="group">
            <div v-if="ui.groupByCategorie" class="ghead">
              <div class="gttl">
                <span class="gdot"></span>
                <span class="gtxt">{{ g.title }}</span>
              </div>
              <div class="muted">{{ g.rows.length }} ligne(s)</div>
            </div>

            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th class="cMp">MP</th>
                    <th class="cF">Fourn.</th>
                    <th class="cCat">Cat.</th>
                    <th class="cCatP r">Catalogue</th>
                    <th class="cOv r">Modifié</th>
                    <th class="cUsed r">Utilisé</th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="r in g.rows" :key="r.variantMpId" class="row">
                    <td class="cMp">
                      <div class="mpCell">
                        <div class="mpTop">
                          <b class="ell" :title="r.label">{{ r.label || "—" }}</b>
                          <span class="unit">({{ r.unite || "—" }})</span>
                        </div>
                        <div class="mpSub muted">
                          <span class="ell" :title="r.mpId">{{ r.mpId }}</span>
                        </div>
                      </div>
                    </td>

                    <td class="cF ell" :title="r.fournisseur">{{ r.fournisseur || "—" }}</td>
                    <td class="cCat ell">
                      <span class="pill2" :title="r.categorie">{{ r.categorie || "—" }}</span>
                    </td>

                    <td class="cCatP r mono">{{ n(r.prixCatalogue) }}</td>

                    <!-- MODIFIÉ -->
                    <td class="cOv r" @click.stop>
                      <template v-if="eOf(r).editing">
                        <div class="editCell">
                          <input
                            class="inSm r mono"
                            type="number"
                            step="0.01"
                            v-model.number="eOf(r).draft"
                            @keydown.enter.prevent="save(r)"
                            @keydown.esc.prevent="stopAllEdits()"
                          />

                          <button class="iconBtn ok" :disabled="eOf(r).saving" @click="save(r)" title="Enregistrer">
                            <CheckIcon class="ib" />
                          </button>
                          <button class="iconBtn" :disabled="eOf(r).saving" @click="stopAllEdits()" title="Annuler">
                            <XMarkIcon class="ib" />
                          </button>
                        </div>

                        <div v-if="eOf(r).error" class="errLine">
                          {{ eOf(r).error }}
                        </div>
                      </template>

                      <template v-else>
                        <span
                          class="val clickable mono"
                          :class="{ dash: r.prixModifie == null, hasOv: r.prixModifie != null }"
                          @click="startEdit(r)"
                          :title="r.prixModifie == null ? 'Cliquer pour modifier le prix' : 'Cliquer pour modifier à nouveau'"
                        >
                          {{ r.prixModifie == null ? "—" : n(r.prixModifie) }}
                        </span>

                        <button class="miniIcon" @click="startEdit(r)" title="Modifier">
                          <PencilSquareIcon class="mi" />
                        </button>
                      </template>
                    </td>

                    <!-- UTILISÉ (restore si modifié existe) -->
                    <td class="cUsed r" @click.stop>
                      <span class="val mono">{{ n(r.prixUtilise) }}</span>

                      <button
                        v-if="r.prixModifie != null"
                        class="miniIcon restore"
                        @click="openRestoreModal(r)"
                        title="Restaurer au catalogue (prix modifié = catalogue)"
                      >
                        <ArrowUturnLeftIcon class="mi" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- MODAL RESTORE -->
      <div v-if="restoreModal.open" class="overlay" @click.self="closeRestoreModal()">
        <div class="modal">
          <div class="mhead">
            <div class="mtitle">Restaurer au catalogue</div>
            <button class="x" @click="closeRestoreModal()" title="Fermer">×</button>
          </div>

          <div v-if="restoreModal.row" class="mbody">
            <div class="mline">
              <b class="ell" :title="restoreModal.row.label">{{ restoreModal.row.label }}</b>
              <span class="muted">({{ restoreModal.row.unite || "—" }})</span>
            </div>

            <div class="mkv muted">
              <span>Modifié :</span>
              <b class="mono">{{ n(restoreModal.row.prixModifie) }}</b>
              <span class="sep">•</span>
              <span>Catalogue :</span>
              <b class="mono">{{ n(restoreModal.row.prixCatalogue) }}</b>
            </div>

            <div class="note">
              Action : mettre <b>modifié = catalogue</b> pour cette MP (variante active).
            </div>

            <div v-if="restoreModal.error" class="merr">{{ restoreModal.error }}</div>
          </div>

          <div class="mact">
            <button class="btn ghost" :disabled="restoreModal.saving" @click="closeRestoreModal()">Annuler</button>
            <button class="btn primary" :disabled="restoreModal.saving" @click="confirmRestore()">
              {{ restoreModal.saving ? "…" : "Confirmer" }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* =========================
   PAGE (compact + cohérent)
========================= */
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.62);
  --b: rgba(16,24,40,0.12);
  --soft: rgba(15,23,42,0.04);

  display:flex;
  flex-direction:column;
  gap:8px;
  padding: 0 10px 12px;
}

/* Sticky header under HeaderDashboard */
.head{
  position: sticky;
  top: -15px; /* ajuste si besoin */
  z-index: 30;

  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:10px;

  padding: 8px 0;
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(16,24,40,0.08);
}

.headL{ display:flex; flex-direction:column; gap:4px; min-width:0; }
.h1{ font-size:14px; font-weight:1000; color:var(--text); line-height:1.05; }
.sub{
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size: 11.5px; color: var(--muted); min-width:0;
}
.dot{ color: rgba(148,163,184,1); font-weight:900; }
.pill{
  max-width: 48vw;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;

  border:1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.82);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.78);
}

.headR{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

.btn{
  height: 30px;
  border:1px solid var(--b);
  background: rgba(255,255,255,0.84);
  border-radius:12px;
  padding:6px 10px;
  font-size:12px;
  font-weight:900;
  color: rgba(15,23,42,0.86);
  cursor:pointer;
  box-shadow: 0 4px 14px rgba(15,23,42,0.06);
  display:inline-flex; align-items:center; gap:8px;
}
.btn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.btn.primary{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; box-shadow:none; }
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn.ghost{ background: rgba(255,255,255,0.75); }
.ic{ width:16px; height:16px; }

.alert{
  border:1px solid var(--b);
  border-radius:14px;
  padding:8px 10px;
  background:#fff;
  font-size:12px;
  font-weight:900;
  color: rgba(15,23,42,0.86);
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.alert.err{ border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); color: rgba(127,29,29,0.95); }
.alert.info{ border-color: rgba(59,130,246,0.25); background: rgba(59,130,246,0.08); }
.spin{ animation: spin 0.9s linear infinite; }
@keyframes spin{ from{ transform: rotate(0);} to{ transform: rotate(360deg);} }

.card{
  background: rgba(255,255,255,0.92);
  border:1px solid var(--b);
  border-radius:16px;
  padding:10px;
  box-shadow: 0 10px 22px rgba(15,23,42,0.06);
}

/* tools row */
.tools{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
  margin-bottom: 8px;
}
.search{
  flex: 1 1 320px;
  display:flex; align-items:center; gap:8px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  border-radius:12px;
  padding:6px 10px;
  min-width: 260px;
}
.sic{ width:16px; height:16px; color: rgba(15,23,42,0.45); }
.sin{ border:0; outline:none; width:100%; font-size:12.5px; font-weight:850; color: var(--text); }
.sclear{ border:0; background:transparent; cursor:pointer; font-size:18px; line-height:1; color: rgba(15,23,42,0.55); padding:0 4px; }

.toggle{
  display:inline-flex; align-items:center; gap:8px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.82);
  border-radius:12px;
  padding:6px 10px;
  font-size:12px;
  font-weight:900;
  color: rgba(15,23,42,0.86);
}
.toggle input{ transform: translateY(1px); }
.meta{ margin-left:auto; font-size:12px; font-weight:850; white-space:nowrap; }
.muted{ color: var(--muted); }

/* group */
.group{ margin-top: 8px; }
.ghead{
  display:flex; justify-content:space-between; align-items:center;
  padding: 6px 2px 8px;
}
.gttl{ display:flex; align-items:center; gap:8px; min-width:0; }
.gdot{ width:8px; height:8px; border-radius:999px; background: rgba(37,99,235,0.35); }
.gtxt{ font-weight:950; color: var(--text); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.empty{ padding: 10px 2px; }

/* table */
.tableWrap{
  overflow:auto;
  border:1px solid rgba(16,24,40,0.10);
  border-radius:14px;
  background:#fff;
}
.table{
  width:100%;
  border-collapse:separate;
  border-spacing:0;
  table-layout: fixed;
  font-size: 12px;
  color: var(--text);
}
.table th, .table td{
  border-bottom:1px solid rgba(16,24,40,0.08);
  padding: 6px 8px; /* ✅ compact height */
  vertical-align:middle;
}
.table thead th{
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(248,250,252,0.96);
  backdrop-filter: blur(6px);
  font-size: 10px;
  font-weight: 950;
  color: rgba(15,23,42,0.55);
  letter-spacing: 0.2px;
  white-space:nowrap;
}
.row:hover td{ background: rgba(15,23,42,0.02); }

.r{ text-align:right; }
.ell{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mono{ font-variant-numeric: tabular-nums; }

/* cols */
.cMp{ width: 34%; }
.cF{ width: 18%; }
.cCat{ width: 14%; }
.cCatP{ width: 11%; }
.cOv{ width: 12.5%; }
.cUsed{ width: 10.5%; }

.mpCell{ min-width:0; }
.mpTop{
  display:flex; align-items:baseline; gap:6px;
  min-width:0;
}
.unit{
  font-size: 11px;
  font-weight: 900;
  color: rgba(15,23,42,0.55);
  flex: 0 0 auto;
}
.mpSub{
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 900;
}

.pill2{
  display:inline-flex;
  max-width:100%;
  padding: 2px 8px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.9);
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.86);
}

/* values */
.val{
  display:inline-flex;
  justify-content:flex-end;
  min-width: 80px;
  font-weight: 950;
}
.val.dash{ color: rgba(15,23,42,0.35); }
.val.clickable{ cursor:pointer; }
.val.clickable:hover{ text-decoration: underline; }
.val.hasOv{ color: rgba(24,64,112,0.95); }

/* mini icons */
.miniIcon{
  margin-left: 6px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.03);
  border-radius: 10px;
  padding: 4px;
  cursor: pointer;
  vertical-align: middle;
}
.miniIcon:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.miniIcon.restore:hover{ background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.18); }
.mi{ width: 14px; height: 14px; color: rgba(15,23,42,0.75); }

/* edit controls */
.editCell{
  display:inline-flex;
  gap:6px;
  align-items:center;
  justify-content:flex-end;
}
.inSm{
  width: 96px;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 900;
  outline: none;
}
.inSm:focus{
  border-color: rgba(32,184,232,0.35);
  box-shadow: 0 0 0 4px rgba(32,184,232,0.12);
}
.iconBtn{
  width: 30px;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.iconBtn.ok{
  background: rgba(24,64,112,0.92);
  border-color: rgba(24,64,112,0.6);
}
.iconBtn.ok .ib{ color:#fff; }
.iconBtn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.iconBtn.ok:hover{ background: rgba(24,64,112,1); }
.ib{ width:16px; height:16px; color: rgba(15,23,42,0.78); }

.errLine{
  margin-top: 3px;
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(127,29,29,0.95);
  text-align: right;
}

/* modal */
.overlay{
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 14px;
  z-index: 99999;
}
.modal{
  width: min(560px, 96vw);
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 40%);
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.mhead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(16,24,40,0.10);
}
.mtitle{ font-size: 13px; font-weight: 1000; color: var(--text); }
.x{
  width: 30px; height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  cursor:pointer;
  font-size: 18px;
  line-height: 1;
}
.x:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.mbody{ padding: 12px 14px 10px; }
.mline{ display:flex; gap:8px; align-items:baseline; min-width:0; }
.mkv{ margin-top: 6px; font-size: 11.5px; font-weight: 900; }
.sep{ margin: 0 6px; color: rgba(148,163,184,1); }
.note{
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.03);
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(15,23,42,0.86);
}
.merr{
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239,68,68,0.35);
  background: rgba(239,68,68,0.08);
  color: rgba(127,29,29,0.95);
  font-weight: 950;
  font-size: 11.5px;
}
.mact{
  padding: 10px 14px 14px;
  display:flex;
  justify-content:flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.72);
}

/* responsive */
@media (max-width: 980px){
  .cCat{ display:none; }
  .cMp{ width: 44%; }
  .cF{ width: 20%; }
  .cCatP{ width: 14%; }
  .cOv{ width: 14%; }
  .cUsed{ width: 12%; }
}
</style>
