<template>
  <div class="sl-page">
    <div class="pg-hd">
      <span class="pg-title">技能库</span>
      <span class="pg-sub">AI 能力工具箱</span>
    </div>
    <div class="pg-body">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="我的技能" name="openclaw">
          <div class="category-bar">
            <span v-for="cat in categories" :key="cat.key"
              class="category-tag" :class="{ active: activeCategory === cat.key }"
              @click="activeCategory = cat.key">
              {{ cat.icon }} {{ cat.label }}
            </span>
            <div class="category-actions">
              <el-button size="small" text type="primary" :loading="translating" @click="translateAll">
                🌐 翻译全部
              </el-button>
              <el-upload
                :auto-upload="true"
                :show-file-list="false"
                :http-request="handleImportSkill"
                accept=".zip"
              >
                <el-button size="small" text type="primary" :loading="importing">📥 导入技能</el-button>
              </el-upload>
            </div>
          </div>
          <div class="skill-grid" style="margin-top:16px">
            <div v-for="s in filteredOpenclawSkills" :key="s.name" class="skill-card" @click="showDetail(s)">
              <div class="sc-icon">{{ s.emoji || '⚡' }}</div>
              <div class="sc-body">
                <div class="sc-top-row">
                  <div class="sc-name">{{ s.nameZh || s.displayName || s.name }}</div>
                  <el-switch v-model="s._enabled" size="small" @change="toggleSkill(s)" @click.stop />
                </div>
                <el-tooltip :content="s.descZh || s.description || s.summary || '暂无描述'" placement="top" :show-after="400" effect="light">
                  <div class="sc-desc">{{ s.descZh || s.description || s.summary || '暂无描述' }}</div>
                </el-tooltip>
                <div class="sc-bottom-row">
                  <el-select v-model="s._category" size="small" class="sc-cat-select"
                    @change="(v) => updateCategory(s, v)" @click.stop>
                    <el-option v-for="c in categories.slice(2)" :key="c.key" :label="c.icon + ' ' + c.label" :value="c.key" />
                  </el-select>
                  <span v-if="s.version" class="sc-meta">v{{ s.version }}</span>
                  <span class="sc-actions">
                    <el-button size="small" text @click.stop="exportSkill(s)" title="导出">📥</el-button>
                    <el-button size="small" text type="danger" @click.stop="deleteSkill(s)" title="卸载">🗑</el-button>
                  </span>
                </div>
              </div>
            </div>
            <div v-if="!filteredOpenclawSkills.length" class="skill-empty">
              <el-empty :description="activeCategory === 'recent' ? '暂无最近使用的技能' : activeCategory === 'all' ? '暂无已安装技能' : '暂无匹配技能'" />
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="ClawHub 市场" name="clawhub">
          <div class="clawhub-search">
            <el-input v-model="clawhubQuery" placeholder="搜索 ClawHub 技能..." clearable
              @keyup.enter="searchClawHub" style="width: 360px" />
            <el-button type="primary" @click="searchClawHub" :loading="clawhubLoading" :disabled="!clawhubQuery.trim()">搜索</el-button>
          </div>
          <div class="skill-grid" style="margin-top:16px">
            <div v-for="s in clawhubResults" :key="s.slug" class="skill-card">
              <div class="sc-icon">📦</div>
              <div class="sc-body">
                <div class="sc-top-row">
                  <div class="sc-name">{{ s.name }}</div>
                  <el-button v-if="isInstalled(s.slug)" size="small" disabled round>已安装</el-button>
                  <el-button v-else size="small" type="primary" round @click.stop="installSkill(s)" :loading="s._installing">安装</el-button>
                </div>
                <div class="sc-desc">{{ s.description || '暂无描述' }}</div>
                <span class="sc-meta" v-if="s.version">v{{ s.version }} · {{ s.owner || '' }}</span>
              </div>
            </div>
            <div v-if="!clawhubLoading && clawhubSearched && !clawhubResults.length" class="skill-empty">
              <el-empty description="未找到匹配技能" />
            </div>
            <div v-if="!clawhubSearched" class="skill-empty">
              <el-empty description="搜索 ClawHub 发现更多 AI 技能" />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="使用统计" name="stats">
          <div class="stats-panel">
            <div class="stats-summary">
              <div class="stat-card">
                <div class="stat-num">{{ skillStats.totalCalls || 0 }}</div>
                <div class="stat-label">总调用次数</div>
              </div>
              <div class="stat-card">
                <div class="stat-num">{{ skillStats.usageLog?.length || 0 }}</div>
                <div class="stat-label">已使用技能</div>
              </div>
              <el-button size="small" @click="checkUpdates" :loading="checkingUpdates">🔍 检查更新</el-button>
              <el-button size="small" @click="loadSkillStats" :loading="statsLoading">🔄 刷新</el-button>
            </div>
            <div v-if="updateInfo.length" class="update-alerts">
              <div v-for="u in updateInfo" :key="u.name" class="update-item">
                ⚡ <b>{{ u.name }}</b>: 本地 {{ u.localVersion }} → ClawHub {{ u.remoteVersion }}
              </div>
            </div>
            <h4 style="margin:16px 0 8px;color:#4a3f5e">技能调用排行</h4>
            <table class="stats-table" v-if="skillStats.usageLog?.length">
              <thead><tr><th>技能命令</th><th>调用次数</th><th>最近使用</th></tr></thead>
              <tbody>
                <tr v-for="u in skillStats.usageLog" :key="u.command">
                  <td>{{ u.command }}</td>
                  <td>{{ u.count }}</td>
                  <td>{{ fmtTime(u.last_used) }}</td>
                </tr>
              </tbody>
            </table>
            <el-empty v-else description="暂无使用记录" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 技能详情弹窗 -->
    <el-dialog v-model="detailDlg.visible" :title="detailDlg.title" width="700px" :close-on-click-modal="false">
      <div v-if="detailDlg.loading" style="text-align:center;padding:40px 0">
        <el-icon class="is-loading"><svg viewBox="0 0 1024 1024" width="24" height="24"><path d="M512 64a448 448 0 110 896 448 448 0 010-896z" fill="#ccc"/><path d="M512 64a448 448 0 01320 128" stroke="#409EFF" stroke-width="32" fill="none" stroke-linecap="round"/></svg></el-icon>
        <p style="color:#909399;margin-top:12px">加载中...</p>
      </div>
      <div v-else>
        <div v-if="detailDlg.desc" class="detail-desc">{{ detailDlg.desc }}</div>
        <div v-if="detailDlg.dependents?.length" style="margin-bottom:12px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:13px">
          🔗 被以下 Agent 引用：
          <span v-for="d in detailDlg.dependents" :key="d.id" style="margin-left:4px;color:#7c3aed;font-weight:500">{{ d.name }}</span>
        </div>
        <div class="markdown-body" v-html="detailDlg.content"></div>
      </div>
      <template #footer>
        <el-button @click="detailDlg.visible=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import request from '../api/index.js'

