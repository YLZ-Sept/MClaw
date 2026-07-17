<template>
  <div class="kb-page">
    <div class="pg-hd">
      <span class="pg-title">知识库</span>
      <span class="pg-sub">企业知识管理 · 文档库 + AI Wiki</span>
      <div style="margin-top:12px">
        <el-radio-group v-model="viewMode" size="default">
          <el-radio-button value="docs">📄 文档库</el-radio-button>
          <el-radio-button value="wiki">📖 Wiki 网络</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- ═══ Wiki 视图 ═══ -->
    <div v-if="viewMode==='wiki'" class="wiki-embed">
      <div class="wiki-embed-body">
        <div class="wiki-embed-sidebar">
          <el-input v-model="wikiSearch" placeholder="搜索 Wiki..." size="small" clearable @input="onWikiSearch" style="margin-bottom:8px" />
          <div class="wiki-embed-list">
            <div v-for="p in wikiPages" :key="p.id" class="wiki-embed-item" :class="{ sel: wikiCurrent?.id===p.id }" @click="selectWikiPage(p)">
              <div class="wei-title">{{ p.title }}</div>
              <div class="wei-meta">v{{ p.version }} <span v-if="p.incoming_links">←{{ p.incoming_links }}</span></div>
            </div>
            <div v-if="!wikiPages.length" style="text-align:center;padding:20px;color:#b8aad0">暂无 Wiki 页面</div>
          </div>
        </div>
        <div class="wiki-embed-main" v-if="wikiCurrent">
          <div class="wem-hd">
            <h3>{{ wikiCurrent.title }}</h3>
            <div style="display:flex;gap:6px;align-items:center">
              <el-tag size="small">v{{ wikiCurrent.version }}</el-tag>
              <el-button size="small" @click="digestWikiAgain">🔄 重新消化</el-button>
            </div>
          </div>
          <div v-if="wikiCurrent.summary" class="wem-summary">{{ wikiCurrent.summary }}</div>
          <div class="wem-content" v-html="renderWikiMd(wikiCurrent.content)"></div>
          <div v-if="wikiCurrent.linked_kb?.length" class="wem-kb">
            <div style="font-weight:600;color:#4a3f5e;margin-bottom:4px">📚 来源知识库文章</div>
            <a v-for="a in wikiCurrent.linked_kb" :key="a.id" class="wem-kb-link" @click="viewMode='docs';selectCat(a.category)">{{ a.title }}</a>
          </div>
        </div>
        <div v-else class="wiki-embed-main wiki-embed-empty">
          <div style="font-size:48px">📖</div>
          <div style="color:#909399;margin-top:8px">选择左侧 Wiki 页面查看</div>
        </div>
      </div>
    </div>

    <!-- ═══ 文档库视图 ═══ -->
    <div v-show="viewMode==='docs'" class="pg-body">
      <!-- 统计 -->
      <div class="stat-row">
        <div class="stat-card" style="--glow:#7c3aed">
          <div class="stat-icon"><el-icon :size="20"><Document /></el-icon></div>
          <div class="stat-num">{{ articles.length }}</div>
          <div class="stat-label">知识文章</div>
        </div>
        <div class="stat-card" style="--glow:#06b6d4">
          <div class="stat-icon"><el-icon :size="20"><Collection /></el-icon></div>
          <div class="stat-num">{{ categories.length }}</div>
          <div class="stat-label">分类</div>
        </div>
        <div class="stat-card" style="--glow:#f59e0b">
          <div class="stat-icon"><el-icon :size="20"><FolderOpened /></el-icon></div>
          <div class="stat-num">{{ activeCat }}</div>
          <div class="stat-label">当前分类</div>
        </div>
      </div>
      <div class="kb-layout">
        <div class="kb-sidebar">
          <div class="kb-side-title">
            <span>分类</span>
            <el-button size="small" text @click="openAddCat" style="padding:0 2px">
              <el-icon><Plus /></el-icon>
            </el-button>
          </div>
          <div
            v-for="c in categories" :key="c.id"
            class="kb-cat-item"
            :class="{ active: activeCat === c.name }"
            @click="activeCat = c.name"
          >
            <span>{{ c.name }}</span>
            <div style="display:flex;align-items:center;gap:2px">
              <el-tag size="small" round>{{ c.count }}</el-tag>
              <el-button class="kb-cat-edit" size="small" text @click.stop="openEditCat(c)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button class="kb-cat-del" size="small" text type="danger" @click.stop="delCat(c)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
        <div class="kb-main">
          <div class="tb-bar">
            <el-input v-model="keyword" placeholder="搜索标题/内容/标签" style="width:280px" clearable @clear="load" @keyup.enter="load">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-button type="primary" @click="openImport">导入文档</el-button>
            <el-button type="success" plain @click="batchDigest" :loading="batchDigesting">🧠 批量消化</el-button>
          </div>
          <div v-if="articles.length" class="kb-list">
            <div v-for="a in articles" :key="a.id" class="kb-item" @click="openView(a)">
              <div class="kbi-info">
                <div class="kbi-title">{{ a.title }}</div>
                <div class="kbi-meta">
                  <el-tag size="small" type="info">{{ a.category }}</el-tag>
                  <el-tag v-if="a.tags" v-for="t in a.tags.split(',')" :key="t" size="small" class="kb-tag">{{ t }}</el-tag>
                  <span v-if="a.source" class="kbi-source">{{ a.source }}</span>
                  <span class="kbi-date">{{ a.updated_at?.slice(0,10) }}</span>
                  <span class="kbi-views">{{ a.view_count }} 次阅读</span>
                </div>
                <div class="kbi-preview">{{ stripContent(a.content) }}</div>
              </div>
              <div class="kbi-actions" @click.stop>
                <el-popconfirm v-if="a.wiki_page_id" title="切换到 Wiki 网络查看？" @confirm="goWikiPage(a.wiki_page_id, a.wiki_title)">
                  <template #reference>
                    <el-tag size="small" type="success" effect="plain" style="cursor:pointer">
                      📖 {{ a.wiki_title || 'Wiki' }}
                    </el-tag>
                  </template>
                </el-popconfirm>
                <el-button size="small" text type="primary" :loading="a._digesting" @click="digestArticle(a)" :disabled="!a.content">
                  {{ a.wiki_page_id ? '🔄' : '🧠 消化' }}
                </el-button>
                <el-button size="small" text @click="openEdit(a)">编辑</el-button>
                <el-button size="small" text type="danger" @click="delArticle(a.id)">删除</el-button>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无文章" />
        </div>
      </div>
    </div>

    <!-- 查看文章弹窗 -->
    <el-dialog v-model="dlg.visible" :title="dlg.viewMode ? dlg.form.title : (dlg.isEdit ? '编辑文章' : '导入文档')" width="750px" :close-on-click-modal="false">
      <template v-if="dlg.viewMode">
        <div class="view-article">
          <div class="va-meta">
            <el-tag size="small">{{ dlg.form.category }}</el-tag>
            <span>{{ dlg.form.updated_at?.slice(0,10) }}</span>
            <span>{{ dlg.form.view_count }} 次阅读</span>
          </div>
          <div class="va-content" v-html="renderMd(dlg.form.content)"></div>
        </div>
      </template>
      <template v-else-if="dlg.importMode">
        <el-tabs v-model="importTab" class="import-tabs">
          <el-tab-pane label="本地文档" name="local">
            <el-form :model="dlg.form" label-width="60px">
              <el-form-item label="标题"><el-input v-model="dlg.form.title" placeholder="文章标题（可从文件名自动提取）"/></el-form-item>
              <el-form-item label="分类">
                <el-select v-model="dlg.form.category" style="width:100%">
                  <el-option v-for="c in catOptions" :key="c" :label="c" :value="c" />
                </el-select>
              </el-form-item>
              <el-form-item label="标签"><el-input v-model="dlg.form.tags" placeholder="逗号分隔"/></el-form-item>
              <el-form-item label="文件">
                <el-upload
                  ref="uploadRef"
                  class="upload-zone"
                  drag
                  multiple
                  :auto-upload="false"
                  :limit="50"
                  :on-change="onFileChange"
                  :on-remove="onFileRemove"
                  :accept="allFormats"
                >
                  <el-icon class="upload-icon"><UploadFilled /></el-icon>
                  <div class="upload-text">点击或拖拽文件到此区域上传</div>
                  <div class="upload-hint">支持 PDF/DOC/DOCX/PPT/PPTX/WPS/PPSX/MHTML/XLSX/XLS/CSV/MD/TXT/HTML/JSON/XML/LOG/XMind/Keynote/Pages/Numbers 及图片（含 OCR 识别）</div>
                  <div class="upload-hint">可同时选择多个文件上传，无文件大小限制</div>
                </el-upload>
                <div v-if="uploadFiles.length" class="upload-info">
                  <div v-for="(entry, i) in uploadFiles" :key="i" class="upload-file-row">
                    <el-tag :type="entry.result?.error ? 'danger' : entry.result ? 'success' : 'info'" size="small">{{ entry.file.name }}</el-tag>
                    <span class="upload-file-size">{{ fmtSize(entry.file.size) }}</span>
                    <el-icon v-if="entry.loading" class="is-loading" :size="14"><Loading /></el-icon>
                    <span v-if="entry.result?.error" class="upload-file-err">{{ entry.result.error }}</span>
                  </div>
                </div>
              </el-form-item>
            </el-form>
            <div v-if="importLoading" style="text-align:center;padding:20px">
              <el-icon class="is-loading" :size="24"><Loading /></el-icon>
              <div style="font-size:12px;color:#b8aad0;margin-top:6px">正在解析文件...</div>
            </div>
            <div v-if="importResult" class="import-preview">
              <div v-if="importResult.error" class="ip-error">
                <el-alert :title="'解析失败：' + importResult.error" type="error" :closable="false" show-icon/>
              </div>
              <template v-else>
                <div class="ip-title">
                  内容预览
                  <el-tag v-if="importResult.tables?.length" size="small" type="warning" style="margin-left:8px">
                    检测到 {{ importResult.tables.length }} 个表格
                  </el-tag>
                </div>
                <div class="ip-text">{{ importResult.text?.slice(0, 2000) }}{{ importResult.text?.length > 2000 ? '...' : '' }}</div>
              </template>
            </div>
          </el-tab-pane>

          <el-tab-pane label="网页文件" name="web">
            <el-form :model="dlg.form" label-width="60px">
              <el-form-item label="标题"><el-input v-model="dlg.form.title" placeholder="文章标题"/></el-form-item>
              <el-form-item label="分类">
                <el-select v-model="dlg.form.category" style="width:100%">
                  <el-option v-for="c in catOptions" :key="c" :label="c" :value="c" />
                </el-select>
              </el-form-item>
              <el-form-item label="标签"><el-input v-model="dlg.form.tags" placeholder="逗号分隔"/></el-form-item>
            </el-form>
            <el-tabs v-model="webMode" size="small" style="margin-top:8px">
              <el-tab-pane label="逐条导入" name="single">
                <div style="display:flex;gap:8px">
                  <el-input v-model="webUrl" placeholder="输入网页 URL" @keyup.enter="fetchWeb"/>
                  <el-button type="primary" @click="fetchWeb" :loading="importLoading">抓取</el-button>
                </div>
              </el-tab-pane>
              <el-tab-pane label="批量导入" name="batch">
                <div class="batch-zone">
                  <div class="batch-info">
                    <span>上传 .xlsx 文件（最多 500 条网址）</span>
                    <el-button size="small" text type="primary" @click="downloadTemplate">下载模板</el-button>
                  </div>
                  <el-upload
                    ref="batchUploadRef"
                    class="upload-zone"
                    drag
                    :auto-upload="false"
                    :limit="1"
                    :accept="'.xlsx'"
                    :on-change="onBatchFileChange"
                    :on-remove="onBatchFileRemove"
                  >
                    <el-icon class="upload-icon"><UploadFilled /></el-icon>
                    <div class="upload-text">点击或拖拽 .xlsx 文件上传</div>
                  </el-upload>
                  <div v-if="batchUrls.length > 0" class="batch-list">
                    <div class="batch-count">已识别 {{ batchUrls.length }} 条网址</div>
                    <div v-for="(u, i) in batchUrls.slice(0, 10)" :key="i" class="batch-url">{{ u }}</div>
                    <div v-if="batchUrls.length > 10" style="font-size:12px;color:#b8aad0">...还有 {{ batchUrls.length - 10 }} 条</div>
                  </div>
                  <el-button v-if="batchUrls.length > 0" type="primary" @click="batchImport" :loading="importLoading" style="margin-top:8px">
                    批量导入 ({{ batchUrls.length }} 条)
                  </el-button>
                </div>
              </el-tab-pane>
            </el-tabs>
            <div v-if="importLoading" style="text-align:center;padding:16px">
              <el-icon class="is-loading" :size="20"><Loading /></el-icon>
              <span style="font-size:12px;color:#b8aad0;margin-left:6px">{{ importProgress }}</span>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
      <template v-else>
        <el-form :model="dlg.form" label-width="60px">
          <el-form-item label="标题"><el-input v-model="dlg.form.title" placeholder="文章标题"/></el-form-item>
          <el-form-item label="分类">
            <el-select v-model="dlg.form.category" style="width:100%">
              <el-option v-for="c in catOptions" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="标签"><el-input v-model="dlg.form.tags" placeholder="逗号分隔"/></el-form-item>
          <el-form-item label="来源"><el-input v-model="dlg.form.source" placeholder="来源URL或文档名"/></el-form-item>
          <el-form-item label="内容">
            <el-input v-model="dlg.form.content" type="textarea" :rows="14" placeholder="Markdown 格式内容"/>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="closeDlg">关闭</el-button>
        <el-button v-if="dlg.importMode" type="primary" @click="saveImport" :disabled="!canSaveImport">保存到知识库</el-button>
        <el-button v-if="!dlg.viewMode && !dlg.importMode" type="primary" @click="saveArticle">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分类编辑弹窗 -->
    <el-dialog v-model="catDlg.visible" :title="catDlg.isEdit ? '编辑分类' : '新增分类'" width="400px">
      <el-form>
        <el-form-item label="分类名称">
          <el-input v-model="catDlg.name" placeholder="输入分类名称" @keyup.enter="saveCat" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveCat">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Edit, Close, UploadFilled, Loading, Document, Collection, FolderOpened } from '@element-plus/icons-vue'
