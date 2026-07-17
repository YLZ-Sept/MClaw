<template>
  <div class="wiki-page">
    <!-- 头部 -->
    <div class="wiki-hd">
      <div>
        <h2 class="wiki-title">LLM 维基</h2>
        <p class="wiki-sub">AI 消化文档 → 结构化知识网络，页面间双向链接，来源溯源</p>
      </div>
      <el-button type="primary" size="large" @click="openDigestDlg">🧠 AI 消化文档</el-button>
    </div>

    <div class="wiki-body">
      <!-- 左侧：页面列表 -->
      <div class="wiki-sidebar">
        <el-input v-model="searchKw" placeholder="搜索页面..." size="small" clearable @input="loadPages" style="margin-bottom:10px" />
        <el-select v-model="filterCategory" size="small" clearable placeholder="全部分类" style="width:100%;margin-bottom:8px" @change="loadPages">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <div class="wiki-page-list">
          <div v-for="p in pages" :key="p.id" class="wiki-page-item" :class="{ sel: currentPage?.id === p.id }" @click="selectPage(p)">
            <div class="wpi-title">{{ p.title }}</div>
            <div class="wpi-meta">
              <span class="wpi-version">v{{ p.version }}</span>
              <span v-if="p.incoming_links" class="wpi-links">← {{ p.incoming_links }}</span>
            </div>
          </div>
          <div v-if="!pages.length" style="text-align:center;padding:30px;color:#b8aad0">暂无页面，点击「AI 消化文档」开始</div>
        </div>
        <div style="padding:8px;text-align:center">
          <el-pagination small layout="prev, pager, next" :total="total" :page-size="20" v-model:current-page="curPage" @current-change="loadPages" />
        </div>
      </div>

      <!-- 中间：页面内容 -->
      <div class="wiki-main" v-if="currentPage">
        <div class="wiki-main-hd">
          <h3>{{ currentPage.title }}</h3>
          <div class="wiki-main-actions">
            <el-tag size="small" type="info">v{{ currentPage.version }}</el-tag>
            <el-tag size="small">{{ currentPage.category }}</el-tag>
            <span style="font-size:12px;color:#909399">👁 {{ currentPage.view_count }}</span>
            <el-button size="small" @click="editPage(currentPage)">✏️ 编辑</el-button>
            <el-button size="small" @click="showVersions = true">📋 版本</el-button>
            <el-button size="small" type="danger" text @click="deletePage(currentPage.id)">🗑</el-button>
          </div>
        </div>
        <div v-if="currentPage.summary" class="wiki-summary">{{ currentPage.summary }}</div>
        <div v-if="currentPage.key_concepts" class="wiki-concepts">
          <el-tag v-for="kc in parseConcepts(currentPage.key_concepts)" :key="kc" size="small" effect="plain" round style="margin:2px 4px 2px 0">{{ kc }}</el-tag>
        </div>
        <div class="wiki-content" v-html="renderWikiMd(currentPage.content)"></div>

        <!-- 来源面板 -->
        <div v-if="currentPage.sources?.length || currentPage.linked_kb?.length" class="wiki-sources-section">
          <h4>📎 来源溯源</h4>
          <!-- 关联知识库文章 -->
          <div v-if="currentPage.linked_kb?.length" style="margin-bottom:12px">
            <div style="font-size:12px;color:#7c3aed;font-weight:600;margin-bottom:4px">📚 关联知识库文章</div>
            <div v-for="a in currentPage.linked_kb" :key="a.id" class="ws-item" style="cursor:pointer" @click="goKB(a.id)">
              <span style="margin-right:6px">📄</span>
              <span>{{ a.title }}</span>
              <el-tag size="small" type="info" style="margin-left:8px">{{ a.category }}</el-tag>
            </div>
          </div>
          <!-- 原始来源 -->
          <div v-if="currentPage.sources?.length">
            <div style="font-size:12px;color:#909399;font-weight:600;margin-bottom:4px">📎 原始来源</div>
            <div v-for="s in currentPage.sources" :key="s.id" class="ws-item">
              <span class="ws-type">{{ s.source_type === 'file' ? '📄' : s.source_type === 'url' ? '🌐' : s.source_type === 'kb_article' ? '📚' : '📝' }}</span>
              <span class="ws-name">{{ s.source_name }}</span>
              <span v-if="s.source_hash" class="ws-hash">({{ s.source_hash }})</span>
            </div>
          </div>
        </div>

        <!-- 出链 / 入链 -->
        <div class="wiki-links-row" v-if="currentPage.outgoing_links?.length || currentPage.incoming_links?.length">
          <div v-if="currentPage.outgoing_links?.length" class="wl-col">
            <h4>🔗 引用页面</h4>
            <a v-for="l in currentPage.outgoing_links" :key="l.id" class="wl-link" @click="goLink(l.target_page_id, l.target_title)">
              {{ l.target_title_display || l.target_title }}
              <span v-if="!l.target_page_id" class="ghost">(待创建)</span>
            </a>
          </div>
          <div v-if="currentPage.incoming_links?.length" class="wl-col">
            <h4>📌 被以下页面引用</h4>
            <a v-for="l in currentPage.incoming_links" :key="l.id" class="wl-link" @click="goPage(l.source_page_id)">
              {{ l.source_title }}
            </a>
          </div>
        </div>
      </div>

      <!-- 中间空状态 -->
      <div v-else class="wiki-main wiki-empty">
        <div style="font-size:60px;margin-bottom:16px">📖</div>
        <div style="font-size:16px;color:#909399">选择左侧页面查看内容</div>
        <div style="font-size:13px;color:#b8aad0;margin-top:8px">或点击「AI 消化文档」上传资料自动生成 Wiki</div>
      </div>
    </div>

    <!-- AI 消化对话框 -->
    <el-dialog v-model="digestDlg.visible" title="🧠 AI 消化文档" width="620px" :close-on-click-modal="false">
      <el-tabs v-model="digestDlg.tab">
        <el-tab-pane label="上传文件" name="files">
          <el-upload drag multiple :auto-upload="false" :on-change="onFileChange" :file-list="digestDlg.files"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls,.csv,.txt,.md,.html,.png,.jpg,.jpeg" style="margin-bottom:12px">
            <el-icon :size="40"><UploadFilled /></el-icon>
            <div style="font-size:14px;margin-top:8px">拖拽或点击上传文档</div>
            <div style="font-size:11px;color:#b8aad0;margin-top:4px">支持 PDF / Word / PPT / Excel / 图片(OCR) / 文本</div>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="网页链接" name="urls">
          <el-input v-model="digestDlg.urls" type="textarea" :rows="3" placeholder="输入网页链接，一行一个" />
        </el-tab-pane>
        <el-tab-pane label="直接输入" name="text">
          <el-input v-model="digestDlg.text" type="textarea" :rows="6" placeholder="直接粘贴需要 AI 消化的文本内容..." />
        </el-tab-pane>
      </el-tabs>
      <div style="margin-top:12px">
        <span style="font-size:13px;color:#909399;margin-right:8px">分类：</span>
        <el-select v-model="digestDlg.category" size="small" style="width:180px" clearable allow-create filterable placeholder="通用">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
      </div>
      <template #footer>
        <el-button @click="digestDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="digestDlg.loading" @click="doDigest">
          {{ digestDlg.loading ? 'AI 正在消化...' : '开始消化' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDlg.visible" :title="editDlg.isNew ? '新建页面' : '编辑页面'" width="700px" :close-on-click-modal="false">
      <el-form label-width="80px" size="default">
        <el-form-item label="标题" required><el-input v-model="editDlg.form.title" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="editDlg.form.category" style="width:100%" clearable allow-create filterable>
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item>
        <el-form-item label="摘要"><el-input v-model="editDlg.form.summary" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="editDlg.form.content" type="textarea" :rows="12" placeholder="Markdown 格式，用 [[页面标题]] 创建链接" />
          <div style="font-size:11px;color:#909399;margin-top:4px">用 [[目标页面]] 或 [[目标|别名]] 创建双向链接，用 [source: xxx] 标注来源</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="saveEdit">{{ editDlg.isNew ? '创建' : '保存' }}</el-button>
      </template>
    </el-dialog>

    <!-- 版本历史对话框 -->
    <el-dialog v-model="showVersions" title="版本历史" width="650px">
      <div v-for="v in versionList" :key="v.id" class="ver-row">
        <div class="ver-header">
          <span class="ver-num">v{{ v.version }}</span>
          <span class="ver-date">{{ v.created_at }}</span>
          <span v-if="v.change_description" class="ver-desc">{{ v.change_description }}</span>
          <el-button size="small" text @click="showDiff(v.id)">对比当前</el-button>
        </div>
        <div v-if="v.summary" class="ver-summary">{{ v.summary }}</div>
      </div>
      <div v-if="!versionList.length" style="text-align:center;padding:20px;color:#909399">暂无历史版本</div>
    </el-dialog>

    <!-- Diff 对话框 -->
    <el-dialog v-model="showDiffDlg" title="版本对比" width="750px">
      <div class="diff-container" v-if="diffData">
        <div v-for="(d, i) in diffData.diff" :key="i" class="diff-line" :class="'diff-' + d.type">
          <span class="diff-prefix">{{ d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ' }}</span>
          <span>{{ d.line }}</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import request from '../api/index'
const router = useRouter()

const pages = ref([])
const total = ref(0)
const curPage = ref(1)
const searchKw = ref('')
const filterCategory = ref('')
const currentPage = ref(null)
const categories = ref(['通用', '产品知识', '技术文档', '规章制度', '培训资料', '其他'])
const versionList = ref([])
const showVersions = ref(false)
const showDiffDlg = ref(false)
const diffData = ref(null)

const digestDlg = reactive({ visible: false, tab: 'files', files: [], urls: '', text: '', category: '通用', loading: false })
const editDlg = reactive({ visible: false, isNew: false, saving: false, form: { id: '', title: '', category: '通用', summary: '', content: '' } })

function parseConcepts(c) {
  try { return typeof c === 'string' ? JSON.parse(c) : c } catch { return [] }
}

function renderWikiMd(content) {
  if (!content) return ''
  let html = content
  html = html.replace(/\[\[([^\]|]+?)\]\]/g, (_, title) => {
    const t = title.trim()
    return `<a href="javascript:void(0)" class="wiki-link" data-title="${t}">${t}</a>`
  })
  html = html.replace(/\[\[([^\]]+?)\|([^\]]+?)\]\]/g, (_, title, display) => {
    const t = title.trim(); const d = display.trim()
    return `<a href="javascript:void(0)" class="wiki-link" data-title="${t}">${d}</a>`
  })
  html = html.replace(/\[source:\s*([^\]]*?)\]/gi, (_, src) => `<sup class="source-tag" title="${src.trim()}">[源]</sup>`)
  return marked(html)
}

