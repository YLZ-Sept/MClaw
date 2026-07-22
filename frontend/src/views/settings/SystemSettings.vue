<template>
  <div>
    <div class="page-hd"><h2 class="page-title">系统设置</h2><p class="page-desc">全局系统行为与运行参数</p></div>

    <div class="setting-card" v-for="group in groups" :key="group.title">
      <h3 class="card-title">{{ group.title }}</h3>
      <div class="card-body">
        <div v-for="item in group.items" :key="item.key" class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{{ item.label }}</span>
            <span class="setting-desc">{{ item.desc }}</span>
          </div>
          <div class="setting-ctrl">
            <el-switch v-if="item.type === 'switch'" v-model="settings[item.key]" @change="save" />
            <el-input-number v-else-if="item.type === 'number'" v-model="settings[item.key]" :min="item.min" :max="item.max" size="small" @change="save" />
            <el-input v-else-if="item.type === 'text'" v-model="settings[item.key]" size="small" @change="save" />
          </div>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <h3 class="card-title">调试</h3>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">系统信息</span>
            <span class="setting-desc">Node.js 版本、运行时间、内存使用</span>
          </div>
          <div class="setting-ctrl" v-if="sysInfo">
            <span class="sys-info-text">{{ sysInfo }}</span>
          </div>
        </div>
        <div class="setting-row" v-if="dbStats">
          <div class="setting-info"><span class="setting-label">数据库</span></div>
          <div class="setting-ctrl"><span class="sys-info-text">{{ dbStats }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/index.js'

const settings = reactive({
  streamEnabled: localStorage.getItem('streamEnabled') !== 'false',
  debugMode: localStorage.getItem('debugMode') === 'true',
  autoScroll: localStorage.getItem('autoScroll') !== 'false',
  maxHistory: parseInt(localStorage.getItem('maxHistory') || '100'),
})

const groups = [
  {
    title: '聊天',
    items: [
      { key: 'streamEnabled', label: '流式响应', desc: '启用 SSE 流式传输（推荐）', type: 'switch' },
      { key: 'autoScroll', label: '自动滚动', desc: '新消息时自动滚动到底部', type: 'switch' },
      { key: 'maxHistory', label: '历史消息上限', desc: '最多保留的历史消息条数', type: 'number', min: 10, max: 500 },
    ]
  },
  {
    title: '开发',
    items: [
      { key: 'debugMode', label: '调试模式', desc: '显示详细的网络请求和错误信息', type: 'switch' },
    ]
  },
]

const sysInfo = ref('')
const dbStats = ref('')

function save() {
  for (const [k, v] of Object.entries(settings)) {
    localStorage.setItem(k, String(v))
  }
  ElMessage.success('已保存')
}

onMounted(async () => {
  try {
    const { data: r1 } = await request.get('/status').catch(() => ({ data: { data: {} } }))
    const d = r1.data || {}
    if (d.system) sysInfo.value = `Node ${d.system.nodeVersion || '-'} · 运行 ${d.system.uptime || '-'} · 内存 ${d.system.memory || '-'}`
    if (d.services) sysInfo.value += ` · ${d.services.length} 个服务`
    try {
      const { data: r2 } = await request.get('/dashboard/models').catch(() => ({ data: { data: [] } }))
      const rows = r2.data || []
      dbStats.value = `SQLite · ${rows.length} 个模型配置`
    } catch {}
  } catch {}
})
</script>

<style scoped>
.page-hd { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #94a3b8; margin: 0; }
.setting-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
.card-title { font-size: 14px; font-weight: 600; color: #4a3f5e; padding: 14px 18px; margin: 0; border-bottom: 1px solid #f8f6fc; background: #faf8ff; }
.card-body { padding: 4px 0; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 18px; }
.setting-row + .setting-row { border-top: 1px solid #f8f6fc; }
.setting-info { min-width: 0; }
.setting-label { font-size: 14px; font-weight: 500; color: #4a3f5e; display: block; }
.setting-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; display: block; }
.setting-ctrl { flex-shrink: 0; }
.sys-info-text { font-size: 12px; color: #b8aad0; font-family: 'SF Mono','Cascadia Code',monospace; }
</style>
