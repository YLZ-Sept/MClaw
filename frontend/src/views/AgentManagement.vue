<template>
  <div class="page-container">
    <div class="page-hd">
      <div>
        <span class="page-title">应用智能体管理</span>
        <span class="page-sub">AI Agent 配置与技能管理</span>
      </div>
      <el-button type="primary" @click="openAdd">添加智能体</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-card" style="--glow:#7c3aed">
        <div class="stat-icon"><el-icon :size="20"><Cpu /></el-icon></div>
        <div class="stat-num">{{ agents.length }}</div>
        <div class="stat-label">智能体总数</div>
      </div>
      <div class="stat-card" style="--glow:#22c55e">
        <div class="stat-icon"><el-icon :size="20"><Check /></el-icon></div>
        <div class="stat-num">{{ agents.filter(a=>a.builtin).length }}</div>
        <div class="stat-label">系统内置</div>
      </div>
      <div class="stat-card" style="--glow:#f59e0b">
        <div class="stat-icon"><el-icon :size="20"><Setting /></el-icon></div>
        <div class="stat-num">{{ agents.filter(a=>!a.builtin).length }}</div>
        <div class="stat-label">自定义</div>
      </div>
    </div>

    <div class="agent-grid">
      <div v-for="agent in agents" :key="agent.id" class="agent-card">
        <div class="agent-header">
          <div class="agent-icon" :style="{ background: agent.bg || agent.color || '#7c3aed' }">
            <span v-if="agent.emoji" class="agent-emoji">{{ agent.emoji }}</span>
            <el-icon v-else :size="28"><Avatar /></el-icon>
          </div>
          <el-tag v-if="agent.builtin" size="small" type="success" effect="plain">系统</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">自定义</el-tag>
        </div>
        <div class="agent-name">{{ agent.name }}</div>
        <div class="agent-desc">{{ agent.desc }}</div>
        <div class="agent-meta">
          <span v-if="agent.base_agent" class="agent-base">基于 {{ agent.base_agent }}</span>
          <span class="agent-id">ID: {{ agent.id }}</span>
        </div>
        <div class="agent-action">
          <el-button v-if="hasPanel(agent)" type="success" size="small" round @click="openManagement(agent)">管理面板</el-button>
          <el-button type="primary" size="small" round @click="manageSkills(agent)">技能</el-button>
          <el-button v-if="!agent.builtin" size="small" round @click="openEdit(agent)">编辑</el-button>
          <el-button v-if="!agent.builtin" size="small" round type="danger" @click="delAgent(agent.id)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 技能选择对话框 -->
    <el-dialog v-model="skillDlg.visible" :title="'技能分配 - ' + skillDlg.agentName" width="620px" :close-on-click-modal="false">
      <el-tabs v-model="skillDlg.tab" type="card">
        <el-tab-pane label="本地技能" name="local">
          <div v-if="allSkills.length === 0" style="text-align:center;padding:40px 0">
            <el-empty description="技能库暂无技能">
              <el-button type="primary" @click="skillDlg.visible=false;router.push('/skill-library')">前往技能库</el-button>
            </el-empty>
          </div>
          <div v-else class="skill-check-list">
            <div v-for="s in allSkills" :key="s.id" class="skill-check-item" :class="{ checked: checkedIds.includes(s.id) }" @click="toggleCheck(s.id)">
              <el-checkbox :model-value="checkedIds.includes(s.id)" @click.stop @change="toggleCheck(s.id)"/>
              <div class="sci-body">
                <div class="sci-name">{{ s.name }}</div>
                <div class="sci-desc">{{ s.desc }}</div>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="OpenClaw 技能" name="openclaw">
          <div v-if="openclawSkills.length === 0" style="text-align:center;padding:40px 0">
            <el-empty description="OpenClaw 服务不可用或无已安装技能">
              <span style="color:#909399;font-size:12px">请确认 OpenClaw 已启动并已安装技能</span>
            </el-empty>
          </div>
          <div v-else class="skill-check-list">
            <div v-for="s in openclawSkills" :key="s.name" class="skill-check-item" :class="{ checked: openclawChecked.includes(s.name) }" @click="toggleOpenClawCheck(s.name)">
              <el-checkbox :model-value="openclawChecked.includes(s.name)" @click.stop @change="toggleOpenClawCheck(s.name)"/>
              <div class="sci-body">
                <div class="sci-name">{{ s.name }} <el-tag v-if="s.source" size="small" type="info" style="margin-left:6px">{{ s.source }}</el-tag></div>
                <div class="sci-desc">{{ s.description || '无描述' }}</div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="skillDlg.visible=false">取消</el-button>
        <el-button type="primary" :loading="skillSaving" @click="saveSkillBinding">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑智能体对话框 -->
    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑智能体' : '添加智能体'" width="560px">
      <el-form :model="dlg.form" label-width="90px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" placeholder="如：智能客服"/></el-form-item>
        <el-form-item label="描述"><el-input v-model="dlg.form.desc" type="textarea" :rows="2"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="图标"><el-select v-model="dlg.form.icon" style="width:100%"><el-option v-for="ic in icons" :key="ic" :label="ic" :value="ic"/></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="Emoji"><el-select v-model="dlg.form.emoji" style="width:100%"><el-option v-for="em in emojis" :key="em" :label="em" :value="em"/></el-select></el-form-item></el-col>
        </el-row>
        <el-form-item label="背景色"><el-color-picker v-model="dlg.form.color"/></el-form-item>
        <el-form-item label="基础 Agent">
          <el-select v-model="dlg.form.base_agent" style="width:100%" clearable placeholder="不继承（纯自定义）">
            <el-option label="不继承（纯自定义提示词）" value=""/>
            <el-option label="企业经营管理 Agent (完整工具集)" value="internal-agent"/>
            <el-option label="售后管理 Agent (客服工具集)" value="support-agent"/>
            <el-option label="销售管理 Agent (CRM 工具集)" value="sales-agent"/>
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>
            <span>系统提示词</span>
            <el-button size="small" type="primary" text :loading="promptGenerating" @click="generatePrompt" style="margin-left:8px">
              AI 生成
            </el-button>
          </template>
          <el-input v-model="dlg.form.system_prompt" type="textarea" :rows="5" placeholder="自定义系统提示词（留空继承基础Agent，或点击 AI 生成自动填写）..."/>
        </el-form-item>
        <el-form-item label="知识库引用">
          <el-select v-model="dlg.form.kb_article_ids" multiple filterable placeholder="选择知识库文章" style="width:100%">
            <el-option v-for="a in kbArticles" :key="a.id" :label="a.title" :value="a.id">
              <span>{{ a.title }}</span>
              <span style="float:right;color:#b8aad0;font-size:11px">{{ a.category }}</span>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveAgent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Avatar, Cpu, Check, Setting } from '@element-plus/icons-vue'