async function loadPages() {
  try {
    const { data } = await request.get('/wiki/pages', {
      params: { keyword: searchKw.value || undefined, category: filterCategory.value || undefined, page: curPage.value, pageSize: 20 }
    })
    if (data.code === 200) { pages.value = data.data.rows; total.value = data.data.total }
  } catch {}
}

async function selectPage(p) {
  try {
    const { data } = await request.get('/wiki/pages/' + p.id)
    if (data.code === 200) currentPage.value = data.data
  } catch {}
}

function goPage(id) { curPage.value = 1; loadPages().then(() => { const p = pages.value.find(x => x.id === id); if (p) selectPage(p) }) }
function goLink(id, title) { if (id) goPage(id); else ElMessage.info(`「${title}」页面尚未创建`) }
function goKB(id) { router.push('/knowledge-base') }

// 处理 wiki-link 点击
onMounted(() => {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.wiki-link')
    if (link) {
      e.preventDefault()
      const title = link.dataset.title
      const page = pages.value.find(p => p.title === title)
      if (page) { selectPage(page) } else { ElMessage.info(`「${title}」页面尚未创建`) }
    }
  })
})

// AI 消化
function openDigestDlg() { digestDlg.visible = true; digestDlg.files = []; digestDlg.urls = ''; digestDlg.text = ''; digestDlg.tab = 'files' }
function onFileChange(file) { digestDlg.files.push(file) }

