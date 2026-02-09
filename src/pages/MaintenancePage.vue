<!-- src/pages/MaintenancePage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";

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
const dureeMois = computed(() => Math.max(0, toNum(contract.value?.dureeMois)));

/* =========================
   EDIT MODEL (MAINTENANCE)
========================= */
type MaintenanceEdit = {
  cab: number;
  elec: number;
  chargeur: number;
  generale: number;
  bassins: number;
  preventive: number;
};

const edit = reactive<MaintenanceEdit>({
  cab: 0,
  elec: 0,
  chargeur: 0,
  generale: 0,
  bassins: 0,
  preventive: 0,
});

function loadFromVariant() {
  const m: any = (variant.value as any)?.maintenance ?? {};
  edit.cab = clamp(m?.cab, 0, 1e12);
  edit.elec = clamp(m?.elec, 0, 1e12);
  edit.chargeur = clamp(m?.chargeur, 0, 1e12);
  edit.generale = clamp(m?.generale, 0, 1e12);
  edit.bassins = clamp(m?.bassins, 0, 1e12);
  edit.preventive = clamp(m?.preventive, 0, 1e12);
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

/* =========================
   METRICS
========================= */
type Line = {
  key: keyof MaintenanceEdit;
  label: string;
  mensuel: number; // DH/mois
  total: number; // DH
  parM3: number; // DH/m3
  pctCa: number; // %
};

// Volume + CA restent nécessaires ici car utilisés par DH/m3 et %CA
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0)
);

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
    const qty = toNum(it.qty); // kg/m3
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

const mensuelTotal = computed(() => {
  return (
    toNum(edit.cab) +
    toNum(edit.elec) +
    toNum(edit.chargeur) +
    toNum(edit.generale) +
    toNum(edit.bassins) +
    toNum(edit.preventive)
  );
});

const total = computed(() => mensuelTotal.value * dureeMois.value);

const parM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));

const pctCa = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

const lines = computed<Line[]>(() => {
  const mk = (key: keyof MaintenanceEdit, label: string): Line => {
    const mensuel = toNum(edit[key]);
    const total = mensuel * dureeMois.value;
    const parM3 = volumeTotal.value > 0 ? total / volumeTotal.value : 0;
    const pctCa = caTotal.value > 0 ? (total / caTotal.value) * 100 : 0;
    return { key, label, mensuel, total, parM3, pctCa };
  };

  return [
    mk("cab", "Maintenance CAB"),
    mk("elec", "Maintenance Électricité"),
    mk("chargeur", "Maintenance Chargeur"),
    mk("generale", "Maintenance Générale"),
    mk("bassins", "Maintenance Bassins"),
    mk("preventive", "Maintenance Préventive"),
  ];
});

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

