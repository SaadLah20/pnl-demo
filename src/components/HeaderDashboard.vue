<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

// Heroicons
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  DocumentDuplicateIcon,
  PlusCircleIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CubeIcon,
  CheckBadgeIcon,
} from "@heroicons/vue/24/outline";

type KpiName =
  | "ASP"
  | "CMP"
  | "MOMD"
  | "Transport"
  | "Production"
  | "EBITDA"
  | "EBIT"
  | "Amortissement";

type KpiValues = {
  total: number;
  m3: number;
  month: number;
  percent: number;
};

type Metrics = Record<KpiName, KpiValues>;

const store = usePnlStore();

onMounted(() => {
  if (store.pnls.length === 0) store.loadPnls();
});

const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnl = computed<any | null>(() => store.activePnl ?? null);
const activeVariant = computed<any | null>(() => store.activeVariant ?? null);
const headerKpis = computed<any>(() => store.activeHeaderKPIs);

const activeContract = computed<any | null>(() => {
  const pnl = activePnl.value;
  const vId = store.activeVariantId;
  if (!pnl || !pnl.contracts?.length) return null;
  if (!vId) return pnl.contracts[0] ?? null;

  return (
    pnl.contracts.find((c: any) => (c.variants ?? []).some((v: any) => v.id === vId)) ??
    pnl.contracts[0] ??
    null
  );
});

const contractsOfActivePnl = computed<any[]>(() => activePnl.value?.contracts ?? []);

/* =========================
   SEARCHABLE PNL SELECT
========================= */
const pnlQuery = ref("");
const pnlOpen = ref(false);

const filteredPnls = computed(() => {
  const q = pnlQuery.value.trim().toLowerCase();
  if (!q) return pnls.value;
  return pnls.value.filter((p: any) => {
    const blob = `${p.title ?? ""} ${p.client ?? ""} ${p.id ?? ""}`.toLowerCase();
    return blob.includes(q);
  });
});

/* =========================
   STORE SETTERS (safe)
========================= */
function setActivePnlId(id: string) {
  const s: any = store as any;
  if (typeof s.setActivePnl === "function") s.setActivePnl(id);
  else s.activePnlId = id;
}
function setActiveContractId(id: string) {
  const s: any = store as any;
  if (typeof s.setActiveContract === "function") s.setActiveContract(id);
  else s.activeContractId = id;
}
function setActiveVariantId(id: string) {
  const s: any = store as any;
  if (typeof s.setActiveVariant === "function") s.setActiveVariant(id);
  else s.activeVariantId = id;
}

function firstVariantIdOfContract(contract: any): string | null {
  const v = (contract?.variants ?? [])[0];
  return v?.id ? String(v.id) : null;
}

function onPickPnl(pnlId: string) {
  pnlOpen.value = false;
  pnlQuery.value = "";

  const pnl = pnls.value.find((p: any) => String(p.id) === String(pnlId));
  if (!pnl) return;

  setActivePnlId(String(pnl.id));

  const c0 = (pnl.contracts ?? [])[0];
  if (c0?.id) setActiveContractId(String(c0.id));

  const v0 = firstVariantIdOfContract(c0);
  if (v0) setActiveVariantId(v0);
}

function onPickContract(contractId: string) {
  const c = contractsOfActivePnl.value.find((x: any) => String(x.id) === String(contractId));
  if (!c) return;

  setActiveContractId(String(c.id));

  const v0 = firstVariantIdOfContract(c);
  if (v0) setActiveVariantId(v0);
}

/* =========================
   HEADER FIELDS
========================= */
const projectName = computed(() => activePnl.value?.title ?? "—");
const variantName = computed(() => activeVariant.value?.title ?? "—");
const durationMonths = computed(() => activeContract.value?.dureeMois ?? 0);
const status = computed(() => activeVariant.value?.status ?? "—");
const volumeTotal = computed(() => headerKpis.value?.volumeTotalM3 ?? 0);
const client = computed(() => activePnl.value?.client ?? "—");

