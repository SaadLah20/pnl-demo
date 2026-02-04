<!-- src/pages/CoutM3Page.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0 && (store as any).loadPnls) {
    await (store as any).loadPnls();
  }
});

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);

/* =========================
   DRAFT (coutM3)
========================= */
type Draft = { eau: number; qualite: number; dechets: number };
const draft = reactive<Draft>({ eau: 0, qualite: 0, dechets: 0 });

function loadDraftFromVariant() {
  const v: any = variant.value ?? {};
  draft.eau = clamp(v?.coutM3?.eau, 0, 1e12);
  draft.qualite = clamp(v?.coutM3?.qualite, 0, 1e12);
  draft.dechets = clamp(v?.coutM3?.dechets, 0, 1e12);
}

watch(
  () => variant.value?.id,
  () => loadDraftFromVariant(),
  { immediate: true }
);

/* =========================
   FORMULES (read-only calc)
   -> CA Total pour calculer %
========================= */
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find(
    (x: any) => String(x.mpId) === String(mpId)
  );
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };
function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty); // kg/m³
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0)
);

const caTotal = computed(() => {
  const t = transportPrixMoyen.value;
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const pv = cmpParM3For(vf) + momd + t;
    return s + pv * vol;
  }, 0);
});

/* =========================
   KPIs (COUT AU M³)
========================= */
const coutM3ParM3 = computed(() => toNum(draft.eau) + toNum(draft.qualite) + toNum(draft.dechets));
const coutM3Total = computed(() => coutM3ParM3.value * volumeTotal.value);

const dureeMois = computed(() => toNum(contract.value?.dureeMois));
const coutM3ParMois = computed(() => (dureeMois.value > 0 ? coutM3Total.value / dureeMois.value : 0));

const coutM3Pct = computed(() => (caTotal.value > 0 ? (coutM3Total.value / caTotal.value) * 100 : 0));

/* =========================
   MODAL
========================= */
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

/* =========================
   SAVE / RESET
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload() {
  const existing: any = (variant.value as any)?.coutM3 ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    eau: Number(clamp(draft.eau, 0, 1e12)),
    qualite: Number(clamp(draft.qualite, 0, 1e12)),
    dechets: Number(clamp(draft.dechets, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { coutM3: buildPayload() });
    openInfo("Enregistré", "Coût au m³ mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement du coût au m³ ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadDraftFromVariant();
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="tleft">
        <div class="titleRow">
          <div class="h1">Coût au m³</div>
          <span class="badge" v-if="variant">Variante active</span>
        </div>

        <div class="muted tiny" v-if="variant">
          <b class="clip">{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="contract?.dureeMois" class="sep">•</span>
          <span v-if="contract?.dureeMois">Durée <b>{{ contract.dureeMois }}</b> mois</span>
        </div>
        <div class="muted tiny" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Reset</button>
        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "…" : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="alert">Chargement…</div>
    <div v-else-if="(store as any).error" class="alert error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="alert error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="card">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <!-- ✅ KPIs -->
        <div class="kpis">
          <div class="kpi kpiSpecial">
            <div class="kLbl kLblSpecial">Prix / m³</div>
            <div class="kVal mono kValSpecial">
              {{ n(coutM3ParM3, 2) }}
              <span class="unitSpecial">DH/m³</span>
            </div>
          </div>

          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal mono">{{ money(coutM3Total, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="kLbl">/ mois</div>
            <div class="kVal mono">{{ money(coutM3ParMois, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="kLbl">%</div>
            <div class="kVal mono">{{ n(coutM3Pct, 2) }} <span>%</span></div>
          </div>
        </div>

        <!-- ✅ Inputs alignés label + input (gauche) comme Maintenance -->
        <div class="card">
          <div class="formGrid">
            <div class="field">
              <div class="label">Eau</div>
              <div class="inputLine">
                <input class="inputSm mono inputMonthLike" type="number" step="0.01" min="0" v-model.number="draft.eau" />
                <span class="unit unitMonthLike">DH/m³</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Qualité</div>
              <div class="inputLine">
                <input
                  class="inputSm mono inputMonthLike"
                  type="number"
                  step="0.01"
                  min="0"
                  v-model.number="draft.qualite"
                />
                <span class="unit unitMonthLike">DH/m³</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Déchets</div>
              <div class="inputLine">
                <input
                  class="inputSm mono inputMonthLike"
                  type="number"
                  step="0.01"
                  min="0"
                  v-model.number="draft.dechets"
                />
                <span class="unit unitMonthLike">DH/m³</span>
              </div>
            </div>
          </div>

          <div class="note muted tiny">
            Prix/m³ = Eau + Qualité + Déchets • Total = Prix/m³ × Volume total (formules).
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
  </div>
</template>

<style scoped>
/* compact page */
.page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

/* top */
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.tleft {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 260px;
}
.titleRow {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.h1 {
  font-size: 16px;
  font-weight: 950;
  line-height: 1.05;
  margin: 0;
  color: #111827;
}
.badge {
  font-size: 10px;
  font-weight: 950;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 7px;
  border-radius: 999px;
}
.muted {
  color: #6b7280;
  font-size: 11px;
}
.tiny {
  font-size: 10px;
}
.clip {
  display: inline-block;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sep {
  margin: 0 6px;
  color: #9ca3af;
}
.actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

/* alerts */
.alert {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px 10px;
  font-size: 12px;
}
.alert.error {
  border-color: #ef4444;
  background: #fff5f5;
}

/* buttons */
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 12px;
  padding: 7px 9px;
  font-size: 11px;
  font-weight: 950;
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
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mono {
  font-variant-numeric: tabular-nums;
}

/* cards */
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 10px;
}

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 8px;
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.kLbl {
  font-size: 10px;
  color: #6b7280;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.kVal {
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
  color: #111827;
}
.kVal span {
  font-weight: 900;
  color: #6b7280;
  margin-left: 6px;
  font-size: 10.5px;
}

/* KPI spécial (Prix / m³) */
.kpiSpecial {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(239, 246, 255, 0.9);
}
.kLblSpecial {
  color: rgba(29, 78, 216, 0.95);
}
.kValSpecial {
  color: #111827;
}
.unitSpecial {
  color: rgba(29, 78, 216, 0.95) !important;
  font-weight: 950 !important;
}

/* ✅ Form aligné label + input (gauche) */
.formGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 10px;
}
@media (max-width: 980px) {
  .formGrid {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 950;
}

/* ligne input similaire à Maintenance */
.inputLine {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* même base inputSm que Maintenance */
.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  font-size: 11px;
  padding: 6px 7px;
  background: #fff;
  width: 120px; /* ✅ compact, pas énorme */
  text-align: right;
}

/* ✅ même style "mensuel" (bleu) de Maintenance */
.inputMonthLike {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(239, 246, 255, 0.9);
  font-weight: 950;
}
.inputMonthLike:focus {
  outline: none;
  border-color: rgba(29, 78, 216, 0.85);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.unit {
  color: #6b7280;
  font-size: 10.5px;
  font-weight: 900;
  white-space: nowrap;
}
.unitMonthLike {
  color: rgba(29, 78, 216, 0.95);
  font-weight: 950;
}

.note {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

/* modal */
.modalMask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
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
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.modalTitle {
  font-weight: 950;
  font-size: 13px;
  margin-bottom: 6px;
  color: #111827;
}
.modalMsg {
  color: #374151;
  font-size: 12px;
  white-space: pre-wrap;
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
