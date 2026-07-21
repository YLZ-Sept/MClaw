<template>
  <div class="page-container">
    <div class="page-hd">
      <span class="page-title">仪表盘</span>
      <el-button size="small" text @click="refresh" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <!-- KPI 卡片行 -->
    <div class="kpi-row">
      <div class="kpi-card" v-for="k in kpis" :key="k.label" :style="{ '--accent': k.color }">
        <div class="kpi-icon"><el-icon :size="20" :color="k.color"><component :is="k.icon"/></el-icon></div>
        <div class="kpi-body">
          <div class="kpi-val">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
        </div>
      </div>
    </div>

    <div class="dash-grid">
      <!-- 系统服务 -->
      <div class="section-card card-accent-purple">
        <div class="section-hd"><span class="section-title">系统服务</span></div>
        <div class="svc-list">
          <div v-for="s in services" :key="s.name" class="svc-row">
            <span class="pulse-dot" :class="s.status === 'running' ? 'running' : 'stopped'"></span>
            <span class="svc-name">{{ s.name }}</span>
            <span class="svc-port">:{{ s.port }}</span>
            <span class="svc-uptime">{{ s.uptime || '-' }}</span>
            <el-tag :type="s.status === 'running' ? 'success' : 'danger'" size="small" round>{{ s.status === 'running' ? '运行' : '停止' }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 模型配置 -->
      <div class="section-card card-accent-blue">
        <div class="section-hd">
          <span class="section-title">模型配置</span>
          <span class="count-badge">{{ modelConfigs?.length || 0 }} 个</span>
        </div>
        <div class="svc-list">
          <div v-for="m in modelConfigs || []" :key="m.id" class="svc-row">
            <span class="pulse-dot" :class="m.is_active ? 'running' : 'stopped'"></span>
            <span class="svc-name">{{ m.provider }}</span>
            <span class="svc-port">{{ m.model }}</span>
            <el-tag v-if="m.is_default" type="success" size="small" round>默认</el-tag>
            <el-tag v-if="m.is_active" type="success" size="small" effect="plain" round>激活</el-tag>
            <el-tag v-else type="info" size="small" effect="plain" round>停用</el-tag>
          </div>
          <el-empty v-if="!modelConfigs?.length" description="暂无模型配置" :image-size="40"/>
        </div>
      </div>

      <!-- 渠道健康 -->
      <div class="section-card card-accent-cyan">
        <div class="section-hd">
          <span class="section-title">消息渠道</span>
          <span class="count-badge">{{ chHealthy }}/{{ chTotal }} 正常</span>
        </div>
        <div class="svc-list">
          <div v-for="ch in (channelManager?.channels?.length ? channelManager.channels : channelHealth?.channels || [])" :key="ch.id || ch.name" class="svc-row">
            <span class="pulse-dot" :class="(ch.health?.status||ch.status)==='healthy'?'running':'stopped'"
              :style="{ background: (ch.health?.status||ch.status)==='healthy'?'#22c55e':(ch.health?.status||ch.status)==='degraded'?'#f59e0b':(ch.health?.status||ch.status)==='unhealthy'?'#ef4444':'#9ca3af' }"></span>
            <span class="svc-name">{{ ch.name || ch.id }}</span>
            <el-tag :type="(ch.health?.status||ch.status)==='healthy'?'success':(ch.health?.status||ch.status)==='degraded'?'warning':'info'" size="small" round>{{ ch.health?.status || ch.status || 'unknown' }}</el-tag>
            <span class="svc-uptime">{{ ch.totalMessages || 0 }} 消息</span>
            <span v-if="ch.consecutiveFailures" class="svc-uptime" style="color:#f59e0b">{{ ch.consecutiveFailures }} 错误</span>
          </div>
        </div>
      </div>

      <!-- 审计摘要 -->
      <div class="section-card card-accent-amber">
        <div class="section-hd">
          <span class="section-title">审计日志</span>
          <span class="count-badge">{{ auditStats?.total || 0 }} 条</span>
        </div>
        <div class="svc-list" v-if="auditStats?.byType?.length">
          <div v-for="t in auditStats.byType.slice(0,5)" :key="t.event_type" class="svc-row">
            <span class="svc-name">{{ t.event_type }}</span>
            <span class="svc-uptime">{{ t.c }} 次</span>
          </div>
        </div>
        <el-empty v-else description="暂无审计记录" :image-size="40"/>
      </div>

      <!-- 插件 -->
      <div class="section-card card-accent-green">
        <div class="section-hd">
          <span class="section-title">插件</span>
          <span class="count-badge">{{ plugins?.plugins?.length || 0 }} 个</span>
        </div>
        <div class="svc-list">
          <div v-for="p in plugins?.plugins || []" :key="p.name" class="svc-row">
            <span class="pulse-dot running"></span>
            <span class="svc-name">{{ p.name }}</span>
            <el-tag type="success" size="small" round>v{{ p.version }}</el-tag>
            <span class="svc-uptime">{{ p.toolCount }} 工具</span>
          </div>
          <el-empty v-if="!plugins?.plugins?.length" description="无插件" :image-size="40"/>
        </div>
      </div>

      <!-- 记忆概览 -->
      <div class="section-card card-accent-pink">
        <div class="section-hd">
          <span class="section-title">记忆系统</span>
          <span class="count-badge">{{ memStats?.totalChars || 0 | fmtSize }}</span>
        </div>
        <div class="svc-list" v-if="memStats?.files?.length">
          <div v-for="f in memStats.files" :key="f.file" class="svc-row">
            <span class="svc-name">{{ f.file }}</span>
            <span class="svc-uptime">{{ f.chars | fmtSize }}</span>
          </div>
        </div>
        <el-empty v-else description="暂无记忆" :image-size="40"/>
      </div>
    </div>

    <!-- 实时事件时间线 -->
    <div class="section-card card-accent-purple" style="margin-top:16px" v-if="events.length">
      <div class="section-hd">
        <span class="section-title">实时事件</span>
        <span class="count-badge">{{ events.length }}</span>
      </div>
      <div class="event-timeline">
        <div v-for="(e, i) in events.slice(0, 20)" :key="i" class="event-row" :class="e.type">
          <span class="event-time">{{ fmtEventTime(e.time) }}</span>
          <el-tag :type="eventTagType(e)" size="small" round>{{ e.type }}</el-tag>
          <span class="event-detail">
            <template v-if="e.type==='tool_executed'">{{ e.tool }} {{ e.duration_ms }}ms {{ e.success ? '✓' : '✗' }}</template>
            <template v-else-if="e.type==='approval_requested'">⚠ {{ e.tool }} #{{ e.approval_id?.slice(-6) }}</template>
            <template v-else-if="e.type==='channel_health'">{{ e.channel }} → {{ e.status }}</template>
            <template v-else>{{ e.type }}</template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh, Monitor, Cpu, Connection, ChatDotSquare, Setting, FolderOpened, Warning } from '@element-plus/icons-vue'