import { marked } from 'marked'
import request from '../api/index.js'
import { downloadFile } from '../utils/download'

const viewMode = ref('docs')

const categories = ref([])
const articles = ref([])
const activeCat = ref('通用')
const keyword = ref('')
const catOptions = computed(() => categories.value.map(c => c.name))
const dlg = ref({ visible: false, isEdit: false, viewMode: false, importMode: false, form: {} })

// ── Wiki 内嵌 ──
const wikiPages = ref([])
const wikiCurrent = ref(null)
const wikiSearch = ref('')

function renderWikiMd(content) {
  if (!content) return ''
  let html = content
  html = html.replace(/\[\[([^\]|]+?)\]\]/g, (_, title) => `<a href="javascript:void(0)" class="wiki-link" data-title="${title.trim()}">${title.trim()}</a>`)
  html = html.replace(/\[\[([^\]]+?)\|([^\]]+?)\]\]/g, (_, title, display) => `<a href="javascript:void(0)" class="wiki-link" data-title="${title.trim()}">${display.trim()}</a>`)
  html = html.replace(/\[source:\s*([^\]]*?)\]/gi, (_, src) => `<sup class="source-tag" title="${src.trim()}">[源]</sup>`)
  return marked(html)
}

let wikiSearchTimer = null
function onWikiSearch() {
  clearTimeout(wikiSearchTimer)
  wikiSearchTimer = setTimeout(() => loadWikiPages(), 300)
}

