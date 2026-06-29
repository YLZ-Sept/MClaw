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
        <div class="agent-desc" :title="agent.desc">{{ agent.desc }}</div>
        <div class="agent-meta">
          <span v-if="agent.base_agent" class="agent-base">基于 {{ agent.base_agent }}</span>
          <span class="agent-id">ID: {{ agent.id }}</span>
        </div>
        <div class="agent-action">
          <el-button v-if="hasPanel(agent)" type="success" size="small" round @click="openManagement(agent)">管理面板</el-button>
          <el-button type="primary" size="small" round @click="manageSkills(agent)">技能</el-button>
          <el-button v-if="!agent.builtin && !agent.is_digital_employee" size="small" round @click="openEdit(agent)">编辑</el-button>
          <el-button v-if="!agent.builtin && !agent.is_digital_employee" size="small" round type="danger" @click="delAgent(agent.id)">删除</el-button>
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
        <el-tab-pane label="我的技能" name="openclaw">
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

    <!-- 目录浏览对话框 -->
    <el-dialog v-model="browseDlg.visible" title="浏览文件夹/文件" width="520px" :close-on-click-modal="false">
      <div style="margin-bottom:8px;font-size:12px;color:#909399">
        当前：{{ browseDlg.current || '—' }}
        <el-button v-if="browseDlg.parent !== null" size="small" text @click="browsePath(browseDlg.parent)">⬆ 上级目录</el-button>
      </div>
      <div style="max-height:360px;overflow-y:auto;border:1px solid #f0ecfc;border-radius:6px">
        <div v-if="browseDlg.loading" style="text-align:center;padding:40px"><el-icon class="is-loading"><Loading /></el-icon></div>
        <div v-else-if="browseDlg.items.length===0" style="text-align:center;padding:40px;color:#b8aad0">空目录</div>
        <div v-for="item in browseDlg.items" :key="item.path" class="browse-item"
          @dblclick="item.type==='dir' ? browsePath(item.path) : selectBrowseItem(item.path)"
          :style="{ cursor: item.type==='dir' ? 'pointer' : 'default' }">
          <el-icon :size="16" :color="item.type==='dir'?'#7c3aed':'#909399'">
            <FolderOpened v-if="item.type==='dir'" /><Document v-else />
          </el-icon>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.name }}</span>
          <el-button v-if="item.type==='dir'" size="small" text @click="browsePath(item.path)">进入</el-button>
          <el-button v-if="item.type==='file'" size="small" text type="primary" @click="selectBrowseItem(item.path)">选择</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="browseDlg.visible=false">取消</el-button>
        <el-button type="primary" @click="selectBrowseItem(browseDlg.current)">选择当前目录</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑智能体对话框 -->
    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑智能体' : '添加智能体'" width="820px" :close-on-click-modal="false">
      <div class="agent-dlg">
        <!-- 左侧表单 -->
        <div class="agent-dlg-form">
          <el-form :model="dlg.form" label-width="85px" size="default">
            <el-form-item label="名称"><el-input v-model="dlg.form.name" placeholder="如：智能客服"/></el-form-item>
            <el-form-item label="描述"><el-input v-model="dlg.form.desc" type="textarea" :rows="2" placeholder="简要描述智能体的用途..."/></el-form-item>

            <!-- 外观设置 -->
            <el-form-item label="外观">
              <div class="look-row">
                <div class="look-col">
                  <div class="look-label">图标</div>
                  <div class="icon-grid">
                    <div v-for="ic in icons" :key="ic" class="icon-cell" :class="{ sel: dlg.form.icon === ic }" @click="dlg.form.icon = ic" :title="ic">
                      <el-icon :size="18"><component :is="ic" /></el-icon>
                    </div>
                  </div>
                </div>
                <div class="look-col">
                  <div class="look-label">Emoji</div>
                  <div class="emoji-grid">
                    <span v-for="em in emojis" :key="em" class="emoji-cell" :class="{ sel: dlg.form.emoji === em }" @click="dlg.form.emoji = em">{{ em }}</span>
                  </div>
                </div>
              </div>
              <div class="look-label" style="margin-top:8px">背景色</div>
              <el-color-picker v-model="dlg.form.color" size="default" style="margin-top:4px"/>
            </el-form-item>

            <el-form-item label="基础 Agent">
              <el-select v-model="dlg.form.base_agent" multiple style="width:100%" clearable placeholder="不继承（纯自定义提示词）">
                <el-option label="企业经营管理 Agent (完整工具集)" value="internal-agent"/>
                <el-option label="售后管理 Agent (客服工具集)" value="support-agent"/>
                <el-option label="销售管理 Agent (CRM 工具集)" value="sales-agent"/>
              </el-select>
            </el-form-item>

            <el-form-item label="系统提示词">
              <el-input v-model="dlg.form.system_prompt" type="textarea" :rows="4" placeholder="留空继承基础Agent，或点击右侧 AI 生成自动填写..."/>
              <div style="display:flex;justify-content:flex-end;margin-top:6px">
                <el-button size="small" type="primary" :loading="promptGenerating" @click="generatePrompt">
                  <el-icon style="margin-right:4px"><MagicStick /></el-icon>AI 生成提示词
                </el-button>
              </div>
            </el-form-item>

            <el-form-item label="知识库">
              <el-select v-model="dlg.form.kb_article_ids" multiple filterable placeholder="选择知识库文章" style="width:100%">
                <el-option v-for="a in kbArticles" :key="a.id" :label="a.title" :value="a.id">
                  <span>{{ a.title }}</span>
                  <span style="float:right;color:#b8aad0;font-size:11px">{{ a.category }}</span>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="本地引用">
              <div class="folder-list">
                <div v-for="(fp, idx) in dlg.form.kb_folder_paths" :key="idx" class="folder-row">
                  <el-input v-model="dlg.form.kb_folder_paths[idx]" placeholder="文件夹或文件路径，如 E:\docs\产品" size="small" style="flex:1" />
                  <el-button size="small" @click="openBrowse(idx)">浏览</el-button>
                  <el-button size="small" type="danger" :icon="Delete" circle @click="dlg.form.kb_folder_paths.splice(idx,1)" />
                </div>
                <el-button size="small" type="primary" text @click="dlg.form.kb_folder_paths.push('')">
                  <el-icon><Plus /></el-icon> 添加
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 右侧预览卡片 -->
        <div class="agent-dlg-preview">
          <div class="preview-label">实时预览</div>
          <div class="agent-card mini" :style="{ '--card-bg': dlg.form.color || '#7c3aed' }">
            <div class="agent-header">
              <div class="agent-icon" :style="{ background: dlg.form.color || '#7c3aed' }">
                <span v-if="dlg.form.emoji" class="agent-emoji">{{ dlg.form.emoji }}</span>
                <el-icon v-else :size="22"><component :is="dlg.form.icon || 'Avatar'" /></el-icon>
              </div>
              <el-tag size="small" type="warning" effect="plain">自定义</el-tag>
            </div>
            <div class="agent-name">{{ dlg.form.name || '智能体名称' }}</div>
            <div class="agent-desc">{{ dlg.form.desc || '智能体描述预览...' }}</div>
            <div class="agent-meta" v-if="dlg.form.base_agent?.length">
              <span class="agent-base">基于 {{ dlg.form.base_agent.join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
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
import { Avatar, Cpu, Check, Setting, Plus, Delete, FolderOpened, Document, Loading, MagicStick } from '@element-plus/icons-vue'
import request from '../api/index.js'
const router = useRouter()

const agents = ref([])
const kbArticles = ref([])
const dlg = reactive({ visible: false, isEdit: false, form: {} })
const promptGenerating = ref(false)
const browseDlg = reactive({ visible: false, loading: false, current: '', parent: null, items: [], editIdx: -1 })
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

// ----- 浏览本地目录 -----
async function browsePath(p) {
  browseDlg.loading = true
  try {
    const { data } = await request.post('/knowledge-base/browse', { filePath: p || '' })
    if (data.code === 200) {
      browseDlg.current = data.data.current
      browseDlg.parent = data.data.parent
      browseDlg.items = data.data.items || []
    }
  } catch (e) {
    ElMessage.error('浏览失败')
  }
  browseDlg.loading = false
}
function openBrowse(idx) {
  browseDlg.editIdx = idx
  browseDlg.visible = true
  const p = dlg.form.kb_folder_paths[idx] || ''
  browsePath(p)
}
function selectBrowseItem(p) {
  if (browseDlg.editIdx >= 0) {
    dlg.form.kb_folder_paths[browseDlg.editIdx] = p
  }
  browseDlg.visible = false
}

// ----- 智能体 -----
function openAdd() {
  dlg.isEdit = false
  dlg.form = { name: '', desc: '', icon: 'Avatar', emoji: '🤖', color: '#7c3aed', base_agent: [], system_prompt: '', kb_article_ids: [], kb_folder_paths: [] }
  dlg.visible = true
}
function openEdit(agent) {
  dlg.isEdit = true
  const ids = agent.kb_article_ids ? agent.kb_article_ids.split(',').filter(Boolean) : []
  const fps = agent.kb_folder_paths ? agent.kb_folder_paths.split(',').filter(Boolean) : []
  const bas = agent.base_agent ? agent.base_agent.split(',').filter(Boolean) : []
  dlg.form = { ...agent, color: agent.bg || agent.color || '#7c3aed', base_agent: bas, kb_article_ids: ids, kb_folder_paths: fps.length ? fps : [] }
  dlg.visible = true
}
async function saveAgent() {
  if (!dlg.form.name) return ElMessage.warning('请输入名称')
  const payload = {
    ...dlg.form,
    base_agent: (dlg.form.base_agent || []).join(','),
    kb_article_ids: (dlg.form.kb_article_ids || []).join(','),
    kb_folder_paths: (dlg.form.kb_folder_paths || []).filter(Boolean).join(',')
  }
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
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该智能体？', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete('/agent-apps/' + id)
    await loadAgents()
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e?.action !== 'cancel') {
      ElMessage.error(e.response?.data?.message || '删除失败')
    }
  }
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
.agent-desc { font-size: 13px; color: #b8aad0; line-height: 1.5; margin-bottom: 12px; flex: 1; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
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

.browse-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; transition: background .15s;
}
.browse-item:hover { background: #f5f3ff; }

/* ── 添加/编辑对话框 ── */
.agent-dlg { display: flex; gap: 24px; }
.agent-dlg-form { flex: 1; min-width: 0; overflow-y: auto; max-height: 65vh; padding-right: 4px; }
.agent-dlg-preview { width: 220px; flex-shrink: 0; }
.preview-label { font-size: 11px; color: #b8aad0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: center; }

/* 预览卡片（缩小版） */
.agent-card.mini { padding: 16px; border-radius: 12px; }
.agent-card.mini .agent-icon { width: 40px; height: 40px; border-radius: 10px; }
.agent-card.mini .agent-emoji { font-size: 22px; }
.agent-card.mini .agent-name { font-size: 14px; margin-bottom: 4px; }
.agent-card.mini .agent-desc { font-size: 11px; margin-bottom: 8px; -webkit-line-clamp: 2; }
.agent-card.mini .agent-meta { margin-bottom: 0; }
.agent-card.mini .agent-header { margin-bottom: 10px; }

/* 外观设置 */
.look-row { display: flex; gap: 12px; }
.look-col { flex: 1; min-width: 0; }
.look-label { font-size: 11px; color: #909399; margin-bottom: 4px; }
.icon-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-cell {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; cursor: pointer; color: #909399; border: 1px solid transparent;
  transition: all .15s;
}
.icon-cell:hover { color: #7c3aed; background: #f5f3ff; }
.icon-cell.sel { color: #7c3aed; background: #ede9fe; border-color: #7c3aed; }
.emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.emoji-cell {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; cursor: pointer; font-size: 18px; border: 1px solid transparent;
  transition: all .15s;
}
.emoji-cell:hover { background: #f5f3ff; }
.emoji-cell.sel { background: #ede9fe; border-color: #7c3aed; }
.folder-list { width: 100%; }
.folder-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
</style>
