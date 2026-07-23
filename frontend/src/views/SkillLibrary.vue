<template>
  <div class="skill-hub">
    <!-- Hero -->
    <div class="hub-hero">
      <div class="hero-text">
        <h1 class="hero-title">技能库</h1>
        <p class="hero-sub">AI 能力工具箱 — 安装、配置、绑定技能到智能体，扩展 AI 能力边界</p>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="hero-stat-num">{{ openclawSkills.length }}</span>
          <span class="hero-stat-label">已安装</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-num">{{ enabledCount }}</span>
          <span class="hero-stat-label">已启用</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-num">{{ skillStats.totalCalls || 0 }}</span>
          <span class="hero-stat-label">总调用</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="hub-body">
      <el-tabs v-model="activeTab" class="hub-tabs">
        <!-- ═══ 我的技能 ═══ -->
        <el-tab-pane name="openclaw">
          <template #label>
            <span class="tab-label">📦 我的技能</span>
            <span class="tab-badge">{{ openclawSkills.length }}</span>
          </template>

          <!-- 分类筛选 -->
          <div class="cat-row">
            <span v-for="cat in categories" :key="cat.key"
              class="cat-chip" :class="{ active: activeCategory === cat.key }"
              @click="activeCategory = cat.key">
              {{ cat.icon }} {{ cat.label }}
              <span v-if="cat.key === 'all'" class="cat-chip-num">{{ openclawSkills.length }}</span>
            </span>
          </div>

          <!-- 操作栏 -->
          <div class="action-row">
            <el-input v-model="skillSearch" placeholder="搜索技能..." clearable size="default" style="width:260px" />
            <div class="action-gap" />
            <el-button size="default" :loading="translating" @click="translateAll">🌐 翻译全部</el-button>
            <el-upload :auto-upload="true" :show-file-list="false" :http-request="handleImportSkill" accept=".zip">
              <el-button size="default" :loading="importing">📥 导入技能</el-button>
            </el-upload>
            <el-button size="default" :loading="checkingUpdates" @click="checkUpdates">🔍 检查更新</el-button>
          </div>

          <!-- 更新提醒 -->
          <div v-if="updateInfo.length" class="update-bar">
            <span v-for="u in updateInfo" :key="u.name" class="update-chip">
              ⚡ {{ u.name }}: {{ u.localVersion }} → {{ u.remoteVersion }}
            </span>
          </div>

          <!-- 卡片网格 -->
          <div v-if="!loading" class="skill-grid">
            <div v-for="s in filteredSkills" :key="s.name" class="skill-card" @click="showDetail(s)">
              <!-- 卡片顶部带色彩 -->
              <div class="card-accent" :style="{ background: catColor(skillCategory(s)) }"></div>
              <div class="card-content">
                <div class="card-icon" :style="{ background: catBg(skillCategory(s)) }">{{ s.emoji || '⚡' }}</div>
                <div class="card-info">
                  <div class="card-name">{{ s.nameZh || s.displayName || s.name }}</div>
                  <div class="card-desc">{{ truncate(s.descZh || s.description || s.summary || '暂无描述', 60) }}</div>
                  <div class="card-meta">
                    <span class="meta-cat" :style="{ color: catColor(skillCategory(s)) }">{{ catLabel(skillCategory(s)) }}</span>
                    <span v-if="s.version" class="meta-ver">v{{ s.version }}</span>
                    <span v-if="s.bundled" class="meta-tag">内置</span>
                  </div>
                </div>
                <div class="card-switch">
                  <el-switch v-model="s._enabled" size="small" @change="toggleSkill(s)" @click.stop />
                </div>
              </div>
            </div>
            <div v-if="!filteredSkills.length" class="skill-empty">
              <el-empty :description="activeCategory === 'all' ? '暂无已安装技能，前往 ClawHub 市场发现更多' : '该分类暂无技能'" />
            </div>
          </div>
          <!-- 骨架屏 -->
          <div v-else class="skill-grid">
            <div v-for="i in 6" :key="i" class="skill-card skeleton-card">
              <div class="card-accent skeleton-bg"></div>
              <div class="card-content">
                <div class="card-icon skeleton-bg" style="width:44px;height:44px;border-radius:12px"></div>
                <div class="card-info" style="flex:1">
                  <div class="skeleton-bg" style="width:60%;height:18px;border-radius:4px;margin-bottom:6px"></div>
                  <div class="skeleton-bg" style="width:100%;height:14px;border-radius:4px;margin-bottom:4px"></div>
                  <div class="skeleton-bg" style="width:40%;height:12px;border-radius:4px"></div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ═══ ClawHub 市场 ═══ -->
        <el-tab-pane name="clawhub">
          <template #label><span class="tab-label">🏪 ClawHub 市场</span></template>
          <div class="market-panel">
            <div class="market-search">
              <el-input v-model="clawhubQuery" placeholder="搜索 ClawHub 技能..." size="large" clearable
                @keyup.enter="searchClawHub" style="width:400px" />
              <el-button type="primary" size="large" @click="searchClawHub" :loading="clawhubLoading" :disabled="!clawhubQuery.trim()">搜索</el-button>
            </div>
            <div class="skill-grid" style="margin-top:20px">
              <div v-for="s in clawhubResults" :key="s.slug" class="skill-card market-card">
                <div class="card-accent" style="background:linear-gradient(135deg,#7c3aed,#6366f1)"></div>
                <div class="card-content">
                  <div class="card-icon" style="background:#f5f3ff">📦</div>
                  <div class="card-info">
                    <div class="card-name">{{ s.displayName || s.name }}</div>
                    <div class="card-desc">{{ truncate(s.description || s.summary || '暂无描述', 70) }}</div>
                    <div class="card-meta">
                      <span class="meta-ver">⬇ {{ s.downloads || 0 }}</span>
                      <span v-if="s.owner" class="meta-cat">@{{ s.owner.handle || s.owner }}</span>
                    </div>
                  </div>
                  <div class="card-action">
                    <el-button v-if="isInstalled(s.slug)" size="small" disabled round>✓ 已安装</el-button>
                    <el-button v-else size="small" type="primary" round @click.stop="installSkill(s)" :loading="s._installing">安装</el-button>
                  </div>
                </div>
              </div>
              <div v-if="!clawhubLoading && clawhubSearched && !clawhubResults.length" class="skill-empty">
                <el-empty description="未找到匹配技能" />
              </div>
              <div v-if="!clawhubSearched" class="skill-empty">
                <el-empty description="搜索 ClawHub 发现更多 AI 技能" />
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ═══ 使用统计 ═══ -->
        <el-tab-pane name="stats">
          <template #label><span class="tab-label">📊 使用统计</span></template>
          <div class="stats-panel">
            <div class="stats-row">
              <div class="stat-box">
                <div class="stat-box-num">{{ skillStats.totalCalls || 0 }}</div>
                <div class="stat-box-label">总调用次数</div>
              </div>
              <div class="stat-box">
                <div class="stat-box-num">{{ skillStats.usageLog?.length || 0 }}</div>
                <div class="stat-box-label">已使用技能数</div>
              </div>
              <div class="stat-box">
                <div class="stat-box-num">{{ enabledCount }}</div>
                <div class="stat-box-label">已启用技能</div>
              </div>
              <div class="stat-box">
                <div class="stat-box-num">{{ openclawSkills.length }}</div>
                <div class="stat-box-label">已安装技能</div>
              </div>
              <el-button style="margin-left:auto" @click="loadSkillStats" :loading="statsLoading">🔄 刷新</el-button>
            </div>
            <div class="stats-table-wrap">
              <table class="stats-table" v-if="skillStats.usageLog?.length">
                <thead><tr><th>#</th><th>技能命令</th><th>调用次数</th><th>最近使用</th></tr></thead>
                <tbody>
                  <tr v-for="(u, i) in skillStats.usageLog" :key="u.command">
                    <td class="rank-cell">{{ i + 1 }}</td>
                    <td><code>{{ u.command }}</code></td>
                    <td><b>{{ u.count }}</b></td>
                    <td class="time-cell">{{ fmtTime(u.last_used) }}</td>
                  </tr>
                </tbody>
              </table>
              <el-empty v-else description="暂无使用记录" :image-size="80" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- ═══ 详情弹窗 ═══ -->
    <el-dialog v-model="detailDlg.visible" :title="detailDlg.title" width="760px" :close-on-click-modal="false" class="skill-detail-dlg">
      <div v-if="detailDlg.loading" class="detail-loading">
        <div class="loading-spin"></div>
        <p>加载技能详情...</p>
      </div>
      <div v-else class="detail-body">
        <div v-if="detailDlg.desc" class="detail-desc">{{ detailDlg.desc }}</div>
        <div v-if="detailDlg.dependents?.length" class="detail-deps">
          🔗 被以下 Agent 引用：
          <span v-for="d in detailDlg.dependents" :key="d.id" class="dep-link">{{ d.name }}</span>
        </div>
        <div class="markdown-body" v-html="detailDlg.content"></div>
      </div>
      <template #footer>
        <div class="dlg-footer">
          <el-button v-if="detailDlg.skill" size="small" @click="exportSkill(detailDlg.skill)">📥 导出</el-button>
          <el-button v-if="detailDlg.skill" size="small" type="danger" @click="deleteSkill(detailDlg.skill)">🗑 卸载</el-button>
          <div class="dlg-gap" />
          <el-button @click="detailDlg.visible=false">关闭</el-button>
        </div>
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

