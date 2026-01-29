<template>
  <div class="app">
    <Sidebar />
    <div class="main-content">
      <HeaderDashboard />
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import HeaderDashboard from '@/components/HeaderDashboard.vue'
import { usePnlStore } from '@/stores/pnl.store'

const pnlStore = usePnlStore()

onMounted(() => {
  pnlStore.loadPnls()
})

onMounted(async () => {
  const res = await fetch("http://localhost:3001/pnls");
  const data = await res.json();
  console.log("PNLS:", data);
});

</script>

<style>
.app {
  display: flex;
  height: 100vh;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
</style>