/* =========================
   KPI METRICS
========================= */
const metrics = computed<Metrics>(() => {
  const k = headerKpis.value;

  const vol = k?.volumeTotalM3 ?? 0;
  const duree = durationMonths.value || 0;
  const ca = k?.caTotal ?? 0;

  const per = (x: number) => (ca > 0 ? (x / ca) * 100 : 0);
  const m3 = (total: number) => (vol > 0 ? total / vol : 0);
  const month = (total: number) => (duree > 0 ? total / duree : 0);

  const aspTotal = k?.caTotal ?? 0;
  const cmpTotal = k?.coutMpTotal ?? 0;
  const momdTotal = k?.momdTotal ?? 0;

  const transportTotal = k?.transportTotal ?? 0;
  const productionTotal = k?.productionTotal ?? 0;

  const amortTotal = k?.amortissementTotal ?? 0;
  const ebitdaTotal = k?.ebitdaTotal ?? 0;
  const ebitTotal = k?.ebitTotal ?? 0;

  return {
    ASP: { total: aspTotal, m3: m3(aspTotal), month: month(aspTotal), percent: 100 },
    CMP: { total: cmpTotal, m3: m3(cmpTotal), month: month(cmpTotal), percent: per(cmpTotal) },
    MOMD: { total: momdTotal, m3: m3(momdTotal), month: month(momdTotal), percent: per(momdTotal) },
    Transport: { total: transportTotal, m3: m3(transportTotal), month: month(transportTotal), percent: per(transportTotal) },
    Production: { total: productionTotal, m3: m3(productionTotal), month: month(productionTotal), percent: per(productionTotal) },
    EBITDA: { total: ebitdaTotal, m3: m3(ebitdaTotal), month: month(ebitdaTotal), percent: per(ebitdaTotal) },
    EBIT: { total: ebitTotal, m3: m3(ebitTotal), month: month(ebitTotal), percent: per(ebitTotal) },
    Amortissement: { total: amortTotal, m3: m3(amortTotal), month: month(amortTotal), percent: per(amortTotal) },
  };
});

/* ✅ 2 lignes, EBIT toujours en 2ème position */
const kpiLeftRow1: KpiName[] = ["ASP", "EBIT", "CMP", "MOMD"];
const kpiLeftRow2: KpiName[] = ["Transport", "Production", "EBITDA", "Amortissement"];

/* =========================
   Buttons (placeholders)
========================= */
function viewPnl() {}
function editPnl() {}
function viewContract() {}
function editContract() {}
function duplicateVariant() {}
function newVariant() {}
function editVariant() {}

/* =========================
   UI HELPERS
========================= */
function fmtMoney(v: number, digits = 0) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  });
}
function fmtPct(v: number) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
function kpiClass(key: KpiName) {
  return {
    ebit: key === "EBIT",
    asp: key === "ASP",
    soft1: ["CMP", "MOMD"].includes(key),
    soft2: ["Transport", "Production"].includes(key),
    soft3: ["EBITDA", "Amortissement"].includes(key),
  };
}

const statusTone = computed(() => {
  const s = String(status.value ?? "").toUpperCase();
  if (["CLOSED", "ADJUGE", "ADJUGÉ"].includes(s)) return "ok";
  if (["PERDU", "LOST"].includes(s)) return "bad";
  if (["ENCOURS", "EN_COURS", "OPEN"].includes(s)) return "warn";
  return "neutral";
});
</script>