// ─── 常量 ───
const CAT_SPEC = {
  office:    { label: '办公效率', icon: '⚡', color: '#7c3aed', bg: '#ede9fe' },
  business:  { label: '商业运营', icon: '💼', color: '#6366f1', bg: '#eef2ff' },
  dev:       { label: '开发编程', icon: '🛠️', color: '#059669', bg: '#ecfdf5' },
  data:      { label: '数据分析', icon: '📊', color: '#d97706', bg: '#fffbeb' },
  ai:        { label: 'AI Agent', icon: '🤖', color: '#dc2626', bg: '#fef2f2' },
  content:   { label: '内容创作', icon: '✍️', color: '#db2777', bg: '#fdf2f8' },
  knowledge: { label: '知识管理', icon: '📚', color: '#0891b2', bg: '#ecfeff' },
  design:    { label: '设计多媒体', icon: '🎨', color: '#ea580c', bg: '#fff7ed' },
  itops:     { label: 'IT 运维', icon: '🔒', color: '#4b5563', bg: '#f3f4f6' },
  edu:       { label: '教育学习', icon: '🎓', color: '#2563eb', bg: '#eff6ff' },
  industry:  { label: '行业专业', icon: '🏭', color: '#9333ea', bg: '#faf5ff' },
  life:      { label: '生活服务', icon: '🌟', color: '#f59e0b', bg: '#fffbeb' },
  external:  { label: '外部技能', icon: '📦', color: '#94a3b8', bg: '#f8fafc' },
}