async function loadWikiPages() {
  try {
    const { data } = await request.get('/wiki/pages', { params: { keyword: wikiSearch.value || undefined, pageSize: 30 } })
    if (data.code === 200) wikiPages.value = data.data.rows
  } catch {}
}

async function selectWikiPage(p) {
  try {
    const { data } = await request.get('/wiki/pages/' + p.id)
    if (data.code === 200) wikiCurrent.value = data.data
  } catch {}
}

async function digestWikiAgain() {
  if (!wikiCurrent.value) return
  try {
    await ElMessageBox.confirm('将从原始来源重新消化生成，当前版本保存为快照。确认？', '重新消化', { type: 'info' })
    const { data } = await request.post('/wiki/regenerate/' + wikiCurrent.value.id)
    if (data.code === 200) {
      ElMessage.success('重新消化完成')
      selectWikiPage({ id: wikiCurrent.value.id })
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error('失败') }
}

function selectCat(cat) {
  activeCat.value = cat  // watch 会自动触发 load()
}

// 初始化时预加载 wiki 页面列表
onMounted(() => { loadWikiPages() })

// Wiki 链接点击导航（挂载时注册，卸载时清理）
const wikiLinkHandler = (e) => {
  const link = e.target.closest('.wiki-link')
  if (link) {
    e.preventDefault()
    const title = link.dataset.title
    const page = wikiPages.value.find(p => p.title === title)
    if (page) { selectWikiPage(page) } else { ElMessage.info('「' + title + '」页面尚未创建') }
  }
}
onMounted(() => document.addEventListener('click', wikiLinkHandler))
onUnmounted(() => document.removeEventListener('click', wikiLinkHandler))
const catDlg = ref({ visible: false, isEdit: false, id: '', name: '' })

// 导入相关
const importTab = ref('local')
const webMode = ref('single')
const webUrl = ref('')
const uploadFiles = ref([])           // { file, result, loading }
const importLoading = ref(false)
const importResult = ref(null)      // 预览显示第一个文件的结果
const importProgress = ref('')
const batchUrls = ref([])
const uploadRef = ref(null)
const batchUploadRef = ref(null)

const allFormats = '.pdf,.doc,.docx,.ppt,.pptx,.wps,.ppsx,.mhtml,.xlsx,.xls,.csv,.md,.txt,.html,.json,.xml,.log,.xmind,.key,.pages,.numbers,.jpg,.png,.jpeg,.tiff,.bmp,.gif'

const canSaveImport = computed(() => {
  if (!dlg.value.form.title) return false
  if (importTab.value === 'web') return importResult.value?.text || batchUrls.value.length
  // 本地文件：有已解析成功的文件
  return uploadFiles.value.length > 0 && uploadFiles.value.some(f => f.result && !f.result.error)
})

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

async function loadCategories() {
  const { data } = await request.get('/knowledge-base/categories')
  categories.value = data.data || []
}
async function load() {
  const params = {}
  if (activeCat.value) params.category = activeCat.value
  if (keyword.value) params.keyword = keyword.value
  const { data } = await request.get('/knowledge-base', { params })
  articles.value = data.data || []
}
function stripContent(c) { return (c || '').replace(/[#*`>\-\[\]()!|]/g, '').slice(0, 120) }
function renderMd(c) { return marked(c || '') }

watch(activeCat, () => load())

// 导入文档
function openImport() {
  dlg.value = { visible: true, isEdit: false, viewMode: false, importMode: true, form: { title: '', category: activeCat.value, tags: '', content: '' } }
  importTab.value = 'local'
  webMode.value = 'single'
  webUrl.value = ''
  uploadFiles.value = []
  importResult.value = null
  importLoading.value = false
  batchUrls.value = []
}

function closeDlg() {
  dlg.value.visible = false
  importResult.value = null
}

// 本地文件
async function onFileChange(file) {
  const entry = { file, result: null, loading: false }
  uploadFiles.value.push(entry)
  if (!dlg.value.form.title) {
    dlg.value.form.title = file.name.replace(/\.[^.]+$/, '')
  }
  // 解析当前文件
  entry.loading = true
  importLoading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.raw)
    const { data } = await request.post('/doc-import/upload', fd)
    entry.result = data.data
    // 预览第一个成功的结果
    if (!importResult.value) importResult.value = data.data
  } catch (e) {
    ElMessage.error(file.name + ' 解析失败: ' + (e.response?.data?.message || e.message))
  }
  entry.loading = false
  importLoading.value = uploadFiles.value.some(f => f.loading)
}
function onFileRemove(removeFile) {
  const idx = uploadFiles.value.findIndex(f => f.file.uid === removeFile.uid)
  if (idx > -1) uploadFiles.value.splice(idx, 1)
  if (uploadFiles.value.length === 0) {
    importResult.value = null
  } else {
    // 预览第一个有结果的文件
    const firstOk = uploadFiles.value.find(f => f.result && !f.result.error)
    importResult.value = firstOk ? firstOk.result : (uploadFiles.value[0]?.result || null)
  }
}

// 网页抓取
async function fetchWeb() {
  if (!webUrl.value.trim()) return
  importLoading.value = true
  importProgress.value = '正在抓取网页...'
  try {
    const { data } = await request.post('/doc-import/fetch-url', { url: webUrl.value.trim() })
    importResult.value = { text: data.data.content, tables: [], fileName: data.data.title }
    if (!dlg.value.form.title) dlg.value.form.title = data.data.title
    dlg.value.form.source = data.data.url
  } catch (e) {
    ElMessage.error('抓取失败')
  }
  importLoading.value = false
}

// 批量文件
async function onBatchFileChange(file) {
  importLoading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.raw)
    const { data } = await request.post('/doc-import/batch-urls', fd)
    batchUrls.value = data.data.urls
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '解析失败')
    batchUrls.value = []
  }
  importLoading.value = false
}
function onBatchFileRemove() { batchUrls.value = [] }

