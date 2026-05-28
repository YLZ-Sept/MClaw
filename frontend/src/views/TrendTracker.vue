<template>
  <div class="trend-page">
    <div class="tp-hd">
      <span class="tp-title">一键追爆款</span>
      <span class="tp-sub">短视频AI内容流水线 — 从爆款提取到视频生成，一站式获客</span>
    </div>
    <div class="tp-body">
      <HotVideoPipeline />
    </div>
  </div>
</template>

<script setup>
import HotVideoPipeline from './internal/HotVideoPipeline.vue'
</script>

<style scoped>
.trend-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.tp-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.tp-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.tp-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.tp-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
</style>
