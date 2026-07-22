<template>
  <div class="dashboard-shell">
    <div class="dashboard-frame">
      <div class="dashboard-inner">
        <!-- ====== 页面头部 ====== -->
        <div class="page-header">
          <div class="header-title">
            <div class="page-kicker">系统运行状态</div>
            <h1 class="page-title">仪表盘</h1>
            <p class="page-desc">实时监控平台运行状态与数据指标</p>
            <div class="header-meta">
              <div class="db-chip">
                <svg class="db-chip__icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
                <span class="db-chip__label">数据库</span>
                <span class="db-chip__value">SQLite</span>
              </div>
              <span class="header-updated" v-if="lastUpdate">
                <el-icon><Timer /></el-icon>
                {{ lastUpdate }}
              </span>
              <el-button size="small" text @click="refresh" :loading="loading" class="btn-refresh">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="header-actions">
            <div class="hero-note">
              <div class="hero-note__label">今日</div>
              <div class="hero-note__value">{{ todayStats.conversations || 0 }}</div>
              <div class="hero-note__meta">会话 · {{ todayStats.messages || 0 }} 条消息 · {{ todayStats.toolCalls || 0 }} 次工具调用</div>
            </div>
          </div>
        </div>

        <!-- ====== 主体内容 ====== -->
        <div class="dashboard-body">
          <!-- KPI 统计卡片 -->
          <div class="stats-grid">
            <div class="stat-card stat-card--primary">
              <div class="stat-icon">
                <el-icon><ChatDotRound /></el-icon>
              </div>
              <div class="stat-body">
                <div class="stat-value">{{ todayStats.conversations || 0 }}</div>
                <div class="stat-label">会话数</div>
              </div>
            </div>
            <div class="stat-card stat-card--primary">
              <div class="stat-icon">
                <el-icon><Document /></el-icon>
              </div>
              <div class="stat-body">
                <div class="stat-value">{{ todayStats.messages || 0 }}</div>
                <div class="stat-label">消息数</div>
              </div>
            </div>
            <div class="stat-card stat-card--secondary">
              <div class="stat-icon">
                <el-icon><Tools /></el-icon>
              </div>
              <div class="stat-body">
                <div class="stat-value">{{ todayStats.toolCalls || 0 }}</div>
                <div class="stat-label">工具调用</div>
              </div>
            </div>
            <div class="stat-card stat-card--secondary">
              <div class="stat-icon">
                <el-icon><Monitor /></el-icon>
              </div>
              <div class="stat-body">
                <div class="stat-value">{{ runningServices }}/{{ services.length }}</div>
                <div class="stat-label">服务运行</div>
              </div>
            </div>
          </div>

          <!-- 模型配置卡片 -->
          <div class="models-section">
            <div class="section-head">
              <h2 class="section-title">模型配置</h2>
              <p class="section-subtitle">当前激活的 AI 模型与提供商状态</p>
            </div>
            <div class="models-card">
              <div class="models-card__head">
                <div class="active-model">
                  <span class="active-model__label">当前模型</span>
                  <span v-if="activeModel" class="active-model__value">
                    <span class="active-model__dot"></span>
                    {{ activeModelLabel }}
                  </span>
                  <span v-else class="active-model__value active-model__value--empty">未配置</span>
                </div>
                <div class="models-card__actions">
                  <span v-if="modelProviders.length" class="models-count">
                    {{ readyProviderCount }}/{{ modelProviders.length }} 已配置
                  </span>
                  <button class="models-manage" @click="$router.push('/model-config')">
                    管理
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
              </div>
              <div v-if="modelProviders.length" class="provider-chips">
                <button
                  v-for="p in modelProviders"
                  :key="p.id"
                  class="provider-chip"
                  :class="'provider-chip--' + providerChipStatus(p)"
                  :title="p.name"
                  @click="$router.push('/model-config')"
                >
                  <span class="provider-chip__dot"></span>
                  <span class="provider-chip__name">{{ p.name || p.provider }}</span>
                  <span class="provider-chip__model">{{ p.model }}</span>
                </button>
              </div>
              <div v-else class="models-empty">
                <span class="models-empty__text">尚未配置 AI 模型</span>
                <button class="models-empty__btn" @click="$router.push('/model-config')">前往配置</button>
              </div>
            </div>
          </div>

          <!-- 7 天趋势图 -->
          <div v-if="trendData.length" class="trend-section">
            <div class="section-head">
              <h2 class="section-title">7 天趋势</h2>
              <p class="section-subtitle">近一周消息与会话数量变化</p>
            </div>
            <div class="trend-chart">
              <div ref="chartRef" class="chart-container"></div>
            </div>
          </div>

          <!-- 时段对比 -->
          <div class="comparison-section">
            <div class="section-head">
              <h2 class="section-title">时段对比</h2>
              <p class="section-subtitle">今日 / 昨日 / 本周数据概览</p>
            </div>
            <div class="comparison-grid">
              <div class="comparison-card" v-for="(period, key) in overview" :key="key">
                <h3 class="comparison-title">{{ periodLabels[key] }}</h3>
                <div class="comparison-row">
                  <span class="comparison-label">会话</span>
                  <span class="comparison-value">{{ period.conversations || 0 }}</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">消息</span>
                  <span class="comparison-value">{{ period.messages || 0 }}</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">工具调用</span>
                  <span class="comparison-value">{{ period.toolCalls || 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 快捷操作 + 实时事件 (双列) -->
          <div class="quick-row">
            <div class="quick-actions-card">
              <h3 class="section-title" style="margin-bottom:12px">快捷操作</h3>
              <div class="quick-btns">
                <button v-for="act in quickActions" :key="act.label" class="quick-btn" @click="$router.push(act.to)">
                  <span class="quick-btn-icon">{{ act.icon }}</span>
                  <span class="quick-btn-label">{{ act.label }}</span>
                </button>
              </div>
            </div>
            <div class="events-card">
              <div class="events-head">
                <h3 class="section-title">实时事件</h3>
                <span class="events-count">{{ events.length }}</span>
              </div>
              <div class="events-list" v-if="events.length">
                <div v-for="(e,i) in events.slice(0,8)" :key="i" class="event-row" :class="e.type">
                  <span class="event-time">{{ fmtEventTime(e.time) }}</span>
                  <span class="event-type-badge" :class="'evt-'+e.type">{{ e.type === 'tool_executed' ? '🛠' : e.type === 'channel_health' ? '📡' : '⚠' }}</span>
                  <span class="event-msg">
                    <template v-if="e.type==='tool_executed'">{{ e.tool }} {{ e.duration_ms }}ms {{ e.success ? '✓' : '✗' }}</template>
                    <template v-else-if="e.type==='channel_health'">{{ e.channel }} → {{ e.status }}</template>
                    <template v-else>{{ e.type }}</template>
                  </span>
                </div>
              </div>
              <div v-else class="events-empty">暂无实时事件</div>
            </div>
          </div>

          <!-- 系统服务 -->
          <div class="services-section">
            <div class="section-head">
              <h2 class="section-title">系统服务</h2>
              <p class="section-subtitle">核心服务运行状态</p>
            </div>
            <div class="services-grid">
              <div v-for="s in services" :key="s.name" class="service-chip" :class="s.status === 'running' ? 'svc--up' : 'svc--down'">
                <span class="svc-dot"></span>
                <span class="svc-name">{{ s.name }}</span>
                <span class="svc-port">:{{ s.port }}</span>
                <span class="svc-uptime">{{ s.uptime || '-' }}</span>
              </div>
              <div v-if="!services.length" class="empty-inline">暂无服务数据</div>
            </div>
          </div>

          <!-- 渠道 & 插件（双列） -->
          <div class="bottom-grid">
            <div class="bottom-card">
              <div class="section-head">
                <h2 class="section-title">消息渠道</h2>
                <span class="sec-count">{{ chHealthy }}/{{ chTotal }} 正常</span>
              </div>
              <div class="bottom-list">
                <div
                  v-for="ch in (channelManager?.channels?.length ? channelManager.channels : channelHealth?.channels || [])"
                  :key="ch.id || ch.name" class="bottom-row"
                >
                  <span class="dot-status" :class="statusDotClass(ch.health?.status || ch.status)"></span>
                  <span class="bottom-name">{{ ch.name || ch.id }}</span>
                  <span class="bottom-tag" :class="'tag--' + (ch.health?.status || ch.status || 'unknown')">{{ ch.health?.status || ch.status || 'unknown' }}</span>
                  <span class="bottom-meta">{{ ch.totalMessages || 0 }} 消息</span>
                </div>
                <div v-if="!channelCount" class="empty-inline">暂无渠道数据</div>
              </div>
            </div>
            <div class="bottom-card">
              <div class="section-head">
                <h2 class="section-title">插件</h2>
                <span class="sec-count">{{ plugins?.plugins?.length || 0 }} 个</span>
              </div>
              <div class="bottom-list">
                <div v-for="p in plugins?.plugins || []" :key="p.name" class="bottom-row">
                  <span class="dot-status on"></span>
                  <span class="bottom-name">{{ p.name }}</span>
                  <span class="bottom-tag tag--ghost">v{{ p.version }}</span>
                  <span class="bottom-meta">{{ p.toolCount }} 工具</span>
                </div>
                <div v-if="!plugins?.plugins?.length" class="empty-inline">暂无插件</div>
              </div>
            </div>
          </div>

          <!-- 最近运行记录 -->
          <div class="runs-section">
            <div class="section-head">
              <h2 class="section-title">最近运行</h2>
              <p class="section-subtitle">定时任务与系统操作记录</p>
            </div>
            <div class="runs-table-wrapper">
              <table v-if="recentRuns.length" class="runs-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>任务</th>
                    <th>状态</th>
                    <th>触发</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in recentRuns" :key="run.id">
                    <td class="cell-time">{{ formatTime(run.startedAt) }}</td>
                    <td class="cell-job">{{ run.jobName || run.type || '-' }}</td>
                    <td>
                      <span class="status-badge" :class="'status--' + run.status">{{ run.status || 'unknown' }}</span>
                    </td>
                    <td class="cell-trigger">{{ run.trigger || run.username || 'system' }}</td>
                    <td class="cell-detail">{{ run.detail || '-' }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="empty-state">暂无运行记录</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Refresh, Timer, ChatDotRound, Document, Tools, Monitor,
  ArrowRight
} from '@element-plus/icons-vue'
import { getStatus } from '../api/index.js'
import { channelHealthApi } from '../api/health.js'
import request from '../api/index.js'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

// ========== 状态 ==========
const loading = ref(false)
const lastUpdate = ref('')
const overview = ref({})
const recentRuns = ref([])
const trendData = ref([])
const chartRef = ref(null)
let chartInstance = null
let chartResizeObserver = null

const todayStats = reactive({
  conversations: 0,
  messages: 0,
  toolCalls: 0,
})

// 系统监控（保留旧数据源）
const services = ref([])
const channelManager = ref(null)
const channelHealth = ref(null)
const plugins = ref(null)
let timer = null

const chHealthy = computed(() => channelHealth.value?.summary?.healthy || 0)
const chTotal = computed(() => channelHealth.value?.summary?.total || 0)
const channelCount = computed(() =>
  (channelManager.value?.channels?.length || channelHealth.value?.channels?.length || 0)
)
const runningServices = computed(() => services.value.filter(s => s.status === 'running').length)

// ========== 快捷操作 ==========
const quickActions = [
  { icon: '💬', label: '新建聊天', to: '/chat' },
  { icon: '🤖', label: '创建 Agent', to: '/digital' },
  { icon: '📚', label: '知识库', to: '/knowledge-base' },
  { icon: '🔗', label: '消息渠道', to: '/channels' },
  { icon: '⏰', label: '定时任务', to: '/tasks' },
  { icon: '⚙️', label: '系统设置', to: '/settings/system' },
]

// ========== 实时事件 ==========
const events = ref([])

// WebSocket 接收事件
let ws = null
function connectWS() {
  try {
    ws = new WebSocket('ws://' + location.hostname + ':18621/ws/events')
    ws.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data)
        if (['tool_executed','approval_requested','channel_health'].includes(e.type)) {
          events.value.unshift({ ...e, time: Date.now() })
          if (events.value.length > 100) events.value.length = 100
        }
      } catch {}
    }
    ws.onclose = () => { setTimeout(connectWS, 10000) }
  } catch {}
}
function fmtEventTime(ts) { const d = new Date(ts); return d.toTimeString().slice(0,8) }

