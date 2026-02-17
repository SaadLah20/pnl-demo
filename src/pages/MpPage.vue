<!-- ✅ src/pages/MpPage.vue (FICHIER COMPLET)
     MAJ demandée :
     ✅ Enlever le fournisseur qui apparaît au dessus/sous le libellé MP dans la cellule MP (plus aucune sous-ligne)
     ✅ Afficher Qté totale en TONNES (T) au lieu de kg (conversion kg -> T /1000)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

// Heroicons
import {
  ArrowPathIcon,
  PencilSquareIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
function fmt(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function round2(x: number) {
  return Math.round(toNum(x) * 100) / 100;
}
function pricePerKg(prixTonne: number): number {
  const p = toNum(prixTonne);
  if (p <= 0) return 0;
  return p / 1000; // DH/tonne -> DH/kg
}

/* =========================
   ACTIVE
========================= */
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const variantTitle = computed(() =>
  String((variant.value as any)?.title ?? (variant.value as any)?.name ?? "Variante")
);
const contractTitle = computed(() => {
  const c: any = contract.value as any;
  const client = c?.client ?? c?.clientName ?? null;
  const name = c?.title ?? c?.name ?? "Contrat";
  const bits = [client, name].filter(Boolean);
  return bits.length ? bits.join(" — ") : "Contrat";
});

/* =========================
   MAJORATIONS (MP)
   - pour coller au CMP du header : key = `mp:${mpId}`
========================= */
function readPersistedMajorations(variantAny: any): Record<string, number> {
  try {
    const raw = variantAny?.autresCouts?.majorations;
    if (!raw) return {};
    if (typeof raw === "object") return raw as Record<string, number>;
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function getMajorationPct(key: string, persisted: Record<string, number>): number {
  return toNum((persisted as any)?.[key]);
}
function applyMajoration(value: number, pct: number): number {
  return value * (1 + toNum(pct) / 100);
}

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

  // gardé côté data (utile ailleurs si besoin), mais plus affiché dans cellule MP
  comment: string;

  prixCatalogue: number;
  prixModifie: number | null;
  prixUtilise: number;

  qteTotaleKg: number;
  qteTotaleT: number;
  coutTotal: number;
};

const majorationsPersisted = computed(() => readPersistedMajorations(variant.value));

/**
 * Map mpId -> qtyTotalKg (sur l'ensemble des formules de la variante)
 * qty dans la compo = kg / m3, donc qtyTotalKg = Σ(qtyKgParM3 * volumeM3)
 */
const mpQtyTotalKgByMpId = computed<Record<string, number>>(() => {
  const v: any = variant.value as any;
  const items = v?.formules?.items ?? [];
  const map: Record<string, number> = {};

  for (const it of items) {
    const vol = toNum(it?.volumeM3);
    const formule = it?.formule;
    const compo = formule?.items ?? [];
    if (vol <= 0 || !Array.isArray(compo)) continue;

    for (const c of compo) {
      const mpId = String(c?.mpId ?? "");
      if (!mpId) continue;
      const qtyKgParM3 = toNum(c?.qty);
      const add = qtyKgParM3 * vol;
      map[mpId] = (map[mpId] ?? 0) + add;
    }
  }

  // TS strict: map[k] peut être number|undefined -> on sécurise
  for (const k of Object.keys(map)) {
    map[k] = round2(map[k] ?? 0);
  }
  return map;
});

const mpRows = computed<MpRow[]>(() => {
  const v: any = variant.value as any;
  const items = v?.mp?.items ?? [];
  const qtyMap = mpQtyTotalKgByMpId.value;
  const maj = majorationsPersisted.value;

  return items.map((it: any) => {
    const mp = it?.mp ?? {};
    const prixCatalogue = toNum(mp?.prix);

    // compat: it.prixOverride (préféré) sinon it.prix (legacy)
    const raw = it?.prixOverride ?? it?.prix ?? null;
    const prixModifie = raw == null ? null : toNum(raw);

    const prixUtilise = prixModifie ?? prixCatalogue;

    // ✅ IMPORTANT : on ne prend PAS it.comment/it.commentaire (souvent = fournisseur/legacy)
    const comment = String(mp?.comment ?? mp?.commentaire ?? "").trim();

    const mpId = String(it?.mpId ?? mp?.id ?? "");
    const qteTotaleKg = toNum(qtyMap[mpId] ?? 0);
    const qteTotaleT = round2(qteTotaleKg / 1000);

    // ✅ Coût total aligné CMP header : prix DH/tonne -> DH/kg + majoration mp:mpId
    const pct = getMajorationPct(`mp:${mpId}`, maj);
    const prixKg = applyMajoration(pricePerKg(prixUtilise), pct);
    const coutTotal = round2(qteTotaleKg * prixKg);

    return {
      variantMpId: String(it?.id ?? ""),
      mpId,
      categorie: String(mp?.categorie ?? "").trim(),
      label: String(mp?.label ?? "").trim(),
      unite: String(mp?.unite ?? "").trim(),
      fournisseur: String(mp?.fournisseur ?? "").trim(),
      comment,
      prixCatalogue,
      prixModifie,
      prixUtilise,
      qteTotaleKg,
      qteTotaleT,
      coutTotal,
    };
  });
});

/* =========================
   CMP TOTAL (somme des coûts totaux)
========================= */
const cmpTotal = computed(() => {
  return round2(mpRows.value.reduce((s, r) => s + toNum(r.coutTotal), 0));
});

/* =========================
   PAGINATION (simple)
========================= */
const ui = reactive({
  pageSize: 10,
  page: 1,
});

const total = computed(() => mpRows.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / ui.pageSize)));

watch(
  () => total.value,
  () => {
    if (ui.page > totalPages.value) ui.page = totalPages.value;
    if (ui.page < 1) ui.page = 1;
  }
);

const pagedRows = computed(() => {
  const start = (ui.page - 1) * ui.pageSize;
  const end = start + ui.pageSize;
  return mpRows.value.slice(start, end);
});

/* =========================
   EDIT STATE (prix modifié)
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
   RESTORE MODAL
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
function prevPage() {
  ui.page = Math.max(1, ui.page - 1);
}
function nextPage() {
  ui.page = Math.min(totalPages.value, ui.page + 1);
}
</script>

<template>
  <div class="page" ref="rootEl">
    <!-- Entête : CMP total -->
    <div class="subhdr">
      <div class="subhdr__left">
        <div class="ttlRow">
          <div class="ttl">MP (variante)</div>
        </div>

        <div class="cmpLine" v-if="variant">
          <span class="cmpLab">CMP total</span>
          <span class="cmpVal mono">{{ fmt(cmpTotal) }}</span>
          <span class="cmpDh">DH</span>
          <span class="cmpHint muted">• {{ variantTitle }} — {{ contractTitle }}</span>
        </div>

        <div class="cmpLine muted" v-else>Aucune variante active.</div>
      </div>

      <div class="subhdr__right">
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
        <div v-if="total === 0" class="empty muted">Aucune MP.</div>

        <template v-else>
          <!-- Pagination top -->
          <div v-if="total > ui.pageSize" class="pager">
            <button class="pbtn" :disabled="ui.page <= 1" @click="prevPage" title="Page précédente">
              <ChevronLeftIcon class="pi" />
            </button>
            <div class="ptext">Page <b>{{ ui.page }}</b> / {{ totalPages }}</div>
            <button class="pbtn" :disabled="ui.page >= totalPages" @click="nextPage" title="Page suivante">
              <ChevronRightIcon class="pi" />
            </button>
          </div>

          <!-- Table -->
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

                  <!-- ✅ tonnes -->
                  <th class="cQty r">Qté totale (T)</th>
                  <th class="cCost r">Coût total (DH)</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="r in pagedRows" :key="r.variantMpId" class="row">
                  <td class="cMp">
                    <div class="mpCell">
                      <div class="mpTop">
                        <b class="ell" :title="r.label">{{ r.label || "—" }}</b>
                        <span class="unit">({{ r.unite || "—" }})</span>
                      </div>

                      <!-- ✅ SUPPRIMÉ : aucune sous-ligne (donc plus de fournisseur/legacy sous le libellé) -->
                      <!-- <div class="mpSub muted" v-if="r.comment">
                        <span class="ell" :title="r.comment">{{ r.comment }}</span>
                      </div> -->
                    </div>
                  </td>

                  <td class="cF ell" :title="r.fournisseur">{{ r.fournisseur || "—" }}</td>

                  <td class="cCat ell">
                    <span class="catPill" :title="r.categorie">{{ r.categorie || "—" }}</span>
                  </td>

                  <td class="cCatP r mono">{{ fmt(r.prixCatalogue) }}</td>

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

                      <div v-if="eOf(r).error" class="errLine">{{ eOf(r).error }}</div>
                    </template>

                    <template v-else>
                      <div class="cellAct">
                        <span
                          class="val clickable mono"
                          :class="{ dash: r.prixModifie == null, hasOv: r.prixModifie != null }"
                          @click="startEdit(r)"
                          :title="r.prixModifie == null ? 'Cliquer pour modifier le prix' : 'Cliquer pour modifier à nouveau'"
                        >
                          {{ r.prixModifie == null ? "—" : fmt(r.prixModifie) }}
                        </span>

                        <button class="miniIcon" @click="startEdit(r)" title="Modifier">
                          <PencilSquareIcon class="mi" />
                        </button>
                      </div>
                    </template>
                  </td>

                  <!-- UTILISÉ -->
                  <td class="cUsed r" @click.stop>
                    <div class="cellAct">
                      <span class="val mono">{{ fmt(r.prixUtilise) }}</span>

                      <button
                        v-if="r.prixModifie != null"
                        class="miniIcon restore"
                        @click="openRestoreModal(r)"
                        title="Restaurer au catalogue (modifié = catalogue)"
                      >
                        <ArrowUturnLeftIcon class="mi" />
                      </button>
                    </div>
                  </td>

                  <!-- ✅ affichage en tonnes (plus lisible en 3 décimales) -->
                  <td class="cQty r mono">{{ fmt(r.qteTotaleT, 3) }}</td>
                  <td class="cCost r mono">{{ fmt(r.coutTotal) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination bottom -->
          <div v-if="total > ui.pageSize" class="pager bottom">
            <button class="pbtn" :disabled="ui.page <= 1" @click="prevPage" title="Page précédente">
              <ChevronLeftIcon class="pi" />
            </button>
            <div class="ptext">Page <b>{{ ui.page }}</b> / {{ totalPages }}</div>
            <button class="pbtn" :disabled="ui.page >= totalPages" @click="nextPage" title="Page suivante">
              <ChevronRightIcon class="pi" />
            </button>
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
              <b class="mono">{{ fmt(restoreModal.row.prixModifie) }}</b>
              <span class="sep">•</span>
              <span>Catalogue :</span>
              <b class="mono">{{ fmt(restoreModal.row.prixCatalogue) }}</b>
            </div>

            <div class="note">Action : mettre <b>modifié = catalogue</b> pour cette MP (variante active).</div>

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
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.62);
  --b: rgba(16,24,40,0.12);
  display:flex;
  flex-direction:column;
  gap:10px;
  padding: 0 10px 12px;
}

.subhdr{
  position: sticky;
  top: -15px;
  z-index: 40;
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 16px;
  padding: 10px 10px;
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:flex-start;
}
.subhdr__left{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.ttlRow{ display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.ttl{ font-size:15px; font-weight:950; color: var(--text); }

.muted{ color: rgba(15,23,42,0.55); font-weight:850; }
.mono{ font-variant-numeric: tabular-nums; }

.cmpLine{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  font-size: 12px;
  min-width:0;
}
.cmpLab{
  font-weight: 950;
  color: rgba(15,23,42,0.70);
  background: rgba(15,23,42,0.04);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 999px;
  padding: 2px 8px;
}
.cmpVal{
  font-weight: 1000;
  color: rgba(24,64,112,0.95);
  background: rgba(2,132,199,0.08);
  border: 1px solid rgba(2,132,199,0.22);
  border-radius: 999px;
  padding: 2px 10px;
}
.cmpDh{ font-weight: 950; color: rgba(15,23,42,0.70); }
.cmpHint{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 72vw; }

.subhdr__right{ display:flex; gap:8px; align-items:center; }
.btn{
  height: 34px;
  border:1px solid var(--b);
  background: rgba(255,255,255,0.84);
  border-radius:14px;
  padding:6px 12px;
  font-size:12px;
  font-weight:950;
  color: rgba(15,23,42,0.86);
  cursor:pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,0.06);
  display:inline-flex; align-items:center; gap:8px;
}
.btn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.btn.primary{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; box-shadow:none; }
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn.ghost{ background: rgba(255,255,255,0.75); }
.ic{ width:16px; height:16px; }

/* alerts */
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
.empty{ padding: 10px 2px; }

/* pager */
.pager{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  padding: 6px 2px 10px;
}
.pager.bottom{ padding: 10px 2px 2px; }
.pbtn{
  width: 34px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.86);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
.pbtn:disabled{ opacity: 0.55; cursor:not-allowed; }
.pbtn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.pi{ width: 16px; height: 16px; color: rgba(15,23,42,0.78); }
.ptext{ font-size: 12px; font-weight: 900; color: rgba(15,23,42,0.75); white-space: nowrap; }

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
  padding: 6px 8px;
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

/* cols */
.cMp   { width: 26%; }
.cF    { width: 12%; }
.cCat  { width: 10%; }
.cCatP { width: 9%; }
.cOv   { width: 12%; }
.cUsed { width: 11%; }
.cQty  { width: 10%; }
.cCost { width: 10%; }

/* superposition fix */
.cCatP{ position: relative; z-index: 1; overflow: hidden; }
.cOv  { position: relative; z-index: 5; overflow: visible; }
.cUsed{ position: relative; z-index: 6; overflow: visible; }

/* mp cell */
.mpCell{ min-width:0; }
.mpTop{ display:flex; align-items:baseline; gap:6px; min-width:0; }
.unit{
  font-size: 11px;
  font-weight: 900;
  color: rgba(15,23,42,0.55);
  flex: 0 0 auto;
}
/* mpSub gardé au cas où, mais plus utilisé */
.mpSub{
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 900;
}

/* category pill */
.catPill{
  display:inline-flex;
  max-width:100%;
  padding: 2px 8px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.86);
  box-sizing: border-box;
}

