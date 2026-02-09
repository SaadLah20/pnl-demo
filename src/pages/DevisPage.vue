<!-- src/pages/DevisPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import { onBeforeUnmount } from "vue";
import { onBeforeRouteLeave } from "vue-router";


import { InformationCircleIcon, ArrowPathIcon, CheckBadgeIcon } from "@heroicons/vue/24/outline";

const store = usePnlStore();

const activeTab = ref<"SURCHARGES" | "CONTENU">("SURCHARGES");

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
   TOGGLES (header)
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
   LOAD persisted devis.surcharges
========================= */
function loadPersisted() {
  draft.surcharges = {};
  const v = variant.value;
  if (!v) return;

  const raw = v?.devis?.surcharges ?? null;
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
   ✅ LIVE DASHBOARD PREVIEW
   - Si Dashboard:surcharge devis = ON => le header se met à jour à chaque edit
   - Si OFF => on clear le preview
========================= */
watch(
  () => withDevisSurcharge.value,
  (on) => {
    if (on) {
      (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
    } else {
      (store as any).setHeaderDevisSurchargesPreview(null);
    }
  }
);

watch(
  () => draft.surcharges,
  () => {
    if (!withDevisSurcharge.value) return;
    (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
  },
  { deep: true }
);

/* =========================
   BASE CALCS (/m3)
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
   IMPACT MAJORATIONS (/m3) - header-based
========================= */
const impactMajorationM3 = computed(() => {
  const v = variant.value;
  const vol = volumeTotal.value;
  if (!v || vol <= 0) return 0;

  const d = dureeMois.value;

  const vBase = {
    ...v,
    autresCouts: {
      ...(v.autresCouts ?? {}),
      majorations: null,
    },
  };

  // base (sans majorations)
  const kBase = computeHeaderKpis(vBase, d, null, null, false);

  // avec majorations (sans surcharge devis ici)
  const kMaj = computeHeaderKpis(v, d, null, null, false);

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

    // si le toggle est ON, resync preview après reload
    if (withDevisSurcharge.value) {
      (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
    }
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

    await (store as any).saveDevis(String(v.id), {
      surcharges: { ...draft.surcharges },
      // (tab CONTENU viendra plus tard — on n’envoie rien pour l’instant)
    });

    // refresh safe
    await (store as any).loadPnls();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
}

function resetSurcharges() {
  loadPersisted();

  // sync preview si toggle ON
  if (withDevisSurcharge.value) {
    (store as any).setHeaderDevisSurchargesPreview({ ...draft.surcharges });
  }

  nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function clearDevisPreview() {
  // ✅ évite pollution du dashboard par des surcharges non enregistrées
  (store as any).setHeaderDevisSurchargesPreview(null);
}

// route leave (plus fiable que unmount seul dans certains cas)
onBeforeRouteLeave(() => {
  clearDevisPreview();
});

// fallback: unmount
onBeforeUnmount(() => {
  clearDevisPreview();
});

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

        <button class="btn" @click="applyToDashboard" :disabled="busy.apply" v-if="activeTab === 'SURCHARGES'">
          Appliquer au dashboard
        </button>

        <button class="btn primary" @click="saveDevis" :disabled="busy.save || !variant?.id">
          <CheckBadgeIcon class="actIc" />
          {{ busy.save ? "Enregistrement..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- TABS -->
    <div class="tabs card">
      <button class="tabBtn" :class="activeTab === 'SURCHARGES' ? 'active' : ''" @click="activeTab = 'SURCHARGES'">
        Surcharges (prix /m³)
      </button>

      <button class="tabBtn" :class="activeTab === 'CONTENU' ? 'active' : ''" @click="activeTab = 'CONTENU'">
        Contenu devis (articles, intro…)
      </button>
    </div>

    <!-- TAB 1: SURCHARGES -->
    <template v-if="activeTab === 'SURCHARGES'">
      <!-- CONTROLS -->
      <div class="card">
        <div class="controls">
          <div class="leftControls">
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
          </div>

          <div v-if="withMajorations" class="pillInfo">
            <span class="muted">Impact majorations :</span>
            <b class="mono">{{ money2(impactMajorationM3) }}</b>
            <span class="muted">DH/m³</span>
          </div>
        </div>
      </div>

      <!-- GRID "TABLE" (no horizontal scroll) -->
      <div class="card cardTable">
        <!-- header -->
        <div class="gHead theadSticky" :class="withMajorations ? 'colsMaj' : 'colsBase'" role="row">
          <div class="hCell">Désignation</div>
          <div class="hCell right">CMP</div>
          <div class="hCell right">MOMD</div>
          <div class="hCell right">Prix calculé</div>
          <div v-if="withMajorations" class="hCell right">Prix avec majorations</div>
          <div class="hCell right">Prix pondéré</div>
          <div class="hCell right">Surcharge</div>
          <div class="hCell right">Prix définitif</div>
          <div class="hCell right">Volume</div>
          <div class="hCell right">Total</div>
        </div>

        <!-- body -->
        <div class="gBody">
          <div v-if="rows.length === 0" class="emptyRow">Aucune formule dans cette variante.</div>

          <div v-for="r in rows" :key="rowKey(r)" class="gRow" :class="withMajorations ? 'colsMaj' : 'colsBase'" role="row">
            <!-- designation -->
            <div class="cell cellMain" :data-label="'Désignation'">
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
            </div>

            <!-- CMP -->
            <div class="cell right" :data-label="'CMP'">
              <div class="value mono">{{ money2(cmpFormuleBaseM3(r?.formule)) }}</div>
            </div>

            <!-- MOMD -->
            <div class="cell right" :data-label="'MOMD'">
              <div class="value mono">{{ money2(r?.momd) }}</div>
            </div>

            <!-- PV base -->
            <div class="cell right" :data-label="'Prix calculé'">
              <div class="badgeWrap">
                <span class="priceBadge">
                  <span class="mono">{{ money2(pvBaseM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/m³</span>
                </span>
              </div>
            </div>

            <!-- PV majoré -->
            <div v-if="withMajorations" class="cell right" :data-label="'Prix avec majorations'">
              <div class="badgeWrap">
                <span class="priceBadge maj">
                  <span class="mono">{{ money2(pvWithMajorationM3(r)) }}</span>
                  <span class="dh">DH</span>
                  <span class="unitTag">/m³</span>
                </span>
              </div>
            </div>

            <!-- pondéré -->
            <div class="cell right" :data-label="'Prix pondéré'">
              <span class="pillStrong mono">{{ money0(pvPondereM3(r)) }}</span>
            </div>

            <!-- surcharge -->
            <div class="cell right" :data-label="'Surcharge'">
              <input
                class="input numInput"
                type="number"
                step="1"
                :value="getSurcharge(r)"
                @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <!-- définitif -->
            <div class="cell right" :data-label="'Prix définitif'">
              <span class="pillStrong mono">{{ money0(pvDefinitifM3(r)) }}</span>
            </div>

            <!-- volume -->
            <div class="cell right" :data-label="'Volume'">
              <div class="value mono">{{ int(r?.volumeM3) }}</div>
            </div>

            <!-- total -->
            <div class="cell right" :data-label="'Total'">
              <div class="value mono strong">{{ money0(pvDefinitifM3(r) * n(r?.volumeM3)) }}</div>
            </div>
          </div>
        </div>

        <!-- footer -->
        <div class="gFoot">
          <div class="footLine">
            <span class="muted">Prix moyen devis :</span>
            <b class="mono">{{ money2(prixMoyenDefinitif) }}</b><span class="muted">DH/m³</span>

            <span class="sep">•</span>

            <span class="muted">Volume :</span>
            <b class="mono">{{ int(volumeTotal) }}</b><span class="muted">m³</span>

            <span class="sep">•</span>

            <span class="muted">CA devis :</span>
            <b class="mono">{{ money0(caDevisTotal) }}</b><span class="muted">DH</span>
          </div>
        </div>
      </div>

      <div class="card hint">
        <div class="muted">
          • <b>Prix pondéré</b> = prix (base ou majoré) arrondi au multiple de 5.
          &nbsp;• <b>Surcharge</b> peut être négative et s’ajoute après pondération.
        </div>
      </div>
    </template>

    <!-- TAB 2: CONTENU (placeholder) -->
    <template v-else>
      <div class="card">
        <div class="phTitle">Contenu devis</div>
        <div class="phText muted">
          Cet onglet va contenir : <b>intro</b>, <b>articles</b>, <b>charges</b>, <b>prix complémentaires</b>,
          <b>validité</b>, <b>signature</b>… (pré-remplis depuis la variante + modèle PDF),
          puis modifiables avant export Word/PDF.
        </div>

        <div class="phBox">
          <b>À implémenter plus tard</b>
          <div class="muted" style="margin-top:6px;">
            Pour l’instant on garde uniquement un placeholder propre.
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* (CSS inchangé) */
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
.cardTable { padding: 0; overflow: hidden; }
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
.strong { font-weight: 950; }

.actIc{ width:18px; height:18px; }

/* Tabs */
.tabs{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.tabBtn{
  border: 1px solid rgba(16,24,40,0.14);
  background: rgba(15,23,42,0.02);
  color:#111827;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
}
.tabBtn:hover{ background: rgba(15,23,42,0.04); }
.tabBtn.active{
  background: rgba(24,64,112,0.10);
  border-color: rgba(24,64,112,0.30);
  color: rgba(24,64,112,1);
}

/* Controls row */
.controls{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.leftControls{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.chk{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  font-weight:900;
  color:#111827;
  user-select:none;
}
.chk input{ width:16px; height:16px; border-radius:6px; }

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

/* GRID TABLE */
.gHead, .gRow{
  display:grid;
  width:100%;
  column-gap: 10px;
  align-items:center;
}
.colsBase{
  grid-template-columns:
    minmax(180px, 2.2fr)
    minmax(70px, .8fr)
    minmax(70px, .8fr)
    minmax(110px, 1.1fr)
    minmax(110px, 1.0fr)
    minmax(110px, 1.0fr)
    minmax(110px, 1.0fr)
    minmax(80px, .8fr)
    minmax(120px, 1.1fr);
}
.colsMaj{
  grid-template-columns:
    minmax(180px, 2.0fr)
    minmax(70px, .75fr)
    minmax(70px, .75fr)
    minmax(110px, 1.0fr)
    minmax(120px, 1.05fr)
    minmax(110px, 0.95fr)
    minmax(110px, 0.95fr)
    minmax(110px, 0.95fr)
    minmax(80px, .75fr)
    minmax(120px, 1.05fr);
}

.gHead{
  padding: 10px 12px;
  background:#fafafa;
  border-bottom: 1px solid #e5e7eb;
  font-size:11px;
  font-weight: 900;
  color:#6b7280;
}
.hCell{
  min-width: 0;
  white-space: normal;
  line-height: 1.15;
}

.gBody{ padding: 0; }
.gRow{
  padding: 10px 12px;
  border-bottom:1px solid #e5e7eb;
}
.gRow:hover{ background:#fafafa; }
.cell{ min-width: 0; }
.value{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cellMain{ overflow: visible; }
.mainLine { display:flex; align-items:center; gap:8px; min-width:0; }
.subText { margin-top: 2px; font-size: 11px; color: rgba(15,23,42,0.62); }

.emptyRow{
  padding: 14px 12px;
  color:#6b7280;
  font-size:12px;
}

.gFoot{
  padding: 10px 12px;
  background: rgba(15,23,42,0.02);
}
.footLine{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
}

/* Sticky header */
.theadSticky{
  position: sticky;
  top: -14px;
  z-index: 20;
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.06);
}

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
.badgeWrap{
  display:flex;
  justify-content:flex-end;
  min-width:0;
}
.priceBadge{
  display:inline-flex;
  align-items:center;
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
  overflow:hidden;
  text-overflow: ellipsis;
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
  flex: 0 0 auto;
}

.pillStrong{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight: 1000;
  color:#111827;
  max-width: 100%;
  overflow:hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.numInput{
  width: 100%;
  min-width: 0;
  max-width: 140px;
  text-align:right;
  padding-right: 10px;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

@media (max-width: 980px) {
  .colsBase, .colsMaj{
    grid-template-columns: 1fr 1fr;
    row-gap: 10px;
  }
  .gHead{ display:none; }
  .gRow{
    border-bottom: none;
    border-top: 1px solid #e5e7eb;
  }

  .gRow > .cell:first-child{ grid-column: 1 / -1; }

  .gRow > .cell{
    display:flex;
    justify-content:space-between;
    gap: 10px;
    align-items:center;
    padding: 2px 0;
  }
  .gRow > .cell::before{
    content: attr(data-label);
    color:#6b7280;
    font-weight: 900;
    font-size: 11px;
    flex: 0 0 auto;
  }
  .gRow > .cell.cellMain{
    display:block;
    padding: 0;
  }
  .gRow > .cell.cellMain::before{ content: ""; display:none; }

  .numInput{ max-width: 180px; }
}

/* Placeholder (tab 2) */
.phTitle{ font-weight: 1000; font-size: 14px; color:#111827; }
.phText{ margin-top: 6px; line-height: 1.35; }
.phBox{
  margin-top: 12px;
  border-radius: 16px;
  border: 1px dashed rgba(16,24,40,0.18);
  background: rgba(15,23,42,0.02);
  padding: 12px;
}
</style>
