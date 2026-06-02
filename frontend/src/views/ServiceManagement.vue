<template>
  <div class="page-container">
    <div class="page-hd">
      <span class="page-title">服务管理</span>
      <el-button :icon="Refresh" @click="fetchStatus" :loading="loading" size="small" round>刷新</el-button>
    </div>

    <!-- 系统监控 -->
    <div class="sys-bar">
      <div class="sys-item" style="--accent:#7c3aed">
        <span class="sys-icon"><el-icon :size="12"><Cpu /></el-icon></span>
        <span class="sys-label">CPU</span>
        <span class="sys-num">{{ system?.cpu || '-' }}</span>
      </div>
      <div class="sys-item" style="--accent:#0284c7">
        <span class="sys-icon"><el-icon :size="12"><Memo /></el-icon></span>
        <span class="sys-label">内存</span>
        <span class="sys-num">{{ memoryUsed }}<em>{{ memoryTotal }}</em></span>
      </div>
      <div class="sys-item" style="--accent:#22c55e">
        <span class="sys-icon"><el-icon :size="12"><Timer /></el-icon></span>
        <span class="sys-label">运行</span>
        <span class="sys-num">{{ backendUptime }}</span>
      </div>
    </div>

    <!-- 服务状态卡片 -->
    <div class="service-grid">
      <div v-for="svc in services" :key="svc.name" class="service-card">
        <div class="svc-left">
          <div class="svc-icon" :style="{ background: svcIconBg(svc.name) }">
            <el-icon :size="20" :color="svcIconColor(svc.name)">
              <component :is="svcIcon(svc.name)" />
            </el-icon>
          </div>
        </div>
        <div class="svc-middle">
          <div class="svc-name">{{ svc.name }}</div>
          <div class="svc-meta">
            <span class="svc-port">端口 {{ svc.port }}</span>
            <span v-if="svc.uptime && svc.uptime !== '-'" class="svc-uptime">运行 {{ svc.uptime }}</span>
          </div>
        </div>
        <div class="svc-right">
          <span class="pulse-dot" :class="svc.status"></span>
          <el-tag :type="svc.status === 'running' ? 'success' : 'danger'" size="small" effect="dark" round>
            {{ svc.status === 'running' ? '运行中' : '已停止' }}
          </el-tag>
          <el-button size="small" round @click="openUrl(svc.name)">打开</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh, Cpu, Memo, Timer, Monitor, VideoCamera, PictureFilled } from '@element-plus/icons-vue'
import { getStatus } from '../api/index.js'

const services = ref([])
const system = ref(null)
const loading = ref(false)
let timer = null

const memoryUsed = computed(() => {
  if (!system.value?.memory) return '-'
  const m = system.value.memory.match(/^(\d+)MB/)
  return m ? m[1] + ' MB' : system.value.memory.split(' / ')[0] || '-'
})

const memoryTotal = computed(() => {
  if (!system.value?.memory) return ''
  const parts = system.value.memory.split(' / ')
  return parts[1] ? '/ ' + parts[1] : ''
})

const backendUptime = computed(() => {
  const svc = services.value.find(s => s.name === '后端 API 服务')
  return svc?.uptime || '-'
})

const URLS = {
  '后端 API 服务': 'http://localhost:4011',
  '抖音发布服务': 'http://localhost:8000',
  '前端 Web 服务': 'http://localhost:4011',
}

function svcIcon(name) {
  const map = { '后端 API 服务': Monitor, '抖音发布服务': VideoCamera, '前端 Web 服务': PictureFilled }
  return map[name] || Monitor
}

function svcIconBg(name) {
  const map = { '后端 API 服务': '#ede9fe', '抖音发布服务': '#fce7f3', '前端 Web 服务': '#e0f2fe' }
  return map[name] || '#ede9fe'
}

function svcIconColor(name) {
  const map = { '后端 API 服务': '#7c3aed', '抖音发布服务': '#db2777', '前端 Web 服务': '#0284c7' }
  return map[name] || '#7c3aed'
}

function openUrl(name) {
  const url = URLS[name]
  if (url) window.open(url, '_blank')
}

async function fetchStatus() {
  loading.value = true
  try {
    const res = await getStatus()
    if (res.data?.code === 200) {
      services.value = res.data.data.services || []
      system.value = res.data.data.system || null
    }
  } catch (e) {
    console.error('获取服务状态失败', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStatus()
  timer = setInterval(fetchStatus, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style scoped>
.page-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.page-container { padding: 20px 24px; height: 100%; overflow-y: auto; background: #fafafe; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }

/* 系统监控条 */
.sys-bar {
  display: inline-flex; gap: 6px;
  background: rgba(255,255,255,.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(124,58,237,.06);
  border-radius: 8px;
  padding: 2px 8px;
  margin-bottom: 16px;
}
.sys-item {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 4px;
}
.sys-icon {
  width: 18px; height: 18px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: var(--accent);
}
.sys-label { font-size: 11px; color: #909399; }
.sys-num { font-size: 12px; font-weight: 600; color: #303133; }
.sys-num em { font-style: normal; font-size: 10px; color: #b8aad0; margin-left: 1px; }

/* 服务卡片 */
.service-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.service-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05);
  border: 1px solid #f0ecf8;
  transition: box-shadow .2s;
}
.service-card:hover { box-shadow: 0 4px 12px rgba(124,58,237,.08); }

.svc-left { flex-shrink: 0; }
.svc-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}

.svc-middle { flex: 1; min-width: 0; }
.svc-name { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 2px; }
.svc-meta { display: flex; gap: 8px; align-items: center; }
.svc-port {
  background: #f5f3ff; color: #7c3aed;
  padding: 1px 7px; border-radius: 4px;
  font-family: monospace; font-size: 11px;
}
.svc-uptime { font-size: 11px; color: #b8aad0; }

.svc-right {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}

.pulse-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.pulse-dot.running { background: #22c55e; animation: pulse 2s infinite; }
.pulse-dot.stopped { background: #ef4444; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); }
  50% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
}

@media (max-width: 900px) {
  .service-grid { grid-template-columns: 1fr; }
  .service-card { flex-wrap: wrap; }
}
</style>