import request from '../api/index.js'
const router = useRouter()

const agents = ref([])
const kbArticles = ref([])
const dlg = reactive({ visible: false, isEdit: false, form: {} })
const promptGenerating = ref(false)
const icons = ['Avatar', 'Coin', 'Headset', 'Lock', 'ChatDotSquare', 'DataAnalysis', 'Cpu', 'Setting', 'Promotion', 'List', 'FolderOpened', 'Document']
const emojis = ['🤖', '🤝', '📋', '🔧', '🛡️', '💻', '💬', '📢', '🎯', '🧠', '👔', '📊']

// 技能分配
const skillDlg = reactive({ visible: false, agentId: '', agentName: '', tab: 'local' })
const allSkills = ref([])
const checkedIds = ref([])
const openclawSkills = ref([])
const openclawChecked = ref([])
const skillSaving = ref(false)

async function loadAgents() {
  try { const { data } = await request.get('/agents'); agents.value = data.data || [] } catch { agents.value = [] }
}
async function loadKB() {
  try { const { data } = await request.get('/knowledge-base', { params: { status: 'published' } }); kbArticles.value = data.data || [] } catch { kbArticles.value = [] }
}

function hasPanel(agent) {
  if (!agent.builtin) return false
  const map = { 'internal-agent': true, 'sales-agent': true, 'support-agent': true }
  return map[agent.id]
}
function openManagement(agent) {
  const id = agent.base_agent || agent.id
  const map = { 'internal-agent': '/internal', 'sales-agent': '/internal/sales', 'support-agent': '/support' }
  if (map[id]) router.push(map[id])
}

// ----- 技能 -----
async function manageSkills(agent) {
  skillDlg.agentId = agent.id; skillDlg.agentName = agent.name; skillDlg.tab = 'local'
  // 加载本地技能 + OpenClaw 技能
  try {
    const { data } = await request.get('/agent-skills')
    allSkills.value = data.data || []
    checkedIds.value = allSkills.value.filter(s => s.agent_id === agent.id).map(s => s.id)
  } catch { allSkills.value = []; checkedIds.value = [] }
  try {
    const [allRes, checkedRes] = await Promise.all([
      request.get('/agent-openclaw-skills'),
      request.get('/agent-openclaw-skills/' + agent.id)
    ])
    openclawSkills.value = allRes.data?.data || []
    openclawChecked.value = checkedRes.data?.data || []
  } catch { openclawSkills.value = []; openclawChecked.value = [] }
  skillDlg.visible = true
}
function toggleCheck(skillId) {
  const idx = checkedIds.value.indexOf(skillId)
  if (idx >= 0) checkedIds.value.splice(idx, 1)
  else checkedIds.value.push(skillId)
}
async function saveSkillBinding() {
  skillSaving.value = true
  try {
    const agentId = skillDlg.agentId
    // 本地技能：勾选的设为 agent_id，未勾选的清空 agent_id
    for (const s of allSkills.value) {
      const shouldBind = checkedIds.value.includes(s.id)
      if (shouldBind && s.agent_id !== agentId) {
        await request.put('/agent-skills/' + s.id, { agent_id: agentId })
      } else if (!shouldBind && s.agent_id === agentId) {
        await request.put('/agent-skills/' + s.id, { agent_id: '' })
      }
    }
    // OpenClaw 技能
    await request.put('/agent-openclaw-skills/' + agentId, { skills: openclawChecked.value })
    ElMessage.success('技能分配已保存')
    skillDlg.visible = false
  } catch (e) {
    ElMessage.error('保存失败')
  }
  skillSaving.value = false
}

