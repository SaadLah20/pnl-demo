<script setup lang="ts">
import { computed, onMounted } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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

const activePnl = computed(() => store.activePnl);
const activeVariant = computed(() => store.activeVariant);

const headerKpis = computed(() => store.activeHeaderKPIs);

// Cherche le contrat qui contient la variante active
const activeContract = computed(() => {
  const pnl = activePnl.value;
  const vId = store.activeVariantId;
  if (!pnl || !pnl.contracts?.length) return null;
  if (!vId) return pnl.contracts[0];

  return (
    pnl.contracts.find((c: any) => (c.variants ?? []).some((v: any) => v.id === vId)) ??
    pnl.contracts[0]
  );
});

// Champs affichés dans le header
const projectName = computed(() => activePnl.value?.title ?? "—");
const contractName = computed(() =>
  activeContract.value ? `Contrat ${activeContract.value.id.slice(0, 6)}` : "—"
);
const variantName = computed(() => activeVariant.value?.title ?? "—");

const durationMonths = computed(() => activeContract.value?.dureeMois ?? 0);
const status = computed(() => activeVariant.value?.status ?? "—");
const volumeTotal = computed(() => headerKpis.value?.volumeTotalM3 ?? 0);
const client = computed(() => activePnl.value?.client ?? "—");

// KPI (placeholder propre, connecté au store)
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

    Transport: {
      total: transportTotal,
      m3: m3(transportTotal),
      month: month(transportTotal),
      percent: per(transportTotal),
    },

    Production: {
      total: productionTotal,
      m3: m3(productionTotal),
      month: month(productionTotal),
      percent: per(productionTotal),
    },

    EBITDA: {
      total: ebitdaTotal,
      m3: m3(ebitdaTotal),
      month: month(ebitdaTotal),
      percent: per(ebitdaTotal),
    },

    EBIT: {
      total: ebitTotal,
      m3: m3(ebitTotal),
      month: month(ebitTotal),
      percent: per(ebitTotal),
    },

    Amortissement: {
      total: amortTotal,
      m3: m3(amortTotal),
      month: month(amortTotal),
      percent: per(amortTotal),
    },
  };
});


const kpiOrder: KpiName[] = [
  "ASP",
  "CMP",
  "MOMD",
  "Transport",
  "Production",
  "EBITDA",
  "EBIT",
  "Amortissement",
];

const actions = [
  { label: "Dupliquer", icon: "📄" },
  { label: "Nouvelle variante", icon: "➕" },
  { label: "Archiver", icon: "🗄️" },
  { label: "Éditer", icon: "✏️" },
  { label: "Supprimer", icon: "🗑️" },
];
</script>

