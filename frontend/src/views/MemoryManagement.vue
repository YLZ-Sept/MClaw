<template>
  <div class="page-container">
    <div class="page-hd">
      <span class="page-title">记忆管理</span>
      <el-button size="small" text @click="loadAgents"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <!-- Agent 选择卡片 -->
    <div class="sec-nav-row" v-if="agents.length">
      <div v-for="a in agents" :key="a.id" class="sec-nav-card"
        :class="{ active: activeAgent === a.id }" @click="selectAgent(a.id)">
        <span class="sec-nav-icon">{{ a.emoji || '🤖' }}</span>
        <div class="sec-nav-text">
          <span class="sec-nav-label">{{ a.name }}</span>
          <span class="sec-nav-sub">{{ a.desc || a.id }}</span>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无数字员工" :image-size="80" />

    <!-- 记忆内容区 -->
    <div class="memory-layout" v-if="activeAgent">
      <!-- 左侧文件列表 -->
      <div class="section-card card-accent-left" style="flex:0 0 260px">
        <div class="section-hd">
          <span class="section-title">记忆文件</span>
          <span class="count-badge">{{ files.length }}</span>
        </div>
        <div class="mem-stats">
          <div class="mem-stat"><span class="mem-stat-v">{{ formatSize(totalChars) }}</span><span class="mem-stat-l">总大小</span></div>
          <div class="mem-stat"><span class="mem-stat-v">{{ files.length }}</span><span class="mem-stat-l">文件数</span></div>
        </div>
        <div class="mem-file-list">
          <div v-for="f in files" :key="f.file" class="mem-file-item"
            :class="{ active: selectedFile === f.file }" @click="selectFile(f)">
            <el-icon size="14"><Document /></el-icon>
            <span class="mem-file-name" :title="f.file">{{ labelForFile(f.file) }}</span>
            <span class="mem-file-size">{{ formatSize(f.chars) }}</span>
            <el-button size="small" text type="danger" @click.stop="delFile(f.file)"><el-icon><Delete /></el-icon></el-button>
          </div>
          <el-empty v-if="!files.length" description="无记忆文件" :image-size="40" />
        </div>
      </div>

      <!-- 右侧内容区：分段卡片 -->
      <div class="section-card card-accent-right" style="flex:1">
        <div class="section-hd">
          <span class="section-title">{{ selectedFile ? labelForFile(selectedFile) : '选择文件' }}</span>
          <div style="display:flex;gap:6px">
            <el-button v-if="selectedFile" size="small" @click="addSection"><el-icon><Plus /></el-icon>新段落</el-button>
          </div>
        </div>
        <div class="mem-content" v-loading="loading">
          <div v-if="!selectedFile" class="empty-hint">
            <el-icon size="32"><FolderOpened /></el-icon>
            <p>请从左侧选择记忆文件查看</p>
          </div>

          <!-- 文件前言（第一个 ## 之前的内容） -->
          <div v-if="preamble && selectedFile" class="section-card-item preamble-card">
            <div class="sec-item-hd">
              <span class="sec-item-title">前言</span>
              <div class="sec-item-actions">
                <el-button v-if="!editingPreamble" size="small" text @click="startEditPreamble"><el-icon><Edit /></el-icon></el-button>
                <template v-else>
                  <el-button size="small" text type="primary" @click="savePreamble" :loading="savingPreamble"><el-icon><Check /></el-icon></el-button>
                  <el-button size="small" text @click="cancelEditPreamble"><el-icon><Close /></el-icon></el-button>
                </template>
              </div>
            </div>
            <div v-if="!editingPreamble" class="sec-item-body markdown-body" v-html="renderMd(preamble)"></div>
            <textarea v-else v-model="editPreamble" class="sec-textarea" rows="4"></textarea>
          </div>

          <!-- 段落卡片 -->
          <div v-for="(sec, idx) in sections" :key="idx" class="section-card-item"
            :class="{ 'sec-editing': sec._editing }">
            <div class="sec-item-hd">
              <span class="sec-item-title">{{ sec.heading }}</span>
              <div class="sec-item-actions">
                <el-button v-if="!sec._editing" size="small" text type="danger" @click="deleteSection(idx)"><el-icon><Delete /></el-icon></el-button>
                <el-button v-if="!sec._editing" size="small" text @click="startEditSection(idx)"><el-icon><Edit /></el-icon></el-button>
                <template v-else>
                  <el-button size="small" text type="primary" @click="saveSection(idx)" :loading="sec._saving"><el-icon><Check /></el-icon></el-button>
                  <el-button size="small" text @click="cancelEditSection(idx)"><el-icon><Close /></el-icon></el-button>
                </template>
              </div>
            </div>
            <div v-if="!sec._editing" class="sec-item-body markdown-body" v-html="renderMd(sec.body)"></div>
            <textarea v-else v-model="sec._draft" class="sec-textarea" rows="6"></textarea>
          </div>

          <el-empty v-if="selectedFile && !loading && !preamble && !sections.length" description="文件为空" :image-size="40" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Document, Delete, Edit, Check, Close, FolderOpened, Plus } from '@element-plus/icons-vue'
