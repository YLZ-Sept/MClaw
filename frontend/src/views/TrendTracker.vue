<template>
  <div class="trend-page">
    <HotVideoPipeline />
  </div>
</template>

<script setup>
import HotVideoPipeline from './internal/HotVideoPipeline.vue'
</script>

<style scoped>
.trend-page { height: 100%; overflow-y: auto; }
</style>