// ─── 状态 ───
const activeTab = ref('openclaw')
const activeCategory = ref('all')
const skillSearch = ref('')
const loading = ref(true)
const openclawSkills = ref([])
const recentUsage = ref([])
const translating = ref(false)
const importing = ref(false)
const checkingUpdates = ref(false)
const updateInfo = ref([])
const skillStats = ref({ totalCalls: 0, usageLog: [], recentCalls: [] })
const statsLoading = ref(false)

const detailDlg = reactive({ visible: false, title: '', desc: '', content: '', loading: false, dependents: [], skill: null })

// ClawHub
const clawhubQuery = ref('')
const clawhubResults = ref([])
const clawhubLoading = ref(false)
const clawhubSearched = ref(false)
const installedSlugs = ref(new Set())

// ─── 分类 ───
const categories = Object.entries(CAT_SPEC).map(([k, v]) => ({ key: k, label: v.label, icon: v.icon }))
categories.unshift({ key: 'all', label: '全部', icon: '📋' })

// ─── 计算属性 ───
const enabledCount = computed(() => openclawSkills.value.filter(s => s._enabled).length)

const filteredSkills = computed(() => {
  let list = openclawSkills.value
  if (activeCategory.value !== 'all') {
    list = list.filter(s => skillCategory(s) === activeCategory.value)
  }
  if (skillSearch.value.trim()) {
    const q = skillSearch.value.toLowerCase()
    list = list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.nameZh || s.displayName || '').toLowerCase().includes(q))
  }
  return list
})

// ─── 分类辅助 ───
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
function skillCategory(s) { return s._category || s.category || getSkillCategory(s) }
function catColor(cat) { return CAT_SPEC[cat]?.color || '#94a3b8' }
function catBg(cat) { return CAT_SPEC[cat]?.bg || '#f8fafc' }
function catLabel(cat) { return CAT_SPEC[cat]?.label || '外部' }
function truncate(s, n) { return (s || '').length > n ? s.slice(0, n) + '...' : s }
function fmtTime(t) { if (!t) return '-'; return new Date(t).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }
function isInstalled(slug) { return installedSlugs.value.has(slug) }

