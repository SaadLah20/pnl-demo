<!-- src/pages/MomdAndQuantityPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

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
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

/* =========================
   DRAFTS
========================= */
type Draft = { volumeM3: number; momd: number };
const drafts = reactive<Record<string, Draft>>({});

function getDraft(id: string): Draft {
  const k = String(id);
  if (!drafts[k]) drafts[k] = { volumeM3: 0, momd: 0 };
  return drafts[k];
}

function loadDraftsFromVariant() {
  for (const vf of formules.value) {
    const d = getDraft(vf.id);
    d.volumeM3 = clamp(vf?.volumeM3, 0, 1e12);
    d.momd = clamp(vf?.momd, 0, 1e12);
  }
}

/* =========================
   TRANSPORT
========================= */
const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

/* =========================
   CMP
========================= */
function mpPriceUsed(mpId: string): number {
  const items = (((variant.value as any)?.mp?.items ?? []) as any[]) || [];
  const vmp = items.find((x: any) => String(x.mpId) === String(mpId));
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

/* =========================
   BASE ROWS (non triées)
========================= */
type Row = {
  id: string;
  designation: string;
  cmp: number;  // DH/m³
  qte: number;  // m³
  momd: number; // DH/m³
  pv: number;   // DH/m³
  ca: number;   // DH
};

const baseRows = computed<Row[]>(() => {
  return formules.value.map((vf: any) => {
    const d = getDraft(vf.id);

    const cmp = cmpParM3For(vf);
    const qte = toNum(d.volumeM3);
    const momd = toNum(d.momd);

    // PV (DH/m³) = CMP + Transport + MOMD
    const pv = cmp + transportPrixMoyen.value + momd;

    // CA (DH) = PV * Qté
    const ca = pv * qte;

    return {
      id: String(vf.id),
      designation: String(vf?.formule?.label ?? vf?.formule?.resistance ?? "Formule"),
      cmp,
      qte,
      momd,
      pv,
      ca,
    };
  });
});

/* =========================
   ORDER STABLE (tri appliqué uniquement quand on le décide)
========================= */
const orderIds = ref<string[]>([]);
const didInitialSort = ref(false);

function setInitialOrderFromVariant() {
  // ordre DB (variant.formules.items) si présent
  orderIds.value = formules.value.map((vf: any) => String(vf.id));
}

function applySortNow() {
  // Tri PV desc, mais on ne modifie QUE orderIds
  const sorted = [...baseRows.value].sort((a, b) => toNum(b.pv) - toNum(a.pv));
  orderIds.value = sorted.map((r) => r.id);
}

/* ✅ rows affichées = baseRows + orderIds */
const rows = computed<Row[]>(() => {
  const map = new Map(baseRows.value.map((r) => [r.id, r]));
  const out: Row[] = [];

  // 1) on respecte orderIds
  for (const id of orderIds.value) {
    const r = map.get(id);
    if (r) out.push(r);
  }

  // 2) si nouveaux ids pas dans orderIds (cas rare), on les ajoute à la fin
  for (const r of baseRows.value) {
    if (!orderIds.value.includes(r.id)) out.push(r);
  }

  return out;
});

/* =========================
   SYNC au changement de variante
   - charge drafts
   - fixe orderIds une fois
   - tri initial UNE SEULE FOIS au chargement de la page
========================= */
watch(
  () => variant.value?.id,
  () => {
    loadDraftsFromVariant();
    setInitialOrderFromVariant();

    // tri initial : uniquement au chargement initial de la page
    if (!didInitialSort.value) {
      applySortNow();
      didInitialSort.value = true;
    }
  },
  { immediate: true }
);

/* =========================
   KPIs
========================= */
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.qte), 0));
const cmpTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.cmp) * toNum(r.qte), 0));
const cmpMoy = computed(() => (volumeTotal.value > 0 ? cmpTotal.value / volumeTotal.value : 0));

const momdTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.momd) * toNum(r.qte), 0));
const momdMoy = computed(() => (volumeTotal.value > 0 ? momdTotal.value / volumeTotal.value : 0));

const caTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.ca), 0));
const pvMoy = computed(() => (volumeTotal.value > 0 ? caTotal.value / volumeTotal.value : 0));

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

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    const items = formules.value.map((vf: any) => {
      const d = getDraft(vf.id);
      return {
        id: String(vf.id),
        volumeM3: Number(clamp(d.volumeM3, 0, 1e12)),
        momd: Number(clamp(d.momd, 0, 1e12)),
      };
    });

    await (store as any).updateVariant(variant.value.id, { formules: { items } });

    // ✅ tri uniquement après enregistrement
    applySortNow();

    openInfo("Enregistré", "Quantités & MOMD mises à jour (tri PV appliqué).");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des quantités & MOMD ?", async () => {
    closeModal();
    await save();
  });
}

function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadDraftsFromVariant();

    // ✅ pas de tri ici (tu as demandé : seulement initial + après save)
    // si tu veux aussi trier après reset => ajoute: applySortNow()
  });
}