<template>
  <header class="header-dashboard">
    <!-- Ligne principale -->
    <div class="top-row">
      <div class="left-info">
        <div class="edit-item pnL">P&L : {{ projectName }}</div>
        <div class="edit-item contract">Contrat : {{ contractName }}</div>

        <div class="variant-block">
          <div class="edit-item variant">Variante : {{ variantName }}</div>

          <div class="actions-block">
            <button v-for="act in actions" :key="act.label" class="action-btn">
              {{ act.icon }} {{ act.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="right-info">
        <span>Durée : {{ durationMonths }} mois</span>
        <span>Volume : {{ volumeTotal.toLocaleString("fr-FR") }} m³</span>
        <span>Client : {{ client }}</span>
        <span>Status : {{ status }}</span>
      </div>
    </div>

    <!-- KPI GRID -->
    <div class="kpi-grid">
      <div
        v-for="key in kpiOrder"
        :key="key"
        class="kpi-column"
        :class="{ highlight: ['ASP', 'EBITDA', 'EBIT'].includes(key) }"
      >
        <div class="kpi-title">{{ key }}</div>

        <div class="kpi-box">
          <div class="kpi-percent">
            {{
              Number(metrics[key].percent || 0).toLocaleString("fr-FR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })
            }}%
          </div>

          <div class="kpi-values">
            <span>
              {{
                Number(metrics[key].total || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH
            </span>

            <span>
              {{
                Number(metrics[key].m3 || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH/m³
            </span>

            <span>
              {{
                Number(metrics[key].month || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH/mois
            </span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* =========================
   Dark Premium Header Dashboard
   + Right-info amber
   + KPI 3-colors values
   + ASP & EBIT FULL BLOCK special
   (CSS only, template unchanged)
   ========================= */

.header-dashboard {
  position: sticky;
  top: 0;
  z-index: 100;

  font-family: "Inter", sans-serif;

  /* ✅ Dark premium glass */
  background: rgba(15, 23, 42, 0.92); /* slate-900 */
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  border-bottom: 1px solid rgba(51, 65, 85, 0.8); /* slate-700 */
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);

  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* =========================
   TOP ROW: horizontal toolbar
   ========================= */
.top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.left-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 280px;
}

/* Compact pills */
.edit-item {
  width: auto;
  max-width: 420px;

  font-size: 11px;
  font-weight: 750;
  color: #e2e8f0; /* slate-200 */

  padding: 4px 8px;
  border-radius: 999px;

  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(2, 6, 23, 0.55); /* slate-950 */

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}

/* Accent soft */
.edit-item.pnL {
  border-color: rgba(0, 158, 224, 0.35);
  background: rgba(2, 6, 23, 0.65);
  color: #7dd3fc; /* sky-300 */
}

.edit-item.contract {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(2, 6, 23, 0.65);
  color: #fdba74; /* orange-300 */
}

.edit-item.variant {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(2, 6, 23, 0.65);
  color: #86efac; /* green-300 */
  font-weight: 800;
}

/* inline compact surface for variant + actions */
.variant-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  padding: 5px 7px;
  border-radius: 12px;

  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(2, 6, 23, 0.55);

  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
}

/* actions chips */
.actions-block {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn {
  border: 1px solid rgba(51, 65, 85, 0.9);
  background: rgba(15, 23, 42, 0.55);

  color: #cbd5e1; /* slate-300 */
  font-size: 10.2px;
  font-weight: 700;

  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;

  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease,
    border-color 0.12s ease, color 0.12s ease;
}

.action-btn:hover {
  transform: translateY(-1px);

  background: rgba(0, 158, 224, 0.18);
  border-color: rgba(0, 158, 224, 0.35);

  color: #e2e8f0;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.32);
}

.action-btn:active {
  transform: translateY(0);
}

.action-btn:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.35);
  outline-offset: 2px;
}

/* =========================
   RIGHT META: amber (clearer)
   ========================= */
.right-info {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;

  font-size: 10.5px;
  font-weight: 750;

  color: rgba(253, 230, 138, 0.98); /* amber-200 */

  padding: 5px 8px;
  border-radius: 12px;

  border: 1px solid rgba(245, 158, 11, 0.30);
  background: rgba(245, 158, 11, 0.06);
}

/* =========================
   KPI GRID (dense + premium dark)
   ========================= */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.kpi-column {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.kpi-title {
  font-size: 9.5px;
  font-weight: 750;
  letter-spacing: 0.45px;
  text-transform: uppercase;
  color: #94a3b8; /* slate-400 */
  text-align: center;
  line-height: 1.1;
}

/* KPI card */
.kpi-box {
  position: relative;
  border-radius: 14px;
  padding: 8px 8px;

  background: rgba(2, 6, 23, 0.62); /* slate-950 */
  border: 1px solid rgba(51, 65, 85, 0.9);

  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.kpi-box::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  border-radius: 14px 14px 0 0;
  opacity: 0.95;
  background: linear-gradient(90deg, #009ee0, #22c55e);
}

.kpi-box:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.45);
  border-color: rgba(148, 163, 184, 0.55);
}

/* Percent typography */
.kpi-percent {
  font-size: 14px;
  font-weight: 750;
  line-height: 1.1;
  color: #e2e8f0;
  text-align: center;
  margin-bottom: 6px;

  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

/* KPI values base */
.kpi-values span {
  display: block;
  text-align: center;

  font-size: 10px;
  font-weight: 600;
  line-height: 1.35;

  font-variant-numeric: tabular-nums;
  letter-spacing: -0.1px;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 3 colors for KPI values */
.kpi-values span:nth-child(1) {
  color: #e2e8f0; /* total */
  font-weight: 650;
}
.kpi-values span:nth-child(2) {
  color: #7dd3fc; /* m3 */
  font-weight: 600;
  opacity: 0.95;
}
.kpi-values span:nth-child(3) {
  color: #86efac; /* month */
  font-weight: 600;
  opacity: 0.95;
}

/* KPI accents by order (kpiOrder) */
.kpi-column:nth-child(1) .kpi-box::before { background: linear-gradient(90deg, #009ee0, #22c55e); }
.kpi-column:nth-child(2) .kpi-box::before { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.kpi-column:nth-child(3) .kpi-box::before { background: linear-gradient(90deg, #22c55e, #16a34a); }
.kpi-column:nth-child(4) .kpi-box::before { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
.kpi-column:nth-child(5) .kpi-box::before { background: linear-gradient(90deg, #a855f7, #ec4899); }
.kpi-column:nth-child(6) .kpi-box::before { background: linear-gradient(90deg, #10b981, #0ea5e9); }
.kpi-column:nth-child(7) .kpi-box::before { background: linear-gradient(90deg, #0f172a, #64748b); }
.kpi-column:nth-child(8) .kpi-box::before { background: linear-gradient(90deg, #94a3b8, #64748b); }

/* =========================
   SPECIAL: ASP & EBIT (FULL BLOCK)
   Order in kpiOrder:
   1 = ASP
   7 = EBIT
   ========================= */

/* ASP special (whole block) */
.kpi-column:nth-child(1) {
  transform: translateY(-2px);
}

.kpi-column:nth-child(1) .kpi-title {
  color: #7dd3fc;
  font-weight: 900;
  letter-spacing: 0.55px;
}

.kpi-column:nth-child(1) .kpi-box {
  border-color: rgba(125, 211, 252, 0.55);

  background: linear-gradient(
    180deg,
    rgba(0, 158, 224, 0.12),
    rgba(2, 6, 23, 0.70)
  );

  box-shadow:
    0 18px 42px rgba(0, 158, 224, 0.12),
    0 18px 42px rgba(0, 0, 0, 0.48);
}

.kpi-column:nth-child(1) .kpi-box::before {
  height: 4px;
  background: linear-gradient(90deg, #7dd3fc, #22c55e);
}

.kpi-column:nth-child(1) .kpi-percent {
  color: #7dd3fc;
  font-weight: 950;
}

/* EBIT special (whole block) */
.kpi-column:nth-child(7) {
  transform: translateY(-2px);
}

.kpi-column:nth-child(7) .kpi-title {
  color: rgba(253, 230, 138, 0.98);
  font-weight: 900;
  letter-spacing: 0.55px;
}

.kpi-column:nth-child(7) .kpi-box {
  border-color: rgba(245, 158, 11, 0.55);

  background: linear-gradient(
    180deg,
    rgba(245, 158, 11, 0.10),
    rgba(2, 6, 23, 0.72)
  );

  box-shadow:
    0 18px 42px rgba(245, 158, 11, 0.10),
    0 18px 42px rgba(0, 0, 0, 0.50);
}

.kpi-column:nth-child(7) .kpi-box::before {
  height: 4px;
  background: linear-gradient(90deg, rgba(253, 230, 138, 0.98), #64748b);
}

.kpi-column:nth-child(7) .kpi-percent {
  color: rgba(253, 230, 138, 0.98);
  font-weight: 950;
}

/* Hover special */
.kpi-column:nth-child(1) .kpi-box:hover,
.kpi-column:nth-child(7) .kpi-box:hover {
  transform: translateY(-2px);
  border-color: rgba(226, 232, 240, 0.35);
  box-shadow:
    0 22px 55px rgba(0, 0, 0, 0.55),
    0 22px 55px rgba(255, 255, 255, 0.03);
}

/* Mobile */
@media (max-width: 900px) {
  .header-dashboard { padding: 7px 9px; gap: 7px; }
  .edit-item { max-width: 320px; }
  .kpi-percent { font-size: 13.5px; }
  .kpi-values span { font-size: 9.8px; }
}

</style>
