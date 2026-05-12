<template>
  <div class="page-container">
    <div class="page-title">仪表盘</div>
    <div class="dashboard-grid">
      <div class="stat-card" v-for="stat in stats" :key="stat.label">
        <div class="stat-icon" :style="{ background: stat.bg }">
          <el-icon :color="stat.color" :size="24"><component :is="stat.icon" /></el-icon>
        </div>
        <div class="stat-label">{{ stat.label }}</div>
        <div class="stat-value">{{ stat.value }}</div>
      </div>
    </div>
    <el-card shadow="hover" style="border-radius: 12px;">
      <template #header><span style="font-weight: 600;">系统状态</span></template>
      <div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="运行状态"><el-tag type="success" size="small">运行中</el-tag></el-descriptions-item>
          <el-descriptions-item label="引擎版本">OpenClaw v0.14.0</el-descriptions-item>
          <el-descriptions-item label="CPU 使用率">12%</el-descriptions-item>
          <el-descriptions-item label="内存使用">380 MB</el-descriptions-item>
          <el-descriptions-item label="活跃服务">3</el-descriptions-item>
          <el-descriptions-item label="运行时间">72h 15m</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { Monitor, Cpu, Connection, ChatDotSquare } from '@element-plus/icons-vue'

const stats = [
  { label: '活跃会话', value: '24', icon: ChatDotSquare, bg: '#e6f1ff', color: '#409eff' },
  { label: '运行服务', value: '3', icon: Connection, bg: '#e8faf0', color: '#67c23a' },
  { label: 'CPU 使用率', value: '12%', icon: Cpu, bg: '#fef0e6', color: '#e6a23c' },
  { label: '内存占用', value: '380 MB', icon: Monitor, bg: '#fcece8', color: '#f56c6c' }
]
</script>
