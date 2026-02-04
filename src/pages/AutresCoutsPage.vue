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

const dureeMois = computed(() => toNum(contract.value?.dureeMois));

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

const volumeTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0);
});

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
    const coutParM3 = (qtyKg / 1000) * prixTonne;
    return s + coutParM3;
  }, 0);
}

const caTotal = computed(() => {
  // CA = Σ (PVformule * volume)
  // PV = CMP + Transport + MOMD
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

const pvMoy = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  return caTotal.value / vol;
});

/* =========================
   AUTRES COUTS - UI MODEL
========================= */
type Unite = "FORFAIT" | "MOIS" | "M3" | "POURCENT_CA";

type DraftRow = {
  _id: string; // local id pour v-for stable
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

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

/* =========================
   CALCULS
========================= */
function totalFor(r: DraftRow): number {
  const v = clamp(r.valeur);

  if (r.unite === "FORFAIT") return v;
  if (r.unite === "MOIS") return v * clamp(dureeMois.value);
  if (r.unite === "M3") return v * clamp(volumeTotal.value);

  // POURCENT_CA
  return (v / 100) * clamp(caTotal.value);
}

function monthlyFor(r: DraftRow): number {
  const v = clamp(r.valeur);

  if (r.unite === "MOIS") return v;

  if (r.unite === "FORFAIT") {
    const d = clamp(dureeMois.value);
    if (d <= 0) return 0;
    return totalFor(r) / d;
  }

  // M3 et %CA -> mensuel dépend de volumes mensuels (non dispo)
  return 0;
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

const perM3Global = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  return totalGlobal.value / vol;
});

const monthlyGlobal = computed(() => {
  const d = clamp(dureeMois.value);
  if (d <= 0) return 0;
  return totalGlobal.value / d;
});

const pctGlobal = computed(() => {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (totalGlobal.value / ca) * 100;
});

/* =========================
   ACTIONS
========================= */
function addRow() {
  rows.value.push({
    _id: uid(),
    label: "Nouveau coût",
    unite: "FORFAIT",
    valeur: 0,
  });
}

function removeRow(idx: number) {
  rows.value.splice(idx, 1);
}

/* =========================
   MODAL (confirm/info)
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
    await (store as any).updateVariant(variant.value.id, {
      autresCouts: { items: buildPayload() },
    });
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
    <!-- HEADER compact (style dashboard-like) -->
    <div class="head">
      <div class="hLeft">
        <div class="hTitle">Autres coûts</div>
        <div class="hSub muted" v-if="variant">
          Variante : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> • {{ dureeMois }} mois</span>
          <span v-if="volumeTotal"> • Vol {{ n(volumeTotal, 0) }} m³</span>
          <span v-if="caTotal"> • CA {{ money(caTotal, 0) }}</span>
          <span v-if="pvMoy"> • PV moy {{ money(pvMoy, 2) }}/m³</span>
        </div>
        <div class="hSub muted" v-else>Aucune variante active.</div>
      </div>

      <div class="hRight">
        <button class="btn" type="button" :disabled="!variant || saving" @click="addRow()">+ Ajouter</button>
        <button class="btn" type="button" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>
        <button class="btn primary" type="button" :disabled="!variant || saving" @click="askSave()">
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
        <!-- KPIs: 1 ligne, très compacte -->
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Autres coûts /m³</div>
            <div class="kVal">{{ n(perM3Global, 2) }} <span class="kUnit">DH/m³</span></div>
          </div>
          <div class="kpi">
            <div class="kLbl">Autres coûts /mois</div>
            <div class="kVal">{{ money(monthlyGlobal, 2) }}</div>
          </div>
          <div class="kpi">
            <div class="kLbl">Autres coûts total</div>
            <div class="kVal">{{ money(totalGlobal, 2) }}</div>
          </div>
          <div class="kpi">
            <div class="kLbl">% du CA</div>
            <div class="kVal">{{ n(pctGlobal, 2) }} <span class="kUnit">%</span></div>
          </div>
        </div>

        <!-- LIST (grid rows) : compact + no overflow -->
        <div class="panel list">
          <div class="listHead">
            <div class="cLabel">Désignation</div>
            <div class="cUnite">Unité</div>
            <div class="cVal r">Valeur</div>
            <div class="cPm3 r">/m³</div>
            <div class="cTot r">Total</div>
            <div class="cPct r">%</div>
            <div class="cAct r"></div>
          </div>

          <div v-if="rows.length === 0" class="empty muted">Aucun autre coût.</div>

          <div v-for="(r0, idx) in rows" :key="r0._id" class="row">
            <!-- label -->
            <div class="cell cLabel">
              <input class="in" v-model="r0.label" placeholder="Ex: Sécurité, gardiennage…" />
            </div>

            <!-- unite -->
            <div class="cell cUnite">
              <select class="in" v-model="r0.unite">
                <option value="FORFAIT">FORFAIT</option>
                <option value="MOIS">MOIS</option>
                <option value="M3">M3</option>
                <option value="POURCENT_CA">%CA</option>
              </select>
            </div>

            <!-- valeur -->
            <div class="cell cVal r">
              <div class="valWrap">
                <input
                  class="in inSm r"
                  type="number"
                  step="0.01"
                  min="0"
                  v-model.number="r0.valeur"
                  :placeholder="r0.unite === 'POURCENT_CA' ? 'ex: 2.5' : '0'"
                />
                <span class="unit">
                  <template v-if="r0.unite === 'POURCENT_CA'">%</template>
                  <template v-else>DH</template>
                </span>
              </div>
            </div>

            <!-- computed -->
            <div class="cell cPm3 r mono">{{ n(perM3For(r0), 2) }}</div>
            <div class="cell cTot r mono"><b>{{ money(totalFor(r0), 2) }}</b></div>
            <div class="cell cPct r mono">{{ n(pctFor(r0), 2) }}%</div>

            <!-- actions -->
            <div class="cell cAct r">
              <button class="icon danger" type="button" title="Supprimer" @click="removeRow(idx)">✕</button>
            </div>
          </div>

          <div class="foot muted">
            Note : unités <b>M3</b> et <b>%CA</b> calculées sur le volume total et le CA total de la variante.
            <span class="muted" style="margin-left: 8px;">(Mensuel pour M3/%CA = 0 par design)</span>
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
/* ✅ anti-overflow global */
.page, .panel, .head, .kpis, .row, .listHead { min-width: 0; }
* { box-sizing: border-box; }

