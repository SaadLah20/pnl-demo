<template>
  <div class="app">
    <Sidebar />

    <div class="main-content">
      <HeaderDashboard />
      <!-- ✅ seul le contenu scroll -->
      <div class="content-scroll">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import HeaderDashboard from "@/components/HeaderDashboard.vue";
import { usePnlStore } from "@/stores/pnl.store";

const pnlStore = usePnlStore();

onMounted(() => {
  pnlStore.loadPnls();
});

// debug (optionnel) — tu peux supprimer plus tard
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
  overflow: hidden; /* ✅ évite scroll global parasite */
}

/* colonne droite */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;

  /* ✅ IMPORTANT: plus de scroll ici */
  overflow: hidden;
  min-width: 0; /* ✅ évite scroll horizontal */
}

/* ✅ seul le router-view scroll */
.content-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;

  /* ✅ évite que le contenu “mange” le header (marges/paddings internes) */
  padding: 12px;
  background: #f7f8fb; /* cohérent sidebar */
}
</style>
