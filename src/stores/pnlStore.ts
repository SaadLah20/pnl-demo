// src/stores/pnlStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePnlStore = defineStore('pnl', () => {
  const activeVariant = ref('CAB neuve') // exemple
  const kpis = ref({
    projectName: 'Autoroute ADM Guercif-Nador LOTS 2-2 et 2-3',
    variantName: 'CAB neuve et terrain à la charge de LHM avec optimisations Génie civil et électricité',
    duration: 12,
    client: 'Entreprise XXXX',
    ASP: 250,
    CMP: 180,
    MOM: 50,
    Transport: 20,
    MOMD: 15,
    Production: 300,
    GrossProfit: 120,
    FraisGeneraux: 30,
    Ebida: 90,
    Amortissement: 40,
    Ebit: 50
  })

  return { activeVariant, kpis }
})