/* values */
.val{
  display:inline-flex;
  justify-content:flex-end;
  min-width: 76px;
  font-weight: 950;
}
.val.dash{ color: rgba(15,23,42,0.35); }
.val.clickable{ cursor:pointer; }
.val.clickable:hover{ text-decoration: underline; }
.val.hasOv{ color: rgba(24,64,112,0.95); }

.cellAct{
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  gap:6px;
  width:100%;
}

.miniIcon{
  width: 28px;
  height: 28px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.03);
  border-radius: 10px;
  cursor: pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex: 0 0 auto;
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
  flex-wrap: nowrap;
  position: relative;
  z-index: 10;
  max-width: 100%;
}
.inSm{
  width: 110px;
  min-width: 110px;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
  outline: none;
  box-sizing: border-box;
}
.inSm:focus{
  border-color: rgba(32,184,232,0.35);
  box-shadow: 0 0 0 4px rgba(32,184,232,0.12);
}
.iconBtn{
  width: 28px;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex: 0 0 auto;
}
.iconBtn.ok{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); }
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

@media (max-width: 1100px){
  .cCat{ display:none; }
  .cMp { width: 30%; }
  .cF { width: 14%; }
  .cCatP { width: 10%; }
  .cOv { width: 13%; }
  .cUsed { width: 12%; }
  .cQty { width: 10.5%; }
  .cCost { width: 10.5%; }
}
@media (max-width: 980px){
  .inSm{ width: 96px; min-width: 96px; }
}
</style>
