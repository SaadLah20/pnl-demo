<!-- src/pages/CoutEmployesPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
});

/* helpers */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
}

/* active */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => clamp(contract.value?.dureeMois));

/* volume + CA (for %) */
type DraftForm = { volumeM3: number; momd: number };
const formDrafts = reactive<Record<string, DraftForm>>({});
function getFormDraft(id: string): DraftForm {
  const k = String(id);
  if (!formDrafts[k]) formDrafts[k] = { volumeM3: 0, momd: 0 };
  return formDrafts[k];
}
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

watch(
  () => variant.value?.id,
  () => {
    for (const vf of formules.value) {
      const d = getFormDraft(vf.id);
      d.volumeM3 = clamp(vf?.volumeM3);
      d.momd = clamp(vf?.momd);
    }
  },
  { immediate: true }
);

const volumeTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0));
const transportPrixMoyen = computed(() => clamp((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return clamp(vmp.prix);
  return clamp(vmp?.mp?.prix);
}
function cmpParM3For(vf: any): number {
  const items = (vf?.formule?.items ?? []) as any[];
  return items.reduce((s: number, it: any) => s + (clamp(it?.qty) / 1000) * mpPriceUsed(String(it?.mpId)), 0);
}
const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const pv = cmpParM3For(vf) + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

/* draft employes */
type Draft = Record<string, number>;
const draft = reactive<Draft>({});

const EMP_GROUPS = [
  { key: "responsable", label: "Responsable" },
  { key: "centralistes", label: "Centralistes" },
  { key: "manoeuvre", label: "Manœuvre" },
  { key: "coordinateurExploitation", label: "Coordinateur exploitation" },
  { key: "technicienLabo", label: "Technicien labo" },
  { key: "femmeMenage", label: "Femme ménage" },
  { key: "gardien", label: "Gardien" },
  { key: "maintenancier", label: "Maintenancier" },
  { key: "panierRepas", label: "Panier repas" },
] as const;

function loadFromVariant() {
  const s: any = (variant.value as any)?.employes ?? {};
  for (const g of EMP_GROUPS) {
    draft[`${g.key}Nb`] = clamp(s[`${g.key}Nb`], 0, 9999);
    draft[`${g.key}Cout`] = clamp(s[`${g.key}Cout`], 0, 999999);
  }
}
watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

/* KPI employes */
const monthly = computed(() => {
  return EMP_GROUPS.reduce((s, g) => {
    const nb = clamp(draft[`${g.key}Nb`], 0, 9999);
    const cout = clamp(draft[`${g.key}Cout`], 0, 999999);
    return s + nb * cout;
  }, 0);
});
const total = computed(() => monthly.value * clamp(dureeMois.value));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

/* ✅ GENERALISER (employes) */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function buildPayload() {
  const existing: any = (variant.value as any)?.employes ?? {};
  const out: any = { category: existing.category ?? "COUTS_CHARGES" };
  for (const g of EMP_GROUPS) {
    out[`${g.key}Nb`] = Number(clamp(draft[`${g.key}Nb`], 0, 9999));
    out[`${g.key}Cout`] = Number(clamp(draft[`${g.key}Cout`], 0, 999999));
  }
  return out;
}

async function generalizeEmployesTo(variantIds: string[]) {
  const sourceVariantId = String(variant.value?.id ?? (store as any).activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const idRaw of variantIds) {
      const targetId = String(idRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;
      await (store as any).updateVariant(targetId, { employes: payload });
    }
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const ok = window.confirm(
    payload.mode === "ALL"
      ? "Généraliser “Coûts employés” sur TOUTES les variantes ?"
      : `Généraliser “Coûts employés” sur ${ids.length} variante(s) ?`
  );
  if (!ok) return;

  await generalizeEmployesTo(ids);
  if (!genErr.value) genOpen.value = false;
}

/* modal (confirm/info) */
const modal = reactive({
  open: false,
  title: "",
  message: "",
  mode: "confirm" as "confirm" | "info",
  onConfirm: null as null | (() => void | Promise<void>),
});
function openConfirm(title: string, message: string, onConfirm: () => void | Promise<void>) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "confirm";
  modal.onConfirm = onConfirm;
}
function openInfo(title: string, message: string) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "info";
  modal.onConfirm = null;
}
function closeModal() {
  modal.open = false;
  modal.title = "";
  modal.message = "";
  modal.onConfirm = null;
}

/* save/reset */
const saving = ref(false);
const err = ref<string | null>(null);

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { employes: buildPayload() });
    openInfo("Enregistré", "Coûts employés mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Coûts employés</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ dureeMois }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || genBusy" @click="genOpen = true">Généraliser</button>
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>
        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="genErr" class="panel error"><b>Généralisation :</b> {{ genErr }}</div>
    <div v-if="genBusy" class="panel">Généralisation…</div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="panel"><div class="muted">Sélectionne une variante.</div></div>

      <template v-else>
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Prix / m³</div>
            <div class="kVal mono">{{ n(perM3, 2) }} <span>DH/m³</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal mono">{{ money(total, 2) }}</div>
          </div>
          <div class="kpi kpiMonth">
            <div class="kLbl">/ mois</div>
            <div class="kVal mono">{{ money(monthly, 2) }} <span>DH/mois</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">%</div>
            <div class="kVal mono">{{ n(pct, 2) }} <span>%</span></div>
          </div>
        </div>

        <div class="panel">
          <div class="gridCards">
            <div v-for="g in EMP_GROUPS" :key="g.key" class="empCard">
              <div class="empTop">
                <div class="empTitle">{{ g.label }}</div>
                <div class="empHint muted">Nb × Coût</div>
              </div>

              <div class="empRow">
                <div class="field">
                  <div class="label">Nb</div>
                  <div class="inCell">
                    <input
                      class="inputNb"
                      type="number"
                      step="0.1"
                      min="0"
                      max="9999"
                      :value="draft[`${g.key}Nb`]"
                      @input="draft[`${g.key}Nb`] = clamp(($event.target as HTMLInputElement).value, 0, 9999)"
                    />
                    <span class="unit">Nb</span>
                  </div>
                </div>

                <div class="field">
                  <div class="label">Coût</div>
                  <div class="inCell">
                    <input
                      class="inputCout inputMonth"
                      type="number"
                      step="0.01"
                      min="0"
                      max="999999"
                      :value="draft[`${g.key}Cout`]"
                      @input="draft[`${g.key}Cout`] = clamp(($event.target as HTMLInputElement).value, 0, 999999)"
                    />
                    <span class="unit unitMonth">DH/mois</span>
                  </div>
                </div>
              </div>

              <div class="empTotal mono">
                <span class="muted">Poste / mois</span>
                <b>{{ money(clamp(draft[`${g.key}Nb`], 0, 9999) * clamp(draft[`${g.key}Cout`], 0, 999999), 2) }}</b>
              </div>
            </div>
          </div>

          <div class="muted foot">
            Calcul mensuel : Σ(<b>Nb × Coût</b>). Champs bleus = valeurs <b>DH/mois</b>.
          </div>
        </div>
      </template>
    </template>

    <!-- MODAL -->
    <div v-if="modal.open" class="modalMask" @click.self="closeModal()">
      <div class="modal">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>
        <div class="modalActions">
          <button class="btn" @click="closeModal()">Fermer</button>
          <button v-if="modal.mode === 'confirm'" class="btn primary" @click="modal.onConfirm && modal.onConfirm()">
            Confirmer
          </button>
        </div>
      </div>
    </div>

    <!-- ✅ MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      section-label="Coûts employés"
      :source-variant-id="String((store as any).activeVariantId ?? (variant?.id ?? '')) || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  max-width: 100%;
}
* {
  box-sizing: border-box;
}
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
  min-width: 0;
}
.h1 {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.1;
  margin: 0;
}
.muted {
  color: #6b7280;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  max-width: 100%;
}
.panel.error {
  border-color: #ef4444;
  background: #fff5f5;
}
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
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mono {
  font-variant-numeric: tabular-nums;
}

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 1050px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.kpi {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  min-width: 0;
}
.kLbl {
  font-size: 11px;
  color: #6b7280;
}
.kVal {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kVal span {
  font-weight: 700;
  color: #6b7280;
  margin-left: 6px;
}
.kpiMonth {
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.9);
}
.kpiMonth .kLbl {
  color: #1d4ed8;
  font-weight: 900;
}
.kpiMonth .kVal span {
  color: #1d4ed8;
  font-weight: 900;
}

/* responsive grid */
.gridCards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
  max-width: 100%;
}
.empCard {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}
.empTop {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.empTitle {
  font-weight: 950;
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empHint {
  font-size: 11px;
  white-space: nowrap;
}

.empRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.label {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inCell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.unit {
  color: #6b7280;
  font-size: 11px;
  white-space: nowrap;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.unitMonth {
  color: #1d4ed8;
  font-weight: 900;
}

.inputNb,
.inputCout {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 12px;
  padding: 5px 7px;
  width: 100%;
  max-width: 100%;
  text-align: right;
  min-width: 0;
}
.inputNb {
  max-width: 92px;
}
.inputCout {
  max-width: 140px;
}

.inputMonth {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.8);
}
.inputMonth:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.empTotal {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
  min-width: 0;
}
.empTotal b {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.foot {
  margin-top: 8px;
}

/* modal */
.modalMask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
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
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.modalTitle {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 6px;
}
.modalMsg {
  color: #374151;
  font-size: 13px;
  white-space: pre-wrap;
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

@media (max-width: 420px) {
  .empRow {
    grid-template-columns: 1fr;
  }
  .inputNb {
    max-width: 100%;
  }
  .inputCout {
    max-width: 100%;
  }
}
</style>
