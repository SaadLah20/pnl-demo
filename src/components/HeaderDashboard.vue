<script setup lang="ts">
import { computed } from 'vue'
import { usePnlStore } from '@/stores/pnlStore'

const pnlStore = usePnlStore()

// Récupération des KPI de la variante active
const kpis = computed(() => pnlStore.kpis)
</script>

<template>
  <header class="header-dashboard">
    <div class="header-top">
      <div class="project-info">
        <div class="project-name">{{ kpis.projectName }}</div>
        <div class="variant-name">{{ kpis.variantName }}</div>
      </div>
      <div class="general-info">
        <div>Durée: {{ kpis.duration }} mois</div>
        <div>Client: {{ kpis.client }}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-item">
        <div class="kpi-label">ASP</div>
        <div class="kpi-value">{{ kpis.ASP }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">CMP</div>
        <div class="kpi-value">{{ kpis.CMP }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">MOM</div>
        <div class="kpi-value">{{ kpis.MOM }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">Transport</div>
        <div class="kpi-value">{{ kpis.Transport }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">MOMD</div>
        <div class="kpi-value">{{ kpis.MOMD }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">Production</div>
        <div class="kpi-value">{{ kpis.Production }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">Gross Profit</div>
        <div class="kpi-value">{{ kpis.GrossProfit }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">Frais généraux</div>
        <div class="kpi-value">{{ kpis.FraisGeneraux }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">EBIDA</div>
        <div class="kpi-value">{{ kpis.Ebida }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">Amortissement</div>
        <div class="kpi-value">{{ kpis.Amortissement }}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-label">EBIT</div>
        <div class="kpi-value">{{ kpis.Ebit }}</div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-dashboard {
  background: #f8f9fa;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  font-family: "Inter", Arial, sans-serif;
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name {
  font-weight: 700;
  font-size: 1.2rem;
  color: #007a33; /* couleur Holcim vert */
}

.variant-name {
  font-weight: 500;
  font-size: 0.95rem;
  color: #009ee0; /* couleur Holcim bleu */
}

.general-info {
  display: flex;
  gap: 16px;
  font-size: 0.9rem;
  color: #333;
  align-items: center;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.kpi-item {
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.kpi-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #666;
}

.kpi-value {
  font-size: 1rem;
  font-weight: 700;
  color: #007a33;
}
</style>
