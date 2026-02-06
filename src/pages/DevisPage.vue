<!-- src/pages/DevisPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import {
  InformationCircleIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

const loading = ref(false);
const busy = reactive({ reload: false, save: false, apply: false });
const error = ref<string | null>(null);

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function money2(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}
function money0(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(x);
}
function int(v: any) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n(v));
}
function pricePerKg(prixTonne: number): number {
  const p = n(prixTonne);
  if (p <= 0) return 0;
  return p / 1000; // DH/tonne -> DH/kg
}
function roundTo5(x: number): number {
  const v = n(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v / 5) * 5;
}

/* =========================
   STATE
========================= */
const variant = computed<any | null>(() => (store as any).activeVariant ?? null);
const contract = computed<any | null>(() => (store as any).activeContract ?? null);

const dureeMois = computed(() => n(contract.value?.dureeMois ?? 0));
const rows = computed<any[]>(() => variant.value?.formules?.items ?? []);
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + n(r?.volumeM3), 0));

/* =========================
   TOGGLES
   - Appliquer majorations => show/hide colonne "Prix avec majorations"
========================= */
const withMajorations = computed({
  get: () => Boolean((store as any).headerUseMajorations),
  set: (v: boolean) => (store as any).setHeaderUseMajorations(Boolean(v)),
});

const withDevisSurcharge = computed({
  get: () => Boolean((store as any).headerUseDevisSurcharge),
  set: (v: boolean) => (store as any).setHeaderUseDevisSurcharge(Boolean(v)),
});

/* =========================
   DRAFT SURCHARGES
   - only editable column
   - key = variantFormule.id
========================= */
const draft = reactive({
  surcharges: {} as Record<string, number>,
  applyToDashboardOnSave: true,
});

function rowKey(r: any): string {
  return String(r?.id ?? r?.variantFormuleId ?? r?.formuleId ?? r?.formule?.id ?? "");
}
function getSurcharge(r: any): number {
  const k = rowKey(r);
  return n(draft.surcharges[k] ?? 0);
}
function setSurcharge(r: any, v: any) {
  const k = rowKey(r);
  draft.surcharges[k] = n(v);
}

/* =========================
   LOAD persisted devis.surcharges (if exists)
========================= */
function loadPersisted() {
  draft.surcharges = {};
  const v = variant.value;
  if (!v) return;

  const raw = v?.devis?.surcharges ?? v?.devis?.meta ?? v?.devis?.data ?? null;
  if (!raw) return;

  try {
    const obj = typeof raw === "object" ? raw : JSON.parse(String(raw));
    const map = (obj?.surcharges ?? obj) as any;
    if (map && typeof map === "object") {
      for (const [k, val] of Object.entries(map)) draft.surcharges[String(k)] = n(val);
    }
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await reload();
});

watch(
  () => variant.value?.id,
  () => loadPersisted()
);

/* =========================
   COMPUTES (BASE)
   - CMP base = sum(qtyKg * prixKg) using variant MP override or catalogue
   - PV base = CMP + Transport + MOMD
========================= */
function mpPrixUsed(mpId: string): number {
  const mpItems = variant.value?.mp?.items ?? [];
  const vmp = mpItems.find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return n(vmp.prix);
  return n(vmp?.mp?.prix);
}

function cmpFormuleBaseM3(formule: any): number {
  const compo = formule?.items ?? [];
  return (compo ?? []).reduce((s: number, it: any) => {
    const mpId = String(it?.mpId ?? "");
    const qtyKg = n(it?.qty);
    const prixKg = pricePerKg(mpPrixUsed(mpId));
    return s + qtyKg * prixKg;
  }, 0);
}

const transportBaseM3 = computed(() => n(variant.value?.transport?.prixMoyen ?? 0));

function pvBaseM3(r: any): number {
  const cmp = cmpFormuleBaseM3(r?.formule);
  const momd = n(r?.momd);
  return cmp + transportBaseM3.value + momd;
}