/* =========================
   INIT DATA
========================= */
onMounted(async () => {
  const pnls = (store as any).pnls ?? [];
  if (pnls.length === 0 && (store as any).loadPnls) {
    await (store as any).loadPnls();
  }
});
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Qté & MOMD</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="contract?.dureeMois"> — Durée {{ contract.dureeMois }} mois</span>
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
        <div class="kpis">
          <div class="kpi"><div class="kLbl">CMP Moy</div><div class="kVal">{{ n(cmpMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">CMP Tot</div><div class="kVal">{{ money(cmpTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">MOMD Moy</div><div class="kVal">{{ n(momdMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">MOMD Tot</div><div class="kVal">{{ money(momdTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">Transport</div><div class="kVal">{{ n(transportPrixMoyen, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">PV Moyen</div><div class="kVal">{{ n(pvMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">CA</div><div class="kVal">{{ money(caTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">Volume Total</div><div class="kVal">{{ n(volumeTotal, 2) }} <span>m³</span></div></div>
        </div>

        <div class="panel">
          <div class="tableWrap">
            <table class="table">
              <colgroup>
                <col class="colDesignation" />
                <col class="colCmp" />
                <col class="colQte" />
                <col class="colMomd" />
                <col class="colPv" />
                <col class="colCa" />
              </colgroup>

              <thead>
                <tr>
                  <th class="th c">Désignation</th>
                  <th class="th c">CMP (DH/m³)</th>
                  <th class="th c">Qté (m³)</th>
                  <th class="th c">MOMD (DH/m³)</th>
                  <th class="th c">PV (DH/m³)</th>
                  <th class="th c">CA (DH)</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td class="designation"><b class="designationText">{{ r.designation }}</b></td>

                  <td class="mono rVal">{{ n(r.cmp, 2) }}</td>

                  <td class="cellInput">
                    <div class="inCell">
                      <input
                        class="inputSm r"
                        type="number"
                        step="1"
                        min="0"
                        :value="getDraft(r.id).volumeM3"
                        @input="getDraft(r.id).volumeM3 = toNum(($event.target as HTMLInputElement).value)"
                      />
                      <span class="unit">m³</span>
                    </div>
                  </td>

                  <td class="cellInput">
                    <div class="inCell">
                      <input
                        class="inputSm r"
                        type="number"
                        step="0.01"
                        min="0"
                        :value="getDraft(r.id).momd"
                        @input="getDraft(r.id).momd = toNum(($event.target as HTMLInputElement).value)"
                      />
                      <span class="unit">DH</span>
                    </div>
                  </td>

                  <td class="cellPv"><span class="pvPill mono">{{ n(r.pv, 2) }}</span></td>

                  <td class="cellCa"><b class="mono">{{ money(r.ca, 2) }}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="hint muted">Tri PV appliqué uniquement au chargement initial et après “Enregistrer”.</div>
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
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }

.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.title { display:flex; flex-direction:column; gap:2px; }
.h1 { font-size:16px; font-weight:800; line-height:1.1; margin:0; }
.muted { color:#6b7280; font-size:12px; }
.actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; }
.panel.error { border-color:#ef4444; background:#fff5f5; }

.btn {
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:10px;
  padding:7px 10px;
  font-size:13px;
  cursor:pointer;
}
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { background:#046a2f; }
.btn:disabled { opacity:.6; cursor:not-allowed; }

.kpis{
  display:grid;
  grid-template-columns: repeat(8, minmax(140px, 1fr));
  gap:8px;
}
@media (max-width: 1400px){ .kpis{ grid-template-columns: repeat(4, minmax(140px, 1fr)); } }
@media (max-width: 900px){ .kpis{ grid-template-columns: repeat(2, minmax(140px, 1fr)); } }

.kpi{
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:8px 10px;
  display:flex;
  flex-direction:column;
  gap:4px;
}
.kLbl{ font-size:11px; color:#6b7280; }
.kVal{ font-size:13px; font-weight:900; white-space:nowrap; }
.kVal span{ font-weight:600; color:#6b7280; margin-left:6px; }

.tableWrap { overflow-x: hidden; }
.table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
  table-layout:fixed;
}
.colDesignation { width: 250px; }
.colCmp { width: 120px; }
.colQte { width: 140px; }
.colMomd { width: 140px; }
.colPv { width: 130px; }
.colCa { width: 150px; }

.th, .table td{
  border-bottom:1px solid #e5e7eb;
  padding:8px 6px;
  vertical-align:middle;
}
.th{
  background:#fafafa;
  color:#6b7280;
  font-size:11px;
  white-space:nowrap;
}
.c { text-align:center; }
.mono{ font-variant-numeric: tabular-nums; }
.r { text-align:right; }
.rVal{ text-align:right; }

.designation{ overflow:hidden; }
.designationText{
  display:block;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.cellInput{ text-align:right; }
.inCell{
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  gap:6px;
  width:100%;
}
.inputSm{
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:12px;
  padding:5px 7px;
  width:90px;
}
.unit{
  color:#6b7280;
  font-size:11px;
  min-width:22px;
  text-align:right;
}

.cellPv{ text-align:right; }
.pvPill{
  display:inline-block;
  padding:5px 9px;
  border-radius:999px;
  border:1px solid #c7f9d4;
  background:#ecfdf3;
  font-weight:900;
  white-space:nowrap;
}

.cellCa{ text-align:right; }
.hint{ margin-top:8px; font-size:12px; }

/* modal */
.modalMask{
  position:fixed; inset:0;
  background:rgba(0,0,0,.35);
  display:flex; align-items:center; justify-content:center;
  padding:16px;
  z-index:50;
}
.modal{
  width:min(520px, 100%);
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:16px;
  padding:14px;
  box-shadow:0 10px 30px rgba(0,0,0,.15);
}
.modalTitle{ font-weight:900; font-size:14px; margin-bottom:6px; }
.modalMsg{ color:#374151; font-size:13px; white-space:pre-wrap; }
.modalActions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
</style>