.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

/* Header (compact, dashboard-like) */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 55%);
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
.hLeft { display:flex; flex-direction:column; gap:2px; min-width: 0; }
.hTitle { font-size: 14px; font-weight: 950; color:#0f172a; line-height: 1.1; }
.hSub { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 1100px; }
.muted { color: rgba(107, 114, 128, 1); font-weight: 800; }
.hRight { margin-left: auto; display:flex; gap:8px; align-items:center; flex-wrap: wrap; }

/* panel */
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 10px;
}
.panel.error {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}

/* buttons */
.btn {
  height: 34px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 14px;
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  background: rgba(32, 184, 232, 0.10);
  border-color: rgba(32, 184, 232, 0.18);
}
.btn.primary {
  background: rgba(24, 64, 112, 0.92);
  border-color: rgba(24, 64, 112, 0.6);
  color: #fff;
}
.btn.primary:hover { background: rgba(24, 64, 112, 1); }
.btn:disabled { opacity: .6; cursor: not-allowed; }

/* KPI row (very compact) */
.kpis{
  display:grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 980px){
  .kpis{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.kpi{
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 14px;
  background: rgba(255,255,255,0.9);
  padding: 8px 10px;
  min-width: 0;
}
.kLbl{ font-size: 10.8px; font-weight: 950; color: rgba(15, 23, 42, 0.6); }
.kVal{ margin-top: 2px; font-size: 13px; font-weight: 950; color:#0f172a; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
.kUnit{ font-size: 11px; font-weight: 900; color: rgba(107,114,128,1); margin-left: 6px; }

/* list grid */
.list { padding: 8px; }
.listHead{
  display:grid;
  grid-template-columns: 1.4fr 140px 150px 110px 150px 90px 40px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(24, 64, 112, 0.05);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(55,65,81,1);
}
.row{
  display:grid;
  grid-template-columns: 1.4fr 140px 150px 110px 150px 90px 40px;
  gap: 8px;
  align-items: center;
  padding: 7px 8px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.10);
}
.row:last-of-type{ border-bottom: 0; }

.cell{ min-width: 0; }
.r{ text-align: right; }
.mono{ font-variant-numeric: tabular-nums; }

.in{
  width: 100%;
  height: 32px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.96);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 850;
  color: #0f172a;
  outline: none;
  min-width: 0;
}
.in:focus{
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.12);
}

.valWrap{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap: 6px;
  min-width: 0;
}
.inSm{ width: 100%; max-width: 110px; }
.unit{
  font-size: 11px;
  font-weight: 950;
  color: rgba(107,114,128,1);
  min-width: 20px;
  text-align: right;
}

.icon{
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255,255,255,0.9);
  cursor: pointer;
  font-weight: 950;
}
.icon:hover{
  background: rgba(32, 184, 232, 0.10);
  border-color: rgba(32, 184, 232, 0.18);
}
.icon.danger{
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
}
.icon.danger:hover{
  background: rgba(239, 68, 68, 0.14);
}

/* empty + foot */
.empty{
  padding: 10px 8px;
  border-bottom: 1px dashed rgba(16, 24, 40, 0.18);
}
.foot{
  padding: 8px 8px 2px;
  font-size: 11.5px;
}

/* responsive: stack columns to avoid overflow */
@media (max-width: 1100px){
  .listHead, .row{
    grid-template-columns: 1.5fr 120px 140px 90px 140px 70px 40px;
  }
  .inSm{ max-width: 96px; }
}
@media (max-width: 920px){
  .listHead{ display:none; }
  .row{
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 8px;
    border-bottom: 1px solid rgba(16, 24, 40, 0.10);
    border-radius: 12px;
    margin-bottom: 8px;
    background: rgba(255,255,255,0.92);
  }
  .row:last-of-type{ margin-bottom: 0; }
  .cLabel{ grid-column: 1 / -1; }
  .cTot, .cPct, .cPm3{ text-align: left; }
  .cAct{ grid-column: 2; justify-self: end; }
}
@media (max-width: 520px){
  .hSub{ white-space: normal; }
}

/* modal */
.modalMask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 99999;
}
.modal {
  width: min(520px, 96vw);
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 40%);
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
}
.modalTitle { font-weight: 950; font-size: 14px; margin-bottom: 6px; color:#0f172a; }
.modalMsg { color: rgba(55, 65, 81, 1); font-size: 13px; white-space: pre-wrap; font-weight: 850; }
.modalActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