/* =========================
   IMPACT MAJORATIONS (/m3)
   - impact = (CA_majoré - CA_base) / volume
   - CA comes from computeHeaderKpis (includes MP + transport + autres majorations)
========================= */
const impactMajorationM3 = computed(() => {
  const v = variant.value;
  const vol = volumeTotal.value;
  if (!v || vol <= 0) return 0;

  const d = dureeMois.value;

  // base: same variant but force majorations null
  const vBase = {
    ...v,
    autresCouts: {
      ...(v.autresCouts ?? {}),
      majorations: null,
    },
  };

  const kBase = computeHeaderKpis(vBase, d, null);
  const kMaj = computeHeaderKpis(v, d, null);

  const deltaCA = n(kMaj?.caTotal) - n(kBase?.caTotal);
  return deltaCA / vol;
});

function pvWithMajorationM3(r: any): number {
  return pvBaseM3(r) + impactMajorationM3.value;
}

/* =========================
   PONDERE / DEFINITIF
========================= */
function pvPondereM3(r: any): number {
  const base = withMajorations.value ? pvWithMajorationM3(r) : pvBaseM3(r);
  return roundTo5(base);
}
function pvDefinitifM3(r: any): number {
  return pvPondereM3(r) + getSurcharge(r);
}

const prixMoyenDefinitif = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  const total = rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
  return total / vol;
});

const caDevisTotal = computed(() => {
  return rows.value.reduce((s, r) => s + pvDefinitifM3(r) * n(r?.volumeM3), 0);
});

