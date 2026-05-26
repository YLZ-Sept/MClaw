<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <el-button text @click="router.push('/internal')"><el-icon><ArrowLeft /></el-icon></el-button>
        <span class="pg-title" style="margin-bottom:0">文档管理</span>
      </div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="docs">文档列表</el-menu-item>
        <el-menu-item index="folders">文档分类</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 文档列表 -->
        <div v-if="tab==='docs'">
          <div class="tb">
            <el-upload
              ref="uploadRef"
              :auto-upload="false"
              :limit="1"
              :accept="allFormats"
              :on-change="onFileChange"
              :on-remove="onFileRemove"
              :show-file-list="false"
            >
              <el-button type="primary">上传文档</el-button>
            </el-upload>
            <el-input v-model="searchQ" placeholder="搜索标题/内容" clearable style="width:250px;margin-left:12px" @keyup.enter="searchDocs"/>
            <el-button @click="searchDocs" style="margin-left:4px">搜索</el-button>
          </div>

          <!-- 上传预览区 -->
          <div v-if="uploadFile" class="upload-card">
            <div class="uc-header">
              <span class="uc-title">文档预览</span>
              <el-tag size="small" type="success">{{ uploadFile.name }}</el-tag>
              <span style="font-size:12px;color:#b8aad0">{{ fmtSize(uploadFile.size) }}</span>
              <el-button size="small" type="danger" text @click="cancelUpload" style="margin-left:auto">取消</el-button>
            </div>
            <div v-if="importLoading" style="text-align:center;padding:20px">
              <el-icon class="is-loading" :size="20"><Loading /></el-icon>
              <span style="font-size:12px;color:#b8aad0;margin-left:6px">正在解析文件...</span>
            </div>
            <template v-else-if="importResult">
              <el-alert v-if="importResult.error" :title="'解析失败：' + importResult.error" type="error" :closable="false" show-icon style="margin-bottom:10px"/>
              <el-form :model="saveForm" label-width="60px" class="uc-form">
                <el-form-item label="标题"><el-input v-model="saveForm.title" placeholder="文档标题"/></el-form-item>
                <el-form-item label="分类">
                  <el-select v-model="saveForm.category" style="width:100%" clearable placeholder="选择分类">
                    <el-option v-for="c in folderOptions" :key="c" :label="c" :value="c"/>
                  </el-select>
                </el-form-item>
                <el-form-item label="标签"><el-input v-model="saveForm.tags" placeholder="逗号分隔"/></el-form-item>
              </el-form>
              <div class="uc-preview">
                <div class="uc-preview-title">内容预览</div>
                <div class="uc-preview-text">{{ importResult.text?.slice(0, 2000) }}{{ importResult.text?.length > 2000 ? '...' : '' }}</div>
              </div>
              <div style="text-align:right;margin-top:10px">
                <el-button type="primary" @click="saveDocument" :disabled="!saveForm.title">保存到文档库</el-button>
              </div>
            </template>
          </div>

          <el-empty v-if="!loading&&documents.length===0" description="暂无文档"/>
          <el-table v-loading="loading" :data="documents" stripe border row-key="id" v-else>
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="title" label="文件名" min-width="180"/>
            <el-table-column prop="category" label="分类" width="100">
              <template #default="{row}"><el-tag v-if="row.category" size="small" type="info">{{ row.category }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="file_type" label="类型" width="70"/>
            <el-table-column label="大小" width="80"><template #default="{row}">{{ fmtSize(row.file_size) }}</template></el-table-column>
            <el-table-column prop="preview" label="内容摘要" min-width="200">
              <template #default="{row}">{{ row.preview || '' }}</template>
            </el-table-column>
            <el-table-column prop="created_at" label="上传时间" width="160"/>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{row}">
                <el-button size="small" text type="primary" @click="viewDoc(row)">查看</el-button>
                <el-button size="small" text @click="openDownload(row)">下载</el-button>
                <el-button size="small" text type="danger" @click="removeDoc(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 文档分类 -->
        <div v-else-if="tab==='folders'">
          <div class="tb"><el-button type="primary" @click="fldDlg.visible=true">新增分类</el-button></div>
          <el-empty v-if="!loading&&folders.length===0" description="暂无分类"/>
          <el-table v-loading="loading" :data="folders" stripe border row-key="id" v-else>
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="name" label="分类名" min-width="200"/>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{row}">
                <el-button size="small" type="danger" link @click="removeFolder(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 查看文档弹窗 -->
    <el-dialog v-model="viewDlg.visible" :title="viewDlg.doc?.title" width="700px" :close-on-click-modal="false">
      <div class="view-meta">
        <el-tag v-if="viewDlg.doc?.category" size="small">{{ viewDlg.doc.category }}</el-tag>
        <span style="font-size:12px;color:#b8aad0">{{ viewDlg.doc?.file_type }} · {{ fmtSize(viewDlg.doc?.file_size) }}</span>
        <span style="font-size:12px;color:#b8aad0;margin-left:auto">{{ viewDlg.doc?.created_at }}</span>
      </div>
      <div class="view-content">{{ viewDlg.doc?.content || '（无文本内容）' }}</div>
      <template #footer>
        <el-button @click="viewDlg.visible=false">关闭</el-button>
        <el-button v-if="viewDlg.doc" type="primary" @click="openDownload(viewDlg.doc)">下载原文件</el-button>
      </template>
    </el-dialog>

    <!-- 分类弹窗 -->
    <el-dialog v-model="fldDlg.visible" title="新增分类" width="400px">
      <el-form :model="fldDlg.form" label-width="80px"><el-form-item label="分类名"><el-input v-model="fldDlg.form.name"/></el-form-item></el-form>
      <template #footer><el-button @click="fldDlg.visible=false">取消</el-button><el-button type="primary" @click="saveFolder">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import { documentApi, folderApi } from '../../api/docs'

