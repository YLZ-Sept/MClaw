<template>
  <div class="scheduler-shell">
    <div class="page-hd">
      <div>
        <div class="page-kicker">Automation</div>
        <h1 class="page-title">任务调度</h1>
        <p class="page-desc">定时任务与 Cron 作业管理</p>
      </div>
      <button class="btn-primary" @click="openCreate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建任务
      </button>
    </div>

    <!-- 统计 -->
    <div class="stats-row">
      <div class="stat-chip"><span class="stat-dot on"></span>{{ activeCount }} 运行中</div>
      <div class="stat-chip" v-if="disabledCount"><span class="stat-dot off"></span>{{ disabledCount }} 已停用</div>
      <div class="stat-chip muted">{{ jobs.length }} 个任务</div>
    </div>

    <!-- 任务列表 -->
    <div class="job-list" v-loading="loading">
      <div v-if="!jobs.length && !loading" class="empty">
        <div class="empty-icon">⏰</div>
        <h3>暂无定时任务</h3>
        <p>创建定时任务，让 AI Agent 按计划自动执行</p>
        <button class="btn-primary" @click="openCreate">创建第一个任务</button>
      </div>

      <div v-for="job in jobs" :key="job.id" class="job-card" :class="{ disabled: !job.enabled }">
        <div class="job-top">
          <div class="job-info">
            <h3 class="job-name">{{ job.name }}</h3>
            <p class="job-desc" v-if="job.description">{{ job.description }}</p>
            <div class="job-meta">
              <code class="job-cron">{{ job.schedule?.cron || formatSchedule(job.schedule) }}</code>
              <span v-if="job.agentId" class="job-agent">Agent: {{ job.agentId }}</span>
              <span class="job-next" v-if="job.nextRun">下次: {{ fmtTime(job.nextRun) }}</span>
            </div>
          </div>
          <div class="job-actions">
            <el-switch v-model="job.enabled" @change="toggleJob(job)" size="small" />
            <el-button size="small" text @click="runJob(job)" :loading="runningId === job.id"><el-icon><VideoPlay /></el-icon></el-button>
            <el-button size="small" text @click="openEdit(job)"><el-icon><Edit /></el-icon></el-button>
            <el-button size="small" text type="danger" @click="deleteJob(job.id)"><el-icon><Delete /></el-icon></el-button>
          </div>
        </div>
        <div class="job-payload" v-if="job.payload?.message">
          <span class="payload-label">执行内容</span>
          <span class="payload-text">{{ job.payload.message.slice(0, 120) }}{{ job.payload.message.length > 120 ? '…' : '' }}</span>
        </div>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="showDialog" :title="editingId ? '编辑任务' : '新建任务'" width="560px" destroy-on-close @closed="resetForm">
      <el-form :model="form" label-position="top">
        <el-form-item label="任务名称" required><el-input v-model="form.name" placeholder="例如：每日报表生成" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" placeholder="任务用途说明" /></el-form-item>
        <el-form-item label="Cron 表达式" required>
          <el-input v-model="form.schedule" placeholder="0 9 * * * (每天早上9点)">
            <template #append><el-button @click="form.schedule='0 9 * * *'">每日9点</el-button></template>
          </el-input>
          <span class="form-hint">格式: 分 时 日 月 周。例如 <code>*/30 * * * *</code> 每30分钟，<code>0 9 * * 1-5</code> 工作日9点</span>
        </el-form-item>
        <el-form-item label="执行消息" required><el-input v-model="form.message" type="textarea" :rows="3" placeholder="Agent 将收到此消息并执行" /></el-form-item>
        <el-form-item label="绑定 Agent（可选）"><el-input v-model="form.agentId" placeholder="留空则使用通用 Agent" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="saveJob" :loading="saving">{{ editingId ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 执行结果 -->
    <el-dialog v-model="showResult" title="执行结果" width="640px">
      <div class="run-result" v-html="runResultRendered"></div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, VideoPlay } from '@element-plus/icons-vue'
import request from '../../api/index.js'
import { marked } from 'marked'

const loading = ref(true)
const jobs = ref([])
const showDialog = ref(false)
const showResult = ref(false)
const editingId = ref(null)
const saving = ref(false)
const runningId = ref(null)
const runResultRendered = ref('')
const form = ref({ name: '', description: '', schedule: '0 9 * * *', message: '', agentId: '' })

const activeCount = computed(() => jobs.value.filter(j => j.enabled).length)
const disabledCount = computed(() => jobs.value.filter(j => !j.enabled).length)

function fmtTime(t) { if (!t) return '-'; return new Date(t).toLocaleString('zh-CN', { month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }) }
function formatSchedule(s) { if (!s) return '-'; if (s.cron) return s.cron; return `${s.minute||'*'} ${s.hour||'*'} ${s.dayOfMonth||'*'} ${s.month||'*'} ${s.dayOfWeek||'*'}` }

async function loadJobs() {
  loading.value = true
  try {
    const { data } = await request.get('/tasks', { params: { enabled: 'all', limit: 50 } })
    jobs.value = (data.data || []).map(j => ({ ...j, enabled: j.enabled !== false }))
  } catch { jobs.value = [] }
  loading.value = false
}

function openCreate() { editingId.value = null; resetForm(); showDialog.value = true }
function openEdit(job) {
  editingId.value = job.id
  form.value = {
    name: job.name || '',
    description: job.description || '',
    schedule: job.schedule?.cron || formatSchedule(job.schedule),
    message: job.payload?.message || '',
    agentId: job.agentId || '',
  }
  showDialog.value = true
}
function resetForm() { form.value = { name: '', description: '', schedule: '0 9 * * *', message: '', agentId: '' } }

async function saveJob() {
  if (!form.value.name || !form.value.schedule || !form.value.message) {
    ElMessage.warning('请填写任务名称、Cron 表达式和执行消息'); return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await request.put('/tasks/' + editingId.value, form.value)
      ElMessage.success('任务已更新')
    } else {
      await request.post('/tasks', form.value)
      ElMessage.success('任务已创建')
    }
    showDialog.value = false
    loadJobs()
  } catch (e) { ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message)) }
  saving.value = false
}

