<!-- src/pages/AutresCoutsPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
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
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => Math.max(0, toNum(contract.value?.dureeMois)));

/* =========================
   KPIs requis (Volume / CA)
========================= */
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

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0)
);

const transportPrixMoyen = computed(() => clamp((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const items = (((variant.value as any)?.mp?.items ?? []) as any[]).find(
    (x: any) => String(x.mpId) === String(mpId)
  );
  if (!items) return 0;
  if (items?.prix != null) return clamp(items.prix);
  return clamp(items?.mp?.prix);
}

function cmpParM3For(vf: any): number {
  const it = (vf?.formule?.items ?? []) as any[];
  return it.reduce((s: number, x: any) => {
    const qtyKg = clamp(x?.qty);
    const prixTonne = mpPriceUsed(String(x?.mpId));
    return s + (qtyKg / 1000) * prixTonne;
  }, 0);
}

const caTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0)
);

/* =========================
   AUTRES COUTS - UI MODEL
========================= */
type Unite = "FORFAIT" | "MOIS" | "M3" | "POURCENT_CA";

type DraftRow = {
  _id: string;
  label: string;
  unite: Unite;
  valeur: number;
};

const rows = ref<DraftRow[]>([]);

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadFromVariant() {
  const items = ((variant.value as any)?.autresCouts?.items ?? []) as any[];
  rows.value = items.map((it: any) => ({
    _id: uid(),
    label: String(it?.label ?? ""),
    unite: (String(it?.unite ?? "FORFAIT") as Unite) || "FORFAIT",
    valeur: clamp(it?.valeur),
  }));
}

watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

/* =========================
   CALCULS
========================= */
function totalFor(r: DraftRow): number {
  const v = clamp(r.valeur);
  if (r.unite === "FORFAIT") return v;
  if (r.unite === "MOIS") return v * clamp(dureeMois.value);
  if (r.unite === "M3") return v * clamp(volumeTotal.value);
  return (v / 100) * clamp(caTotal.value); // POURCENT_CA
}

function perM3For(r: DraftRow): number {
  const vol = clamp(volumeTotal.value);
  if (vol <= 0) return 0;
  return totalFor(r) / vol;
}

function pctFor(r: DraftRow): number {
  const ca = clamp(caTotal.value);
  if (ca <= 0) return 0;
  return (totalFor(r) / ca) * 100;
}

const totalGlobal = computed(() => rows.value.reduce((s, r) => s + totalFor(r), 0));
const perM3Global = computed(() => (volumeTotal.value > 0 ? totalGlobal.value / volumeTotal.value : 0));
const monthlyGlobal = computed(() => (dureeMois.value > 0 ? totalGlobal.value / dureeMois.value : 0));
const pctGlobal = computed(() => (caTotal.value > 0 ? (totalGlobal.value / caTotal.value) * 100 : 0));