<template>
  <header class="hd">
    <!-- ✅ BARRE FULL WIDTH (3 blocs qui couvrent 100%) -->
    <div class="bar">
      <!-- P&L selector -->
      <div class="pill pnl" @keydown.esc="pnlOpen = false">
        <button type="button" class="pill__head" @click="pnlOpen = !pnlOpen">
          <span class="pill__label">P&L</span>
          <span class="pill__value" :title="projectName">{{ projectName }}</span>
          <ChevronDownIcon class="pill__chev" />
        </button>

        <div class="pill__actions">
          <button class="iconbtn" title="Voir" @click.stop="viewPnl"><EyeIcon class="ic" /></button>
          <button class="iconbtn" title="Éditer" @click.stop="editPnl"><PencilSquareIcon class="ic" /></button>
        </div>

        <!-- ✅ Dropdown corrigé (plus de loupe géante) -->
        <div v-if="pnlOpen" class="dd" @click.stop>
          <div class="dd__search">
            <MagnifyingGlassIcon class="dd__ic" />
            <input class="dd__in" v-model="pnlQuery" placeholder="Rechercher un P&L..." />
          </div>

          <div class="dd__list">
            <button
              v-for="p in filteredPnls"
              :key="p.id"
              class="dd__item"
              :class="{ active: String(p.id) === String(activePnl?.id) }"
              @click="onPickPnl(String(p.id))"
            >
              <div class="dd__main">
                <div class="dd__title">{{ p.title ?? `P&L ${String(p.id).slice(0, 6)}` }}</div>
                <div class="dd__sub">{{ p.client ?? "—" }}</div>
              </div>
              <div class="dd__id">{{ String(p.id).slice(0, 6) }}</div>
            </button>

            <div v-if="filteredPnls.length === 0" class="dd__empty">Aucun P&L trouvé.</div>
          </div>
        </div>
      </div>

      <!-- Contrat selector -->
      <div class="pill contract">
        <div class="pill__head static">
          <span class="pill__label">Contrat</span>
          <select
            class="pill__select"
            :value="activeContract?.id ? String(activeContract.id) : ''"
            @change="onPickContract(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>—</option>
            <option v-for="c in contractsOfActivePnl" :key="c.id" :value="String(c.id)">
              {{ c.title ? String(c.title) : `Contrat ${String(c.id).slice(0, 6)}` }}
            </option>
          </select>
        </div>

        <div class="pill__actions">
          <button class="iconbtn" title="Voir" @click.stop="viewContract"><EyeIcon class="ic" /></button>
          <button class="iconbtn" title="Éditer" @click.stop="editContract"><PencilSquareIcon class="ic" /></button>
        </div>
      </div>

      <!-- ✅ Variante = INFO (pas selector) -->
      <div class="pill variant info">
        <div class="pill__head static">
          <Squares2X2Icon class="pill__miniic" />
          <span class="pill__label">Variante</span>
          <span class="pill__value" :title="variantName">{{ variantName }}</span>
        </div>

        <div class="pill__actions">
          <button class="iconbtn" title="Dupliquer" @click.stop="duplicateVariant">
            <DocumentDuplicateIcon class="ic" />
          </button>
          <button class="iconbtn" title="Nouvelle variante" @click.stop="newVariant">
            <PlusCircleIcon class="ic" />
          </button>
          <button class="iconbtn" title="Éditer variante" @click.stop="editVariant">
            <PencilSquareIcon class="ic" />
          </button>
        </div>
      </div>
    </div>

    <!-- KPI + Summary -->
    <div class="cockpit">
      <div class="kpis-left">
        <div class="kpi-row">
          <div v-for="key in kpiLeftRow1" :key="key" class="kpi" :class="kpiClass(key)">
            <div class="kpi__top">
              <span class="kpi__name">{{ key }}</span>

              <!-- ✅ % cohérent + EBIT plus visible -->
              <span class="kpi__pct" :class="{ hot: key === 'EBIT' }">
                {{ fmtPct(metrics[key].percent) }}%
              </span>
            </div>

            <div class="kpi__valRow">
              <!-- ✅ chiffres uniformes (sauf EBIT) -->
              <span class="kpi__num" :class="{ big: key === 'EBIT' }">
                {{ fmtMoney(metrics[key].total, 0) }}
              </span>
              <span class="kpi__unit">DH</span>
            </div>

            <!-- ✅ mini-ligne compacte & stable -->
            <div
              class="kpi__mini"
              :title="`${fmtMoney(metrics[key].m3, 2)} DH/m3 • ${fmtMoney(metrics[key].month, 0)} DH/mo`"
            >
              <span class="kmini">{{ fmtMoney(metrics[key].m3, 2) }}</span>
              <span class="u">DH/m3</span>
              <span class="dot">•</span>
              <span class="kmini">{{ fmtMoney(metrics[key].month, 0) }}</span>
              <span class="u">DH/mo</span>
            </div>
          </div>
        </div>

        <div class="kpi-row">
          <div v-for="key in kpiLeftRow2" :key="key" class="kpi" :class="kpiClass(key)">
            <div class="kpi__top">
              <span class="kpi__name">{{ key }}</span>
              <span class="kpi__pct">{{ fmtPct(metrics[key].percent) }}%</span>
            </div>

            <div class="kpi__valRow">
              <span class="kpi__num">{{ fmtMoney(metrics[key].total, 0) }}</span>
              <span class="kpi__unit">DH</span>
            </div>

            <div
              class="kpi__mini"
              :title="`${fmtMoney(metrics[key].m3, 2)} DH/m3 • ${fmtMoney(metrics[key].month, 0)} DH/mo`"
            >
              <span class="kmini">{{ fmtMoney(metrics[key].m3, 2) }}</span>
              <span class="u">DH/m3</span>
              <span class="dot">•</span>
              <span class="kmini">{{ fmtMoney(metrics[key].month, 0) }}</span>
              <span class="u">DH/mo</span>
            </div>
          </div>
        </div>
      </div>

      <aside class="summary" :class="statusTone">
        <div class="summary__title">Résumé</div>

        <div class="summary__grid">
          <div class="sum">
            <BuildingOffice2Icon class="sum__ic" />
            <div class="sum__txt">
              <div class="sum__k">Client</div>
              <div class="sum__v" :title="client">{{ client }}</div>
            </div>
          </div>

          <div class="sum">
            <CalendarDaysIcon class="sum__ic" />
            <div class="sum__txt">
              <div class="sum__k">Durée</div>
              <div class="sum__v">{{ durationMonths }} mois</div>
            </div>
          </div>

          <div class="sum">
            <CubeIcon class="sum__ic" />
            <div class="sum__txt">
              <div class="sum__k">Volume</div>
              <div class="sum__v">{{ Number(volumeTotal || 0).toLocaleString("fr-FR") }} m³</div>
            </div>
          </div>

          <div class="sum">
            <CheckBadgeIcon class="sum__ic" />
            <div class="sum__txt">
              <div class="sum__k">Statut</div>
              <div class="sum__v">{{ status }}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </header>
