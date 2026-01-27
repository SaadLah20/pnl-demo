<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div style="padding:16px">
    <h2>Page: {{ route.params.name || 'Accueil' }}</h2>
  </div>
</template>
