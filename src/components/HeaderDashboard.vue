<script setup lang="ts">
import { computed, onMounted } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

type KpiName =
  | "ASP"
  | "CMP"
  | "MOMD"
  | "Transport"
  | "Production"
  | "EBIDA"
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
const contractName = computed(() => (activeContract.value ? `Contrat ${activeContract.value.id.slice(0, 6)}` : "—"));
const variantName = computed(() => activeVariant.value?.title ?? "—");

const durationMonths = computed(() => 0); // TODO: calcul plus tard
const client = computed(() => activePnl.value?.client ?? "—");
const status = computed(() => activePnl.value?.status ?? "—");
const volumeTotal = computed(() => 0); // TODO: calcul plus tard

// KPI: pour l’instant en “placeholder” (tu n’as pas encore la logique de calcul)
const metrics = computed<Metrics>(() => ({
  ASP: { total: 50000, m3: 120, month: 2083, percent: 100 },
  CMP: { total: 35000, m3: 80, month: 1458, percent: 70 },
  MOMD: { total: 2000, m3: 5, month: 83, percent: 4 },
  Transport: { total: 4000, m3: 10, month: 167, percent: 8 },
  Production: { total: 25000, m3: 60, month: 1042, percent: 50 },
  EBIDA: { total: 6000, m3: 15, month: 250, percent: 12 },
  EBIT: { total: 10000, m3: 25, month: 417, percent: 20 },
  Amortissement: { total: 4000, m3: 10, month: 167, percent: 8 },
}));

const kpiOrder: KpiName[] = [
  "ASP",
  "CMP",
  "MOMD",
  "Transport",
  "Production",
  "EBIDA",
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
        :class="{ highlight: ['ASP', 'EBIDA', 'EBIT'].includes(key) }"
      >
        <div class="kpi-title">{{ key }}</div>
        <div class="kpi-box">
          <div class="kpi-percent">{{ metrics[key].percent }}%</div>
          <div class="kpi-values">
            <span>{{ metrics[key].total.toLocaleString("fr-FR") }} DH</span>
            <span>{{ metrics[key].m3 }} DH/m³</span>
            <span>{{ metrics[key].month }} DH/mois</span>
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