/* =========================
   API
========================= */
async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;

  try {
    if ((store as any).pnls?.length === 0) {
      await (store as any).loadPnls();
    }
    loadPersisted();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

function applyToDashboard() {
  busy.apply = true;
  try {
    (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
    withDevisSurcharge.value = true;
  } finally {
    busy.apply = false;
  }
}

async function saveDevis() {
  const v = variant.value;
  if (!v?.id) return;

  busy.save = true;
  error.value = null;
  try {
    if (draft.applyToDashboardOnSave) {
      (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
      withDevisSurcharge.value = true;
    }

    await (store as any).saveDevis(String(v.id), { surcharges: { ...draft.surcharges } });

    // reload state from store (optional safety)
    await (store as any).loadPnls();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
}

function resetSurcharges() {
  loadPersisted();
  nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}
</script>

<template>
  <div class="page">
    <!-- TOP -->
    <div class="top">
      <div class="tleft">
        <div class="title">Devis</div>
        <div class="subline">
          <span class="muted">Variante :</span>
          <b class="ell">{{ variant?.title ?? "—" }}</b>

          <span class="sep">•</span>

          <span class="muted">Volume :</span>
          <b>{{ int(volumeTotal) }}</b><span class="muted">m³</span>

          <span class="sep">•</span>

          <span class="muted">Prix moyen devis :</span>
          <b>{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>
        </div>
      </div>

      <div class="tright">
        <button class="btn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="actIc" />
        </button>

        <button class="btn" @click="resetSurcharges" :disabled="busy.save">Réinitialiser</button>

        <button class="btn" @click="applyToDashboard" :disabled="busy.apply">
          Appliquer au dashboard
        </button>

        <button class="btn primary" @click="saveDevis" :disabled="busy.save || !variant?.id">
          <CheckBadgeIcon class="actIc" />
          {{ busy.save ? "Enregistrement..." : "Enregistrer devis" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- CONTROLS -->
    <div class="card">
      <div class="controls">
        <label class="chk">
          <input type="checkbox" v-model="withMajorations" />
          <span>Appliquer majorations</span>
        </label>

        <label class="chk">
          <input type="checkbox" v-model="withDevisSurcharge" />
          <span>Dashboard : surcharge devis</span>
        </label>

        <label class="chk">
          <input type="checkbox" v-model="draft.applyToDashboardOnSave" />
          <span>Appliquer au dashboard lors du save</span>
        </label>

        <div v-if="withMajorations" class="pillInfo">
          <span class="muted">Impact majorations :</span>
          <b class="mono">{{ money2(impactMajorationM3) }}</b>
          <span class="muted">DH/m³</span>
        </div>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card cardTable">
      <div class="tableWrap">
        <table class="table">
          <colgroup>
            <col class="cDes" />
            <col class="cNum" />
            <col class="cNum" />
            <col class="cNum" />
            <col v-if="withMajorations" class="cNum" />
            <col class="cNum" />
            <col class="cSurch" />
            <col class="cNum" />
            <col class="cVol" />
            <col class="cTot" />
          </colgroup>

          <thead class="theadSticky">
            <tr>
              <th>Désignation</th>
              <th class="right">CMP</th>
              <th class="right">MOMD</th>
              <th class="right">Prix calculé</th>
              <th v-if="withMajorations" class="right">Prix avec majorations</th>
              <th class="right">Prix pondéré</th>
              <th class="right">Surcharge</th>
              <th class="right">Prix définitif</th>
              <th class="right">Volume</th>
              <th class="right">Total</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in rows" :key="rowKey(r)">
              <td class="cellMain">
                <div class="mainLine">
                  <b class="ell">{{ r?.formule?.label ?? "—" }}</b>

                  <span class="cmtWrap">
                    <button class="cmtBtn" type="button" aria-label="Info">
                      <InformationCircleIcon class="cmtIc" />
                    </button>
                    <span class="cmtTip" role="tooltip">
                      Transport (base) : <b>{{ money2(transportBaseM3) }}</b> DH/m³
                      <br />
                      Volume : <b>{{ int(r?.volumeM3) }}</b> m³
                    </span>
                  </span>
                </div>

                <div class="subText ell">
                  Clé: <span class="mono">{{ rowKey(r) }}</span>
                </div>
              </td>

              <td class="right">
                <span class="mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</span>
              </td>

              <td class="right">
                <span class="mono">{{ money2(r?.momd) }}</span>
              </td>

              <td class="right">
                <span class="priceBadge">
                  <span class="mono">{{ money2(pvBaseM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/ m³</span>
                </span>
              </td>

              <td v-if="withMajorations" class="right">
                <span class="priceBadge maj">
                  <span class="mono">{{ money2(pvWithMajorationM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/ m³</span>
                </span>
              </td>

              <td class="right">
                <span class="pillStrong mono">{{ money0(pvPondereM3(r)) }}</span>
              </td>

              <td class="right">
                <input
                  class="input numInput"
                  type="number"
                  step="1"
                  :value="getSurcharge(r)"
                  @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
                />
              </td>

              <td class="right">
                <span class="pillStrong mono">{{ money0(pvDefinitifM3(r)) }}</span>
              </td>

              <td class="right">
                <span class="mono">{{ int(r?.volumeM3) }}</span>
              </td>

              <td class="right">
                <span class="mono"><b>{{ money0(pvDefinitifM3(r) * n(r?.volumeM3)) }}</b></span>
              </td>
            </tr>

            <tr v-if="rows.length === 0">
              <td colspan="10" class="emptyRow">Aucune formule dans cette variante.</td>
            </tr>
          </tbody>

          <tfoot v-if="rows.length > 0">
            <tr class="tfootRow">
              <td colspan="3" class="muted">
                Total devis
              </td>

              <td class="right muted" colspan="3">
                Prix moyen devis : <b class="mono">{{ money2(prixMoyenDefinitif) }}</b> DH/m³
              </td>

              <td class="right muted" colspan="2">
                Volume : <b class="mono">{{ int(volumeTotal) }}</b> m³
              </td>

              <td class="right" colspan="2">
                <span class="pillStrong mono">{{ money0(caDevisTotal) }}</span>
                <span class="muted">DH</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="card hint">
      <div class="muted">
        • <b>Prix pondéré</b> = prix (base ou majoré) arrondi au multiple de 5.
        &nbsp;• <b>Surcharge</b> peut être négative et s’ajoute après pondération.
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ✅ Copie du langage visuel de tes pages (MpCataloguePage) */

.page { padding: 14px; display:flex; flex-direction:column; gap:12px; }

.top { display:flex; justify-content:space-between; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:4px; min-width: 240px; }
.title { font-size:18px; font-weight:900; color:#111827; }
.subline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sep { color:#9ca3af; }

.tright { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:10px 12px; }
.cardTable { overflow: visible; }
.hint { padding: 10px 12px; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
.btn:hover { background:#f9fafb; }
.btn.primary { background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover { background: rgba(24,64,112,1); }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.right { text-align:right; }
.muted { color:#6b7280; font-size:12px; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mono { font-variant-numeric: tabular-nums; }

.controls{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.chk{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  font-weight:900;
  color:#111827;
  user-select:none;
}
.chk input{
  width:16px;
  height:16px;
  border-radius:6px;
}

.pillInfo{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-size:12px;
  font-weight:900;
  color:#111827;
}

/* TABLE */
.tableWrap { overflow: visible; }
.table {
  width:100%;
  border-collapse:collapse;
  font-size:12px;
  table-layout: fixed;
}
.table th, .table td {
  border-bottom:1px solid #e5e7eb;
  padding: 7px 8px;
  text-align:left;
  vertical-align: middle;
}
.table th {
  font-size:11px;
  color:#6b7280;
  background:#fafafa;
  white-space: nowrap;
}
.emptyRow { color:#6b7280; padding:10px; }

.theadSticky{
  position: sticky;
  top: -14px;          /* ✅ comme ton besoin “collé sous headerdashboard” */
  z-index: 20;
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.06);
}

/* Column widths (no horizontal scroll in most cases) */
.cDes { width: 25%; }
.cNum { width: 9%; }
.cSurch { width: 10%; }
.cVol { width: 7%; }
.cTot { width: 12%; }

.cellMain { overflow: visible; }
.mainLine { display:flex; align-items:center; gap:8px; min-width:0; }
.subText { margin-top: 2px; font-size: 11px; color: rgba(15,23,42,0.62); }

/* Tooltip */
.cmtWrap { position: relative; display:inline-flex; align-items:center; z-index: 5; }
.cmtBtn{
  width: 26px; height: 26px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor: default;
}
.cmtIc{ width: 16px; height: 16px; color:#6b7280; }
.cmtTip{
  position:absolute;
  left: 34px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 240px;
  max-width: 360px;
  background: rgba(17,24,39,0.95);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.25;
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-50%) translateX(-4px);
  z-index: 9999;
}
.cmtWrap:hover .cmtTip{
  opacity: 1;
  transform: translateY(-50%) translateX(0px);
}

/* Badges */
.priceBadge{
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  gap: 6px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(2,132,199,0.22);
  background: rgba(2,132,199,0.08);
  color:#0b3b63;
  font-weight:1000;
  font-size:13px;
  white-space:nowrap;
  max-width: 100%;
  box-sizing: border-box;
}
.priceBadge.maj{
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(16, 185, 129, 0.10);
  color: #065f46;
}
.priceBadge .dh{ font-size:11px; font-weight:900; opacity:0.9; }
.unitTag{
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.65);
  background: rgba(255,255,255,0.65);
  border: 1px solid rgba(16,24,40,0.10);
  padding: 2px 8px;
  border-radius: 999px;
}

.pillStrong{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width: 66px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight: 1000;
  color:#111827;
}

.numInput{
  max-width: 120px;
  text-align:right;
  padding-right: 10px;
  font-variant-numeric: tabular-nums;
}

.tfootRow td{
  background: rgba(15,23,42,0.02);
  border-bottom: none;
}

.actIc{ width:18px; height:18px; }

@media (max-width: 980px) {
  .cDes { width: 30%; }
  .cTot { width: 14%; }
}
@media (max-width: 720px) {
  .cVol { width: 0%; }
  th:nth-last-child(2), td:nth-last-child(2) { display:none; } /* hide volume on mobile */
}
</style>
