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
  const mp = k?.coutMpTotal ?? 0;

  const marge = k?.margeBrute ?? 0;

  const asp_m3 = k?.prixMoyenM3 ?? 0;
  const cmp_m3 = k?.coutMpMoyenM3 ?? 0;
  const momd_m3 = k?.momdMoyenM3 ?? 0;

  const per = (x: number) => (ca > 0 ? (x / ca) * 100 : 0);
  const month = (total: number) => (duree > 0 ? total / duree : 0);

  return {
    ASP: { total: ca, m3: asp_m3, month: month(ca), percent: 100 },
    CMP: { total: mp, m3: cmp_m3, month: month(mp), percent: per(mp) },
    MOMD: { total: 0, m3: momd_m3, month: 0, percent: 0 },

    Transport: { total: 0, m3: 0, month: 0, percent: 0 },
    Production: { total: 0, m3: 0, month: 0, percent: 0 },

    EBITDA: { total: marge, m3: vol > 0 ? marge / vol : 0, month: month(marge), percent: per(marge) },
    EBIT: { total: marge, m3: vol > 0 ? marge / vol : 0, month: month(marge), percent: per(marge) },
    Amortissement: { total: 0, m3: 0, month: 0, percent: 0 },
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
.header-dashboard {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #12122e;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid #20414f;
  font-family: "Inter", sans-serif;
}

.top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.left-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-item {
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-item.pnL { color: #3b82f6; }
.edit-item.contract { color: #facc15; }
.edit-item.variant { color: #22c55e; font-weight: 600; }

.variant-block {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 6px;
  border-radius: 6px;
  flex-wrap: wrap;
}

.actions-block {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.action-btn {
  background: #1e293b;
  border: 1px solid #3b82f6;
  color: #cbd5f5;
  font-size: 0.68rem;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.2s;
}
.action-btn:hover {
  background: #3b82f6;
  color: #fff;
}

.right-info {
  display: flex;
  gap: 10px;
  font-size: 0.72rem;
  color: #de8511;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(4, 1fr); }
}

.kpi-column {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.kpi-title {
  font-size: 0.66rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #cbd5f5;
  text-align: center;
}

.kpi-box {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 4px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.kpi-column.highlight .kpi-box {
  border-color: #22c55e;
  background: #052e1a;
}

.kpi-percent {
  font-size: 1rem;
  font-weight: 700;
  color: #22c55e;
  line-height: 1;
}

.kpi-values span {
  display: block;
  font-size: 0.60rem;
  font-weight: 500;
  color: #e5e7eb;
  line-height: 1.1;
}
</style>