marked.setOptions({ breaks: true, gfm: true })

const activeTab = ref('openclaw')

// ─── 分类 & 我的技能 ───
const activeCategory = ref('all')
const recentUsage = ref([])

const categories = [
  { key: 'all', label: '全部', icon: '📋' },

  { key: 'design', label: '设计多媒体', icon: '🎨' },
  { key: 'dev', label: '开发编程', icon: '🛠️' },
  { key: 'itops', label: 'IT 运维与安全', icon: '🔒' },
  { key: 'data', label: '数据分析', icon: '📊' },
  { key: 'ai', label: 'AI Agent', icon: '🤖' },
  { key: 'content', label: '内容创作', icon: '✍️' },
  { key: 'knowledge', label: '知识管理', icon: '📚' },
  { key: 'business', label: '商业运营', icon: '💼' },
  { key: 'edu', label: '教育学习', icon: '🎓' },
  { key: 'industry', label: '行业专业', icon: '🏭' },
  { key: 'office', label: '办公效率', icon: '⚡' },
  { key: 'life', label: '生活服务', icon: '🌟' },
  { key: 'external', label: '外部技能', icon: '📦' }
]

const CATEGORY_KEYWORDS = {
  office: ['productivity','workflow','automation','task','schedule','calendar','todo','email','meeting','batch','organize','reminder','deadline','project','note','ppt','presentation','slide','document','word','pdf','excel','markdown','format','convert','template','collab'],
  business: ['business','crm','sales','market','finance','hr','erp','supply','inventory','order','customer','lead','contract','invoice','payment','account','ecommerce','shop','revenue','tax','payroll','recruitment'],
  edu: ['education','learn','course','tutorial','quiz','exam','study','teach','train','academy','student','flashcard','explain','lesson','textbook','classroom','skill'],
  industry: ['legal','medical','health','real estate','logistics','manufacture','retail','compliance','regulation','clinic','construction','pharma','insurance','bank','industry','bid','procurement'],
  data: ['analytics','visualization','chart','dashboard','bi','etl','csv','spreadsheet','metric','kpi','statistics','tableau','bigquery','databricks','database','sql','parse','extract','transform','report','stats','query','schema','pandas','numpy','jupyter'],
  itops: ['security','auth','devops','monitor','deploy','server','cloud','network','backup','ci','cd','infra','encrypt','scan','audit','permission','sre','admin','linux','docker','kubernetes','firewall','proxy','dns','ssl','vpn','log','ssh','nginx','terraform','ansible','vault','secret','policy'],
  dev: ['dev','code','git','browser','api','cli','npm','node','python','debug','terminal','shell','command','sdk','program','javascript','typescript','rust','golang','java','compile','build','ide','vscode','lint','commit','repo','package','plugin','framework','library','frontend','backend','css','html','react','vue','swift'],
  content: ['content','write','blog','article','social','copywriting','seo','creative','text','story','script','newsletter','tweet','publish','headline','medium','post','essay','translate','summary','caption','writing'],
  knowledge: ['knowledge','wiki','memory','faq','kb','retrieve','catalog','archive','library','search','obsidian','notion','index','reference','handbook','guide','manual'],
  ai: ['llm','gpt','claude','agent','chatbot','prompt','rag','embedding','token','copilot','assistant','reasoning','nlp','chat','model','language','completion','vector','llama','mistral','gemini','openai','anthropic','deepseek','qwen','generate','generative','ai'],
  life: ['travel','food','fitness','weather','shop','news','entertainment','fun','hobby','personal','lifestyle','recipe','restaurant','game','sport','movie','book','pet','music'],
  design: ['image','video','audio','photo','picture','graphic','draw','art','animation','voice','speech','icon','logo','color','render','3d','canvas','svg','font','filter','effect','camera','sound','design','avatar','screenshot','thumbnail','banner']
}

