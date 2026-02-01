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
    <div class="top">
      <div class="title">
        <div class="h1">MP — Variante active</div>
        <div class="muted">
          Override uniquement (utilisé dans les calculs). Le prix catalogue se modifie dans le répertoire MP.
        </div>
      </div>
      <button class="btn" @click="store.loadPnls()">Recharger</button>
    </div>

    <div v-if="store.loading" class="panel">Chargement…</div>
    <div v-else-if="store.error" class="panel error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div class="panel">
        <div class="meta">
          <div><span class="muted">P&L:</span> <b>{{ pnlTitle }}</b></div>
          <div><span class="muted">Contrat:</span> <b>{{ contractLabel }}</b></div>
          <div><span class="muted">Variante:</span> <b>{{ variantTitle }}</b></div>
        </div>
      </div>

      <div class="panel" v-if="!variant">
        <div class="muted">Aucune variante active. Sélectionne une variante depuis le Dashboard.</div>
      </div>

      <div class="panel" v-else>
        <div class="h2">Matières premières</div>
        <div class="muted small" style="margin-top: 2px">
          • Clique <b>Prix override</b> pour modifier • Clique <b>Prix utilisé</b> pour restaurer l’override au prix catalogue (si override existe)
        </div>

        <div v-if="mpRows.length === 0" class="muted pad">Aucune MP.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Cat.</th>
                <th>MP</th>
                <th>Fournisseur</th>
                <th class="r">Prix cat.</th>
                <th class="r">Prix override</th>
                <th class="r">Utilisé</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in mpRows" :key="r.variantMpId">
                <td>{{ r.categorie }}</td>

                <td>
                  <b>{{ r.label }}</b>
                  <span class="muted"> ({{ r.unite }})</span>
                </td>

                <td>{{ r.fournisseur }}</td>

                <td class="r">{{ n(r.prixCatalogue) }}</td>

                <!-- OVERRIDE -->
                <td class="r" @click.stop>
                  <template v-if="ensureEdit(r.variantMpId, r.prixOverride).ovEditing">
                    <div class="editCell">
                      <input
                        class="inputSm r"
                        type="number"
                        step="0.01"
                        v-model.number="ensureEdit(r.variantMpId, r.prixOverride).ovDraft"
                      />
                      <button class="btnSm" :disabled="ensureEdit(r.variantMpId, r.prixOverride).ovSaving" @click="saveOverride(r)">
                        {{ ensureEdit(r.variantMpId, r.prixOverride).ovSaving ? "..." : "OK" }}
                      </button>
                      <button class="btnSm" :disabled="ensureEdit(r.variantMpId, r.prixOverride).ovSaving" @click="stopAllEdits()">
                        ✕
                      </button>
                    </div>

                    <div v-if="ensureEdit(r.variantMpId, r.prixOverride).error" class="err">
                      {{ ensureEdit(r.variantMpId, r.prixOverride).error }}
                    </div>
                  </template>

                  <template v-else>
                    <span class="clickVal" @click="startOverrideEdit(r)">
                      {{ r.prixOverride == null ? "—" : n(r.prixOverride) }}
                    </span>
                  </template>
                </td>

                <!-- USED (click => open modal restore) -->
                <td class="r" @click.stop>
                  <span
                    class="usedVal"
                    :class="{ restore: r.prixOverride != null }"
                    :title="r.prixOverride != null ? 'Cliquer pour restaurer l’override au prix catalogue' : 'Prix catalogue (aucun override)'"
                    @click="openRestoreModal(r)"
                  >
                    {{ n(r.prixUtilise) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="muted small" style="margin-top: 8px">
            NB: “utilisé” = override si présent, sinon catalogue.
          </div>
        </div>
      </div>

      <!-- MODAL RESTORE -->
      <div v-if="restoreModal.open" class="overlay" @click.self="closeRestoreModal()">
        <div class="modal">
          <div class="modalTitle">Restaurer au prix catalogue</div>

          <div class="modalText" v-if="restoreModal.row">
            <div><b>{{ restoreModal.row.label }}</b></div>
            <div class="muted small" style="margin-top: 4px">
              Override actuel : <b>{{ n(restoreModal.row.prixOverride) }}</b> — Catalogue : <b>{{ n(restoreModal.row.prixCatalogue) }}</b>
            </div>

            <div class="note">
              Cette action va mettre <b>prix override = prix catalogue</b> pour cette variante.
              Les KPIs de la variante seront recalculés.
            </div>
          </div>

          <div v-if="restoreModal.error" class="modalErr">{{ restoreModal.error }}</div>

          <div class="modalActions">
            <button class="btn" :disabled="restoreModal.saving" @click="closeRestoreModal()">Annuler</button>
            <button class="btn primary" :disabled="restoreModal.saving" @click="confirmRestore()">
              {{ restoreModal.saving ? "..." : "Confirmer" }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

/* top */
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.h1 {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.1;
  margin: 0;
}
.h2 {
  font-size: 13px;
  font-weight: 800;
  margin: 0;
}
.muted {
  color: #6b7280;
  font-size: 12px;
}
.small {
  font-size: 11px;
}

/* panel */
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
}
.panel.error {
  border-color: #ef4444;
  background: #fff5f5;
}
.pad {
  padding: 10px 0;
}
.meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
}

/* buttons */
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 13px;
  cursor: pointer;
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
  background: #046a2f;
}
.btnSm {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
}
.btnSm:hover {
  background: #f9fafb;
}

/* table */
.tableWrap {
  overflow: auto;
  margin-top: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 7px 8px;
  vertical-align: top;
}
.table th {
  background: #fafafa;
  color: #6b7280;
  font-size: 11px;
}
.r {
  text-align: right;
}

/* edit */
.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 12px;
  padding: 6px 8px;
  width: 110px;
}
.editCell {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.err {
  margin-top: 4px;
  color: #b91c1c;
  font-size: 11px;
}

/* clickable values */
.clickVal {
  cursor: pointer;
  font-weight: 700;
}
.clickVal:hover {
  text-decoration: underline;
}
.usedVal {
  font-weight: 800;
}
.usedVal.restore {
  cursor: pointer;
}
.usedVal.restore:hover {
  text-decoration: underline;
}

/* modal */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
}
.modalTitle {
  font-weight: 900;
  font-size: 14px;
}
.modalText {
  margin-top: 10px;
  font-size: 13px;
}
.note {
  margin-top: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  font-size: 12px;
}
.modalErr {
  margin-top: 10px;
  color: #b91c1c;
  font-size: 12px;
}
.modalActions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
