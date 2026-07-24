<template>
  <div class="svc-body">
    <div class="svc-header">
      <span class="svc-title">服务状态</span>
      <div class="svc-header-actions">
        <el-button :icon="Refresh" @click="fetchStatus" :loading="loading" size="small" round>刷新</el-button>
        <el-button :icon="Checked" @click="runDiagnostics" :loading="diagLoading" size="small" round type="primary" plain>
          {{ diagLoading ? '自检中...' : '自检' }}
        </el-button>
      </div>
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
      <div v-if="diagSummary" class="sys-item" style="--accent:#7c3aed">
        <span class="sys-icon"><el-icon :size="12"><Checked /></el-icon></span>
        <span class="sys-label">自检</span>
        <span class="sys-num" style="display:flex;gap:4px">
          <span v-if="diagSummary.pass" style="color:#22c55e">{{ diagSummary.pass }}✓</span>
          <span v-if="diagSummary.warn" style="color:#d97706">{{ diagSummary.warn }}⚠</span>
          <span v-if="diagSummary.fail" style="color:#ef4444">{{ diagSummary.fail }}✗</span>
        </span>
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

    <!-- 自检结果面板 -->
    <div v-if="diagChecks.length" class="diag-panel">
      <div class="diag-header">
        <span class="diag-title">自检报告</span>
        <span class="diag-time">{{ diagTime }}</span>
      </div>
      <div class="diag-list">
        <div
          v-for="c in diagChecks" :key="c.id"
          class="diag-row"
          :class="'diag-' + c.status"
        >
          <span class="diag-icon">
            <el-icon v-if="c.status === 'pass'" :size="16"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="c.status === 'warn'" :size="16"><WarningFilled /></el-icon>
            <el-icon v-else :size="16"><CircleCloseFilled /></el-icon>
          </span>
          <span class="diag-name">{{ c.name }}</span>
          <el-tag
            :type="c.status === 'pass' ? 'success' : c.status === 'warn' ? 'warning' : 'danger'"
            size="small" effect="plain" round
          >
            {{ c.status === 'pass' ? '正常' : c.status === 'warn' ? '警告' : '异常' }}
          </el-tag>
          <span class="diag-detail">{{ c.detail }}</span>
          <el-button
            v-if="c.repairable"
            size="small"
            type="primary"
            plain
            :loading="repairingAction === c.repairAction"
            @click="doRepair(c)"
          >
            修复
          </el-button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Refresh, Cpu, Memo, Timer, Monitor, VideoCamera, PictureFilled, Connection, Checked, CircleCheckFilled, WarningFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getStatus, getDiagnostics, repairService } from '../api/index.js'
import { useWebSocket } from '../composables/useWebSocket.js'

const services = ref([])
const system = ref(null)
const loading = ref(false)

const { systemHealth } = useWebSocket()

// WebSocket 推送
watch(systemHealth, (data) => {
  if (data && data.services) services.value = data.services
  if (data && data.system) system.value = data.system
}, { immediate: false })

// ── 自检 ──
const diagLoading = ref(false)
const diagChecks = ref([])
const diagTime = ref('')
const diagSummary = ref(null)
const repairingAction = ref(null)

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
  '后端 API 服务': 'http://localhost:18621',
  '多平台发布服务': 'http://localhost:18623',
  '前端 Web 服务': 'http://localhost:18621',
  'AI引擎服务': 'http://localhost:18622',
}

function svcIcon(name) {
  const map = { '后端 API 服务': Monitor, '多平台发布服务': VideoCamera, '前端 Web 服务': PictureFilled, 'AI引擎服务': Connection }
  return map[name] || Monitor
}

function svcIconBg(name) {
  const map = { '后端 API 服务': '#ede9fe', '多平台发布服务': '#fce7f3', '前端 Web 服务': '#e0f2fe', 'AI引擎服务': '#fef3c7' }
  return map[name] || '#ede9fe'
}