function downloadTemplate() {
  downloadFile('/api/doc-import/template', '模板下载失败')
}

async function batchImport() {
  if (!batchUrls.value.length) return
  if (!dlg.value.form.title) return ElMessage.warning('请输入标题')
  importLoading.value = true
  let success = 0, fail = 0
  for (let i = 0; i < batchUrls.value.length; i++) {
    importProgress.value = `导入中 ${i + 1}/${batchUrls.value.length}...`
    try {
      const { data } = await request.post('/doc-import/fetch-url', { url: batchUrls.value[i] })
      await request.post('/knowledge-base', {
        title: data.data.title || ('网页_' + (i + 1)),
        content: data.data.content,
        category: dlg.value.form.category,
        tags: dlg.value.form.tags || '',
        source: data.data.url
      })
      success++
    } catch { fail++ }
  }
  importLoading.value = false
  ElMessage.success(`导入完成: 成功 ${success} 条, 失败 ${fail} 条`)
  closeDlg()
  await loadCategories()
  await load()
}

async function saveImport() {
  if (importTab.value === 'local') {
    // 批量保存本地文件
    const successFiles = uploadFiles.value.filter(f => f.result && !f.result.error)
    if (!successFiles.length) return ElMessage.warning('没有可保存的解析结果')
    let saved = 0
    for (const entry of successFiles) {
      try {
        await request.post('/knowledge-base', {
          title: entry.file.name.replace(/\.[^.]+$/, '') || dlg.value.form.title,
          content: entry.result.text || '',
          category: dlg.value.form.category,
          tags: dlg.value.form.tags || '',
          source: entry.file.name
        })
        saved++
      } catch {}
    }
    closeDlg()
    await loadCategories()
    await load()
    ElMessage.success(`已导入 ${saved} 篇`)
  } else {
    // 网页/批量 URL
    const f = dlg.value.form
    await request.post('/knowledge-base', {
      title: f.title,
      content: importResult.value?.text || '',
      category: f.category,
      tags: f.tags || '',
      source: f.source || ''
    })
    closeDlg()
    await loadCategories()
    await load()
    ElMessage.success('已导入')
  }
}