import { getStatus } from '../api/index.js'
import { llmHealthApi, channelHealthApi } from '../api/health.js'
import request from '../api/index.js'

const loading = ref(false)
const system = ref(null)
const services = ref([])
const llmHealth = ref(null)
const modelConfigs = ref([])
const channelManager = ref(null)
const channelHealth = ref(null)
const auditStats = ref(null)
const plugins = ref(null)
const memStats = ref(null)
const events = ref([])
let timer = null
let ws = null

const chHealthy = computed(() => channelHealth.value?.summary?.healthy || 0)
const chTotal = computed(() => channelHealth.value?.summary?.total || 0)

const kpis = computed(() => [
  { label: '服务', value: services.value.filter(s => s.status === 'running').length + '/' + services.value.length, icon: Connection, color: '#7c3aed' },
  { label: 'LLM', value: (llmHealth.value?.summary?.poolSize || 0) + ' 可用', icon: Cpu, color: '#0284c7' },
  { label: '审计', value: (auditStats.value?.total || 0) + ' 条', icon: Warning, color: '#f59e0b' },
  { label: '插件', value: (plugins.value?.plugins?.length || 0) + ' 个', icon: Setting, color: '#22c55e' }
])

async function refresh() {
  loading.value = true
  try {
    const [statusRes, llmRes, modelsRes, chRes, mgrRes, auditRes, pluginRes, memRes] = await Promise.all([
      getStatus().catch(() => ({ data: { data: {} } })),
      llmHealthApi.get().catch(() => ({ data: { data: null } })),
      request.get('/dashboard/models').catch(() => ({ data: { data: [] } })),
      channelHealthApi.get().catch(() => ({ data: { data: null } })),
      request.get('/channels/manager').catch(() => ({ data: { data: null } })),
      request.get('/audit/stats').catch(() => ({ data: { data: {} } })),
      request.get('/plugins').catch(() => ({ data: { data: {} } })),
      request.get('/memory/internal-agent').catch(() => ({ data: { data: {} } }))
    ])
    if (statusRes.data?.code === 200) {
      services.value = statusRes.data.data.services || []
      system.value = statusRes.data.data.system || null
    }
    llmHealth.value = llmRes.data?.data || null
    modelConfigs.value = modelsRes.data?.data || []
    channelManager.value = mgrRes.data?.data || null
    channelHealth.value = chRes.data?.data || null
    auditStats.value = auditRes.data?.data || {}
    plugins.value = pluginRes.data?.data || {}
    memStats.value = memRes.data?.data || {}
  } catch {} finally { loading.value = false }
}