function svcIconColor(name) {
  const map = { '后端 API 服务': '#7c3aed', '多平台发布服务': '#db2777', '前端 Web 服务': '#0284c7', 'AI引擎服务': '#d97706' }
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

async function runDiagnostics() {
  diagLoading.value = true
  try {
    const res = await getDiagnostics()
    if (res.data?.code === 200) {
      diagChecks.value = res.data.data.checks || []
      diagSummary.value = res.data.data.summary || null
      diagTime.value = new Date(res.data.data.time).toLocaleString()
    }
  } catch (e) {
    ElMessage.error('自检失败: ' + (e.response?.data?.message || e.message))
    diagChecks.value = []
    diagSummary.value = null
  } finally {
    diagLoading.value = false
  }
}

async function doRepair(check) {
  repairingAction.value = check.repairAction
  try {
    const res = await repairService(check.repairAction)
    const d = res.data?.data || res.data
    if (d?.success) {
      ElMessage.success(d.message || '修复成功')
    } else {
      ElMessage.warning(d?.message || '修复未完全成功')
    }
    // 修复后重新自检
    await runDiagnostics()
  } catch (e) {
    ElMessage.error('修复失败: ' + (e.response?.data?.message || e.message))
  } finally {
    repairingAction.value = null
  }
}

import { watch } from 'vue'

onMounted(() => {
  fetchStatus()
})
</script>

<style scoped>
.svc-body { min-height: 100%; }
.svc-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.svc-title { font-size: 16px; font-weight: 600; color: #4a3f5e; }
.svc-header-actions { display: flex; gap: 8px; }

/* 系统监控条 */
.sys-bar {
  display: inline-flex; gap: 6px;
  background: rgba(255,255,255,.5); backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(124,58,237,.06); border-radius: 8px;
  padding: 2px 8px; margin-bottom: 16px; flex-wrap: wrap;
}
.sys-item { display: flex; align-items: center; gap: 4px; padding: 2px 4px; }
.sys-icon {
  width: 18px; height: 18px; border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--accent);
}
.sys-label { font-size: 11px; color: #909399; }
.sys-num { font-size: 12px; font-weight: 600; color: #303133; }
.sys-num em { font-style: normal; font-size: 10px; color: #b8aad0; margin-left: 1px; }

/* 服务卡片 */
.service-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
}
.service-card {
  background: #fff; border-radius: 10px; padding: 14px 18px;
  display: flex; align-items: center; gap: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05); border: 1px solid #f0ecf8;
  transition: box-shadow .2s;
}
.service-card:hover { box-shadow: 0 4px 12px rgba(124,58,237,.08); }
.svc-left { flex-shrink: 0; }
.svc-icon {
  width: 38px; height: 38px; border-radius: 10px;
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
.svc-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.pulse-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.pulse-dot.running { background: #22c55e; animation: pulse 2s infinite; }
.pulse-dot.stopped { background: #ef4444; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); }
  50% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
}

/* 自检面板 */
.diag-panel {
  margin-top: 20px;
  background: #fff; border-radius: 12px;
  border: 1px solid #f0ecf8; box-shadow: 0 1px 3px rgba(0,0,0,.04);
  overflow: hidden;
}
.diag-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid #f8f6fc;
}
.diag-title { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.diag-time { font-size: 12px; color: #b8aad0; }
.diag-list { padding: 8px 0; }
.diag-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; transition: background .15s;
}
.diag-row:hover { background: #fafafe; }
.diag-row + .diag-row { border-top: 1px solid #faf8fd; }
.diag-icon { width: 20px; text-align: center; flex-shrink: 0; }
.diag-pass .diag-icon { color: #22c55e; }
.diag-warn .diag-icon { color: #d97706; }
.diag-fail .diag-icon { color: #ef4444; }
.diag-name {
  font-size: 13px; font-weight: 500; color: #303133;
  min-width: 80px; flex-shrink: 0;
}
.diag-detail {
  flex: 1; font-size: 12px; color: #909399;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

@media (max-width: 900px) {
  .service-grid { grid-template-columns: 1fr; }
  .service-card { flex-wrap: wrap; }
  .diag-row { flex-wrap: wrap; }
}
</style>
