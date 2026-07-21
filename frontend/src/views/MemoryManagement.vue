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
          <span class="section-title">文件</span>
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
            <span class="mem-file-name">{{ f.file }}</span>
            <span class="mem-file-size">{{ formatSize(f.chars) }}</span>
            <el-button size="small" text type="danger" @click.stop="delFile(f.file)" style="margin-left:auto"><el-icon><Delete /></el-icon></el-button>
          </div>
          <el-empty v-if="!files.length" description="无记忆文件" :image-size="40" />
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="section-card card-accent-right" style="flex:1">
        <div class="section-hd">
          <span class="section-title">{{ selectedFile || '选择文件' }}</span>
          <div style="display:flex;gap:8px">
            <el-button v-if="!editing" size="small" @click="startEdit"><el-icon><Edit /></el-icon>编辑</el-button>
            <el-button v-if="editing" size="small" type="primary" @click="saveEdit" :loading="saving"><el-icon><Check /></el-icon>保存</el-button>
            <el-button v-if="editing" size="small" @click="cancelEdit">取消</el-button>
          </div>
        </div>
        <div class="mem-content" v-loading="loading">
          <div v-if="!selectedFile" class="empty-hint">
            <el-icon size="32"><FolderOpened /></el-icon>
            <p>请从左侧选择记忆文件查看</p>
          </div>
          <el-input v-else-if="editing" v-model="editContent" type="textarea"
            class="mem-editor" :autosize="{ minRows: 12, maxRows: 30 }" />
          <div v-else class="mem-markdown markdown-body" v-html="renderedContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Document, Delete, Edit, Check, FolderOpened } from '@element-plus/icons-vue'
import { memoryApi } from '../api/memory'
import { marked } from 'marked'

const agents = ref([])
const activeAgent = ref('')
const files = ref([])
const totalChars = computed(() => files.value.reduce((s, f) => s + (f.chars || 0), 0))
const selectedFile = ref('')
const fileContent = ref('')
const editContent = ref('')
const editing = ref(false)
const loading = ref(false)
const saving = ref(false)

const renderedContent = computed(() => {
  if (!fileContent.value) return ''
  try { return marked.parse(fileContent.value) } catch { return fileContent.value }
})

function formatSize(chars) {
  if (!chars) return '0'
  if (chars >= 10000) return (chars / 1000).toFixed(1) + 'k'
  return chars.toLocaleString()
}

async function loadAgents() {
  try {
    const { data } = await fetch('/api/agents').then(r => r.json())
    agents.value = (data.data || []).filter(a => a.id && !a.is_expert)
  } catch { agents.value = [] }
}

async function selectAgent(id) {
  activeAgent.value = id
  selectedFile.value = ''
  fileContent.value = ''
  editing.value = false
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
  editing.value = false
  loading.value = true
  try {
    const { data } = await memoryApi.content(activeAgent.value, f.file)
    fileContent.value = data.data?.content || ''
  } catch { fileContent.value = '' }
  loading.value = false
}

function startEdit() {
  editContent.value = fileContent.value
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editContent.value = ''
}

async function saveEdit() {
  saving.value = true
  try {
    await memoryApi.save(activeAgent.value, selectedFile.value, editContent.value)
    fileContent.value = editContent.value
    editing.value = false
    await loadStats()
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  }
  saving.value = false
}

async function delFile(file) {
  try {
    await ElMessageBox.confirm(`确定删除 ${file}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    await memoryApi.clear(activeAgent.value)
    ElMessage.success('已清除记忆')
    files.value = []
    if (selectedFile.value === file) { selectedFile.value = ''; fileContent.value = '' }
  } catch { ElMessage.error('删除失败') }
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
.mem-file-list { padding: 0 10px 10px; max-height: 320px; overflow-y: auto }
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
.mem-editor :deep(textarea) {
  font-family: 'SF Mono',Consolas,monospace; font-size: 13px; line-height: 1.7;
}
.mem-markdown { line-height: 1.7; color: #334155 }
.mem-markdown :deep(h2) { font-size: 15px; color: #4a3f5e; margin: 16px 0 8px; border-bottom: 1px solid #f0ecf8; padding-bottom: 4px }
.mem-markdown :deep(h3) { font-size: 13px; color: #7c3aed; margin: 12px 0 4px }
.mem-markdown :deep(ul) { padding-left: 20px; margin: 4px 0 }
.mem-markdown :deep(li) { margin: 2px 0; font-size: 13px }
.mem-markdown :deep(p) { margin: 6px 0; font-size: 13px }
.mem-markdown :deep(strong) { color: #4a3f5e }

.empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: #909399; gap: 8px }
</style>