// ========== 模型配置 ==========
const modelProviders = ref([])
const activeModel = ref(null)

const readyProviderCount = computed(() =>
  modelProviders.value.filter(p => providerChipStatus(p) === 'ready').length
)
const activeModelLabel = computed(() => {
  if (!activeModel.value) return ''
  const match = modelProviders.value.find(p => p.id === activeModel.value.providerId)
  return match
    ? `${match.name || match.provider} · ${activeModel.value.model}`
    : `${activeModel.value.providerId} · ${activeModel.value.model}`
})

function providerChipStatus(p) {
  if (p.liveness === 'LIVE') return 'ready'
  if (p.liveness === 'COOLDOWN' || p.liveness === 'UNPROBED') return 'partial'
  if (p.liveness === 'REMOVED' || p.liveness === 'UNCONFIGURED') return 'down'
  if (p.isActive) return 'ready'
  return 'down'
}

// ========== 时段标签 ==========
const periodLabels = { today: '今日', yesterday: '昨日', thisWeek: '本周' }

// ========== 数据获取 ==========
async function refresh() {
  loading.value = true
  try {
    // 新的仪表盘 API
    const [overviewRes, trendRes, runsRes, modelsRes] = await Promise.all([
      request.get('/dashboard/overview').catch(() => ({ data: { data: {} } })),
      request.get('/dashboard/trend?days=7').catch(() => ({ data: { data: [] } })),
      request.get('/dashboard/recent-runs?limit=10').catch(() => ({ data: { data: [] } })),
      request.get('/dashboard/models-full').catch(() => ({ data: { data: { providers: [], activeModel: null } } })),
    ])

    const ov = overviewRes.data?.data || {}
    overview.value = ov
    Object.assign(todayStats, ov.today || {})

    const newTrend = trendRes.data?.data || []
    trendData.value = newTrend
    if (newTrend.length) {
      await nextTick()
      renderChart()
    }

    recentRuns.value = runsRes.data?.data || []

    const mf = modelsRes.data?.data || {}
    modelProviders.value = mf.providers || []
    activeModel.value = mf.activeModel || null

    // 系统监控数据
    const [statusRes, chRes, mgrRes, pluginRes] = await Promise.all([
      getStatus().catch(() => ({ data: { data: {} } })),
      channelHealthApi.get().catch(() => ({ data: { data: null } })),
      request.get('/channels/manager').catch(() => ({ data: { data: null } })),
      request.get('/plugins').catch(() => ({ data: { data: {} } })),
    ])
    if (statusRes.data?.code === 200) {
      services.value = statusRes.data.data.services || []
    }
    channelHealth.value = chRes.data?.data || null
    channelManager.value = mgrRes.data?.data || null
    plugins.value = pluginRes.data?.data || {}
  } catch {} finally {
    loading.value = false
    lastUpdate.value = new Date().toTimeString().slice(0, 8)
  }
}