async function doDigest() {
  const fd = new FormData()
  if (digestDlg.tab === 'files') {
    if (!digestDlg.files.length) return ElMessage.warning('请选择文件')
    for (const f of digestDlg.files) fd.append('files', f.raw)
  } else if (digestDlg.tab === 'urls') {
    if (!digestDlg.urls.trim()) return ElMessage.warning('请输入链接')
    fd.append('urls', digestDlg.urls)
  } else {
    if (!digestDlg.text.trim()) return ElMessage.warning('请输入文本')
    fd.append('textContent', digestDlg.text)
  }
  fd.append('category', digestDlg.category || '通用')
  digestDlg.loading = true
  try {
    const { data } = await request.post('/wiki/digest', fd)
    if (data.code === 200) {
      ElMessage.success(`AI 消化完成，生成 ${data.data.totalPages} 个 Wiki 页面`)
      digestDlg.visible = false
      categories.value = [...new Set([...categories.value, digestDlg.category])].filter(Boolean)
      loadPages()
    }
  } catch (e) { ElMessage.error(e.response?.data?.message || '消化失败') }
  digestDlg.loading = false
}

// 编辑
function editPage(p) {
  editDlg.isNew = !p
  editDlg.form = p ? { id: p.id, title: p.title, category: p.category, summary: p.summary || '', content: p.content || '' }
    : { id: '', title: '', category: '通用', summary: '', content: '' }
  editDlg.visible = true
}
async function saveEdit() {
  if (!editDlg.form.title || !editDlg.form.content) return ElMessage.warning('标题和内容必填')
  editDlg.saving = true
  try {
    if (editDlg.isNew) {
      await request.post('/wiki/pages', editDlg.form)
    } else {
      await request.put('/wiki/pages/' + editDlg.form.id, editDlg.form)
    }
    ElMessage.success('已保存')
    editDlg.visible = false
    loadPages()
    if (currentPage.value?.id === editDlg.form.id) selectPage({ id: editDlg.form.id })
  } catch (e) { ElMessage.error('保存失败') }
  editDlg.saving = false
}

