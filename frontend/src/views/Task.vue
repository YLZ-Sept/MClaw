<template>
  <div class="sl-page">
    <div class="pg-hd">
      <span class="pg-title">任务调度</span>
      <span class="pg-sub">定时任务管理</span>
      <div style="float:right">
        <el-button type="primary" @click="openCreate">+ 新建任务</el-button>
      </div>
    </div>
    <div class="pg-body">
      <el-table :data="tasks" v-loading="loading" stripe style="width:100%">
        <el-table-column prop="name" label="任务名称" min-width="160" />
        <el-table-column label="调度规则" min-width="180">
          <template #default="{ row }">{{ scheduleLabel(row.schedule) }}</template>
        </el-table-column>
        <el-table-column label="目标" width="120">
          <template #default="{ row }">{{ row.agentId || '默认' }}</template>
        </el-table-column>
        <el-table-column label="启用" width="70">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" @change="(v) => toggleEnabled(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="上次运行" min-width="150">
          <template #default="{ row }">{{ row.lastRunAt ? fmt(row.lastRunAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="下次运行" min-width="150">
          <template #default="{ row }">{{ row.nextRunAt ? fmt(row.nextRunAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="runJob(row)">执行</el-button>
            <el-button size="small" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="removeJob(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && !tasks.length" style="padding:80px 0;text-align:center">
        <el-empty description="暂无定时任务，点击右上角新建" />
      </div>
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑任务' : '新建任务'" width="560px" :close-on-click-modal="false">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="任务名称" required>
          <el-input v-model="dlg.form.name" placeholder="如：每日销售报表" />
        </el-form-item>
        <el-form-item label="调度规则" required>
          <el-input v-model="dlg.form.schedule" placeholder="cron: 0 9 * * *  或 间隔: 30m/1h  或 一次: ISO时间" />
          <div class="form-hint">cron 表达式(0 9 * * *)、间隔(1h/30m)、或一次性 ISO 时间戳</div>
        </el-form-item>
        <el-form-item label="Agent">
          <el-input v-model="dlg.form.agentId" placeholder="如 sales-agent，留空使用默认" />
        </el-form-item>
        <el-form-item label="执行内容" required>
          <el-input v-model="dlg.form.message" type="textarea" :rows="3" placeholder="Agent 将收到此消息并执行" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="dlg.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible=false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="saveJob">{{ dlg.isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 执行结果弹窗 -->
    <el-dialog v-model="resultDlg.visible" :title="'执行结果 - ' + resultDlg.taskName" width="700px" :close-on-click-modal="false">
      <div v-if="resultDlg.loading" style="text-align:center;padding:40px">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <div style="margin-top:12px;color:#b8aad0">正在执行任务...</div>
      </div>
      <div v-else class="result-content" v-html="renderMd(resultDlg.content)"></div>
      <template #footer>
        <el-button v-if="resultDlg.agentId" type="primary" plain @click="viewInChat">在聊天中查看</el-button>
        <el-button @click="resultDlg.visible=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { marked } from 'marked'
import request from '../api/index.js'

function renderMd(text) {
  return marked(text || '')
}

const router = useRouter()
const tasks = ref([])
const loading = ref(false)
const dlg = ref({ visible: false, isEdit: false, saving: false, form: {} })
const resultDlg = ref({ visible: false, content: '', loading: false, taskName: '', agentId: '' })

function defaultForm() {
  return { name: '', schedule: '', agentId: '', message: '', enabled: true }
}

function fmt(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function scheduleLabel(s) {
  if (!s) return '-'
  if (s.kind === 'cron') return `cron: ${s.expr}`
  if (s.kind === 'every') {
    const ms = s.everyMs
    if (ms >= 3600000) return `每 ${ms / 3600000} 小时`
    if (ms >= 60000) return `每 ${ms / 60000} 分钟`
    return `每 ${ms / 1000} 秒`
  }
  if (s.kind === 'at') return `一次: ${fmt(s.at)}`
  return JSON.stringify(s)
}

async function loadTasks() {
  loading.value = true
  try {
    const { data } = await request.get('/tasks')
    tasks.value = data.data || []
  } catch (e) {
    ElMessage.error('加载任务失败: ' + (e.response?.data?.message || e.message))
  }
  loading.value = false
}

function openCreate() {
  dlg.value = { visible: true, isEdit: false, saving: false, form: defaultForm() }
}

function openEdit(row) {
  dlg.value = {
    visible: true, isEdit: true, saving: false,
    form: {
      name: row.name,
      schedule: row.schedule?.kind === 'cron' ? row.schedule.expr :
                row.schedule?.kind === 'every' ? `${row.schedule.everyMs / 60000}m` :
                row.schedule?.at || '',
      agentId: row.agentId || '',
      message: row.payload?.message || '',
      enabled: row.enabled,
      _id: row.id
    }
  }
}

async function saveJob() {
  const f = dlg.value.form
  if (!f.name || !f.schedule || !f.message) {
    return ElMessage.warning('请填写名称、调度规则和执行内容')
  }
  dlg.value.saving = true
  try {
    if (dlg.value.isEdit) {
      await request.put(`/tasks/${f._id}`, f)
      ElMessage.success('任务已更新')
    } else {
      await request.post('/tasks', f)
      ElMessage.success('任务已创建')
    }
    dlg.value.visible = false
    loadTasks()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  }
  dlg.value.saving = false
}

async function removeJob(row) {
  try {
    await ElMessageBox.confirm(`确定删除任务「${row.name}」？`, '确认删除', { type: 'warning' })
    await request.delete(`/tasks/${row.id}`)
    ElMessage.success('已删除')
    loadTasks()
  } catch { /* cancelled */ }
}

async function runJob(row) {
  resultDlg.value = { visible: true, content: '', loading: true, taskName: row.name, agentId: row.agentId || '' }
  try {
    const { data: res } = await request.post(`/tasks/${row.id}/run`)
    resultDlg.value.content = res.data?.content || '(无返回内容)'
  } catch (e) {
    resultDlg.value.content = '执行失败: ' + (e.response?.data?.message || e.message)
  }
  resultDlg.value.loading = false
}

async function toggleEnabled(row, val) {
  try {
    await request.put(`/tasks/${row.id}`, { enabled: val })
    row.enabled = val
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

function viewInChat() {
  router.push({ path: '/chat', query: { agent: resultDlg.value.agentId } })
}

onMounted(() => loadTasks())
</script>

<style scoped>
.sl-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.pg-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.pg-body { flex: 1; padding: 24px; overflow-y: auto; }
.form-hint { font-size: 11px; color: #b8aad0; margin-top: 4px; }
.result-content { max-height: 55vh; overflow-y: auto; font-size: 14px; line-height: 1.8; color: #303133; }
.result-content :deep(h2) { font-size: 16px; margin: 14px 0 6px; }
.result-content :deep(h3) { font-size: 14px; margin: 10px 0 4px; }
.result-content :deep(ul), .result-content :deep(ol) { padding-left: 18px; margin: 6px 0; }
.result-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.result-content :deep(pre) { background: #2d2640; color: #e8e0f0; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
</style>