const router = useRouter()

const tab = ref('docs')
const documents = ref([])
const folders = ref([])
const searchQ = ref('')
const fldDlg = reactive({ visible: false, form: { name: '' } })
const loading = ref(false)

// 上传相关
const uploadRef = ref(null)
const uploadFile = ref(null)
const importLoading = ref(false)
const importResult = ref(null)
const saveForm = reactive({ title: '', category: '', tags: '' })

const allFormats = '.pdf,.doc,.docx,.ppt,.pptx,.wps,.ppsx,.mhtml,.xlsx,.xls,.csv,.md,.txt,.html,.json,.xml,.log,.xmind,.key,.pages,.numbers,.jpg,.png,.jpeg,.tiff,.bmp,.gif'

const folderOptions = computed(() => folders.value.map(f => f.name))

const kpis = computed(() => [
  { val: documents.value.length, label: '文档总数' },
  { val: folders.value.length, label: '分类数' }
])

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

// ── 文档 CRUD ──
async function loadDocs() {
  documents.value = (await documentApi.list()).data.data
}

async function searchDocs() {
  loading.value = true
  try {
    if (!searchQ.value) documents.value = (await documentApi.list()).data.data
    else documents.value = (await documentApi.search(searchQ.value)).data.data
  } finally { loading.value = false }
}

async function removeDoc(id) {
  if (!confirm('确认删除该文档？')) return
  await documentApi.remove(id)
  ElMessage.success('已删除')
  await refresh()
}

function openDownload(doc) {
  window.open(documentApi.downloadUrl(doc.id), '_blank')
}

// ── 上传流程 ──
async function onFileChange(file) {
  uploadFile.value = file
  importResult.value = null
  saveForm.title = file.name.replace(/\.[^.]+$/, '')
  saveForm.category = ''
  saveForm.tags = ''
  importLoading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.raw)
    const { data } = await documentApi.upload(fd)
    importResult.value = data.data
  } catch (e) {
    ElMessage.error('文件解析失败: ' + (e.response?.data?.message || e.message))
  }
  importLoading.value = false
}

function onFileRemove() {
  uploadFile.value = null
  importResult.value = null
}

function cancelUpload() {
  uploadFile.value = null
  importResult.value = null
  uploadRef.value?.clearFiles()
}

async function saveDocument() {
  if (!saveForm.title) return ElMessage.warning('标题必填')
  await documentApi.save({
    title: saveForm.title,
    file_path: importResult.value.filePath,
    file_type: importResult.value.ext,
    file_size: importResult.value.size,
    content: importResult.value.text || '',
    category: saveForm.category,
    tags: saveForm.tags
  })
  cancelUpload()
  await refresh()
  ElMessage.success('文档已保存')
}

// ── 查看文档 ──
const viewDlg = reactive({ visible: false, doc: null })
async function viewDoc(row) {
  const { data } = await documentApi.detail(row.id)
  viewDlg.doc = data.data
  viewDlg.visible = true
}

// ── 分类管理 ──
async function loadFolders() {
  folders.value = (await folderApi.list()).data.data
}

async function saveFolder() {
  if (!fldDlg.form.name) return ElMessage.warning('分类名必填')
  await folderApi.create({ name: fldDlg.form.name })
  fldDlg.visible = false
  fldDlg.form.name = ''
  await loadFolders()
  ElMessage.success('已保存')
}

async function removeFolder(id) {
  if (!confirm('确认删除该分类？')) return
  await folderApi.remove(id)
  ElMessage.success('已删除')
  await loadFolders()
}

async function refresh() {
  loading.value = true
  await loadDocs()
  await loadFolders()
  loading.value = false
}

onMounted(() => refresh())
</script>

<style scoped>
.pg { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px 0; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; margin-bottom: 12px; }
.kpi-row { display: flex; gap: 16px; margin-bottom: 16px; }
.kpi { padding: 10px 20px; background: #f8f7ff; border-radius: 10px; text-align: center; min-width: 100px; }
.kpi-val { font-size: 22px; font-weight: 700; color: #7c3aed; }
.kpi-lbl { font-size: 12px; color: #b8aad0; margin-top: 2px; }
.pg-body { flex: 1; display: flex; overflow: hidden; }
.side-tabs { width: 140px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; }

/* 上传预览卡片 */
.upload-card {
  background: #fff; border: 1px solid #e5dbff; border-radius: 10px; padding: 16px; margin-bottom: 16px;
}
.uc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.uc-title { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.uc-form { margin-bottom: 8px; }
.uc-preview {
  background: #fafafe; border: 1px solid #f0ecfc; border-radius: 8px; padding: 12px;
  max-height: 200px; overflow-y: auto;
}
.uc-preview-title { font-size: 12px; font-weight: 600; color: #4a3f5e; margin-bottom: 6px; }
.uc-preview-text { font-size: 12px; color: #6b5f80; white-space: pre-wrap; word-break: break-all; line-height: 1.6; }

/* 查看弹窗 */
.view-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.view-content {
  max-height: 50vh; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
  font-size: 13px; color: #4a3f5e; line-height: 1.8; background: #fafafe; padding: 16px; border-radius: 8px;
}
</style>