function buildPayload(): any {
  const existing: any = (variant.value as any)?.maintenance ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    cab: Number(clamp(edit.cab, 0, 1e12)),
    elec: Number(clamp(edit.elec, 0, 1e12)),
    chargeur: Number(clamp(edit.chargeur, 0, 1e12)),
    generale: Number(clamp(edit.generale, 0, 1e12)),
    bassins: Number(clamp(edit.bassins, 0, 1e12)),
    preventive: Number(clamp(edit.preventive, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { maintenance: buildPayload() });
    openInfo("Enregistré", "La section Maintenance a été mise à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer Maintenance", "Confirmer l’enregistrement de la Maintenance ?", async () => {
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

/* =========================
   ✅ GENERALISER (AJOUT UNIQUEMENT)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeTo(variantIds: string[]) {
  const sourceId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceId) return;

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds ?? []) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceId) continue;

      await (store as any).updateVariant(targetId, { maintenance: payload });
    }
    openInfo("Généralisé", "La section Maintenance a été généralisée sur les variantes ciblées.");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    openInfo("Erreur", String(genErr.value ?? e?.message ?? e));
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Maintenance sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Maintenance sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser Maintenance", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Maintenance</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ dureeMois }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>

        <!-- ✅ AJOUT: bouton Généraliser -->
        <button class="btn" :disabled="!variant || saving || genBusy" @click="genOpen = true">
          {{ genBusy ? "..." : "Généraliser" }}
        </button>

        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <!-- ✅ AJOUT: feedback généralisation (non intrusif) -->
      <div v-if="genErr" class="panel error"><b>Généralisation :</b> {{ genErr }}</div>
      <div v-if="genBusy" class="panel"><b>Généralisation :</b> traitement…</div>

      <div v-if="!variant" class="panel">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <!-- KPIs -->
        <div class="kpis">
          <div class="kpi kpiMonth">
            <div class="kLbl">Maintenance / mois</div>
            <div class="kVal">{{ n(mensuelTotal, 2) }} <span>DH/mois</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">Maintenance total</div>
            <div class="kVal">{{ money(total, 2) }}</div>
          </div>
          <div class="kpi">
            <div class="kLbl">Maintenance / m³</div>
            <div class="kVal">{{ n(parM3, 2) }} <span>DH/m³</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">% du CA</div>
            <div class="kVal">{{ n(pctCa, 2) }} <span>%</span></div>
          </div>
        </div>

        <!-- Table -->
        <div class="panel">
          <div class="tableWrap">
            <table class="table">
              <colgroup>
                <col class="colLabel" />
                <col class="colMensuel" />
                <col class="colTotal" />
                <col class="colM3" />
                <col class="colPct" />
              </colgroup>

              <thead>
                <tr>
                  <th class="th">Poste</th>
                  <th class="th r">DH/mois</th>
                  <th class="th r">Total (DH)</th>
                  <th class="th r">DH/m³</th>
                  <th class="th r">% CA</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="ln in lines" :key="String(ln.key)">
                  <td class="labelCell"><b>{{ ln.label }}</b></td>

                  <td class="r">
                    <div class="inCell">
                      <input
                        class="inputSm r inputMonth"
                        type="number"
                        step="0.01"
                        min="0"
                        :value="(edit as any)[ln.key]"
                        @input="(edit as any)[ln.key] = clamp(($event.target as HTMLInputElement).value, 0, 1e12)"
                      />
                      <span class="unit unitMonth">DH</span>
                    </div>
                  </td>

                  <td class="r mono"><b>{{ money(ln.total, 2) }}</b></td>
                  <td class="r mono">{{ n(ln.parM3, 2) }}</td>
                  <td class="r mono">{{ n(ln.pctCa, 2) }}%</td>
                </tr>

                <tr class="sumRow">
                  <td><b>Total</b></td>
                  <td class="r"><b>{{ n(mensuelTotal, 2) }}</b> <span class="unit">DH</span></td>
                  <td class="r"><b>{{ money(total, 2) }}</b></td>
                  <td class="r"><b>{{ n(parM3, 2) }}</b></td>
                  <td class="r"><b>{{ n(pctCa, 2) }}%</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="muted foot">
            Durée utilisée : <b>{{ dureeMois }}</b> mois — % calculé sur le CA issu des formules (CMP + Transport + MOMD).
          </div>
        </div>
      </template>
    </template>

    <!-- ✅ AJOUT: MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Maintenance"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- MODAL -->
    <div v-if="modal.open" class="modalMask" @click.self="closeModal()">
      <div class="modal">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>

        <div class="modalActions">
          <button class="btn" @click="closeModal()">Fermer</button>
          <button
            v-if="modal.mode === 'confirm'"
            class="btn primary"
            @click="
              async () => {
                if (modal.onConfirm) await modal.onConfirm();
              }
            "
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
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

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(170px, 1fr));
  gap: 8px;
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(170px, 1fr));
  }
}

.kpi {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kLbl {
  font-size: 11px;
  color: #6b7280;
}
.kVal {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}
.kVal span {
  font-weight: 600;
  color: #6b7280;
  margin-left: 6px;
}

/* ✅ KPI /mois (spécial comme demandé) */
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

/* Table */
.tableWrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.colLabel {
  width: 260px;
}
.colMensuel {
  width: 150px;
}
.colTotal {
  width: 170px;
}
.colM3 {
  width: 120px;
}
.colPct {
  width: 90px;
}

.th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 8px;
  vertical-align: middle;
}
.th {
  background: #fafafa;
  color: #6b7280;
  font-size: 11px;
  white-space: nowrap;
}
.r {
  text-align: right;
}
.mono {
  font-variant-numeric: tabular-nums;
}

.inCell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
}
.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 12px;
  padding: 5px 7px;
  width: 92px;
  text-align: right;
}
.unit {
  color: #6b7280;
  font-size: 11px;
  min-width: 20px;
  text-align: right;
}

/* ✅ champs /mois distingués */
.inputMonth {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.8);
}
.inputMonth:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.unitMonth {
  color: #1d4ed8;
  font-weight: 900;
}

.sumRow td {
  background: #fcfcfd;
  font-weight: 900;
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
</style>
