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
            <div v-for="s in filteredOpenclawSkills" :key="s.name" class="skill-card">
              <div class="sc-icon">{{ s.emoji || '⚡' }}</div>
              <div class="sc-body">
                <div class="sc-name">{{ s.nameZh || s.displayName || s.name }}</div>
                <div class="sc-desc">{{ s.descZh || s.description || s.summary || '暂无描述' }}</div>
                <div class="sc-meta" v-if="s.version">v{{ s.version }} · {{ s.source || '' }}</div>
              </div>
              <div class="sc-action">
                <el-tag v-if="!s.disabled" size="small" type="success" effect="plain" class="skill-status-tag" @click.stop="toggleSkill(s)">已启用</el-tag>
                <el-tag v-else size="small" type="info" effect="plain" class="skill-status-tag" @click.stop="toggleSkill(s)">已禁用</el-tag>
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
            <el-button type="primary" @click="searchClawHub" :loading="clawhubLoading">搜索</el-button>
          </div>
          <div class="skill-grid" style="margin-top:16px">
            <div v-for="s in clawhubResults" :key="s.slug" class="skill-card">
              <div class="sc-icon">📦</div>
              <div class="sc-body">
                <div class="sc-name">{{ s.name }}</div>
                <div class="sc-desc">{{ s.description || '暂无描述' }}</div>
                <div class="sc-meta" v-if="s.version">v{{ s.version }} · {{ s.owner || '' }}</div>
              </div>
              <div class="sc-action">
                <el-button v-if="isInstalled(s.slug)" size="small" disabled>已安装</el-button>
                <el-button v-else size="small" type="primary" @click.stop="installSkill(s)" :loading="s._installing">安装</el-button>
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
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../api/index.js'

const activeTab = ref('openclaw')

// ─── 分类 & 我的技能 ───
const activeCategory = ref('all')
const recentUsage = ref([])

const categories = [
  { key: 'all', label: '全部', icon: '📋' },
  { key: 'recent', label: '最近使用', icon: '🕐' },
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
  { key: 'life', label: '生活服务', icon: '🌟' }
]

const CATEGORY_KEYWORDS = {
  design: ['image', 'video', 'audio', 'music', 'photo', 'picture', 'design', 'graphic', 'draw', 'art', 'animation', 'voice', 'speech', 'icon', 'logo', 'color', 'render', '3d', 'canvas', 'svg', 'font', 'filter', 'effect', 'edit', 'clip', 'screen', 'record', 'camera', 'sound'],
  dev: ['dev', 'code', 'git', 'browser', 'api', 'cli', 'npm', 'node', 'python', 'debug', 'terminal', 'shell', 'command', 'sdk', 'program', 'javascript', 'typescript', 'rust', 'golang', 'java', 'compile', 'build', 'ide', 'vscode', 'lint', 'commit', 'repo', 'package', 'plugin', 'framework', 'library', 'frontend', 'backend', 'css', 'html', 'react', 'vue', 'swift'],
  itops: ['security', 'auth', 'devops', 'monitor', 'deploy', 'server', 'cloud', 'network', 'backup', 'ci', 'cd', 'infra', 'encrypt', 'scan', 'audit', 'permission', 'sre', 'admin', 'linux', 'docker', 'kubernetes', 'firewall', 'proxy', 'dns', 'ssl', 'vpn', 'log', 'ssh', 'nginx', 'terraform', 'ansible', 'vault', 'secret', 'policy'],
  data: ['analytics', 'visualization', 'chart', 'dashboard', 'bi', 'etl', 'csv', 'spreadsheet', 'metric', 'kpi', 'statistics', 'tableau', 'bigquery', 'databricks', 'database', 'sql', 'excel', 'parse', 'extract', 'transform', 'report', 'stats', 'query', 'schema', 'pandas', 'numpy', 'jupyter'],
  ai: ['llm', 'gpt', 'claude', 'agent', 'chatbot', 'prompt', 'rag', 'embedding', 'token', 'copilot', 'assistant', 'reasoning', 'nlp', 'chat', 'ai', 'model', 'language', 'completion', 'vector', 'llama', 'mistral', 'gemini', 'openai', 'anthropic', 'deepseek', 'qwen', 'generate', 'generative'],
  content: ['content', 'write', 'blog', 'article', 'social', 'copywriting', 'seo', 'creative', 'text', 'story', 'script', 'newsletter', 'tweet', 'publish', 'headline', 'medium', 'post', 'essay', 'translate', 'summary', 'caption'],
  knowledge: ['knowledge', 'wiki', 'memory', 'faq', 'kb', 'retrieve', 'catalog', 'archive', 'library', 'record', 'search', 'obsidian', 'notion', 'index', 'reference', 'handbook', 'guide', 'manual'],
  business: ['business', 'crm', 'sales', 'market', 'finance', 'hr', 'erp', 'supply', 'inventory', 'order', 'customer', 'lead', 'contract', 'invoice', 'payment', 'account', 'ecommerce', 'shop', 'revenue', 'tax', 'payroll'],
  edu: ['education', 'learn', 'course', 'tutorial', 'quiz', 'exam', 'study', 'teach', 'train', 'skill', 'academy', 'student', 'flashcard', 'explain', 'lesson', 'textbook', 'classroom'],
  industry: ['legal', 'medical', 'health', 'real estate', 'logistics', 'manufacture', 'retail', 'industry', 'compliance', 'regulation', 'clinic', 'construction', 'pharma', 'insurance', 'bank'],
  office: ['productivity', 'workflow', 'automation', 'task', 'schedule', 'calendar', 'todo', 'email', 'meeting', 'office', 'batch', 'organize', 'quick', 'reminder', 'plan', 'deadline', 'project', 'note', 'ppt', 'presentation', 'slide', 'document', 'word', 'pdf', 'markdown', 'format', 'convert', 'template', 'manage', 'collab'],
  life: ['travel', 'food', 'health', 'fitness', 'weather', 'shop', 'news', 'entertainment', 'fun', 'hobby', 'personal', 'lifestyle', 'recipe', 'restaurant', 'game', 'sport', 'music', 'movie', 'book', 'pet']
}