function fmtEventTime(ts) {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8)
}
function eventTagType(e) {
  if (e.type === 'tool_executed') return e.success ? 'success' : 'danger'
  if (e.type === 'approval_requested') return 'warning'
  if (e.type === 'channel_health') return e.status === 'healthy' ? 'success' : 'warning'
  return 'info'
}
function connectWS() {
  try {
    ws = new WebSocket('ws://' + location.hostname + ':18621/ws/events')
    ws.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data)
        if (['tool_executed','approval_requested','channel_health'].includes(e.type)) {
          events.value.unshift(e)
          if (events.value.length > 100) events.value.length = 100
        }
      } catch {}
    }
    ws.onclose = () => setTimeout(connectWS, 5000)
  } catch {}
}

onMounted(() => { refresh(); timer = setInterval(refresh, 30000); connectWS() })
onUnmounted(() => { clearInterval(timer); if (ws) ws.close() })
</script>

<style scoped>
.page-container { padding: 20px 24px; background: #fafafe; height: 100%; overflow-y: auto }
.page-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 16px }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e }

.kpi-row { display: flex; gap: 12px; margin-bottom: 18px }
.kpi-card {
  flex: 1; display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; background: #fff; border-radius: 12px;
  border: 1px solid #f0ecf8; transition: box-shadow .2s;
}
.kpi-card:hover { box-shadow: 0 4px 12px rgba(124,58,237,.08) }
.kpi-icon {
  width: 42px; height: 42px; border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  display: flex; align-items: center; justify-content: center;
}
.kpi-val { font-size: 20px; font-weight: 700; color: #1e293b }
.kpi-label { font-size: 12px; color: #909399; margin-top: 2px }

.dash-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
@media (max-width: 1200px) { .dash-grid { grid-template-columns: repeat(2, 1fr) } }
@media (max-width: 768px) { .dash-grid { grid-template-columns: 1fr } }

.section-card {
  background: #fff; border-radius: 12px; border: 1px solid #f0ecf8;
  overflow: hidden; border-left: 3px solid transparent;
}
.card-accent-purple { border-left-color: #7c3aed }
.card-accent-blue { border-left-color: #0284c7 }
.card-accent-cyan { border-left-color: #06b6d4 }
.card-accent-amber { border-left-color: #f59e0b }
.card-accent-green { border-left-color: #22c55e }
.card-accent-pink { border-left-color: #ec4899 }

.section-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid #f0ecf8;
}
.section-title { font-weight: 600; font-size: 13px; color: #4a3f5e }
.count-badge { font-size: 11px; background: #f5f3ff; color: #7c3aed; padding: 2px 8px; border-radius: 10px; font-weight: 600 }

.svc-list { padding: 6px 0 }
.svc-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; font-size: 12px;
}
.svc-row:hover { background: #fafafe }
.svc-name { flex: 1; font-weight: 500; color: #334155 }
.svc-port { color: #7c3aed; font-family: monospace; font-size: 11px }
.svc-uptime { font-size: 11px; color: #909399 }

.pulse-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #9ca3af;
}
.pulse-dot.running { background: #22c55e; animation: pulse 2s infinite }
.pulse-dot.stopped { background: #ef4444 }
.event-timeline { max-height: 320px; overflow-y: auto }
.event-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 14px; font-size: 12px; border-bottom: 1px solid #f8f9fc;
}
.event-row:hover { background: #fafafe }
.event-time { font-family: monospace; font-size: 11px; color: #909399; min-width: 52px }
.event-detail { color: #334155; font-size: 12px }

@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5) }
  50% { box-shadow: 0 0 0 5px rgba(34,197,94,0) }
}
</style>