// ========== ECharts 趋势图 ==========
function renderChart() {
  if (!chartRef.value) return
  if (chartInstance) chartInstance.dispose()
  if (chartResizeObserver) chartResizeObserver.disconnect()

  chartInstance = echarts.init(chartRef.value)

  const dates = trendData.value.map(d => d.date?.slice(5) || '')
  const messages = trendData.value.map(d => d.messages || 0)
  const conversations = trendData.value.map(d => d.conversations || 0)
  const toolCalls = trendData.value.map(d => d.toolCalls || 0)

  const style = getComputedStyle(document.documentElement)
  const textColor = style.getPropertyValue('--el-text-color-secondary')?.trim() || '#909399'
  const borderColor = style.getPropertyValue('--el-border-color-lighter')?.trim() || '#ebeef5'

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#e8e4ef',
      textStyle: { color: '#334155', fontSize: 12 },
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    },
    legend: {
      data: ['消息', '会话', '工具调用'],
      textStyle: { color: textColor, fontSize: 12 },
      bottom: 0,
    },
    grid: { top: 10, right: 16, bottom: 36, left: 44, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: borderColor } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' } },
      minInterval: 1,
    },
    series: [
      {
        name: '消息',
        type: 'line',
        data: messages,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2.5, color: '#7c3aed' },
        itemStyle: { color: '#7c3aed' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(124,58,237,0.22)' },
            { offset: 1, color: 'rgba(124,58,237,0.02)' },
          ]),
        },
      },
      {
        name: '会话',
        type: 'line',
        data: conversations,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: '#a78bfa' },
        itemStyle: { color: '#a78bfa' },
      },
      {
        name: '工具调用',
        type: 'bar',
        data: toolCalls,
        barWidth: 8,
        itemStyle: {
          color: 'rgba(139,92,246,0.25)',
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  })

  chartResizeObserver = new ResizeObserver(() => chartInstance?.resize())
  chartResizeObserver.observe(chartRef.value)
}