// 文章 CRUD
function openView(a) {
  dlg.value = { visible: true, isEdit: false, viewMode: true, importMode: false, form: { ...a } }
}
function openEdit(a) {
  dlg.value = { visible: true, isEdit: true, viewMode: false, importMode: false, form: { ...a } }
}
async function saveArticle() {
  if (!dlg.value.form.title) return ElMessage.warning('标题必填')
  const f = dlg.value.form
  if (dlg.value.isEdit) {
    await request.put('/knowledge-base/' + f.id, { title: f.title, content: f.content, category: f.category, tags: f.tags, source: f.source })
  }
  dlg.value.visible = false
  await load()
  ElMessage.success('已保存')
}
async function delArticle(id) {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该文章？', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete('/knowledge-base/' + id)
    await loadCategories()
    await load()
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e?.action !== 'cancel') {
      ElMessage.error(e.response?.data?.message || '删除失败')
    }
  }
}

// ── Wiki 集成 ──
const batchDigesting = ref(false)

function goWikiPage(wikiId, wikiTitle) {
  viewMode.value = 'wiki'
  loadWikiPages().then(() => {
    const p = wikiPages.value.find(x => x.id === wikiId || x.title === wikiTitle)
    if (p) selectWikiPage(p)
  })
}

async function digestArticle(a) {
  if (!a.content) return ElMessage.warning('文章内容为空')
  a._digesting = true
  try {
    const { data } = await request.post('/knowledge-base/' + a.id + '/digest-to-wiki')
    if (data.code === 200 && data.data?.totalPages > 0) {
      ElMessage.success(`AI 消化完成，生成 ${data.data.totalPages} 个 Wiki 页面`)
      await load()
    } else {
      ElMessage.info(data.data?.message || 'AI 未提取到结构化知识点')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '消化失败')
  }
  a._digesting = false
}