function getSkillCategory(s) {
  const text = ((s.name || '') + ' ' + (s.displayName || '') + ' ' + (s.description || s.summary || '')).toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return cat
    }
  }
  return 'external'
}

function matchRecentUsage(s) {
  const name = (s.name || '').toLowerCase()
  const displayName = (s.displayName || '').toLowerCase()
  const skillKey = (s.skillKey || '').toLowerCase()
  for (const log of recentUsage.value) {
    const cmd = (log.command || '').toLowerCase()
    if (!cmd) continue
    if ((name && cmd.includes(name)) || (displayName && cmd.includes(displayName)) || (skillKey && cmd === skillKey)) return true
  }
  return false
}

function skillCategory(s) {
  return s.category || getSkillCategory(s)
}

const filteredOpenclawSkills = computed(() => {
  if (activeCategory.value === 'recent') {
    return openclawSkills.value.filter(s => matchRecentUsage(s))
  }
  if (activeCategory.value === 'all') return openclawSkills.value
  return openclawSkills.value.filter(s => skillCategory(s) === activeCategory.value)
})

// ClawHub state
const clawhubQuery = ref('')
const clawhubResults = ref([])
const clawhubLoading = ref(false)
const clawhubSearched = ref(false)
const installedSlugs = ref(new Set())
const translating = ref(false)
const importing = ref(false)
const openclawSkills = ref([])
const detailDlg = reactive({ visible: false, title: '', desc: '', content: '', loading: false, dependents: [] })
const skillStats = ref({ totalCalls: 0, usageLog: [], recentCalls: [] })
const statsLoading = ref(false)
const updateInfo = ref([])
const checkingUpdates = ref(false)