import request from '../api/index'
import { memoryApi } from '../api/memory'
import { marked } from 'marked'

const agents = ref([])
const activeAgent = ref('')
const files = ref([])
const totalChars = computed(() => files.value.reduce((s, f) => s + (f.chars || 0), 0))
const selectedFile = ref('')
const fileContent = ref('')
const loading = ref(false)
const savingPreamble = ref(false)

// 分段数据
const sections = ref([])       // { heading, body, _editing, _draft, _saving }
const preamble = ref('')       // 第一个 ## 之前的内容
const editingPreamble = ref(false)
const editPreamble = ref('')

const FILE_LABELS = {
  'MEMORY.md': '长期记忆',
  'PROFILE.md': '用户画像',
  'SOUL.md': '人格画像',
}

function labelForFile(file) {
  return FILE_LABELS[file] || file
}

function renderMd(text) {
  if (!text) return ''
  try { return marked.parse(text) } catch { return text }
}

function formatSize(chars) {
  if (!chars) return '0'
  if (chars >= 10000) return (chars / 1000).toFixed(1) + 'k'
  return chars.toLocaleString()
}

// ── 解析文件为段落 ──

function parseSections(content) {
  if (!content || !content.trim()) {
    preamble.value = ''
    sections.value = []
    return
  }
  // 找第一个 ## heading
  const firstHeading = content.search(/^## /m)
  if (firstHeading === -1) {
    // 整个文件作为前言
    preamble.value = content.trim()
    sections.value = []
    return
  }
  preamble.value = firstHeading > 0 ? content.slice(0, firstHeading).trim() : ''

  // 按 ## 分割（保留分隔符）
  const parts = content.slice(firstHeading).split(/(?=^## )/m)
  const result = []
  for (const part of parts) {
    const match = part.match(/^## (.+)\n([\s\S]*)/)
    if (match) {
      result.push({
        heading: match[1].trim(),
        body: match[2].trim(),
        _editing: false,
        _draft: '',
        _saving: false
      })
    }
  }
  sections.value = result
}

// ── 文件操作 ──

async function loadAgents() {
  try {
    const { data } = await request.get('/agents')
    agents.value = (data.data || []).filter(a => a.id && !a.is_expert)
  } catch { agents.value = [] }
}

async function selectAgent(id) {
  activeAgent.value = id
  selectedFile.value = ''
  fileContent.value = ''
  preamble.value = ''
  sections.value = []
  editingPreamble.value = false
  await loadStats()
}

async function loadStats() {
  if (!activeAgent.value) return
  loading.value = true
  try {
    const { data } = await memoryApi.stats(activeAgent.value)
    files.value = data.data?.files || []
  } catch { files.value = [] }
  loading.value = false
}

async function selectFile(f) {
  selectedFile.value = f.file
  sections.value = []
  preamble.value = ''
  editingPreamble.value = false
  loading.value = true
  try {
    const { data } = await memoryApi.content(activeAgent.value, f.file)
    fileContent.value = data.data?.content || ''
    parseSections(fileContent.value)
  } catch {
    fileContent.value = ''
    parseSections('')
  }
  loading.value = false
}

async function delFile(file) {
  try {
    await ElMessageBox.confirm(`确定删除 ${file}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    await memoryApi.deleteFile(activeAgent.value, file)
    ElMessage.success(`已删除 ${file}`)
    if (selectedFile.value === file) { selectedFile.value = ''; fileContent.value = ''; preamble.value = ''; sections.value = [] }
    await loadStats()
  } catch { ElMessage.error('删除失败') }
}

// ── 重新组装并保存完整文件 ──

function assembleContent() {
  const parts = []
  if (preamble.value) parts.push(preamble.value)
  for (const sec of sections.value) {
    parts.push(`## ${sec.heading}\n${sec.body}`)
  }
  return parts.join('\n\n')
}

async function persistFile() {
  await memoryApi.save(activeAgent.value, selectedFile.value, assembleContent())
  // 更新原始内容
  fileContent.value = assembleContent()
  await loadStats()
}

// ── 前言编辑 ──

function startEditPreamble() {
  editPreamble.value = preamble.value
  editingPreamble.value = true
}

function cancelEditPreamble() {
  editingPreamble.value = false
  editPreamble.value = ''
}

async function savePreamble() {
  savingPreamble.value = true
  try {
    preamble.value = editPreamble.value.trim()
    editingPreamble.value = false
    await persistFile()
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  }
  savingPreamble.value = false
}

// ── 段落编辑 ──

function startEditSection(idx) {
  sections.value[idx]._draft = sections.value[idx].body
  sections.value[idx]._editing = true
}

function cancelEditSection(idx) {
  sections.value[idx]._editing = false
  sections.value[idx]._draft = ''
}

async function saveSection(idx) {
  sections.value[idx]._saving = true
  try {
    sections.value[idx].body = sections.value[idx]._draft.trim()
    sections.value[idx]._editing = false
    await persistFile()
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  }
  sections.value[idx]._saving = false
}

// ── 新增/删除段落 ──

function addSection() {
  const name = `新段落 ${sections.value.length + 1}`
  sections.value.push({
    heading: name,
    body: '请在此输入内容…',
    _editing: true,
    _draft: '请在此输入内容…',
    _saving: false
  })
}

async function deleteSection(idx) {
  try {
    await ElMessageBox.confirm(`确定删除段落「${sections.value[idx].heading}」？`, '确认', { type: 'warning' })
  } catch { return }
  sections.value.splice(idx, 1)
  await persistFile()
  ElMessage.success('已删除段落')
}

onMounted(loadAgents)
</script>

<style scoped>
.page-container { padding: 20px 24px; background: #fafafe; height: 100%; overflow-y: auto }
.page-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 16px }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e }

/* Agent 选择卡 */
.sec-nav-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px }
.sec-nav-card {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: #fff; border-radius: 10px; border: 2px solid #f0ecf8;
  cursor: pointer; transition: all .2s; min-width: 160px;
}
.sec-nav-card:hover { box-shadow: 0 4px 12px rgba(124,58,237,.08) }
.sec-nav-card.active { border-color: #7c3aed; background: #f5f3ff }
.sec-nav-icon { font-size: 22px }
.sec-nav-text { display: flex; flex-direction: column }
.sec-nav-label { font-weight: 600; font-size: 13px; color: #4a3f5e }
.sec-nav-sub { font-size: 11px; color: #909399; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }

/* 左右栏 */
.memory-layout { display: flex; gap: 16px; align-items: flex-start }
.section-card { background: #fff; border-radius: 12px; border: 1px solid #f0ecf8; overflow: hidden }
.card-accent-left { border-left: 3px solid #7c3aed }
.card-accent-right { border-left: 3px solid #0284c7 }
.section-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #f0ecf8;
}
.section-title { font-weight: 600; font-size: 14px; color: #4a3f5e }
.count-badge {
  font-size: 11px; background: #f5f3ff; color: #7c3aed;
  padding: 2px 8px; border-radius: 10px; font-weight: 600;
}

/* 统计 */
.mem-stats { display: flex; gap: 8px; padding: 10px 14px }
.mem-stat {
  flex: 1; padding: 8px 10px; background: #f8f9fc; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.mem-stat-v { font-size: 15px; font-weight: 600; color: #1e293b }
.mem-stat-l { font-size: 10px; color: #909399 }

/* 文件列表 */
.mem-file-list { padding: 0 10px 10px; max-height: 360px; overflow-y: auto }
.mem-file-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background .15s; font-size: 13px;
}
.mem-file-item:hover { background: #f5f3ff }
.mem-file-item.active { background: #ede9fe; color: #7c3aed; font-weight: 600 }
.mem-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.mem-file-size { font-size: 11px; color: #909399 }

/* 内容区 */
.mem-content { padding: 16px; min-height: 300px }

/* 段落卡片 */
.section-card-item {
  margin-bottom: 12px; padding: 14px 16px; border-radius: 10px;
  background: #f8f9fc; border: 1px solid transparent;
  transition: border-color .15s;
}
.section-card-item:hover { border-color: #e5dff5 }
.section-card-item.sec-editing { background: #fff; border-color: #7c3aed }
.preamble-card { border-left: 3px solid #e5dff5 }

.sec-item-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px }
.sec-item-title { font-size: 13px; font-weight: 600; color: #4a3f5e }
.sec-item-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s }
.section-card-item:hover .sec-item-actions { opacity: 1 }

.sec-item-body { font-size: 13px; line-height: 1.7; color: #334155 }
.sec-item-body :deep(h2) { font-size: 15px; margin: 12px 0 6px; color: #4a3f5e }
.sec-item-body :deep(h3) { font-size: 13px; margin: 10px 0 4px; color: #7c3aed }
.sec-item-body :deep(ul) { padding-left: 20px; margin: 4px 0 }
.sec-item-body :deep(li) { margin: 2px 0; font-size: 13px }
.sec-item-body :deep(p) { margin: 6px 0; font-size: 13px }
.sec-item-body :deep(strong) { color: #4a3f5e }
.sec-item-body :deep(code) {
  padding: 1px 5px; border-radius: 4px; background: #ede9fe;
  font-size: 12px; font-family: 'SF Mono',Consolas,monospace;
}

.sec-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #d9d0f0; border-radius: 8px;
  background: #fff; font-size: 13px; font-family: 'SF Mono',Consolas,monospace;
  resize: vertical; outline: none; line-height: 1.6; color: #334155;
}
.sec-textarea:focus { border-color: #7c3aed }

.empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: #909399; gap: 8px }
</style>
