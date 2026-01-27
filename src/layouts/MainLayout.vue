<script setup lang="ts">
import Sidebar from '@/components/Sidebar.vue'
import HeaderDashboard from '@/components/HeaderDashboard.vue'
</script>

<template>
  <div class="layout">
    <Sidebar />
    <div class="main">
      <HeaderDashboard />
      <div class="content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  padding: 16px;
  background: #f5f6f8;
}
</style>