async function toggleJob(job) {
  try {
    await request.put('/tasks/' + job.id, { enabled: job.enabled })
    ElMessage.success(job.enabled ? '已启用' : '已停用')
  } catch { ElMessage.error('操作失败'); job.enabled = !job.enabled }
}

async function runJob(job) {
  runningId.value = job.id
  try {
    const { data } = await request.post('/tasks/' + job.id + '/run')
    runResultRendered.value = marked.parse(data.data?.content || '执行完成，无返回内容')
    showResult.value = true
  } catch (e) { ElMessage.error('执行失败: ' + (e.response?.data?.message || e.message)) }
  runningId.value = null
}

async function deleteJob(id) {
  try { await ElMessageBox.confirm('确定删除该任务？', '确认', { type: 'warning' }) } catch { return }
  try { await request.delete('/tasks/' + id); ElMessage.success('已删除'); loadJobs() }
  catch { ElMessage.error('删除失败') }
}

onMounted(loadJobs)
</script>

<style scoped>
.scheduler-shell { padding: 28px 32px; height: 100%; overflow-y: auto; }
.page-hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.page-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7c3aed; margin-bottom: 8px; }
.page-title { font-size: 26px; font-weight: 800; letter-spacing: -0.04em; color: #4a3f5e; margin: 0 0 6px; }
.page-desc { font-size: 13px; color: #94a3b8; margin: 0; }
.btn-primary { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: white; border: none; border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(124,58,237,0.3); }

.stats-row { display: flex; gap: 10px; margin-bottom: 18px; }
.stat-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; background: #fff; border: 1px solid #f0ecfc; color: #4a3f5e; }
.stat-chip.muted { color: #94a3b8; }
.stat-dot { width: 8px; height: 8px; border-radius: 50%; }
.stat-dot.on { background: #22c55e; }
.stat-dot.off { background: #9ca3af; }

.job-list { display: flex; flex-direction: column; gap: 12px; }
.job-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 16px 18px; transition: all 0.15s; }
.job-card:hover { border-color: #c4b5fd; box-shadow: 0 2px 12px rgba(124,58,237,0.06); }
.job-card.disabled { opacity: 0.6; background: #faf8ff; }
.job-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.job-info { flex: 1; min-width: 0; }
.job-name { font-size: 15px; font-weight: 600; color: #4a3f5e; margin: 0 0 4px; }
.job-desc { font-size: 12px; color: #94a3b8; margin: 0 0 6px; }
.job-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.job-cron { font-size: 12px; background: #f5f3ff; padding: 2px 8px; border-radius: 6px; color: #7c3aed; font-weight: 600; }
.job-agent { font-size: 11px; color: #b8aad0; }
.job-next { font-size: 11px; color: #94a3b8; }
.job-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.job-payload { margin-top: 10px; padding-top: 10px; border-top: 1px solid #f8f6fc; display: flex; gap: 8px; }
.payload-label { font-size: 11px; color: #b8aad0; font-weight: 600; white-space: nowrap; }
.payload-text { font-size: 12px; color: #6b7280; }

.form-hint { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 4px; }
.form-hint code { background: #f5f3ff; padding: 1px 4px; border-radius: 3px; color: #7c3aed; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 64px 24px; text-align: center; gap: 12px; }
.empty-icon { font-size: 48px; }
.empty h3 { font-size: 18px; color: #4a3f5e; margin: 0; }
.empty p { font-size: 13px; color: #94a3b8; margin: 0; }

.run-result { max-height: 400px; overflow-y: auto; font-size: 14px; line-height: 1.65; padding: 8px 0; }
</style>