/* =========================
   ACTIONS
========================= */
function addRow() {
  rows.value.push({ _id: uid(), label: "Nouveau coût", unite: "FORFAIT", valeur: 0 });
}
function removeRow(idx: number) {
  rows.value.splice(idx, 1);
}

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
  return rows.value.map((r) => ({
    label: String(r.label ?? ""),
    unite: String(r.unite ?? "FORFAIT"),
    valeur: Number(clamp(r.valeur)),
  }));
}

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { autresCouts: { items: buildPayload() } });
    openInfo("Enregistré", "Autres coûts mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des autres coûts ?", async () => {
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
        <div class="h1">Autres coûts</div>

        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ dureeMois }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>
        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="panel">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <!-- KPIs: KPI spécial = TOTAL (éloigné visuellement du Prix/m³) -->
        <div class="kpis">
          <div class="kpi kpiMain">
            <div class="kLbl">Total autres coûts</div>
            <div class="kVal mono">{{ money(totalGlobal, 2) }}</div>
          </div>

          <div class="kpi kpiMonth">
            <div class="kLbl">/ mois</div>
            <div class="kVal mono">{{ money(monthlyGlobal, 2) }} <span>DH/mois</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">Prix / m³</div>
            <div class="kVal mono">{{ n(perM3Global, 2) }} <span>DH/m³</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">%</div>
            <div class="kVal mono">{{ n(pctGlobal, 2) }} <span>%</span></div>
          </div>
        </div>

        <div class="panel">
          <div class="rowTop">
            <button class="btn" @click="addRow()">+ Ajouter</button>
          </div>

          <!-- ✅ HEADER EXACTEMENT sur les colonnes -->
          <div class="gridHead">
            <div class="hCell">Nom</div>
            <div class="hCell">Unité</div>
            <div class="hCell r">Valeur</div>
            <div class="hCell r">Prix / m³</div>
            <div class="hCell r">Total</div>
            <div class="hCell r">%</div>
            <div class="hCell r"></div>
          </div>

          <div class="gridBody">
            <div v-for="(r, idx) in rows" :key="r._id" class="gridRow">
              <div class="cell">
                <input class="input" v-model="r.label" placeholder="Ex: Assurance, Divers..." />
              </div>

              <div class="cell">
                <select class="select" v-model="r.unite">
                  <option value="FORFAIT">FORFAIT</option>
                  <option value="MOIS">MOIS</option>
                  <option value="M3">M3</option>
                  <option value="POURCENT_CA">% CA</option>
                </select>
              </div>

              <div class="cell r">
                <div class="inCell">
                  <input
                    class="inputVal r"
                    type="number"
                    step="0.01"
                    min="0"
                    v-model.number="r.valeur"
                    :placeholder="r.unite === 'POURCENT_CA' ? 'ex: 2.5' : '0'"
                  />
                  <span class="unit">
                    <template v-if="r.unite === 'POURCENT_CA'">%</template>
                    <template v-else-if="r.unite === 'M3'">DH/m³</template>
                    <template v-else-if="r.unite === 'MOIS'">DH/mois</template>
                    <template v-else>DH</template>
                  </span>
                </div>
              </div>

              <div class="cell r mono">{{ n(perM3For(r), 2) }}</div>
              <div class="cell r mono"><b>{{ money(totalFor(r), 2) }}</b></div>
              <div class="cell r mono">{{ n(pctFor(r), 2) }}%</div>

              <div class="cell r">
                <button class="btn danger" @click="removeRow(idx)">Suppr</button>
              </div>
            </div>

            <div v-if="rows.length === 0" class="empty muted">Aucun autre coût.</div>
          </div>

          <div class="footNote muted">
            Notes : <b>M3</b> et <b>%CA</b> utilisent le <b>volume total</b> et le <b>CA total</b> de la variante.
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
.btn.danger {
  border-color: #ef4444;
  color: #b91c1c;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mono {
  font-variant-numeric: tabular-nums;
}
.r {
  text-align: right;
}

/* =========================
   KPIs (Total séparé du Prix/m³)
========================= */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px; /* + d’air entre KPI */
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

/* KPI spécial = TOTAL (plus large) */
.kpiMain {
  border: 1px solid rgba(16, 185, 129, 0.45);
  background: rgba(236, 253, 245, 0.9);
}
@media (min-width: 1051px) {
  .kpiMain {
    grid-column: span 2; /* éloigne visuellement du Prix/m³ */
  }
}
.kpiMain .kLbl {
  color: #065f46;
  font-weight: 950;
}
.kpiMain .kVal {
  font-size: 14px;
}

/* /mois distingué */
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

.rowTop {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 8px;
}

/* =========================
   GRID (Header aligné EXACT sur champs)
========================= */
/* Colonnes: Nom | Unité | Valeur | Prix/m³ | Total | % | Action */
.gridHead,
.gridRow {
  display: grid;
  grid-template-columns:
    minmax(220px, 2.2fr)
    minmax(120px, 1fr)
    minmax(170px, 1.2fr)
    minmax(110px, 0.9fr)
    minmax(140px, 1.1fr)
    minmax(80px, 0.7fr)
    88px;
  column-gap: 10px;
}

.gridHead {
  padding: 8px 6px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
  color: #6b7280;
  font-size: 11px;
  border-radius: 10px;
}
.hCell {
  min-width: 0;
  line-height: 1.2;
}

.gridBody {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.gridRow {
  align-items: center;
  padding: 6px 6px;
  border-bottom: 1px solid #f1f5f9;
}

.cell {
  min-width: 0;
}

/* Mobile: cartes, pas de header */
@media (max-width: 980px) {
  .gridHead {
    display: none;
  }
  .gridRow {
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: auto;
    row-gap: 8px;
    column-gap: 10px;
    padding: 10px 8px;
    border: 1px solid #eef2f7;
    border-radius: 12px;
  }
  .gridRow .cell:nth-child(1) {
    grid-column: 1 / -1;
  }
  .gridRow .cell:nth-child(2) {
    grid-column: 1 / 2;
  }
  .gridRow .cell:nth-child(3) {
    grid-column: 2 / 3;
  }
  .gridRow .cell:nth-child(4),
  .gridRow .cell:nth-child(5),
  .gridRow .cell:nth-child(6),
  .gridRow .cell:nth-child(7) {
    grid-column: 1 / -1;
    justify-self: end;
  }
}

/* Inputs */
.select,
.input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 13px;
  padding: 7px 9px;
  width: 100%;
  min-width: 0;
}

/* Valeur: ✅ uniformisé (même taille pour tous) + unité ne déborde pas */
.inCell {
  display: grid;
  grid-template-columns: 120px auto; /* ✅ taille fixe */
  align-items: center;
  justify-content: end;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
@media (max-width: 980px) {
  .inCell {
    grid-template-columns: 120px auto;
  }
}
.inputVal {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 12px;
  padding: 5px 7px;
  width: 120px; /* ✅ uniforme */
  text-align: right;
}
.unit {
  color: #6b7280;
  font-size: 11px;
  white-space: nowrap; /* ✅ pas de retour */
}

.empty {
  padding: 10px 6px;
}
.footNote {
  margin-top: 10px;
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
