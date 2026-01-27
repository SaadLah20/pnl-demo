<script setup lang="ts">
import { reactive, computed } from 'vue'

type KpiName =
  | 'ASP'
  | 'CMP'
  | 'MOM'
  | 'Transport'
  | 'MOMD'
  | 'Production'
  | 'Gross Profit'
  | 'Frais Généraux'
  | 'Ebida'
  | 'Amortissement'
  | 'Ebit'

type KpiValues = { m3: number; total: number; month: number }
type Metrics = Record<KpiName, KpiValues>

const kpis = reactive({
  projectName: 'Autoroute ADM Guercif-Nador LOTS 2-2 et 2-3',
  variantName:
    'CAB neuve et terrain à la charge de LHM avec optimisations Génie civil et électricité',
  durationMonths: 24,
  client: 'Entreprise XXXX',
  metrics: {
    ASP: { m3: 120, total: 50000, month: 2083 },
    CMP: { m3: 80, total: 35000, month: 1458 },
    MOM: { m3: 30, total: 12000, month: 500 },
    Transport: { m3: 10, total: 4000, month: 167 },
    MOMD: { m3: 5, total: 2000, month: 83 },
    Production: { m3: 60, total: 25000, month: 1042 },
    'Gross Profit': { m3: 40, total: 18000, month: 750 },
    'Frais Généraux': { m3: 20, total: 9000, month: 375 },
    Ebida: { m3: 15, total: 6000, month: 250 },
    Amortissement: { m3: 10, total: 4000, month: 167 },
    Ebit: { m3: 25, total: 10000, month: 417 }
  } as Metrics
})

const volumeTotal = computed(() =>
  Object.values(kpis.metrics).reduce((acc, val) => acc + val.m3, 0)
)

const firstRow: KpiName[] = ['ASP', 'CMP', 'MOM', 'Transport', 'MOMD', 'Production']
const secondRow: KpiName[] = [
  'Gross Profit',
  'Frais Généraux',
  'Ebida',
  'Amortissement',
  'Ebit'
]

const highlightKpis: KpiName[] = ['ASP', 'Ebida', 'Ebit']
</script>

<template>
  <header class="header-dashboard">
    <!-- Projet & Variante -->
    <div class="project-info">
      <div class="project-name">{{ kpis.projectName }}</div>
      <div class="variant-name">{{ kpis.variantName }}</div>
      <div class="duration-client">
        <span>Durée: {{ kpis.durationMonths }} mois</span>
        <span>Client: {{ kpis.client }}</span>
        <span>Volume total: {{ volumeTotal }} m³</span>
      </div>
    </div>

    <!-- KPI en deux lignes -->
    <div class="kpi-container">
      <div class="kpi-row">
        <div
          v-for="key in firstRow"
          :key="key"
          :class="['kpi-card', { highlight: highlightKpis.includes(key) }]"
        >
          <div class="kpi-name">{{ key }}</div>
          <div class="kpi-values">
            <span class="value-m3">{{ kpis.metrics[key].m3 }} m³</span>
            <span class="value-total">{{ kpis.metrics[key].total.toLocaleString('fr-FR') }} DH</span>
            <span class="value-month">{{ kpis.metrics[key].month.toLocaleString('fr-FR') }} DH/mois</span>
          </div>
        </div>
      </div>
      <div class="kpi-row">
        <div
          v-for="key in secondRow"
          :key="key"
          :class="['kpi-card', { highlight: highlightKpis.includes(key) }]"
        >
          <div class="kpi-name">{{ key }}</div>
          <div class="kpi-values">
            <span class="value-m3">{{ kpis.metrics[key].m3 }} m³</span>
            <span class="value-total">{{ kpis.metrics[key].total.toLocaleString('fr-FR') }} DH</span>
            <span class="value-month">{{ kpis.metrics[key].month.toLocaleString('fr-FR') }} DH/mois</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-dashboard {
  background: #014d3f; /* fond sombre */
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: "Inter", Arial, sans-serif;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  border-radius: 6px;
  position: sticky;
  top: 0;
  z-index: 100;
}

/* Projet et variante */
.project-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.project-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff;
}
.variant-name {
  font-size: 0.78rem;
  color: #ccc;
}
.duration-client {
  font-size: 0.72rem;
  color: #aaa;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* KPI container */
.kpi-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.kpi-card {
  flex: 1;
  min-width: 100px;
  background: #2c2c2c; /* bloc légèrement plus clair */
  padding: 4px 6px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #eee;
  border: 1px solid #444;
  font-size: 0.78rem;
}

.kpi-card.highlight {
  border: 2px solid #00d084; /* vert vif */
  background: #333; /* fond un peu plus clair pour se détacher */
}

.kpi-name {
  font-weight: 500;
  color: #bbb;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.kpi-values span {
  display: block;
  font-weight: 600;
  font-size: 0.75rem;
}

.kpi-values .value-m3 { color:#999; }
.kpi-values .value-total { color:#00d084; }
.kpi-values .value-month { color:#00aaff; }
</style>
