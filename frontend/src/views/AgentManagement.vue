<template>
  <div class="page-container">
    <div class="page-hd">
      <span class="page-title">应用智能体管理</span>
      <el-button type="primary" @click="openAdd">添加智能体</el-button>
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

    <!-- 技能管理对话框 -->
    <el-dialog v-model="skillDlg.visible" :title="'技能管理 - ' + skillDlg.agentName" width="700px">
      <div style="margin-bottom:12px">
        <el-button type="primary" size="small" @click="openSkillAdd">添加技能</el-button>
      </div>
      <el-table :data="skills" stripe border row-key="id" v-loading="skillLoading">
        <el-table-column prop="name" label="名称" width="120"/>
        <el-table-column prop="desc" label="描述" min-width="180" show-overflow-tooltip/>
        <el-table-column prop="tools" label="关联工具" width="200" show-overflow-tooltip>
          <template #default="{row}"><el-tag v-for="t in (row.tools||'').split(',').filter(Boolean)" :key="t" size="small" style="margin:1px">{{ t }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{row}">
            <el-button size="small" type="primary" link @click="openSkillEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="delSkill(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="skillDlg.visible=false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 技能添加/编辑 -->
    <el-dialog v-model="skillFormDlg.visible" :title="skillFormDlg.isEdit ? '编辑技能' : '添加技能'" width="560px">
      <el-form :model="skillFormDlg.form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="skillFormDlg.form.name" placeholder="如：合同分析"/></el-form-item>
        <el-form-item label="描述"><el-input v-model="skillFormDlg.form.desc" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="关联工具">
          <el-select v-model="skillFormDlg.form.toolsList" multiple filterable placeholder="选择要启用的工具" style="width:100%">
            <el-option v-for="t in availableTools" :key="t" :label="t" :value="t"/>
          </el-select>
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="skillFormDlg.form.prompt_snippet" type="textarea" :rows="5" placeholder="附加到系统提示词的技能描述..."/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skillFormDlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveSkill">保存</el-button>
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
            <el-option label="内部管理 Agent (完整工具集)" value="internal-agent"/>
            <el-option label="售后管理 Agent (客服工具集)" value="support-agent"/>
            <el-option label="销售管理 Agent (CRM 工具集)" value="sales-agent"/>
          </el-select>
        </el-form-item>
        <el-form-item label="系统提示词"><el-input v-model="dlg.form.system_prompt" type="textarea" :rows="5" placeholder="自定义系统提示词（留空继承基础Agent）..."/></el-form-item>
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
import { Avatar } from '@element-plus/icons-vue'
import axios from 'axios'
const req = axios.create({ baseURL: '/api' })
const router = useRouter()

const agents = ref([])
const kbArticles = ref([])
const dlg = reactive({ visible: false, isEdit: false, form: {} })
const icons = ['Avatar', 'Coin', 'Headset', 'Lock', 'ChatDotSquare', 'DataAnalysis', 'Cpu', 'Setting', 'Promotion', 'List', 'FolderOpened', 'Document']
const emojis = ['🤖', '🤝', '📋', '🔧', '🛡️', '💻', '💬', '📢', '🎯', '🧠', '👔', '📊']

// 技能管理
const skillDlg = reactive({ visible: false, agentId: '', agentName: '' })
const skillFormDlg = reactive({ visible: false, isEdit: false, form: {} })
const skills = ref([])
const skillLoading = ref(false)

const availableTools = [
  'list_customers', 'get_customer', 'create_customer', 'update_customer', 'add_follow_up',
  'list_contacts', 'list_opportunities', 'create_opportunity', 'list_leads', 'list_contracts',
  'create_contract', 'list_tickets', 'create_ticket', 'list_feedback', 'list_quotations',
  'list_campaigns', 'list_asset_ledger',
  'list_products', 'create_product', 'query_stock', 'stock_in', 'stock_out',
  'list_suppliers', 'list_purchase_orders', 'list_sales_orders', 'list_warehouses',
  'list_returns', 'create_return',
  'list_employees', 'create_employee', 'list_departments', 'list_recruitment',
  'list_candidates', 'clock_in', 'clock_out', 'attendance_records', 'attendance_monthly_report',
  'list_attendance_rules', 'list_personnel_changes', 'list_performance_schemes',
  'list_documents', 'search_documents', 'list_document_folders',
  'search_faq', 'search_employee', 'get_dashboard_stats', 'handoff_to_human'
]

async function loadAgents() {
  try { const { data } = await req.get('/agents'); agents.value = data.data || [] } catch { agents.value = [] }
}
async function loadKB() {
  try { const { data } = await req.get('/knowledge-base', { params: { status: 'published' } }); kbArticles.value = data.data || [] } catch { kbArticles.value = [] }
}

function hasPanel(agent) {
  const map = { 'internal-agent': true, 'sales-agent': true, 'support-agent': true }
  return map[agent.id] || (agent.base_agent && map[agent.base_agent])
}
function openManagement(agent) {
  const id = agent.base_agent || agent.id
  const map = { 'internal-agent': '/internal', 'sales-agent': '/internal/sales', 'support-agent': '/support' }
  if (map[id]) router.push(map[id])
}

// ----- 技能 -----
async function loadSkills() {
  skillLoading.value = true
  try {
    const { data } = await req.get('/agent-skills', { params: { agent_id: skillDlg.agentId } })
    skills.value = data.data || []
  } catch { skills.value = [] } finally { skillLoading.value = false }
}
function manageSkills(agent) {
  skillDlg.agentId = agent.id; skillDlg.agentName = agent.name; skillDlg.visible = true
  loadSkills()
}
function openSkillAdd() {
  skillFormDlg.isEdit = false
  skillFormDlg.form = { name: '', desc: '', toolsList: [], prompt_snippet: '', agent_id: skillDlg.agentId }
  skillFormDlg.visible = true
}
function openSkillEdit(row) {
  skillFormDlg.isEdit = true
  skillFormDlg.form = { ...row, toolsList: (row.tools || '').split(',').filter(Boolean) }
  skillFormDlg.visible = true
}
async function saveSkill() {
  if (!skillFormDlg.form.name) return ElMessage.warning('请输入名称')
  const payload = { ...skillFormDlg.form, tools: (skillFormDlg.form.toolsList || []).join(','), toolsList: undefined }
  if (skillFormDlg.isEdit) {
    await req.put('/agent-skills/' + skillFormDlg.form.id, payload)
  } else {
    await req.post('/agent-skills', payload)
  }
  skillFormDlg.visible = false; await loadSkills(); ElMessage.success('OK')
}
async function delSkill(id) {
  try { await ElMessageBox.confirm('确认删除？'); await req.delete('/agent-skills/' + id); await loadSkills() } catch {}
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
  if (dlg.isEdit) { await req.put('/agent-apps/' + dlg.form.id, payload) }
  else { await req.post('/agent-apps', payload) }
  dlg.visible = false; await loadAgents(); ElMessage.success('OK')
}
async function delAgent(id) {
  try { await ElMessageBox.confirm('确认删除？'); await req.delete('/agent-apps/' + id); await loadAgents() } catch {}
}

onMounted(() => { loadAgents(); loadKB() })
</script>

<style scoped>
.page-container { padding: 20px 24px; height: 100%; overflow-y: auto; background: #fafafe; }
.page-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
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
</style>