function getSkillCategory(s) {
  const text = ((s.name || '') + ' ' + (s.displayName || '') + ' ' + (s.description || s.summary || '')).toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return cat
    }
  }
  return 'ai' // 默认归入 AI Agent
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

const filteredOpenclawSkills = computed(() => {
  if (activeCategory.value === 'recent') {
    return openclawSkills.value.filter(s => matchRecentUsage(s))
  }
  if (activeCategory.value === 'all') return openclawSkills.value
  return openclawSkills.value.filter(s => getSkillCategory(s) === activeCategory.value)
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

function skillEmoji(name) {
  if (name.includes('PPT')) return '📊'
  if (name.includes('文档') || name.includes('Word')) return '📝'
  if (name.includes('表') || name.includes('Excel')) return '📈'
  return '⚡'
}


function isInstalled(slug) {
  return installedSlugs.value.has(slug)
}


async function loadInstalledSlugs() {
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      installedSlugs.value = new Set(data.data.skills.map(s => s.name).filter(Boolean))
    }
  } catch {}
}

async function loadOpenClawSkills() {
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      openclawSkills.value = data.data.skills.map(s => ({
        ...s,
        emoji: skillEmoji(s.name || s.displayName || '')
      }))
    }
  } catch {}
}

async function toggleSkill(s) {
  const enabled = !!s.disabled // 当前是禁用状态，点一下变成启用
  s._toggling = true
  try {
    await request.put('/agent-openclaw-skills/toggle', { skillKey: s.skillKey, enabled })
    s.disabled = !enabled
    loadRecentUsage()
    ElMessage.success(enabled ? '已启用' : '已禁用')
  } catch (e) {
    ElMessage.error('操作失败: ' + (e.response?.data?.message || e.message))
  }
  s._toggling = false
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




watch(activeTab, (tab) => { if (tab === 'openclaw') { loadOpenClawSkills(); loadRecentUsage(); activeCategory.value = 'all' } })
onMounted(() => { loadInstalledSlugs() })
</script>

<style scoped>
.sl-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.pg-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.pg-body { flex: 1; padding: 24px; overflow-y: auto; }

.skill-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.skill-card {
  display: flex; align-items: center; gap: 14px;
  width: 340px; padding: 20px;
  background: #fff; border: 1px solid #f0ecfc; border-radius: 14px;
  cursor: pointer; transition: all .2s;
}
.skill-card:hover { border-color: #7c3aed; box-shadow: 0 6px 20px rgba(124,58,237,.1); transform: translateY(-2px); }
.sc-icon { width: 48px; height: 48px; border-radius: 12px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.sc-body { flex: 1; min-width: 0; }
.sc-name { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.sc-desc { font-size: 12px; color: #909399; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-meta { font-size: 11px; color: #b8aad0; margin-top: 4px; }
.sc-action { flex-shrink: 0; }
.skill-status-tag { cursor: pointer; }
.skill-status-tag:hover { opacity: 0.8; }
.skill-empty { padding: 60px 0; text-align: center; width: 100%; }

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