async function batchDigest() {
  batchDigesting.value = true
  try {
    const { data } = await request.post('/knowledge-base/batch-digest', { category: activeCat.value || undefined })
    if (data.code === 200) {
      ElMessage.success(`批量消化完成：处理 ${data.data.processed}/${data.data.total} 篇`)
      await load()
    }
  } catch (e) {
    ElMessage.error('批量消化失败')
  }
  batchDigesting.value = false
}

// 分类管理
function openAddCat() { catDlg.value = { visible: true, isEdit: false, id: '', name: '' } }
function openEditCat(c) { catDlg.value = { visible: true, isEdit: true, id: c.id, name: c.name } }
async function saveCat() {
  if (!catDlg.value.name.trim()) return ElMessage.warning('名称必填')
  if (catDlg.value.isEdit) {
    await request.put('/knowledge-base/categories/' + catDlg.value.id, { name: catDlg.value.name.trim() })
  } else {
    await request.post('/knowledge-base/categories', { name: catDlg.value.name.trim() })
  }
  catDlg.value.visible = false
  await loadCategories()
  ElMessage.success('已保存')
}
async function delCat(c) {
  try {
    await ElMessageBox.confirm(`删除"${c.name}"分类？文章将移至"通用"。`, '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete('/knowledge-base/categories/' + c.id)
    await loadCategories()
    await load()
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e?.action !== 'cancel') {
      ElMessage.error(e.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => { await loadCategories(); await load() })
</script>

<style scoped>
.kb-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }

/* stats */
.stat-row { display: flex; gap: 12px; margin-bottom: 16px; }
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
.stat-num { font-size: 22px; font-weight: 700; color: #303133; line-height: 1; }
.stat-label { font-size: 12px; color: #909399; margin-left: auto; }

.pg-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.pg-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.pg-body { flex: 1; padding: 16px 24px; overflow: hidden; }
.kb-layout { display: flex; gap: 16px; height: 100%; }
.kb-sidebar {
  width: 180px; flex-shrink: 0; background: #fff; border-radius: 10px;
  border: 1px solid #f0ecfc; padding: 12px 0; overflow-y: auto;
}
.kb-side-title { font-size: 12px; color: #b8aad0; padding: 0 14px 8px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
.kb-cat-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; cursor: pointer; font-size: 13px; color: #4a3f5e; transition: background .15s;
}
.kb-cat-item:hover { background: #f5f3ff; }
.kb-cat-item.active { background: #ede9fe; color: #7c3aed; }
.kb-cat-edit, .kb-cat-del { opacity: 0; transition: opacity .15s; padding: 2px; }
.kb-cat-item:hover .kb-cat-edit, .kb-cat-item:hover .kb-cat-del { opacity: 1; }
.kb-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.tb-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.kb-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.kb-item {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 14px 16px; background: #fff; border-radius: 10px;
  border: 1px solid #f0ecfc; cursor: pointer; transition: all .15s;
}
.kb-item:hover { border-color: #c4b5fd; box-shadow: 0 2px 8px rgba(124,58,237,.06); }
.kbi-info { flex: 1; min-width: 0; }
.kbi-title { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.kbi-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.kb-tag { font-size: 10px; }
.kbi-source { font-size: 11px; color: #10b981; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbi-date { font-size: 11px; color: #b8aad0; margin-left: auto; }
.kbi-views { font-size: 11px; color: #b8aad0; }
.kbi-preview { font-size: 12px; color: #6b5f80; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbi-actions { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; margin-left: 8px; }
.view-article { max-height: 60vh; overflow-y: auto; }
.va-meta { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; font-size: 12px; color: #b8aad0; }
.va-content { line-height: 1.8; color: #4a3f5e; }
.va-content :deep(h2) { font-size: 16px; margin: 14px 0 6px; }
.va-content :deep(p) { margin: 6px 0; }
.va-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.va-content :deep(pre) { background: #2d2640; color: #e8e0f0; padding: 12px; border-radius: 8px; overflow-x: auto; }

/* 导入 */
.import-tabs { min-height: 360px; }
.upload-zone { width: 100%; }
.upload-icon { font-size: 36px; color: #c4b5fd; }
.upload-text { font-size: 14px; color: #4a3f5e; margin-top: 8px; }
.upload-hint { font-size: 11px; color: #b8aad0; margin-top: 4px; }
.upload-info { margin-top: 8px; }
.upload-file-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.upload-file-size { font-size: 12px; color: #b8aad0; }
.upload-file-err { font-size: 11px; color: #f56c6c; }
.import-preview { margin-top: 12px; background: #fafafe; border: 1px solid #f0ecfc; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto; }
.ip-error { margin-bottom: 4px; }
.ip-title { font-size: 12px; font-weight: 600; color: #4a3f5e; margin-bottom: 6px; display: flex; align-items: center; }
.ip-text { font-size: 12px; color: #6b5f80; white-space: pre-wrap; word-break: break-all; line-height: 1.6; }
.batch-zone { display: flex; flex-direction: column; gap: 10px; }
.batch-info { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #6b5f80; }
.batch-list { background: #fafafe; border: 1px solid #f0ecfc; border-radius: 8px; padding: 10px; max-height: 200px; overflow-y: auto; }
.batch-count { font-size: 12px; font-weight: 600; color: #7c3aed; margin-bottom: 6px; }
.batch-url { font-size: 11px; color: #6b5f80; padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Wiki 嵌入 ── */
.wiki-embed { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wiki-embed-body { flex: 1; display: flex; overflow: hidden; border-radius: 12px; border: 1px solid #f0ecfc; background: #fff; }
.wiki-embed-sidebar { width: 240px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding: 12px; display: flex; flex-direction: column; }
.wiki-embed-list { flex: 1; overflow-y: auto; }
.wiki-embed-item { padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; transition: background .15s; }
.wiki-embed-item:hover { background: #f5f3ff; }
.wiki-embed-item.sel { background: #ede9fe; }
.wei-title { font-size: 13px; font-weight: 500; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wei-meta { font-size: 11px; color: #b8aad0; }
.wiki-embed-main { flex: 1; overflow-y: auto; padding: 20px 24px; }
.wiki-embed-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.wem-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.wem-hd h3 { margin: 0; font-size: 18px; color: #1e293b; }
.wem-summary { padding: 10px 14px; background: #f5f3ff; border-left: 3px solid #7c3aed; border-radius: 0 6px 6px 0; font-size: 13px; color: #4a3f5e; margin-bottom: 14px; }
.wem-content :deep(h2) { font-size: 1.2em; margin: 14px 0 6px; }
.wem-content :deep(h3) { font-size: 1.05em; margin: 12px 0 4px; }
.wem-content :deep(p) { margin: 8px 0; line-height: 1.7; }
.wem-content :deep(ul), .wem-content :deep(ol) { padding-left: 18px; margin: 6px 0; }
.wem-content :deep(.wiki-link) { color: #7c3aed; text-decoration: none; border-bottom: 1px dashed #a78bfa; cursor: pointer; }
.wem-content :deep(.wiki-link:hover) { color: #5b21b6; }
.wem-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.wem-content :deep(pre) { background: #1e1e2e; color: #cdd6f4; padding: 14px; border-radius: 8px; overflow-x: auto; }
.wem-content :deep(pre code) { background: none; padding: 0; color: inherit; }
.wem-kb { margin-top: 20px; padding-top: 14px; border-top: 1px solid #f0ecfc; }
.wem-kb-link { display: block; padding: 4px 0; font-size: 13px; color: #7c3aed; cursor: pointer; }
.wem-kb-link:hover { text-decoration: underline; }
</style>
