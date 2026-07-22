<template>
  <div>
    <div class="page-hd"><h2 class="page-title">用量统计</h2><p class="page-desc">AI 模型调用量与令牌消耗</p></div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">今日消息</div><div class="stat-val">{{ todayStats.messages || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">今日会话</div><div class="stat-val">{{ todayStats.conversations || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">工具调用</div><div class="stat-val">{{ todayStats.toolCalls || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">本周消息</div><div class="stat-val">{{ todayStats.weekMessages || 0 }}</div></div>
    </div>

    <div class="section-card">
      <h3 class="section-title">近 7 天消息趋势</h3>
      <div ref="chartRef" class="chart-box"></div>
    </div>

    <div class="section-card">
      <h3 class="section-title">最近调用记录</h3>
      <table class="usage-table" v-if="recentRuns.length">
        <thead><tr><th>时间</th><th>任务/操作</th><th>状态</th><th>详情</th></tr></thead>
        <tbody>
          <tr v-for="r in recentRuns" :key="r.id">
            <td class="cell-time">{{ fmtTime(r.startedAt) }}</td>
            <td>{{ r.jobName || r.type || '-' }}</td>
            <td><span class="badge" :class="'badge--'+r.status">{{ r.status }}</span></td>
            <td class="cell-detail">{{ r.detail || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂无调用记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import request from '../../api/index.js'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const todayStats = ref({ messages: 0, conversations: 0, toolCalls: 0, weekMessages: 0 })
const recentRuns = ref([])
const chartRef = ref(null)

function fmtTime(t) { if (!t) return '-'; return new Date(t).toLocaleString('zh-CN', { month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }) }

onMounted(async () => {
  try {
    const [{ data: ov }, { data: tr }, { data: rr }] = await Promise.all([
      request.get('/dashboard/overview').catch(() => ({ data: { data: {} } })),
      request.get('/dashboard/trend?days=7').catch(() => ({ data: { data: [] } })),
      request.get('/dashboard/recent-runs?limit=20').catch(() => ({ data: { data: [] } })),
    ])
    const d = ov.data || {}
    todayStats.value = { messages: d.today?.messages || 0, conversations: d.today?.conversations || 0, toolCalls: d.today?.toolCalls || 0, weekMessages: d.thisWeek?.messages || 0 }
    recentRuns.value = rr.data || []
    await nextTick()
    if (chartRef.value) {
      const c = echarts.init(chartRef.value)
      const trend = tr.data || []
      c.setOption({
        tooltip: { trigger: 'axis' },
        grid: { top:10,right:16,bottom:24,left:40,containLabel:false },
        xAxis: { type:'category', data: trend.map(d=>d.date?.slice(5)||''), axisLabel:{fontSize:11} },
        yAxis: { type:'value', minInterval:1, axisLabel:{fontSize:11} },
        series: [{ type:'line', data: trend.map(d=>d.messages||0), smooth:true, lineStyle:{color:'#7c3aed',width:2.5}, itemStyle:{color:'#7c3aed'}, areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(124,58,237,0.18)'},{offset:1,color:'rgba(124,58,237,0.02)'}])} }]
      })
    }
  } catch {}
})
</script>

<style scoped>
.page-hd { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #94a3b8; margin: 0; }
.stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
.stat-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 18px; text-align: center; }
.stat-label { font-size: 12px; color: #b8aad0; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.stat-val { font-size: 28px; font-weight: 800; color: #4a3f5e; }
.section-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; color: #4a3f5e; margin: 0 0 14px; }
.chart-box { width: 100%; height: 200px; }
.usage-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.usage-table th { padding: 8px 12px; text-align: left; font-weight: 600; font-size: 11px; color: #b8aad0; text-transform: uppercase; background: #faf8ff; border-bottom: 1px solid #f0ecfc; }
.usage-table td { padding: 8px 12px; border-bottom: 1px solid #f8f6fc; color: #4a3f5e; }
.cell-time { font-size: 12px; color: #94a3b8; white-space: nowrap; }
.cell-detail { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge--completed { background: rgba(16,185,129,0.12); color: #10b981; }
.badge--failed { background: rgba(239,68,68,0.12); color: #ef4444; }
.badge--running { background: rgba(124,58,237,0.12); color: #7c3aed; }
.empty { padding: 32px; text-align: center; color: #b8aad0; font-size: 13px; }
</style>