function skillEmoji(s) {
  const name = (s.name || s.displayName || '').toLowerCase()
  if (name.includes('ppt') || name.includes('slide')) return '📊'
  if (name.includes('excel') || name.includes('sheet') || name.includes('xlsx')) return '📈'
  if (name.includes('word') || name.includes('docx')) return '📝'
  if (name.includes('code') || name.includes('git') || name.includes('dev')) return '💻'
  if (name.includes('image') || name.includes('photo')) return '🖼️'
  if (name.includes('video')) return '🎬'
  if (name.includes('audio') || name.includes('music')) return '🎵'
  if (name.includes('web') || name.includes('browser')) return '🌐'
  if (name.includes('search')) return '🔍'
  if (name.includes('pdf')) return '📄'
  if (name.includes('finance') || name.includes('fund')) return '💰'
  if (name.includes('law') || name.includes('legal')) return '⚖️'
  if (name.includes('server') || name.includes('health')) return '🖥️'
  if (name.includes('log')) return '📋'
  if (name.includes('memory')) return '🧠'
  if (name.includes('report')) return '📊'
  if (name.includes('script') || name.includes('video')) return '🎬'
  if (name.includes('copy') || name.includes('social')) return '✍️'
  if (name.includes('supply') || name.includes('chain')) return '🔗'
  if (name.includes('comment')) return '💬'
  if (name.includes('hot') || name.includes('news')) return '🔥'
  const cat = getSkillCategory(s)
  return CAT_SPEC[cat]?.icon || '⚡'
}

// ─── 数据加载 ───
async function loadOpenClawSkills() {
  loading.value = true
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      openclawSkills.value = data.data.skills.map(s => ({
        ...s,
        emoji: skillEmoji(s),
        _category: s.category || getSkillCategory(s),
        _enabled: !s.disabled
      }))
      installedSlugs.value = new Set(data.data.skills.map(s => s.name).filter(Boolean))
    }
  } catch {}
  loading.value = false
}

async function loadRecentUsage() {
  try {
    const { data } = await request.get('/agent-openclaw-skills/recent-usage', { params: { limit: 50 } })
    if (data.code === 200) recentUsage.value = data.data || []
  } catch { recentUsage.value = [] }
}

async function loadSkillStats() {
  statsLoading.value = true
  try {
    const { data } = await request.get('/clawhub/skills/stats')
    skillStats.value = data.data || { totalCalls: 0, usageLog: [], recentCalls: [] }
  } catch { skillStats.value = { totalCalls: 0, usageLog: [], recentCalls: [] } }
  statsLoading.value = false
}

// ─── 技能操作 ───
async function toggleSkill(s) {
  const enabled = s._enabled
  try {
    await request.put('/agent-openclaw-skills/toggle', { skillKey: s.skillKey, enabled })
    s.disabled = !enabled
    loadRecentUsage()
  } catch (e) {
    s._enabled = !enabled
    ElMessage.error('操作失败: ' + (e.response?.data?.message || e.message))
  }
}

async function showDetail(s) {
  detailDlg.visible = true
  detailDlg.title = s.nameZh || s.displayName || s.name
  detailDlg.desc = s.descZh || s.description || ''
  detailDlg.content = ''
  detailDlg.loading = true
  detailDlg.dependents = []
  detailDlg.skill = s
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
    detailDlg.content = '<p style="color:#909399">加载失败</p>'
  }
  detailDlg.loading = false
}

async function handleImportSkill(options) {
  importing.value = true
  const form = new FormData(); form.append('file', options.file)
  try {
    const { data: res } = await request.post('/clawhub/import', form)
    if (res.code === 200) { ElMessage.success(res.message || '导入成功'); loadOpenClawSkills() }
    else ElMessage.error(res.message || '导入失败')
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message)) }
  importing.value = false
}

async function translateAll() {
  translating.value = true
  try {
    const { data } = await request.post('/clawhub/translate-batch')
    if (data.code === 200) { ElMessage.success(`翻译完成：${data.data.translated}/${data.data.total}`); loadOpenClawSkills() }
  } catch (e) { ElMessage.error('翻译失败: ' + (e.response?.data?.message || e.message)) }
  translating.value = false
}

async function checkUpdates() {
  checkingUpdates.value = true
  try {
    const { data } = await request.post('/clawhub/skills/check-updates')
    updateInfo.value = data.data?.updates || []
    if (updateInfo.value.length) ElMessage.warning(`发现 ${updateInfo.value.length} 个技能有新版本`)
    else ElMessage.success('所有技能均为最新版本')
  } catch { ElMessage.error('检查更新失败') }
  checkingUpdates.value = false
}