</template>

<style scoped>
/* ===== Header ===== */
.hd {
  --navy: #184070;
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.65);
  --border: rgba(16, 24, 40, 0.12);
  --bg: linear-gradient(180deg, #eef1f6 0%, #e6eaf1 100%);

  position: sticky;
  top: 0;
  z-index: 9999;
  isolation: isolate;

  background: var(--bg);
  border-bottom: 1px solid var(--border);

  padding: 8px 10px;
  display: grid;
  gap: 8px;
  overflow-x: hidden;
}

/* ===== Top bar full width ===== */
.bar {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

@media (max-width: 1100px) {
  .bar {
    grid-template-columns: 1fr;
  }
}

/* ===== Pills ===== */
.pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  width: 100%;
  background: rgba(255, 255, 255, 0.90);
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 14px;
  padding: 6px 8px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  min-width: 0;
}

.pill__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  min-width: 0;
  flex: 1;
}
.pill__head.static {
  cursor: default;
}

.pill__label {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.pill__value {
  font-size: 12px;
  font-weight: 950;
  color: var(--text);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill__chev {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.55);
  flex: 0 0 auto;
}

.pill__miniic {
  width: 16px;
  height: 16px;
  color: rgba(24, 64, 112, 0.75);
  flex: 0 0 auto;
}

.pill__actions {
  display: inline-flex;
  gap: 6px;
  flex: 0 0 auto;
}

.iconbtn {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.iconbtn:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.18);
}
.ic {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.75);
}

.pill__select {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-weight: 950;
  font-size: 12px;
  min-width: 0;
  max-width: 100%;
}

/* Variante info: pas d'apparence "selector" */
.pill.variant.info {
  background: rgba(255, 255, 255, 0.88);
}
.pill.variant.info .pill__head {
  cursor: default;
}

/* ===== Dropdown (FIX) ===== */
.dd {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: min(560px, 96vw);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
  padding: 10px;
  z-index: 10000;
}

.dd__search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.dd__ic {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.55);
  flex: 0 0 auto;
}

.dd__in {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.88);
}

.dd__list {
  max-height: 260px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dd__item {
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.dd__item:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.18);
}
.dd__item.active {
  background: rgba(144, 192, 40, 0.10);
  border-color: rgba(144, 192, 40, 0.22);
}

.dd__title {
  font-size: 12px;
  font-weight: 950;
  color: var(--text);
}
.dd__sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
.dd__id {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
  font-variant-numeric: tabular-nums;
}
.dd__empty {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  padding: 10px;
  text-align: center;
}