// ========== 工具函数 ==========
function formatTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusDotClass(s) {
  if (s === 'healthy') return 'on'
  if (s === 'degraded') return 'warn'
  if (s === 'unhealthy') return 'off'
  return ''
}

// ========== 生命周期 ==========
onMounted(() => {
  refresh()
  timer = setInterval(refresh, 30000)
  connectWS()
})

onUnmounted(() => {
  clearInterval(timer)
  if (ws) ws.close()
  chartInstance?.dispose()
  chartResizeObserver?.disconnect()
})
</script>

<style scoped>
/* ============================================
   仪表盘 — 紫色系（与全局统一）
   ============================================ */

/* ----- 页面壳 ----- */
.dashboard-shell {
  background: transparent;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.dashboard-frame {
  height: min(calc(100vh - 28px), 100%);
  min-height: 0;
  overflow: hidden;
}
.dashboard-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* ----- 页面头部 ----- */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;
  padding: 28px 32px 20px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.header-title { min-width: 0; }
.header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
  margin-top: 28px;
}

/* Kicker / Title / Desc */
.page-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7c3aed;
  margin-bottom: 8px;
}
.page-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #4a3f5e;
  margin: 0 0 6px;
}
.page-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

/* 头部元信息行 */
.header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.db-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid #ddd6fe;
  border-radius: 999px;
  background: #f5f3ff;
  font-size: 12px;
  line-height: 1;
  color: #94a3b8;
}
.db-chip__icon { color: #b8aad0; flex-shrink: 0; }
.db-chip__label { color: #b8aad0; }
.db-chip__value { font-weight: 600; color: #4a3f5e; }

.header-updated {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #b8aad0;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
}
.btn-refresh { color: #b8aad0; }

/* Hero 今日概览卡 */
.hero-note {
  min-width: 220px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.hero-note__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7c3aed;
  margin-bottom: 10px;
}
.hero-note__value {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: #4a3f5e;
  line-height: 1;
}
.hero-note__meta {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.5;
}

/* ============================================
   主体内容区
   ============================================ */
.dashboard-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 32px 40px;
}

/* 段落标题 */
.section-head {
  margin-bottom: 12px;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #4a3f5e;
  letter-spacing: -0.03em;
  margin: 0 0 4px;
}
.section-subtitle {
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
}

/* ============================================
   统计卡片
   ============================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
  transition: box-shadow 0.25s, transform 0.25s;
}
.stat-card:hover {
  box-shadow: 0 4px 16px rgba(124,58,237,0.08);
  transform: translateY(-1px);
}
.stat-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(124,58,237,0.12), rgba(99,102,241,0.06));
  font-size: 24px;
  color: #7c3aed;
  flex-shrink: 0;
}
.stat-body { display: flex; flex-direction: column; min-width: 0; }
.stat-value {
  font-size: 30px;
  font-weight: 800;
  color: #4a3f5e;
  line-height: 1;
  letter-spacing: -0.05em;
}
.stat-label {
  font-size: 12px;
  color: #b8aad0;
  margin-top: 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* 次要统计卡 */
.stat-card--secondary { opacity: 0.75; }
.stat-card--secondary .stat-icon {
  background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.04));
  color: #a78bfa;
}
.stat-card--secondary .stat-value { font-size: 24px; }

/* ============================================
   模型配置卡片
   ============================================ */
.models-section { margin-bottom: 22px; }
.models-card {
  padding: 18px;
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.models-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.active-model { display: flex; align-items: center; gap: 10px; min-width: 0; }
.active-model__label {
  font-size: 12px;
  color: #b8aad0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.active-model__value {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: #4a3f5e;
}
.active-model__value--empty { color: #b8aad0; font-weight: 600; }
.active-model__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
}
.models-card__actions { display: flex; align-items: center; gap: 14px; }
.models-count { font-size: 12px; color: #b8aad0; white-space: nowrap; }
.models-manage {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 600;
  color: #7c3aed;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s;
}
.models-manage:hover { background: rgba(124,58,237,0.08); }

/* 提供商芯片 */
.provider-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0ecfc;
}
.provider-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid #ddd6fe;
  background: #f5f3ff;
  font-size: 12px;
  font-weight: 600;
  color: #5b4a7a;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.provider-chip:hover { border-color: #7c3aed; transform: translateY(-1px); }
.provider-chip__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.provider-chip__name { white-space: nowrap; }
.provider-chip__model {
  font-size: 11px;
  color: #b8aad0;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.provider-chip--ready .provider-chip__dot { background: #10b981; }
.provider-chip--partial .provider-chip__dot { background: #f59e0b; }
.provider-chip--down .provider-chip__dot { background: #b8aad0; }
.provider-chip--down { opacity: 0.7; }

.models-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0ecfc;
}
.models-empty__text { font-size: 13px; color: #b8aad0; }
.models-empty__btn {
  padding: 6px 14px;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.models-empty__btn:hover { opacity: 0.9; }

/* ============================================
   趋势图
   ============================================ */
.trend-section { margin-bottom: 22px; }
.trend-chart {
  padding: 18px;
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.chart-container { width: 100%; height: 240px; }

/* ============================================
   时段对比
   ============================================ */
.comparison-section { margin-bottom: 22px; }
.comparison-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.comparison-card {
  padding: 16px 16px 10px;
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.comparison-title {
  font-size: 12px;
  font-weight: 700;
  color: #7c3aed;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.comparison-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0ecfc;
}
.comparison-row:last-child { border-bottom: none; }
.comparison-label { font-size: 13px; color: #b8aad0; }
.comparison-value { font-size: 14px; font-weight: 700; color: #4a3f5e; }

/* ============================================
   快捷操作 + 实时事件
   ============================================ */
.quick-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:22px; }
.quick-actions-card, .events-card { background:#fff; border:1px solid #f0ecfc; border-radius:16px; padding:18px; box-shadow:0 1px 2px rgba(124,58,237,0.04); }
.quick-btns { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.quick-btn { display:flex; flex-direction:column; align-items:center; gap:6px; padding:16px 8px; border:1px solid #f0ecfc; border-radius:12px; background:transparent; cursor:pointer; transition:all 0.15s; font-family:inherit; }
.quick-btn:hover { border-color:#c4b5fd; background:#faf8ff; transform:translateY(-1px); }
.quick-btn-icon { font-size:24px; }
.quick-btn-label { font-size:12px; color:#4a3f5e; font-weight:500; }
.events-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.events-count { font-size:11px;padding:2px 8px;background:#ede9fe;border-radius:10px;color:#7c3aed;font-weight:600; }
.events-list { display:flex;flex-direction:column;gap:2px;max-height:240px;overflow-y:auto; }
.event-row { display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid #f8f6fc; }
.event-time { font-family:monospace;font-size:11px;color:#b8aad0;min-width:50px; }
.event-type-badge { font-size:12px;width:18px;text-align:center; }
.event-msg { color:#4a3f5e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.events-empty { padding:32px;text-align:center;color:#b8aad0;font-size:13px; }

/* ============================================
   系统服务网格
   ============================================ */
.services-section { margin-bottom: 22px; }
.services-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.service-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #f0ecfc;
  font-size: 12px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.03);
  transition: box-shadow 0.2s;
}
.service-chip:hover { box-shadow: 0 2px 8px rgba(124,58,237,0.08); }
.svc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.svc--up .svc-dot { background: #10b981; }
.svc--down .svc-dot { background: #ef4444; }
.svc-name { font-weight: 600; color: #4a3f5e; }
.svc-port { font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 11px; color: #7c3aed; }
.svc-uptime { font-size: 11px; color: #b8aad0; margin-left: auto; }

/* ============================================
   底部双列（渠道 + 插件）
   ============================================ */
.bottom-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 22px;
}
.bottom-card {
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.sec-count {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
  background: #ede9fe;
  color: #7c3aed;
}
.bottom-list { margin-top: 8px; }
.bottom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 12.5px;
}
.bottom-row + .bottom-row { border-top: 1px solid #f5f3ff; }
.bottom-name { flex: 1; font-weight: 500; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bottom-meta { font-size: 11px; color: #b8aad0; white-space: nowrap; }

/* 状态点 */
.dot-status { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #b8aad0; }
.dot-status.on { background: #10b981; }
.dot-status.off { background: #ef4444; }
.dot-status.warn { background: #f59e0b; }

/* 迷你标签 */
.bottom-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9px;
  white-space: nowrap;
}
.tag--healthy { background: #ede9fe; color: #7c3aed; }
.tag--degraded { background: #fffbeb; color: #d97706; }
.tag--unhealthy { background: #fef2f2; color: #dc2626; }
.tag--unknown, .tag--ghost { background: #f0ecfc; color: #94a3b8; }

.empty-inline { padding: 20px; text-align: center; color: #b8aad0; font-size: 13px; }

/* ============================================
   最近运行表格
   ============================================ */
.runs-section { min-height: 0; }
.runs-table-wrapper {
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  overflow: auto;
  max-height: 360px;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.runs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.runs-table th {
  padding: 9px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: #b8aad0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #f5f3ff;
  border-bottom: 1px solid #f0ecfc;
  position: sticky;
  top: 0;
  z-index: 1;
}
.runs-table td {
  padding: 9px 14px;
  border-bottom: 1px solid #f0ecfc;
  color: #4a3f5e;
}
.runs-table tr:last-child td { border-bottom: none; }
.runs-table tbody tr:hover { background: rgba(124,58,237,0.04); }

.cell-time { font-size: 12px; color: #b8aad0; white-space: nowrap; }
.cell-job { font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 12px; color: #94a3b8; }
.cell-trigger { font-size: 12px; color: #b8aad0; }
.cell-detail { font-size: 12px; color: #94a3b8; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.status--running { background: rgba(124,58,237,0.12); color: #7c3aed; }
.status--completed { background: rgba(16,185,129,0.12); color: #10b981; }
.status--failed { background: rgba(239,68,68,0.12); color: #ef4444; }

.empty-state { padding: 48px; text-align: center; color: #b8aad0; font-size: 14px; }

/* ============================================
   响应式
   ============================================ */
@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .comparison-grid { grid-template-columns: repeat(2, 1fr); }
  .bottom-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .dashboard-frame {
    height: 100%;
    min-height: calc(100vh - 28px);
  }
  .dashboard-body { overflow: visible; padding: 0 16px 32px; }
  .page-header { padding: 20px 16px 16px; flex-direction: column; }
  .header-actions { margin-top: 0; align-items: stretch; }
  .hero-note { min-width: 0; width: 100%; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .comparison-grid { grid-template-columns: 1fr; }
  .bottom-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr; }
  .stat-value { font-size: 28px; }
}
</style>