// ----- OpenClaw 技能 -----
function toggleOpenClawCheck(skillName) {
  const idx = openclawChecked.value.indexOf(skillName)
  if (idx >= 0) openclawChecked.value.splice(idx, 1)
  else openclawChecked.value.push(skillName)
}

// ----- 智能体 -----
function openAdd() {
  dlg.isEdit = false
  dlg.form = { name: '', desc: '', icon: 'Avatar', emoji: '🤖', color: '#7c3aed', base_agent: '', system_prompt: '', kb_article_ids: [] }
  dlg.visible = true
}
function openEdit(agent) {
  dlg.isEdit = true
  const ids = agent.kb_article_ids ? agent.kb_article_ids.split(',').filter(Boolean) : []
  dlg.form = { ...agent, color: agent.bg || agent.color || '#7c3aed', kb_article_ids: ids }
  dlg.visible = true
}
async function saveAgent() {
  if (!dlg.form.name) return ElMessage.warning('请输入名称')
  const payload = { ...dlg.form, kb_article_ids: (dlg.form.kb_article_ids || []).join(',') }
  if (dlg.isEdit) { await request.put('/agent-apps/' + dlg.form.id, payload) }
  else { await request.post('/agent-apps', payload) }
  dlg.visible = false; await loadAgents(); ElMessage.success('OK')
}
async function generatePrompt() {
  if (!dlg.form.name) return ElMessage.warning('请先填写智能体名称')
  promptGenerating.value = true
  try {
    const { data } = await request.post('/agent-apps/generate-prompt', {
      name: dlg.form.name,
      desc: dlg.form.desc || '',
      base_agent: dlg.form.base_agent || ''
    })
    if (data.code === 200 && data.data?.system_prompt) {
      dlg.form.system_prompt = data.data.system_prompt
      ElMessage.success('提示词已生成')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '生成失败')
  }
  promptGenerating.value = false
}

async function delAgent(id) {
  try { await ElMessageBox.confirm('确认删除？'); await request.delete('/agent-apps/' + id); await loadAgents() } catch {}
}

onMounted(() => { loadAgents(); loadKB() })
</script>

<style scoped>
.page-container { padding: 20px 24px; height: 100%; overflow-y: auto; background: #fafafe; }
.page-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.page-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }

/* stats */
.stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
.stat-card {
  flex: 1;
  display: flex; align-items: center; gap: 12px;
  background: rgba(255,255,255,.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(124,58,237,.12);
  border-radius: 12px;
  padding: 12px 18px;
  transition: all .3s;
}
.stat-card:hover {
  background: rgba(255,255,255,.85);
  border-color: color-mix(in srgb, var(--glow, #7c3aed) 40%, transparent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--glow, #7c3aed) 10%, transparent);
  transform: translateY(-1px);
}
.stat-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--glow, #7c3aed) 12%, transparent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: var(--glow, #7c3aed);
}
.stat-num {
  font-size: 22px; font-weight: 700; color: #303133; line-height: 1;
}
.stat-label {
  font-size: 12px; color: #909399; margin-left: auto;
}
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.agent-card {
  background: #fff; border: 1px solid #f0ecfc; border-radius: 16px; padding: 24px;
  transition: all 0.25s; display: flex; flex-direction: column;
  box-shadow: 0 1px 4px rgba(139, 92, 246, 0.04);
}
.agent-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(139, 92, 246, 0.1); border-color: #c4b5fd; }
.agent-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.agent-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; }
.agent-emoji { font-size: 28px; }
.agent-name { font-size: 17px; font-weight: 600; color: #4a3f5e; margin-bottom: 8px; }
.agent-desc { font-size: 13px; color: #b8aad0; line-height: 1.5; margin-bottom: 12px; flex: 1; }
.agent-meta { margin-bottom: 16px; display: flex; flex-direction: column; gap: 2px; }
.agent-id { font-size: 11px; color: #d0c8e0; font-family: monospace; }
.agent-base { font-size: 11px; color: #b8aad0; }
.agent-action { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }

/* 技能复选框列表 */
.skill-check-list { max-height: 50vh; overflow-y: auto; }
.skill-check-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px; border-radius: 8px; cursor: pointer;
  transition: background .15s;
}
.skill-check-item:hover { background: #f8f7ff; }
.skill-check-item.checked { background: #f5f3ff; }
.sci-body { flex: 1; min-width: 0; }
.sci-name { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.sci-desc { font-size: 12px; color: #909399; margin-top: 2px; }
</style>