// 删除
async function deletePage(id) {
  try {
    await ElMessageBox.confirm('删除此页面将同时清除关联链接和来源，确认？', '删除确认', { type: 'warning' })
    await request.delete('/wiki/pages/' + id)
    ElMessage.success('已删除')
    currentPage.value = null
    loadPages()
  } catch (e) { if (e !== 'cancel' && e?.action !== 'cancel') ElMessage.error('删除失败') }
}

// 版本
async function loadVersions() {
  if (!currentPage.value) return
  try {
    const { data } = await request.get('/wiki/pages/' + currentPage.value.id + '/versions')
    if (data.code === 200) versionList.value = data.data
  } catch {}
}
async function showDiff(versionId) {
  try {
    const { data } = await request.get('/wiki/pages/' + currentPage.value.id + '/diff/' + versionId)
    if (data.code === 200) { diffData.value = data.data; showDiffDlg.value = true }
  } catch { ElMessage.error('加载对比失败') }
}

// 重新消化
async function regenerate() {
  if (!currentPage.value) return
  try {
    await ElMessageBox.confirm('将重新从来源文档消化生成内容，当前版本将保存为历史快照。确认？', '重新消化', { type: 'info' })
    const { data } = await request.post('/wiki/regenerate/' + currentPage.value.id)
    if (data.code === 200) {
      ElMessage.success(`重新消化完成 → v${data.data.version}`)
      selectPage({ id: data.data.id })
    }
  } catch (e) { if (e !== 'cancel' && e?.action !== 'cancel') ElMessage.error('重新消化失败') }
}

onMounted(() => { loadPages() })
</script>