const CATEGORY_EMOJI = {
  design: '🎨', dev: '🛠️', itops: '🔒', data: '📊', ai: '🤖',
  content: '✍️', knowledge: '📚', business: '💼', edu: '🎓',
  industry: '🏭', office: '⚡', life: '🌟', external: '📦'
}
function skillEmoji(s) {
  const name = (s.name || s.displayName || '').toLowerCase()
  if (name.includes('ppt') || name.includes('slide')) return '📊'
  if (name.includes('excel') || name.includes('sheet')) return '📈'
  if (name.includes('word') || name.includes('doc')) return '📝'
  if (name.includes('code') || name.includes('dev')) return '💻'
  if (name.includes('image') || name.includes('photo')) return '🖼️'
  if (name.includes('video')) return '🎬'
  if (name.includes('audio') || name.includes('music')) return '🎵'
  const cat = getSkillCategory(s)
  return CATEGORY_EMOJI[cat] || '⚡'
}


function isInstalled(slug) {
  return installedSlugs.value.has(slug)
}


async function loadOpenClawSkills() {
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      const skills = data.data.skills
      openclawSkills.value = skills.map(s => ({
        ...s,
        emoji: skillEmoji(s),
        _category: s.category || getSkillCategory(s),
        _enabled: !s.disabled
      }))
      installedSlugs.value = new Set(skills.map(s => s.name).filter(Boolean))
    }
  } catch {}
}

async function toggleSkill(s) {
  const enabled = s._enabled
  try {
    await request.put('/agent-openclaw-skills/toggle', { skillKey: s.skillKey, enabled })
    s.disabled = !enabled
    loadRecentUsage()
  } catch (e) {
    s._enabled = !enabled  // 还原开关状态
    ElMessage.error('操作失败: ' + (e.response?.data?.message || e.message))
  }
}

async function loadRecentUsage() {
  try {
    const { data } = await request.get('/agent-openclaw-skills/recent-usage', { params: { limit: 50 } })
    if (data.code === 200) {
      recentUsage.value = data.data || []
    }
  } catch { recentUsage.value = [] }
}

async function handleImportSkill(options) {
  importing.value = true
  const form = new FormData()
  form.append('file', options.file)
  try {
    const { data: res } = await request.post('/clawhub/import', form)
    if (res.code === 200) {
      ElMessage.success(res.message || '导入成功')
      loadOpenClawSkills()
    } else {
      ElMessage.error(res.message || '导入失败')
    }
  } catch (e) {
    ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message))
  }
  importing.value = false
}

async function translateAll() {
  translating.value = true
  try {
    const { data } = await request.post('/clawhub/translate-batch')
    if (data.code === 200) {
      ElMessage.success(`翻译完成：${data.data.translated}/${data.data.total}`)
      loadOpenClawSkills()
    }
  } catch (e) {
    ElMessage.error('翻译失败: ' + (e.response?.data?.message || e.message))
  }
  translating.value = false
}

async function searchClawHub() {
  if (!clawhubQuery.value.trim()) return
  clawhubLoading.value = true
  clawhubSearched.value = true
  try {
    const { data } = await request.get('/clawhub/search', { params: { q: clawhubQuery.value, limit: 20 } })
    clawhubResults.value = (data.data || []).map(s => ({ ...s, _installing: false }))
  } catch (e) {
    ElMessage.error('搜索失败: ' + (e.response?.data?.message || e.message))
  }
  clawhubLoading.value = false
}

