<!-- src/pages/MpPage.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
});

const rootEl = ref<HTMLElement | null>(null);

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
const pnl = computed(() => store.activePnl);
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const pnlTitle = computed(() => pnl.value?.title ?? "—");
const contractLabel = computed(() => {
  const d = (contract.value as any)?.dureeMois ?? null;
  return d != null ? `Contrat ${String((contract.value as any)?.id ?? "").slice(0, 6)} — ${d} mois` : "—";
});
const variantTitle = computed(() => (variant.value as any)?.title ?? "—");

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
  prixOverride: number | null;
  prixUtilise: number;
};

const mpRows = computed<MpRow[]>(() => {
  const items = (variant.value as any)?.mp?.items ?? [];
  return items.map((it: any) => {
    const mp = it?.mp ?? {};
    const prixCatalogue = toNum(mp?.prix);

    // compat: it.prixOverride (préféré) sinon it.prix (legacy)
    const rawOv = it?.prixOverride ?? it?.prix ?? null;
    const prixOverride = rawOv == null ? null : toNum(rawOv);

    return {
      variantMpId: String(it?.id ?? ""),
      mpId: String(it?.mpId ?? mp?.id ?? ""),
      categorie: String(mp?.categorie ?? ""),
      label: String(mp?.label ?? ""),
      unite: String(mp?.unite ?? ""),
      fournisseur: String(mp?.fournisseur ?? ""),
      prixCatalogue,
      prixOverride,
      prixUtilise: prixOverride ?? prixCatalogue,
    };
  });
});

/* =========================
   EDIT STATE (override only)
========================= */
type EditState = {
  ovEditing: boolean;
  ovDraft: number;
  ovSaving: boolean;
  error: string | null;
};

const edit = reactive<Record<string, EditState>>({});

function ensureEdit(key: string, initialOv: number | null): EditState {
  const k = String(key);
  if (!edit[k]) {
    edit[k] = {
      ovEditing: false,
      ovDraft: initialOv == null ? 0 : toNum(initialOv),
      ovSaving: false,
      error: null,
    };
  }
  return edit[k];
}

watch(
  () => mpRows.value.map((r) => ({ id: r.variantMpId, ov: r.prixOverride })),
  (arr) => {
    for (const x of arr) {
      const e = ensureEdit(x.id, x.ov);
      if (!e.ovEditing) e.ovDraft = x.ov == null ? 0 : toNum(x.ov);
      if (e.error && x.ov != null && toNum(x.ov) === toNum(e.ovDraft)) e.error = null;
    }
  },
  { immediate: true }
);