<style scoped>
.wiki-page { padding: 24px; background: #fafafe; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.wiki-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-shrink: 0; }
.wiki-title { margin: 0; font-size: 22px; font-weight: 700; color: #4a3f5e; }
.wiki-sub { margin: 4px 0 0; font-size: 13px; color: #b8aad0; }

.wiki-body { flex: 1; display: flex; gap: 0; overflow: hidden; }

.wiki-sidebar {
  width: 260px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding: 12px;
  display: flex; flex-direction: column; background: #fff; border-radius: 12px 0 0 12px;
}
.wiki-page-list { flex: 1; overflow-y: auto; }
.wiki-page-item {
  padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: all .15s;
  border: 1px solid transparent; margin-bottom: 4px;
}
.wiki-page-item:hover { background: #f5f3ff; border-color: #ede9fe; }
.wiki-page-item.sel { background: #ede9fe; border-color: #c4b5fd; }
.wpi-title { font-size: 14px; font-weight: 500; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wpi-meta { display: flex; gap: 10px; font-size: 11px; color: #b8aad0; margin-top: 2px; }
.wpi-links { color: #a78bfa; font-weight: 500; }

.wiki-main { flex: 1; overflow-y: auto; padding: 24px 32px; background: #fff; border-radius: 0 12px 12px 0; }
.wiki-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.wiki-main-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.wiki-main-hd h3 { margin: 0; font-size: 20px; color: #1e293b; }
.wiki-main-actions { display: flex; align-items: center; gap: 8px; }
.wiki-summary { padding: 12px 16px; background: #f5f3ff; border-left: 3px solid #7c3aed; border-radius: 0 8px 8px 0; font-size: 14px; color: #4a3f5e; margin-bottom: 16px; }
.wiki-concepts { margin-bottom: 16px; }

.wiki-content :deep(h1) { font-size: 1.5em; margin: 16px 0 8px; }
.wiki-content :deep(h2) { font-size: 1.25em; margin: 14px 0 6px; }
.wiki-content :deep(h3) { font-size: 1.1em; margin: 12px 0 4px; }
.wiki-content :deep(p) { margin: 8px 0; line-height: 1.7; }
.wiki-content :deep(ul), .wiki-content :deep(ol) { padding-left: 20px; margin: 8px 0; }
.wiki-content :deep(li) { margin: 4px 0; }
.wiki-content :deep(.wiki-link) { color: #7c3aed; text-decoration: none; border-bottom: 1px dashed #a78bfa; cursor: pointer; }
.wiki-content :deep(.wiki-link:hover) { color: #5b21b6; border-bottom-style: solid; }
.wiki-content :deep(.source-tag) { font-size: 10px; color: #909399; cursor: help; vertical-align: super; margin: 0 2px; }
.wiki-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.wiki-content :deep(pre) { background: #1e1e2e; color: #cdd6f4; padding: 14px; border-radius: 8px; overflow-x: auto; }
.wiki-content :deep(pre code) { background: none; padding: 0; color: inherit; }
.wiki-content :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
.wiki-content :deep(th), .wiki-content :deep(td) { border: 1px solid #e8e3f0; padding: 8px 12px; text-align: left; }
.wiki-content :deep(th) { background: #faf8ff; font-weight: 600; }

.wiki-sources-section { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0ecfc; }
.wiki-sources-section h4 { font-size: 14px; color: #4a3f5e; margin-bottom: 8px; }
.ws-item { padding: 6px 0; font-size: 13px; color: #606266; }
.ws-type { margin-right: 6px; }
.ws-hash { font-size: 11px; color: #b8aad0; margin-left: 6px; font-family: monospace; }

.wiki-links-row { display: flex; gap: 32px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0ecfc; }
.wl-col { flex: 1; }
.wl-col h4 { font-size: 14px; color: #4a3f5e; margin-bottom: 8px; }
.wl-link { display: block; padding: 4px 0; font-size: 13px; color: #7c3aed; cursor: pointer; text-decoration: none; }
.wl-link:hover { text-decoration: underline; }
.wl-link .ghost { color: #e74c3c; font-size: 11px; }

/* Diff */
.diff-container { max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 13px; }
.diff-line { padding: 2px 8px; white-space: pre-wrap; word-break: break-all; }
.diff-prefix { margin-right: 6px; font-weight: bold; }
.diff-added { background: #f0fdf4; color: #166534; }
.diff-added .diff-prefix { color: #16a34a; }
.diff-removed { background: #fef2f2; color: #991b1b; }
.diff-removed .diff-prefix { color: #dc2626; }
.diff-same { color: #909399; }

/* 版本 */
.ver-row { padding: 10px 0; border-bottom: 1px solid #f0ecfc; }
.ver-header { display: flex; align-items: center; gap: 10px; }
.ver-num { font-weight: 600; color: #7c3aed; }
.ver-date { font-size: 12px; color: #909399; }
.ver-desc { font-size: 12px; color: #606266; }
.ver-summary { font-size: 13px; color: #6b7280; margin-top: 4px; }
</style>