/* ===== Cockpit layout ===== */
.cockpit {
  display: grid;
  grid-template-columns: 1fr 210px;
  gap: 10px;
  align-items: stretch;
  min-width: 0;
}
@media (max-width: 1100px) {
  .cockpit {
    grid-template-columns: 1fr;
  }
}

.kpis-left {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}
@media (max-width: 900px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ===== KPI cards ===== */
.kpi {
  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 14px;
  padding: 9px 10px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.65) inset,
    0 10px 22px rgba(15, 23, 42, 0.10);
  min-width: 0;
  overflow: hidden;
}

/* légères teintes (sobres) pour distinguer */
.kpi.soft1 { background: linear-gradient(180deg, rgba(32,184,232,0.06), #fff 60%); }
.kpi.soft2 { background: linear-gradient(180deg, rgba(24,64,112,0.06), #fff 60%); }
.kpi.soft3 { background: linear-gradient(180deg, rgba(148,163,184,0.12), #fff 60%); }

.kpi__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.kpi__name {
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: rgba(15, 23, 42, 0.72);
}

.kpi__pct {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.58);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(15, 23, 42, 0.02);
}
.kpi__pct.hot {
  color: rgba(180, 83, 9, 0.98);
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.10);
}

.kpi__valRow {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  margin-top: 6px;
}

.kpi__num {
  font-size: 16px;          /* ✅ plus lisible */
  font-weight: 950;
  color: var(--navy);
  font-variant-numeric: tabular-nums;
}
.kpi__num.big {
  font-size: 19px;          /* ✅ EBIT héro */
  letter-spacing: 0.2px;
}

.kpi__unit {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.50);
}

.kpi__mini {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 4px;
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.70);
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kmini { font-size: 10px; font-weight: 950; color: rgba(15, 23, 42, 0.80); }
.u { font-size: 9px; font-weight: 900; color: rgba(15, 23, 42, 0.45); }
.dot { color: rgba(15, 23, 42, 0.26); }

/* ASP accent (même taille, mais effet) */
.kpi.asp {
  border-color: rgba(32, 184, 232, 0.30);
  box-shadow:
    0 0 0 1px rgba(32, 184, 232, 0.10) inset,
    0 12px 24px rgba(15, 23, 42, 0.10);
}
.kpi.asp .kpi__num {
  color: rgba(24, 64, 112, 1);
}

/* ✅ EBIT premium (glass + gradient + shine) */
.kpi.ebit {
  border-color: rgba(245, 158, 11, 0.55);
  background:
    radial-gradient(120% 90% at 20% 0%, rgba(245,158,11,0.22), transparent 55%),
    linear-gradient(180deg, rgba(245,158,11,0.14), #fff 58%);
  box-shadow:
    0 0 0 1px rgba(245, 158, 11, 0.18) inset,
    0 16px 34px rgba(15, 23, 42, 0.14);
  transform: translateY(-1px);
  position: relative;
}
.kpi.ebit::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.55), transparent 40%);
  pointer-events: none;
  opacity: 0.55;
}
.kpi.ebit .kpi__name {
  color: rgba(180, 83, 9, 0.98);
}
.kpi.ebit .kpi__num {
  color: rgba(180, 83, 9, 0.98);
}

/* ===== Summary ===== */
.summary {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  padding: 10px 10px 8px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);
  min-width: 0;
  overflow: hidden;
}

.summary__title {
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: rgba(15, 23, 42, 0.68);
  margin-bottom: 8px;
}

.summary__grid {
  display: grid;
  gap: 8px;
}

.sum {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.sum__ic {
  width: 18px;
  height: 18px;
  color: rgba(24, 64, 112, 0.70);
}
.sum__k {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.sum__v {
  font-size: 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary.ok { box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.10) inset, 0 10px 26px rgba(15, 23, 42, 0.10); }
.summary.ok .sum__ic { color: rgba(34, 197, 94, 0.70); }
.summary.warn { box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.12) inset, 0 10px 26px rgba(15, 23, 42, 0.10); }
.summary.warn .sum__ic { color: rgba(245, 158, 11, 0.75); }
.summary.bad { box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.12) inset, 0 10px 26px rgba(15, 23, 42, 0.10); }
.summary.bad .sum__ic { color: rgba(239, 68, 68, 0.75); }
.summary.neutral .sum__ic { color: rgba(24, 64, 112, 0.70); }
</style>
