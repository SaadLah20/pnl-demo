<!-- src/pages/MaintenancePage.vue -->
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
    mk("cab", "CAB"),
    mk("elec", "Électricité"),
    mk("chargeur", "Chargeur"),
    mk("generale", "Générale"),
    mk("bassins", "Bassins"),
    mk("preventive", "Préventive"),
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
</script>

<template>
  <div class="page">
    <!-- ✅ Top compact -->
    <div class="top">
      <div class="tleft">
        <div class="titleRow">
          <div class="h1">Maintenance</div>
          <span class="badge" v-if="variant">Variante active</span>
        </div>
        <div class="muted tiny" v-if="variant">
          <b class="clip">{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois" class="sep">•</span>
          <span v-if="dureeMois">Durée <b>{{ dureeMois }}</b> mois</span>
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
        <!-- ✅ KPIs denses (4) -->
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Mensuel</div>
            <div class="kVal mono">{{ n(mensuelTotal, 2) }} <span>DH/mois</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal mono">{{ money(total, 2) }}</div>
          </div>
          <div class="kpi">
            <div class="kLbl">DH / m³</div>
            <div class="kVal mono">{{ n(parM3, 2) }} <span>DH/m³</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">% CA</div>
            <div class="kVal mono">{{ n(pctCa, 2) }} <span>%</span></div>
          </div>
        </div>

        <!-- ✅ Table dense -->
        <div class="card pad0">
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
                  <th class="th r">Total</th>
                  <th class="th r">DH/m³</th>
                  <th class="th r">% CA</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="ln in lines" :key="String(ln.key)">
                  <td class="labelCell">
                    <b>{{ ln.label }}</b>
                  </td>

                  <!-- ✅ input mensuel => couleur spéciale -->
                  <td class="r">
                    <div class="inCell">
                      <input
                        class="inputSm mono r inputMonth"
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
                  <td class="r">
                    <b class="mono">{{ n(mensuelTotal, 2) }}</b> <span class="unit unitMonth">DH</span>
                  </td>
                  <td class="r"><b class="mono">{{ money(total, 2) }}</b></td>
                  <td class="r"><b class="mono">{{ n(parM3, 2) }}</b></td>
                  <td class="r"><b class="mono">{{ n(pctCa, 2) }}%</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="foot muted tiny">
            Durée : <b>{{ dureeMois }}</b> mois — % sur CA (CMP + Transport + MOMD).
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
/* ✅ ultra compact page */
.page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

/* top compact */
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

/* cards */
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 10px;
}
.card.pad0 {
  padding: 0;
}

/* KPIs compact */
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

.mono {
  font-variant-numeric: tabular-nums;
}

/* table dense */
.tableWrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  table-layout: fixed;
}
.colLabel {
  width: 230px;
}
.colMensuel {
  width: 160px;
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
  padding: 6px 7px; /* ✅ dense */
  vertical-align: middle;
}
.th {
  background: #fafafa;
  color: #6b7280;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}
.r {
  text-align: right;
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
  border-radius: 12px;
  font-size: 11px;
  padding: 6px 7px;
  width: 92px;
  text-align: right;
  background: #fff;
}
.unit {
  color: #6b7280;
  font-size: 10.5px;
  min-width: 20px;
  text-align: right;
}

/* ✅ Distinction des champs mensuels (DH/mois) */
.inputMonth {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(239, 246, 255, 0.9);
  font-weight: 950;
}
.inputMonth:focus {
  outline: none;
  border-color: rgba(29, 78, 216, 0.85);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.unitMonth {
  color: rgba(29, 78, 216, 0.95);
  font-weight: 950;
}

.sumRow td {
  background: #fcfcfd;
  font-weight: 950;
}

.foot {
  padding: 7px 10px;
  border-top: 1px solid #e5e7eb;
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
