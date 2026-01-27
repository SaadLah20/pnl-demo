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
import Sidebar from '@/components/Sidebar.vue'
import HeaderDashboard from '@/components/HeaderDashboard.vue'
</script>

<style>
.app {
  display: flex;
  height: 100vh;
  font-family: "Inter", Arial, sans-serif;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
</style>