function exportSkill(s) {
  const skillKey = s.skillKey || s.name
  const skillName = (s.nameZh || s.displayName || s.name) + '.zip'
  try {
    const token = localStorage.getItem('token') || ''
    const a = document.createElement('a')
    a.href = `/api/clawhub/skills/${encodeURIComponent(skillKey)}/export?token=${encodeURIComponent(token)}`
    a.download = skillName
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  } catch (e) { ElMessage.error('导出失败') }
}

async function deleteSkill(s) {
  const skillKey = s.skillKey || s.name
  const skillName = s.nameZh || s.displayName || s.name
  try {
    await ElMessageBox.confirm(`确定要卸载「${skillName}」吗？`, '确认卸载', { confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning' })
    await request.delete('/clawhub/skills/' + encodeURIComponent(skillKey))
    ElMessage.success('已卸载'); loadOpenClawSkills(); detailDlg.visible = false
  } catch (e) { if (e !== 'cancel') ElMessage.error('卸载失败') }
}

// ─── ClawHub ───
async function searchClawHub() {
  if (!clawhubQuery.value.trim()) return
  clawhubLoading.value = true; clawhubSearched.value = true
  try {
    const { data } = await request.get('/clawhub/search', { params: { q: clawhubQuery.value, limit: 20 } })
    clawhubResults.value = (data.data || []).map(s => ({ ...s, _installing: false }))
  } catch (e) { ElMessage.error('搜索失败') }
  clawhubLoading.value = false
}

async function installSkill(s) {
  s._installing = true
  try {
    await request.post('/clawhub/install', { slug: s.slug })
    ElMessage.success(`已安装: ${s.displayName || s.name}`)
    installedSlugs.value.add(s.slug); loadOpenClawSkills()
  } catch (e) { ElMessage.error('安装失败: ' + (e.response?.data?.message || e.message)) }
  s._installing = false
}

async function loadCategories() {
  try {
    const { data } = await request.get('/clawhub/categories')
    if (data.data?.length) {
      categories.length = 1 // keep 'all'
      const emojiMap = {}
      for (const [k, v] of Object.entries(CAT_SPEC)) emojiMap[k] = v.icon
      for (const c of data.data) {
        categories.push({ key: c.key, label: c.label, icon: emojiMap[c.key] || '📦' })
      }
    }
  } catch {}
}

// ─── 生命周期 ───
watch(activeTab, (tab) => {
  if (tab === 'openclaw') { loadOpenClawSkills(); loadRecentUsage(); activeCategory.value = 'all' }
  if (tab === 'stats') loadSkillStats()
})
onMounted(() => { loadOpenClawSkills(); loadRecentUsage(); loadCategories() })
</script>

<style scoped>
/* ═══ Shell ═══ */
.skill-hub { height: 100%; display: flex; flex-direction: column; background: #fafafe; overflow: hidden; }

/* ═══ Hero ═══ */
.hub-hero {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 24px 28px; background: #fff; border-bottom: 1px solid #f0ecfc; flex-shrink: 0;
}
.hero-title { font-size: 22px; font-weight: 800; color: #4a3f5e; margin: 0 0 4px; }
.hero-sub { font-size: 13px; color: #94a3b8; margin: 0; max-width: 480px; }
.hero-stats { display: flex; gap: 24px; }
.hero-stat { text-align: center; }
.hero-stat-num { display: block; font-size: 26px; font-weight: 800; color: #7c3aed; }
.hero-stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }

/* ═══ Body ═══ */
.hub-body { flex: 1; overflow-y: auto; padding: 0 28px 28px; }
.hub-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.tab-label { font-size: 14px; font-weight: 600; }
.tab-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 18px; padding: 0 6px; border-radius: 9px;
  font-size: 11px; font-weight: 600; background: #ede9fe; color: #7c3aed; margin-left: 6px;
}

/* ═══ Category chips ═══ */
.cat-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.cat-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 14px; border-radius: 18px; font-size: 13px;
  background: #f5f3ff; color: #7c7b8e; cursor: pointer; transition: all .15s;
  user-select: none; border: 1px solid transparent;
}
.cat-chip:hover { border-color: #7c3aed; color: #7c3aed; }
.cat-chip.active { background: #7c3aed; color: #fff; }
.cat-chip-num { font-size: 11px; background: rgba(255,255,255,.3); padding: 0 6px; border-radius: 8px; }

/* ═══ Action row ═══ */
.action-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.action-gap { flex: 1; }

/* ═══ Update bar ═══ */
.update-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.update-chip {
  padding: 4px 12px; border-radius: 8px; font-size: 12px;
  background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
}

/* ═══ Skill grid ═══ */
.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.skill-empty { grid-column: 1 / -1; padding: 60px 0; text-align: center; }

/* ═══ Skill card ═══ */
.skill-card {
  position: relative; background: #fff; border: 1px solid #f0ecfc; border-radius: 14px;
  overflow: hidden; cursor: pointer; transition: all .2s;
}
.skill-card:hover { border-color: #c4b5fd; box-shadow: 0 6px 20px rgba(124,58,237,.1); transform: translateY(-2px); }
.card-accent { height: 3px; }
.card-content { display: flex; gap: 12px; padding: 14px 16px 16px; align-items: flex-start; }
.card-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
.card-info { flex: 1; min-width: 0; }
.card-name { font-size: 14px; font-weight: 700; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
.card-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; }
.card-meta { display: flex; gap: 8px; align-items: center; }
.meta-cat { font-size: 11px; font-weight: 600; }
.meta-ver { font-size: 11px; color: #b8aad0; }
.meta-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #ede9fe; color: #7c3aed; font-weight: 600; }
.card-switch { flex-shrink: 0; padding-top: 2px; }
.card-action { flex-shrink: 0; display: flex; align-items: center; }

/* ═══ Skeleton ═══ */
.skeleton-card { pointer-events: none; }
.skeleton-bg { background: linear-gradient(90deg, #f0ecfc 25%, #e8e0f0 50%, #f0ecfc 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ═══ Market ═══ */
.market-panel { padding-top: 4px; }
.market-search { display: flex; gap: 10px; align-items: center; }

/* ═══ Stats ═══ */
.stats-panel { padding-top: 4px; }
.stats-row { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.stat-box {
  padding: 16px 24px; background: #fff; border: 1px solid #f0ecfc; border-radius: 12px;
  text-align: center; min-width: 120px;
}
.stat-box-num { font-size: 28px; font-weight: 800; color: #7c3aed; }
.stat-box-label { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.stats-table-wrap { background: #fff; border-radius: 12px; border: 1px solid #f0ecfc; overflow: hidden; }
.stats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stats-table th { padding: 10px 14px; text-align: left; font-weight: 600; font-size: 11px; color: #b8aad0; text-transform: uppercase; background: #faf8ff; border-bottom: 1px solid #f0ecfc; }
.stats-table td { padding: 8px 14px; border-bottom: 1px solid #f8f6fc; color: #4a3f5e; }
.stats-table code { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #7c3aed; }
.rank-cell { width: 40px; color: #b8aad0; font-weight: 600; }
.time-cell { color: #94a3b8; font-size: 12px; }

/* ═══ Detail modal ═══ */
.detail-loading { text-align: center; padding: 60px 0; }
.loading-spin { width: 32px; height: 32px; border: 3px solid #f0ecfc; border-top-color: #7c3aed; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-body { max-height: 55vh; overflow-y: auto; }
.detail-desc { font-size: 14px; color: #606266; margin-bottom: 14px; padding: 10px 14px; background: #f8f7ff; border-radius: 8px; border-left: 3px solid #7c3aed; }
.detail-deps { margin-bottom: 14px; padding: 8px 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e; }
.dep-link { display: inline-block; margin: 2px 4px; padding: 2px 8px; background: #fff; border-radius: 6px; color: #7c3aed; font-weight: 500; font-size: 12px; }
.dlg-footer { display: flex; gap: 6px; align-items: center; }
.dlg-gap { flex: 1; }

/* Markdown inside detail */
.markdown-body :deep(h2) { font-size: 15px; margin: 14px 0 6px; color: #4a3f5e; }
.markdown-body :deep(h3) { font-size: 13px; margin: 10px 0 4px; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 18px; margin: 6px 0; }
.markdown-body :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #7c3aed; }
.markdown-body :deep(pre) { background: #2d2640; color: #e8e0f0; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; }
.markdown-body :deep(th) { background: #ede9fe; color: #5b21b6; padding: 8px 12px; border: 1px solid #e0d6f5; }
.markdown-body :deep(td) { padding: 6px 12px; border: 1px solid #e0d6f5; }
</style>
