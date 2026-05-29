<template>
  <div class="trend-page">
    <div class="tp-hd">
      <span class="tp-title">一键追爆款</span>
      <span class="tp-sub">短视频AI内容流水线 — 从爆款提取到视频生成，一站式获客</span>
      <div class="tp-tabs">
        <span :class="{ active: subTab === 'pipeline' }" @click="subTab='pipeline'">爆款流水线</span>
        <span :class="{ active: subTab === 'chanjing' }" @click="subTab='chanjing'">蝉镜工作室</span>
      </div>
    </div>
    <div class="tp-body">
      <HotVideoPipeline v-if="subTab==='pipeline'"/>
      <ChanjingStudio v-else/>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import HotVideoPipeline from './internal/HotVideoPipeline.vue'
import ChanjingStudio from './ChanjingStudio.vue'
const subTab = ref('pipeline')
</script>

<style scoped>
.trend-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.tp-hd { padding: 16px 24px 12px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.tp-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.tp-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.tp-tabs { margin-top: 10px; display: flex; gap: 0; }
.tp-tabs span { padding: 6px 20px; cursor: pointer; font-size: 14px; color: #909399; border-bottom: 2px solid transparent; transition: all 0.2s; user-select: none; }
.tp-tabs span:hover { color: #409eff; }
.tp-tabs span.active { color: #409eff; font-weight: 600; border-bottom-color: #409eff; }
.tp-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
</style>