function stopAllEdits() {
  for (const k of Object.keys(edit)) {
    const e = edit[k];
    if (!e) continue;
    e.ovEditing = false;
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

function startOverrideEdit(row: MpRow) {
  const e = ensureEdit(row.variantMpId, row.prixOverride);
  e.error = null;
  e.ovDraft = row.prixOverride == null ? 0 : toNum(row.prixOverride);
  e.ovEditing = true;
}

async function saveOverride(row: MpRow) {
  const e = ensureEdit(row.variantMpId, row.prixOverride);
  e.error = null;

  const val = toNum(e.ovDraft);
  if (val <= 0) {
    e.error = "Prix override invalide.";
    return;
  }

  e.ovSaving = true;
  try {
    await store.updateVariantMp(row.variantMpId, { prix: val });
    e.ovEditing = false;
  } catch (err: any) {
    e.error = err?.message ?? String(err);
  } finally {
    e.ovSaving = false;
  }
}

/* =========================
   RESTORE MODAL (override = catalogue)
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
  if (row.prixOverride == null) return;
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

  const newOverride = toNum(row.prixCatalogue);
  if (newOverride <= 0) {
    restoreModal.error = "Prix catalogue invalide, impossible de restaurer.";
    return;
  }

  restoreModal.saving = true;
  restoreModal.error = null;

  try {
    await store.updateVariantMp(row.variantMpId, { prix: newOverride }); // override = catalogue
    closeRestoreModal();
  } catch (e: any) {
    restoreModal.error = e?.message ?? String(e);
  } finally {
    restoreModal.saving = false;
  }
}
</script>

<template>
  <div class="page" ref="rootEl">
    <!-- TOP BAR ultra compact -->
    <div class="top">
      <div class="tleft">
        <div class="titleRow">
          <div class="title">MP — Variante active</div>
          <span class="badge">Override</span>
        </div>
        <div class="muted">
          Override uniquement. Catalogue = répertoire MP.
        </div>
      </div>

      <div class="tright">
        <button class="btn" @click="store.loadPnls()">Recharger</button>
      </div>
    </div>

    <div v-if="store.loading" class="alert">Chargement…</div>
    <div v-else-if="store.error" class="alert error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div class="card" v-if="!variant">
        <div class="muted">Aucune variante active. Sélectionne une variante depuis le Dashboard.</div>
      </div>

      <div class="card" v-else>
        <div class="cardHead">
          <div class="h2">Matières premières</div>
          <div class="muted tiny">
            <b>Override</b> = éditable • <b>Utilisé</b> = restaurer (si override existe)
          </div>
        </div>

        <div v-if="mpRows.length === 0" class="muted pad">Aucune MP.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th class="cCat">Cat.</th>
                <th class="cMp">MP</th>
                <th class="cFourn">Fourn.</th>
                <th class="cPrice r">Cat.</th>
                <th class="cOv r">Ov.</th>
                <th class="cUsed r">Util.</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in mpRows" :key="r.variantMpId" class="row">
                <td class="ell">
                  <span class="pill">{{ r.categorie || "—" }}</span>
                </td>

                <td class="ell">
                  <div class="mpCell">
                    <b class="ell">{{ r.label }}</b>
                    <span class="muted unit">({{ r.unite }})</span>
                  </div>
                </td>

                <td class="ell">{{ r.fournisseur || "—" }}</td>

                <td class="r mono">{{ n(r.prixCatalogue) }}</td>

                <!-- OVERRIDE -->
                <td class="r" @click.stop>
                  <template v-if="ensureEdit(r.variantMpId, r.prixOverride).ovEditing">
                    <div class="editCell">
                      <input
                        class="inputSm r mono"
                        type="number"
                        step="0.01"
                        v-model.number="ensureEdit(r.variantMpId, r.prixOverride).ovDraft"
                      />
                      <button
                        class="btn xs"
                        :disabled="ensureEdit(r.variantMpId, r.prixOverride).ovSaving"
                        @click="saveOverride(r)"
                        title="OK"
                      >
                        {{ ensureEdit(r.variantMpId, r.prixOverride).ovSaving ? "…" : "OK" }}
                      </button>
                      <button
                        class="btn xs"
                        :disabled="ensureEdit(r.variantMpId, r.prixOverride).ovSaving"
                        @click="stopAllEdits()"
                        title="Annuler"
                      >
                        ✕
                      </button>
                    </div>

                    <div v-if="ensureEdit(r.variantMpId, r.prixOverride).error" class="err">
                      {{ ensureEdit(r.variantMpId, r.prixOverride).error }}
                    </div>
                  </template>

                  <template v-else>
                    <span class="clickVal mono" @click="startOverrideEdit(r)">
                      {{ r.prixOverride == null ? "—" : n(r.prixOverride) }}
                    </span>
                  </template>
                </td>

                <!-- USED (click => restore) -->
                <td class="r" @click.stop>
                  <span
                    class="usedVal mono"
                    :class="{ restore: r.prixOverride != null }"
                    :title="r.prixOverride != null ? 'Restaurer au catalogue' : 'Catalogue (aucun override)'"
                    @click="openRestoreModal(r)"
                  >
                    {{ n(r.prixUtilise) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MODAL RESTORE -->
      <div v-if="restoreModal.open" class="overlay" @click.self="closeRestoreModal()">
        <div class="modal">
          <div class="modalTitle">Restaurer au catalogue</div>

          <div class="modalText" v-if="restoreModal.row">
            <div class="ell"><b>{{ restoreModal.row.label }}</b></div>

            <div class="muted tiny" style="margin-top: 4px">
              Ov :
              <b class="mono">{{ n(restoreModal.row.prixOverride) }}</b>
              <span class="sep">•</span>
              Cat :
              <b class="mono">{{ n(restoreModal.row.prixCatalogue) }}</b>
            </div>

            <div class="note">
              Met <b>override = catalogue</b> pour cette variante.
            </div>
          </div>

          <div v-if="restoreModal.error" class="modalErr">{{ restoreModal.error }}</div>

          <div class="modalActions">
            <button class="btn" :disabled="restoreModal.saving" @click="closeRestoreModal()">Annuler</button>
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
/* ✅ Ultra compact page */
.page {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ✅ Top bar ultra compact */
.top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.tleft {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 240px;
}

.titleRow {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.title {
  font-size: 16px;
  font-weight: 900;
  color: #111827;
  line-height: 1.05;
}

.badge {
  font-size: 10px;
  font-weight: 900;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 7px;
  border-radius: 999px;
}

.tright {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

/* alerts */
.alert {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px 10px;
  background: #fff;
  color: #111827;
  font-size: 12px;
}
.alert.error {
  border-color: #ef4444;
  background: #fff5f5;
}

/* ✅ card super compacte */
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 10px;
}

.cardHead {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 6px;
}

.h2 {
  font-size: 12px;
  font-weight: 900;
  margin: 0;
  color: #111827;
}

.muted {
  color: #6b7280;
  font-size: 11px;
}
.tiny {
  font-size: 10px;
}

.pad {
  padding: 6px 0;
}

.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-variant-numeric: tabular-nums;
}

/* ✅ boutons compacts */
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 12px;
  padding: 7px 9px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  line-height: 1;
}
.btn:hover {
  background: #f9fafb;
}
.btn.primary {
  background: #007a33;
  border-color: #007a33;
  color: #fff;
}
.btn.primary:hover {
  filter: brightness(0.95);
}
.btn.xs {
  padding: 6px 8px;
  border-radius: 12px;
  font-size: 11px;
}

/* ✅ table ultra dense */
.tableWrap {
  overflow-x: auto;
  margin-top: 0;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  table-layout: fixed;
}

.table th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 7px; /* ✅ plus petit */
  text-align: left;
  vertical-align: middle;
}

.table th {
  font-size: 10px;
  color: #6b7280;
  background: #fafafa;
  white-space: nowrap;
  padding-top: 5px;
  padding-bottom: 5px;
}

.row:hover td {
  background: #fcfcfd;
}

.r {
  text-align: right;
}

/* ✅ colonnes plus serrées */
.cCat {
  width: 14%;
}
.cMp {
  width: 33%;
}
.cFourn {
  width: 18%;
}
.cPrice {
  width: 11%;
}
.cOv {
  width: 12%;
}
.cUsed {
  width: 12%;
}

.pill {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #111827;
  font-size: 10px;
  font-weight: 900;
}

.mpCell {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
}
.unit {
  flex: 0 0 auto;
}

/* edit ultra compact */
.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  font-size: 11px;
  padding: 6px 7px;
  width: 96px;
  background: #fff;
}

.editCell {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: flex-end;
}

.err {
  margin-top: 3px;
  color: #b91c1c;
  font-size: 10px;
  text-align: right;
}

.clickVal {
  cursor: pointer;
  font-weight: 900;
}
.clickVal:hover {
  text-decoration: underline;
}

.usedVal {
  font-weight: 900;
}
.usedVal.restore {
  cursor: pointer;
}
.usedVal.restore:hover {
  text-decoration: underline;
}

/* modal compact */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 50;
}
.modal {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 12px;
}
.modalTitle {
  font-weight: 900;
  font-size: 13px;
  color: #111827;
}
.modalText {
  margin-top: 8px;
  font-size: 12px;
}
.sep {
  margin: 0 6px;
  color: #9ca3af;
}
.note {
  margin-top: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px;
  font-size: 11px;
}
.modalErr {
  margin-top: 8px;
  color: #b91c1c;
  font-size: 11px;
}
.modalActions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
