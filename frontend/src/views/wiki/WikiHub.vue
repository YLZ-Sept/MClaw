<template>
  <div class="wiki-shell">
    <!-- ====== 无 KB 时：网格视图 ====== -->
    <template v-if="!currentKB">
      <div class="wiki-library">
        <div class="page-hd">
          <div>
            <div class="page-kicker">Knowledge</div>
            <h1 class="page-title">知识库</h1>
            <p class="page-desc">AI 驱动的知识管理与语义检索</p>
          </div>
          <button class="btn-primary" @click="showCreateKB = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建知识库
          </button>
        </div>

        <div class="kb-grid" v-loading="kbLoading">
          <div v-for="kb in knowledgeBases" :key="kb.id" class="kb-card" @click="openKB(kb)">
            <div class="kb-card-top">
              <div class="kb-avatar" :style="{ background: kbColor(kb.id) }">{{ kbInitial(kb.name) }}</div>
              <div class="kb-info">
                <h3 class="kb-name">{{ kb.name }}</h3>
                <p class="kb-desc" v-if="kb.description">{{ kb.description }}</p>
              </div>
            </div>
            <div class="kb-stats">
              <span>{{ kb.pageCount || 0 }} 页</span>
              <span>{{ kb.rawCount || 0 }} 素材</span>
              <span class="kb-time">{{ fmtRelative(kb.updated_at) }}</span>
            </div>
            <div class="kb-actions" @click.stop>
              <el-button size="small" text @click="openKB(kb)">打开</el-button>
              <el-button size="small" text @click="deleteKB(kb.id)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!knowledgeBases.length && !kbLoading" class="empty-hero">
          <div class="empty-icon">📚</div>
          <h3>还没有知识库</h3>
          <p>创建知识库，让 AI 帮你消化文档、构建知识图谱</p>
          <button class="btn-primary" @click="showCreateKB = true">创建第一个知识库</button>
        </div>
      </div>
    </template>

    <!-- ====== 工作区：KB 已选中 ====== -->
    <template v-else>
      <div class="workspace">
        <div class="workspace-header">
          <button class="back-btn" @click="currentKB = null"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>返回</button>
          <div class="kb-meta">
            <div class="kb-avatar-sm" :style="{ background: kbColor(currentKB.id) }">{{ kbInitial(currentKB.name) }}</div>
            <div>
              <h2 class="ws-title">{{ currentKB.name }}</h2>
              <span class="ws-subtitle">{{ currentKB.pageCount || 0 }} 页 · {{ currentKB.rawCount || 0 }} 素材</span>
            </div>
          </div>
          <div class="ws-tabs">
            <button v-for="t in wsTabs" :key="t.key" class="ws-tab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">{{ t.label }}</button>
          </div>
        </div>

        <div class="workspace-body">
          <!-- 页面浏览 -->
          <template v-if="activeTab === 'pages'">
            <div class="ws-layout">
              <div class="ws-sidebar">
                <div class="sidebar-search">
                  <input v-model="pageSearch" class="sidebar-input" placeholder="搜索页面…" />
                  <button class="sidebar-add-btn" @click="showNewPage=true">+</button>
                </div>
                <div class="page-list">
                  <div v-for="p in filteredPages" :key="p.id" class="page-item" :class="{ active: currentPage?.id === p.id }" @click="loadPage(p)">
                    <span class="page-type-dot" :style="{ background: pageTypeColor(p.page_type) }"></span>
                    <span class="page-title-text">{{ p.title || '未命名' }}</span>
                    <span class="page-version" v-if="p.version">v{{ p.version }}</span>
                  </div>
                  <div v-if="!filteredPages.length" class="sidebar-empty">暂无页面，上传文件后自动 AI 消化生成</div>
                </div>
              </div>
              <div class="ws-content">
                <!-- 热缓存摘要 -->
                <div v-if="kbSummary" class="kb-summary-card">
                  <div class="kb-summary-text">{{ kbSummary }}</div>
                  <button class="kb-summary-btn" @click="generateSummary">✨ AI 生成摘要</button>
                </div>
                <button v-else class="kb-summary-gen" @click="generateSummary" :disabled="summarizing">
                  {{ summarizing ? '⏳ 生成中…' : '✨ AI 生成知识库摘要' }}
                </button>

                <!-- 页面查看器 -->
                <div v-if="currentPage" class="page-viewer">
                  <div class="page-header">
                    <div class="page-type-badge" :style="{ background: pageTypeBg(currentPage.page_type), color: pageTypeColor(currentPage.page_type) }">{{ currentPage.page_type || 'page' }}</div>
                    <h3 class="page-title">{{ currentPage.title }}</h3>
                    <span class="page-meta">v{{ currentPage.version || 1 }} · {{ currentPage.updated_at ? fmtTime(currentPage.updated_at) : '' }}</span>
                    <div class="page-actions">
                      <el-button size="small" v-if="!editing" @click="startEdit">编辑</el-button>
                      <el-button size="small" type="primary" v-if="editing" @click="savePage" :loading="saving">保存</el-button>
                      <el-button size="small" v-if="editing" @click="editing = false">取消</el-button>
                    </div>
                  </div>
                  <div v-if="currentPage.summary" class="page-summary">📝 {{ currentPage.summary }}</div>
                  <div v-if="currentPage.key_concepts" class="page-concepts">
                    <span v-for="kw in parseConcepts(currentPage.key_concepts)" :key="kw" class="concept-tag">{{ kw }}</span>
                  </div>
                  <div v-if="editing" class="page-editor">
                    <textarea v-model="editContent" class="editor-area"></textarea>
                  </div>
                  <div class="page-toolbar">
                    <button class="view-toggle" :class="{active:!rawView}" @click="rawView=false">预览</button>
                    <button class="view-toggle" :class="{active:rawView}" @click="rawView=true">原文</button>
                  </div>
                  <div v-if="!rawView" class="page-body markdown-body" v-html="renderedContent"></div>
                  <pre v-else class="raw-text">{{ currentPage?.content }}</pre>
                  <div v-if="currentPage && backlinks.length" class="backlinks-panel">
                    <h4>🔗 引用此页面的页面</h4>
                    <span v-for="bl in backlinks" :key="bl.source_page_id" class="backlink-item" @click="loadPageById(bl.source_page_id)">{{ bl.source_title }}</span>
                  </div>
                  <div v-if="currentPage && relatedPages.length" class="related-panel">
                    <h4>📄 相关页面</h4>
                    <span v-for="rp in relatedPages" :key="rp.id" class="backlink-item" @click="loadPageById(rp.id)">{{ rp.title }}</span>
                  </div>
                  <div v-if="!currentPage" class="page-empty">选择左侧页面查看内容</div>
                </div>
              </div>
            </div>
          </template>

          <!-- 实体图谱 -->
          <div v-if="activeTab === 'graph'" class="graph-panel">
            <div ref="graphRef" class="graph-container"></div>
            <div v-if="!graphNodes.length" class="graph-empty">暂无页面间链接数据，上传文件 AI 消化后生成</div>
          </div>

          <!-- 素材管理 -->
          <div v-if="activeTab === 'materials'" class="materials-panel">
            <div class="panel-hd">
              <h3>素材管理</h3>
              <div style="display:flex;gap:8px;align-items:center">
                <el-upload :auto-upload="true" :show-file-list="false" :http-request="uploadMaterial" accept=".txt,.md,.csv,.pdf,.docx,.xlsx,.pptx,.html">
                  <el-button type="primary" size="small">📄 上传素材</el-button>
                </el-upload>
                <input ref="folderInputRef" type="file" webkitdirectory style="display:none" @change="onFolderSelected" />
                <el-button type="primary" size="small" plain :loading="uploadingFolder" @click="pickFolder">
                  {{ uploadingFolder ? `📁 ${uploadProgress}` : '📁 上传文件夹' }}
                </el-button>
              </div>
            </div>
            <table class="mat-table" v-if="materials.length">
              <thead><tr><th>名称</th><th>类型</th><th>状态</th><th>时间</th></tr></thead>
              <tbody>
                <tr v-for="m in materials" :key="m.id">
                  <td>{{ m.title || m.filename }}</td>
                  <td><el-tag size="small" round>{{ m.source_type || 'file' }}</el-tag></td>
                  <td><span class="mat-status" :class="m.status">{{ m.status || 'pending' }}</span></td>
                  <td class="cell-time">{{ fmtTime(m.created_at) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="mat-empty">暂无素材，上传文件开始构建知识库</div>
          </div>

          <!-- 配置 -->
          <div v-if="activeTab === 'config'" class="config-panel">
            <div class="cfg-card">
              <h4>模型策略</h4>
              <p class="cfg-desc">选择用于知识库处理的 AI 模型</p>
              <el-select v-model="configModel" placeholder="选择模型" style="width:320px" @change="saveConfig">
                <el-option v-for="m in modelList" :key="m.id" :label="m.name" :value="m.id" />
              </el-select>
            </div>
            <div class="cfg-card">
              <h4>处理规则</h4>
              <p class="cfg-desc">自定义 AI 处理行为</p>
              <el-input v-model="configRules" type="textarea" :rows="6" placeholder="Markdown 格式的处理规则…" @change="saveConfig" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 新建页面对话框 -->
    <el-dialog v-model="showNewPage" title="新建页面" width="560px" @closed="newPageForm={title:'',content:''}">
      <el-form label-position="top">
        <el-form-item label="标题" required><el-input v-model="newPageForm.title" placeholder="页面标题" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="newPageForm.content" type="textarea" :rows="10" placeholder="Markdown 格式，支持 [[链接]]" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showNewPage=false">取消</el-button><el-button type="primary" @click="createPage" :loading="creating">创建</el-button></template>
    </el-dialog>

    <!-- 创建 KB 对话框 -->
    <el-dialog v-model="showCreateKB" title="新建知识库" width="480px">
      <el-form :model="newKBForm" label-position="top">
        <el-form-item label="名称" required><el-input v-model="newKBForm.name" placeholder="例如：产品手册" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="newKBForm.description" placeholder="知识库用途说明" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showCreateKB=false">取消</el-button><el-button type="primary" @click="createKB" :loading="creating">创建</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/index.js'
import { marked } from 'marked'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([GraphChart, TooltipComponent, CanvasRenderer])

const kbLoading = ref(false)
const knowledgeBases = ref([])
const currentKB = ref(null)
const activeTab = ref('pages')
const currentPage = ref(null)
const editing = ref(false)
const rawView = ref(false)
const editContent = ref('')
const saving = ref(false)
const pageSearch = ref('')
const pages = ref([])
const materials = ref([])
const modelList = ref([])
const configModel = ref('')
const configRules = ref('')
const showCreateKB = ref(false)
const creating = ref(false)
const folderInputRef = ref(null)
const uploadingFolder = ref(false)
const uploadProgress = ref('')
const newKBForm = ref({ name: '', description: '' })

const wsTabs = [{ key: 'pages', label: '页面' }, { key: 'graph', label: '图谱' }, { key: 'materials', label: '素材' }, { key: 'config', label: '配置' }]

const filteredPages = computed(() => {
  if (!pageSearch.value) return pages.value
  const q = pageSearch.value.toLowerCase()
  return pages.value.filter(p => (p.title || '').toLowerCase().includes(q) || (p.slug || '').toLowerCase().includes(q))
})

function kbColor(id) { const colors = ['#7c3aed','#6366f1','#8b5cf6','#a78bfa','#c4b5fd']; return colors[(String(id).charCodeAt(0)||0) % colors.length] }
function kbInitial(name) { return (name || 'K')[0].toUpperCase() }
function fmtTime(t) { if (!t) return '-'; return new Date(t).toLocaleString('zh-CN', { month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }) }
function fmtRelative(t) { if (!t) return '-'; const d = Math.floor((Date.now() - new Date(t).getTime())/86400000); return d <= 0 ? '今天' : d === 1 ? '昨天' : `${d}天前` }
function pageTypeColor(t) { const m = { entity:'#dc2626', concept:'#7c3aed', source:'#059669', synthesis:'#d97706' }; return m[t] || '#94a3b8' }
function pageTypeBg(t) { const m = { entity:'#fef2f2', concept:'#f5f3ff', source:'#ecfdf5', synthesis:'#fffbeb' }; return m[t] || '#f3f4f6' }

const renderedContent = computed(() => {
  try {
    let text = currentPage.value?.content || ''
    if (!text) return '<p style="color:#94a3b8">*暂无内容*</p>'
    if (text.length > 200000) text = text.slice(0, 200000) + '\n\n*(内容过长)*'
    let html = marked.parse(text)
    // Wikilink: [[目标]] 或 [[目标|显示]]
    html = html.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (m, target, display) => {
      return '<a class="wiki-link" data-target="' + target + '" href="javascript:void(0)">' + (display || target) + '</a>'
    })
    return html
  } catch { return '<pre>' + (currentPage.value?.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>' }
})
function parseConcepts(kc) { try { return typeof kc === 'string' ? JSON.parse(kc) : (Array.isArray(kc) ? kc : []) } catch { return [] } }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// ====== 图谱、反向链接、Wikilink ======
const graphRef = ref(null)
const graphNodes = ref([])
const backlinks = ref([])
const relatedPages = ref([])
const kbSummary = ref('')
const showNewPage = ref(false)
const newPageForm = ref({ title: '', content: '' })
const summarizing = ref(false)
let graphChart = null
let pollTimers = []

async function loadPage(p) {
  try {
    const { data } = await request.get('/knowledge-base/kbs/' + currentKB.value.id + '/pages/' + p.id)
    currentPage.value = data.data || data
    editing.value = false; rawView.value = false
    // 加载反向链接 + 相关页面
    try { const { data: bl } = await request.get('/knowledge-base/kbs/' + currentKB.value.id + '/pages/' + p.id + '/backlinks'); backlinks.value = bl.data || [] } catch { backlinks.value = [] }
    try { const { data: rp } = await request.get('/knowledge-base/kbs/' + currentKB.value.id + '/pages/' + p.id + '/related'); relatedPages.value = rp.data || [] } catch { relatedPages.value = [] }
  } catch { ElMessage.error('加载页面失败') }
}
function loadPageById(id) { loadPage({ id }) }

async function createPage() {
  if (!newPageForm.value.title) return ElMessage.warning('请输入标题')
  creating.value = true
  try {
    await request.post('/knowledge-base/kbs/' + currentKB.value.id + '/pages', newPageForm.value)
    ElMessage.success('页面已创建'); showNewPage.value = false
    openKB(currentKB.value)
  } catch(e) { ElMessage.error(e.response?.data?.message || '创建失败') }
  creating.value = false
}

async function generateSummary() {
  if (summarizing.value) return
  summarizing.value = true
  try {
    const { data } = await request.post('/knowledge-base/kbs/' + currentKB.value.id + '/summary')
    kbSummary.value = data.data?.content || ''
    ElMessage.success('摘要已生成')
  } catch { ElMessage.error('生成失败') }
  finally { summarizing.value = false }
}

async function loadGraph() {
  try {
    const { data } = await request.get('/knowledge-base/kbs/' + currentKB.value.id + '/graph')
    const g = data.data || { nodes: [], edges: [] }
    graphNodes.value = g.nodes
    await nextTick()
    if (graphRef.value && g.nodes.length > 0) {
      if (graphChart) graphChart.dispose()
      graphChart = echarts.init(graphRef.value)
      graphChart.setOption({
        tooltip: { formatter: function(p){ return p.dataType==='node' ? '<b>'+p.name+'</b>' : '' } },
        series: [{
          type: 'graph', layout: 'force', roam: true, draggable: true,
          force: { repulsion: 300, edgeLength: [80, 200] },
          data: g.nodes.map(n => ({ id:n.id, name:n.name, category:n.category, symbolSize:n.symbolSize||24,
            itemStyle:{color:pageTypeColor(n.category)} })),
          edges: g.edges.map(e => ({ source: e.source, target: e.target })),
          lineStyle: { color: '#c4b5fd', curveness: 0.2, opacity: 0.6 },
          label: { show: true, fontSize: 11, color: '#4a3f5e' }
        }]
      })
      graphChart.on('click', function(params){ if(params.dataType==='node'&&params.data?.id) loadPageById(params.data.id) })
    }
  } catch {}
}
// 切换图谱 tab 时加载
watch(() => activeTab.value, v => { if (v === 'graph' && currentKB.value) { nextTick(loadGraph) } })

// Wikilink 点击处理
function handleWikilinkClick(e) {
  const link = e.target.closest('.wiki-link')
  if (!link) return
  e.preventDefault()
  const target = link.dataset.target
  if (!target) return
  const page = pages.value.find(p => p.title === target)
  if (page) { activeTab.value = 'pages'; loadPage(page) }
  else ElMessage.info('页面 "' + target + '" 尚未创建')
}
function clearPollTimers() { pollTimers.forEach(t => clearTimeout(t)); pollTimers = [] }

onMounted(() => { document.addEventListener('click', handleWikilinkClick); loadKBs() })
onUnmounted(() => { document.removeEventListener('click', handleWikilinkClick); clearPollTimers(); if(graphChart) graphChart.dispose() })

async function loadKBs() {
  kbLoading.value = true
  try { const { data } = await request.get('/knowledge-base/kbs'); knowledgeBases.value = data.data || [] } catch {}
  kbLoading.value = false
}

async function openKB(kb) {
  currentKB.value = kb
  activeTab.value = 'pages'
  kbSummary.value = kb.summary || ''
  try {
    const { data: p } = await request.get('/knowledge-base/kbs/' + kb.id + '/pages')
    pages.value = p.data || []
    const { data: m } = await request.get('/knowledge-base/kbs/' + kb.id + '/materials')
    materials.value = m.data || []
    const { data: c } = await request.get('/knowledge-base/kbs/' + kb.id + '/config')
    if (c.data) { configModel.value = c.data.modelId || ''; configRules.value = c.data.rules || '' }
    const { data: ml } = await request.get('/model-configs')
    modelList.value = (ml.data || []).filter(m => m.is_active)
  } catch {}
}

function startEdit() { editContent.value = currentPage.value?.content || ''; editing.value = true }
async function savePage() {
  saving.value = true
  try {
    await request.put('/knowledge-base/kbs/' + currentKB.value.id + '/pages/' + currentPage.value.id, { content: editContent.value })
    ElMessage.success('已保存')
    editing.value = false
    currentPage.value.content = editContent.value
  } catch { ElMessage.error('保存失败') }
  saving.value = false
}

async function uploadSingleFile(file) {
  const form = new FormData(); form.append('file', file)
  const kbId = currentKB.value.id
  const { data } = await request.post('/knowledge-base/kbs/' + kbId + '/materials/upload', form)
  return data
}

async function uploadMaterial(options) {
  try {
    const data = await uploadSingleFile(options.file)
    if (data.code === 200) {
      ElMessage.success(data.data?.message || '已上传')
      scheduleRefresh()
    }
  } catch { ElMessage.error('上传失败') }
}

function scheduleRefresh() {
  const kbId = currentKB.value.id
  clearPollTimers()
  pollTimers.push(
    setTimeout(() => { if (currentKB.value?.id === kbId) openKB(currentKB.value) }, 5000),
    setTimeout(() => { if (currentKB.value?.id === kbId) openKB(currentKB.value) }, 15000),
    setTimeout(() => { if (currentKB.value?.id === kbId) openKB(currentKB.value) }, 45000)
  )
}

function pickFolder() {
  folderInputRef.value?.click()
}

async function onFolderSelected(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  uploadingFolder.value = true
  let done = 0, failed = 0
  for (const file of files) {
    uploadProgress.value = `${done + 1}/${files.length} ${file.name}`
    try {
      const data = await uploadSingleFile(file)
      if (data.code === 200) done++
      else failed++
    } catch { failed++ }
  }
  uploadingFolder.value = false
  uploadProgress.value = ''
  // 重置 input 以便重复选择同一文件夹
  e.target.value = ''
  if (done > 0) {
    ElMessage.success(`已上传 ${done} 个文件${failed ? `，${failed} 失败` : ''}`)
    scheduleRefresh()
  } else {
    ElMessage.error('全部上传失败')
  }
}

async function saveConfig() {
  try {
    await request.put('/knowledge-base/kbs/' + currentKB.value.id + '/config', { modelId: configModel.value, rules: configRules.value })
    ElMessage.success('配置已保存')
  } catch {}
}

async function createKB() {
  creating.value = true
  try {
    const { data } = await request.post('/knowledge-base/kbs', { name: newKBForm.value.name, description: newKBForm.value.description })
    if (data.code === 200) {
      ElMessage.success('知识库已创建')
      showCreateKB.value = false; loadKBs()
    } else {
      ElMessage.error(data.message || '创建失败')
    }
  } catch (e) { ElMessage.error(e.response?.data?.message || e.message || '创建失败') }
  creating.value = false
}

async function deleteKB(id) {
  try { await ElMessageBox.confirm('确定删除该知识库？所有页面和素材将被移除', '确认', { type: 'warning' }) } catch { return }
  try { await request.delete('/knowledge-base/kbs/' + id); ElMessage.success('已删除'); loadKBs() } catch { ElMessage.error('删除失败') }
}

</script>

<style scoped>
.wiki-shell { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
.wiki-library { padding: 28px 32px; }
.page-hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.page-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7c3aed; margin-bottom: 8px; }
.page-title { font-size: 26px; font-weight: 800; color: #4a3f5e; margin: 0 0 6px; }
.page-desc { font-size: 13px; color: #94a3b8; margin: 0; }
.btn-primary { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: white; border: none; border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(124,58,237,0.3); }

/* KB Grid */
.kb-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(320px,1fr)); gap: 16px; }
.kb-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 18px; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 12px; }
.kb-card:hover { border-color: #c4b5fd; box-shadow: 0 4px 16px rgba(124,58,237,0.08); transform: translateY(-1px); }
.kb-card-top { display: flex; gap: 14px; align-items: flex-start; }
.kb-avatar { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 700; flex-shrink: 0; }
.kb-info { flex: 1; min-width: 0; }
.kb-name { font-size: 16px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.kb-desc { font-size: 12px; color: #94a3b8; margin: 0; }
.kb-stats { display: flex; gap: 16px; font-size: 12px; color: #94a3b8; }
.kb-time { color: #b8aad0; margin-left: auto; }
.kb-actions { display: flex; gap: 8px; border-top: 1px solid #f8f6fc; padding-top: 10px; }

/* Workspace */
.workspace { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.workspace-header { display: flex; align-items: center; gap: 16px; padding: 14px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; flex-shrink: 0; }
.back-btn { display: flex; align-items: center; gap: 4px; background: none; border: 1px solid #f0ecfc; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; color: #4a3f5e; }
.back-btn:hover { background: #f5f3ff; }
.kb-meta { display: flex; align-items: center; gap: 10px; }
.kb-avatar-sm { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; }
.ws-title { font-size: 16px; font-weight: 700; color: #4a3f5e; margin: 0; }
.ws-subtitle { font-size: 11px; color: #94a3b8; }
.ws-tabs { display: flex; gap: 4px; margin-left: auto; }
.ws-tab { padding: 6px 14px; border-radius: 8px; border: none; background: none; cursor: pointer; font-size: 13px; color: #94a3b8; font-weight: 500; }
.ws-tab:hover { color: #7c3aed; }
.ws-tab.active { background: #ede9fe; color: #7c3aed; font-weight: 600; }

.workspace-body { flex: 1; overflow: hidden; }
.ws-layout { display: flex; height: 100%; }
.ws-sidebar { width: 240px; flex-shrink: 0; border-right: 1px solid #f0ecfc; display: flex; flex-direction: column; }
.sidebar-search { padding: 12px; }
.sidebar-input { width: 100%; padding: 8px 10px; border: 1px solid #f0ecfc; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; }
.sidebar-input:focus { border-color: #7c3aed; }
.page-list { flex: 1; overflow-y: auto; }
.page-item { display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; transition: background 0.1s; }
.page-item:hover { background: #faf8ff; }
.page-item.active { background: #ede9fe; color: #7c3aed; font-weight: 600; }
.page-type-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.page-title-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-version { font-size: 10px; color: #b8aad0; }
.sidebar-empty { padding: 24px; text-align: center; color: #b8aad0; font-size: 13px; }

.ws-content { flex: 1; overflow-y: auto; }
.page-viewer { padding: 24px 32px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid #f0ecfc; }
.page-type-badge { padding: 2px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.page-actions { margin-left: auto; display: flex; gap: 6px; }
.page-editor { margin-top: 8px; }
.editor-area { width: 100%; min-height: 400px; padding: 14px; border: 1px solid #f0ecfc; border-radius: 10px; font-size: 14px; font-family: 'SF Mono',monospace; line-height: 1.6; resize: vertical; outline: none; }
.editor-area:focus { border-color: #7c3aed; }
.page-toolbar { display:flex; gap:4px; margin-bottom:12px; }
.view-toggle { padding:4px 12px; border-radius:6px; border:1px solid #f0ecfc; background:#fff; cursor:pointer; font-size:12px; color:#94a3b8; }
.view-toggle.active { background:#ede9fe; color:#7c3aed; border-color:#c4b5fd; font-weight:600; }
.page-summary { background:linear-gradient(135deg,#f5f3ff,#faf8ff); border-left:3px solid #7c3aed; padding:10px 14px; border-radius:8px; font-size:13px; color:#4a3f5e; margin-bottom:12px; line-height:1.5; }
.page-concepts { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.concept-tag { padding:2px 10px; background:#ede9fe; color:#7c3aed; border-radius:12px; font-size:12px; font-weight:500; }

.raw-text { background:#f8f7ff; border:1px solid #f0ecfc; border-radius:10px; padding:16px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-all; overflow-x:auto; max-height:600px; overflow-y:auto; color:#4a3f5e; font-family:'SF Mono',monospace; }
.page-empty { padding: 64px; text-align: center; color: #94a3b8; }

/* Materials */
.materials-panel { padding: 24px 32px; }
.panel-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.panel-hd h3 { font-size: 18px; font-weight: 700; color: #4a3f5e; margin: 0; }
.mat-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mat-table th { padding: 8px 12px; text-align: left; font-weight: 600; font-size: 11px; color: #b8aad0; text-transform: uppercase; background: #faf8ff; border-bottom: 1px solid #f0ecfc; }
.mat-table td { padding: 8px 12px; border-bottom: 1px solid #f8f6fc; color: #4a3f5e; }
.mat-status { font-size: 12px; font-weight: 500; }
.mat-status.completed,.mat-status.digesting { color: #7c3aed; }
.mat-status.processing { color: #7c3aed; animation: pulse 1.5s infinite; }
.mat-status.failed { color: #ef4444; }
.mat-status.pending { color: #94a3b8; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
.cell-time { font-size: 12px; color: #94a3b8; }
.mat-empty { padding: 48px; text-align: center; color: #94a3b8; }

/* Config */
.config-panel { padding: 24px 32px; }
.cfg-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
.cfg-card h4 { font-size: 15px; font-weight: 600; color: #4a3f5e; margin: 0 0 4px; }
.cfg-desc { font-size: 12px; color: #94a3b8; margin: 0 0 12px; }

/* Markdown */
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; }
.markdown-body :deep(th) { background: #ede9fe; color: #5b21b6; padding: 8px 12px; border: 1px solid #e0d6f5; }
.markdown-body :deep(td) { padding: 6px 12px; border: 1px solid #e0d6f5; }
.markdown-body :deep(strong) { color: #7c3aed; }
.markdown-body :deep(code) { background: #ede9fe; padding: 2px 6px; border-radius: 4px; color: #5b21b6; }
.markdown-body :deep(pre) { background: #f8f7ff; padding: 12px 16px; border-radius: 10px; overflow-x: auto; }
.markdown-body :deep(blockquote) { border-left: 3px solid #c4b5fd; padding-left: 12px; margin: 8px 0; color: #8b7aaf; }

.empty-hero { display: flex; flex-direction: column; align-items: center; padding: 80px 24px; text-align: center; gap: 12px; }
.empty-icon { font-size: 56px; }
.empty-hero h3 { font-size: 20px; color: #4a3f5e; margin: 0; }
.empty-hero p { font-size: 14px; color: #94a3b8; margin: 0; }

/* Wikilink */
.markdown-body :deep(.wiki-link) { color:#7c3aed; text-decoration:underline; text-underline-offset:2px; cursor:pointer; font-weight:500; }
.markdown-body :deep(.wiki-link:hover) { color:#6366f1; background:rgba(124,58,237,0.06); border-radius:3px; padding:0 2px; }

/* Backlinks */
.backlinks-panel { margin-top:16px; padding-top:12px; border-top:1px solid #f0ecfc; }
.backlinks-panel h4 { font-size:13px; color:#94a3b8; margin:0 0 8px; }
.backlink-item { display:inline-block; padding:3px 10px; margin:2px 4px; background:#f5f3ff; border-radius:8px; font-size:12px; color:#7c3aed; cursor:pointer; font-weight:500; }
.backlink-item:hover { background:#ede9fe; }

/* Graph */
.graph-panel { height:100%; position:relative; }
.graph-container { width:100%; height:100%; min-height:400px; }
.graph-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:14px; }

/* Sidebar add button */
.sidebar-search { display:flex; gap:4px; align-items:center; }
.sidebar-add-btn { width:28px;height:28px;border-radius:6px;border:1px solid #f0ecfc;background:#fff;cursor:pointer;font-size:16px;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.sidebar-add-btn:hover { background:#ede9fe; }

/* KB Summary */
.kb-summary-card { background:linear-gradient(135deg,#f5f3ff,#faf8ff);border:1px solid #ede9fe;border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start; }
.kb-summary-text { flex:1;font-size:13px;color:#4a3f5e;line-height:1.6; }
.kb-summary-btn { padding:4px 10px;border:1px solid #c4b5fd;border-radius:8px;background:#fff;cursor:pointer;font-size:11px;color:#7c3aed;white-space:nowrap;flex-shrink:0; }
.kb-summary-btn:hover { background:#ede9fe; }
.kb-summary-gen { display:block;width:100%;padding:8px;border:1px dashed #ddd6fe;border-radius:8px;background:transparent;cursor:pointer;font-size:13px;color:#94a3b8;margin-bottom:16px; }
.kb-summary-gen:hover:not(:disabled) { border-color:#7c3aed;color:#7c3aed;background:#faf8ff; }
.kb-summary-gen:disabled { opacity:0.5;cursor:not-allowed; }

/* Related pages */
.related-panel { margin-top:8px;padding-top:8px;border-top:1px solid #f8f6fc; }
.related-panel h4 { font-size:13px;color:#94a3b8;margin:0 0 6px; }
</style>