async function showDetail(s) {
  detailDlg.visible = true
  detailDlg.title = s.nameZh || s.displayName || s.name
  detailDlg.desc = s.descZh || s.description || ''
  detailDlg.content = ''
  detailDlg.loading = true
  detailDlg.dependents = []
  try {
    const skillKey = s.skillKey || s.name
    const [readmeRes, depRes] = await Promise.all([
      request.get('/clawhub/readme/' + encodeURIComponent(skillKey)).catch(() => ({ data: { code: 200, data: { content: '' } } })),
      request.get('/clawhub/skills/' + encodeURIComponent(skillKey) + '/dependents').catch(() => ({ data: { data: [] } }))
    ])
    if (readmeRes.data?.code === 200) {
      detailDlg.content = marked.parse(readmeRes.data.data.content || '')
    }
    detailDlg.dependents = depRes.data?.data || []
  } catch (e) {
    detailDlg.content = '<p style="color:#909399">加载失败: ' + (e.response?.data?.message || e.message) + '</p>'
  }
  detailDlg.loading = false
}

function exportSkill(s) {
  const skillKey = s.skillKey || s.name
  const skillName = (s.nameZh || s.displayName || s.name) + '.zip'
  try {
    const token = localStorage.getItem('token') || ''
    const a = document.createElement('a')
    a.href = `/api/clawhub/skills/${encodeURIComponent(skillKey)}/export?token=${encodeURIComponent(token)}`
    a.download = skillName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (e) {
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}

async function deleteSkill(s) {
  const skillKey = s.skillKey || s.name
  const skillName = s.nameZh || s.displayName || s.name
  try {
    await ElMessageBox.confirm(`确定要卸载「${skillName}」吗？此操作不可恢复。`, '确认卸载', {
      confirmButtonText: '卸载',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete('/clawhub/skills/' + encodeURIComponent(skillKey))
    ElMessage.success('已卸载')
    loadOpenClawSkills()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('卸载失败: ' + (e.response?.data?.message || e.message))
  }
}

async function updateCategory(s, category) {
  try {
    await request.put('/clawhub/category', { skillKey: s.skillKey, category })
    s.category = category
    ElMessage.success('分类已更新')
  } catch (e) {
    ElMessage.error('更新分类失败: ' + (e.response?.data?.message || e.message))
  }
}

async function installSkill(s) {
  s._installing = true
  try {
    await request.post('/clawhub/install', { slug: s.slug })
    ElMessage.success(`已安装技能: ${s.name}`)
    installedSlugs.value.add(s.slug)
    loadOpenClawSkills()
  } catch (e) {
    ElMessage.error('安装失败: ' + (e.response?.data?.message || e.message))
  }
  s._installing = false
}




async function loadSkillStats() {
  statsLoading.value = true
  try {
    const { data } = await request.get('/clawhub/skills/stats')
    skillStats.value = data.data || { totalCalls: 0, usageLog: [], recentCalls: [] }
  } catch { skillStats.value = { totalCalls: 0, usageLog: [], recentCalls: [] } }
  statsLoading.value = false
}

async function checkUpdates() {
  checkingUpdates.value = true
  try {
    const { data } = await request.post('/clawhub/skills/check-updates')
    updateInfo.value = data.data?.updates || []
    if (updateInfo.value.length) {
      ElMessage.warning(`发现 ${updateInfo.value.length} 个技能有新版本`)
    } else {
      ElMessage.success('所有技能均为最新版本')
    }
  } catch { ElMessage.error('检查更新失败') }
  checkingUpdates.value = false
}

async function loadCategories() {
  try {
    const { data } = await request.get('/clawhub/categories')
    if (data.data?.length) {
      const cats = [{ key: 'all', label: '全部', icon: '📋' }]
      const emojiMap = { design:'🎨', dev:'🛠️', itops:'🔒', data:'📊', ai:'🤖', content:'✍️', knowledge:'📚', business:'💼', edu:'🎓', industry:'🏭', office:'⚡', life:'🌟', external:'📦' }
      for (const c of data.data) {
        cats.push({ key: c.key, label: c.label, icon: emojiMap[c.key] || '📦' })
      }
      categories.length = 0
      categories.push(...cats)
    }
  } catch {}
}

watch(activeTab, (tab) => {
  if (tab === 'openclaw') { loadOpenClawSkills(); loadRecentUsage(); activeCategory.value = 'all' }
  if (tab === 'stats') { loadSkillStats() }
})
onMounted(() => { loadOpenClawSkills(); loadRecentUsage(); loadCategories() })
</script>

<style scoped>
.sl-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.pg-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.pg-body { flex: 1; padding: 24px; overflow-y: auto; }

.skill-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.skill-card {
  display: flex; gap: 14px;
  width: 340px; padding: 18px;
  background: #fff; border: 1px solid #f0ecfc; border-radius: 14px;
  cursor: pointer; transition: all .2s;
}
.skill-card:hover { border-color: #7c3aed; box-shadow: 0 6px 20px rgba(124,58,237,.1); transform: translateY(-2px); }
.sc-icon { width: 48px; height: 48px; border-radius: 12px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.sc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.sc-top-row { display: flex; align-items: center; justify-content: space-between; }
.sc-name { font-size: 15px; font-weight: 600; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-desc { font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-bottom-row { display: flex; align-items: center; justify-content: space-between; }
.sc-cat-select { --el-select-width: 130px; }
.sc-cat-select :deep(.el-select__wrapper) { background: #f5f3ff; border: none; box-shadow: none; padding: 0 8px; min-height: 24px; }
.sc-cat-select :deep(.el-select__placeholder) { color: #7c3aed; font-size: 12px; }
.sc-cat-select :deep(.el-select__selected-item) { font-size: 12px; color: #7c3aed; }
.sc-meta { font-size: 11px; color: #b8aad0; }
.sc-actions { display: flex; gap: 2px; }
.sc-actions .el-button { padding: 2px 4px; font-size: 16px; }
.skill-empty { padding: 60px 0; text-align: center; width: 100%; }

/* switch 颜色匹配主题 */
.sc-top-row :deep(.el-switch.is-checked .el-switch__core) { background-color: #7c3aed; border-color: #7c3aed; }

/* 分类标签栏 */
.category-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.category-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 18px; font-size: 13px;
  background: #f5f3ff; color: #7c7b8e; cursor: pointer; transition: all .2s;
  user-select: none; border: 1px solid transparent;
}
.category-tag:hover { border-color: #7c3aed; color: #7c3aed; }
.category-tag.active { background: #7c3aed; color: #fff; }
.category-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.category-actions .el-upload { display: inline-flex; }
.cat-count { font-size: 11px; background: rgba(255,255,255,.3); padding: 0 6px; border-radius: 8px; }

.clawhub-search { display: flex; gap: 10px; align-items: center; }

/* 详情弹窗 */
.detail-body { max-height: 55vh; overflow-y: auto; }
.detail-desc { font-size: 14px; color: #606266; margin-bottom: 16px; padding: 10px 14px; background: #f8f7ff; border-radius: 8px; border-left: 3px solid #7c3aed; }
.detail-section { margin-top: 8px; }
.detail-section-title { font-size: 13px; font-weight: 600; color: #4a3f5e; margin-bottom: 8px; }
.detail-content { font-size: 13px; color: #4a3f5e; line-height: 1.8; }
.detail-content :deep(h2) { font-size: 15px; margin: 14px 0 6px; color: #4a3f5e; }
.detail-content :deep(h3) { font-size: 13px; margin: 10px 0 4px; }
.detail-content :deep(ul), .detail-content :deep(ol) { padding-left: 18px; margin: 6px 0; }
.detail-content :deep(li) { margin: 3px 0; }
.detail-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.detail-content :deep(pre) { background: #2d2640; color: #e8e0f0; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }

/* PPT 生成 */
.ppt-prompt-label { font-size: 13px; color: #606266; margin-bottom: 8px; }
.ppt-examples { margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ppt-examples-label { font-size: 12px; color: #b8aad0; }
.ppt-eg-tag { cursor: pointer; }
.ppt-eg-tag:hover { background: #ede9fe; color: #7c3aed; }
.ppt-result { padding: 20px 0; }
</style>
