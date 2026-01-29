<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();
const { pnls, activePnlId, activeVariantId, loading, error } = storeToRefs(store);

onMounted(async () => {
  if (pnls.value.length === 0) {
    await store.loadPnls();
  }
});

function selectPnl(id: string) {
  store.setActivePnl(id);
}

function selectVariant(id: string) {
  store.setActiveVariant(id);
}
</script>

<template>
  <div class="mes-pnls">
    <div class="toolbar">
      <h2>Mes P&L</h2>
      <button class="primary">➕ Nouveau P&L</button>
    </div>

    <div v-if="loading" class="state">Chargement…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <div v-else class="grid">
      <div
        v-for="p in pnls"
        :key="p.id"
        class="card"
        :class="{ active: p.id === activePnlId }"
      >
        <div class="card-head">
          <button class="title" @click="selectPnl(p.id)">
            {{ p.title }}
          </button>

          <div class="meta">
            <span>{{ p.model }}</span>
            <span>•</span>
            <span>{{ p.status }}</span>
          </div>

          <div class="meta">
            <span>{{ p.city }}</span>
            <span>•</span>
            <span>{{ p.region }}</span>
            <span v-if="p.client">•</span>
            <span v-if="p.client">{{ p.client }}</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="section">
          <div class="section-title">Contrats</div>

          <div v-if="!(p.contracts?.length)" class="empty">Aucun contrat</div>

          <div v-for="c in (p.contracts ?? [])" :key="c.id" class="contract">
            <div class="contract-meta">
              <span>Postes: <b>{{ c.postes }}</b></span>
              <span>Penalty: <b>{{ c.delayPenalty }}</b></span>
              <span>Chiller: <b>{{ c.chillerRent }}</b></span>
            </div>

            <div class="variants">
              <button
                v-for="v in (c.variants ?? [])"
                :key="v.id"
                class="chip"
                :class="{ active: v.id === activeVariantId }"
                @click="selectVariant(v.id)"
              >
                {{ v.title }}
                <span class="chip-sub">({{ v.status }})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mes-pnls { padding: 14px 16px; }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
h2 { margin: 0; font-size: 1.1rem; }

.primary {
  background: #3b82f6;
  color: white;
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.state { padding: 10px 0; opacity: .85; }
.state.error { color: #c00; }

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; }
}

.card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  background: white;
}
.card.active { border-color: #3b82f6; }

.title {
  display: block;
  width: 100%;
  text-align: left;
  font-weight: 800;
  font-size: .95rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 0;
}

.meta {
  margin-top: 4px;
  font-size: .78rem;
  opacity: .75;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.divider { height: 1px; background: #f1f5f9; margin: 10px 0; }

.section-title { font-weight: 800; font-size: .85rem; margin-bottom: 8px; }
.empty { opacity: .7; font-size: .8rem; }

.contract {
  padding: 10px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  margin: 10px 0;
  background: #fafafa;
}
.contract-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: .78rem;
  opacity: .85;
}

.variants { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.chip {
  border: 1px solid #e2e8f0;
  background: white;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-size: .78rem;
}
.chip.active { border-color: #3b82f6; }
.chip-sub { opacity: .7; margin-left: 6px; }
</style>
