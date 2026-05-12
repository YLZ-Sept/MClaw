<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">文档管理</span></div>
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
        <div v-if="tab==='docs'">
          <div class="tb">
            <el-upload :http-request="handleUpload" :show-file-list="false" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg">
              <el-button type="primary">上传文档</el-button>
            </el-upload>
            <el-input v-model="searchQ" placeholder="搜索" clearable style="width:250px;margin-left:12px" @keyup.enter="searchDocs"/>
            <el-button @click="searchDocs" style="margin-left:4px">搜索</el-button>
          </div>
          <el-empty v-if="!loading&&documents.length===0" description="暂无文档"/>
          <el-table v-loading="loading" :data="documents" stripe border row-key="id">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="title" label="文件名" min-width="200"/>
            <el-table-column prop="file_type" label="类型" width="80"/>
            <el-table-column prop="file_size" label="大小" width="80"><template #default="{row}">{{ (row.file_size/1024).toFixed(1) }}KB</template></el-table-column>
            <el-table-column prop="created_at" label="上传时间" width="170"/>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{row}">
                <el-button size="small" type="danger" link @click="removeDoc(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else-if="tab==='folders'">
          <div class="tb"><el-button type="primary" @click="fldDlg.visible=true">新增分类</el-button></div>
          <el-empty v-if="!loading&&folders.length===0" description="暂无分类"/>
          <el-table v-loading="loading" :data="folders" stripe border row-key="id">
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
    <el-dialog v-model="fldDlg.visible" title="新增分类" width="400px"><el-form :model="fldDlg.form" label-width="80px"><el-form-item label="分类名"><el-input v-model="fldDlg.form.name"/></el-form-item></el-form><template #footer><el-button @click="fldDlg.visible=false">取消</el-button><el-button type="primary" @click="saveFolder">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { documentApi, folderApi } from '../../api/docs'
const router = useRouter()

const tab = ref('docs')
const documents = ref([]), folders = ref([]), searchQ = ref('')
const fldDlg = reactive({ visible: false, form: {} })
const loading = ref(false)

const kpis = computed(() => [
  { val: documents.value.length, label: '文档总数' },
  { val: folders.value.length, label: '分类数' }
])

async function loadDocs() { documents.value = (await documentApi.list()).data.data }
async function handleUpload(opt) { const fd = new FormData(); fd.append('file', opt.file); await documentApi.upload(fd); ElMessage.success('上传成功'); await refresh() }
async function searchDocs() {
  loading.value = true
  if (!searchQ.value) documents.value = (await documentApi.list()).data.data
  else documents.value = (await documentApi.search(searchQ.value)).data.data
  loading.value = false
}
async function removeDoc(id) {
  if (!confirm('确认删除该文档？')) return
  await documentApi.remove(id)
  ElMessage.success('已删除')
  await refresh()
}
async function saveFolder() { await folderApi.create(fldDlg.form); fldDlg.visible = false; fldDlg.form = {}; await refresh(); ElMessage.success('OK') }
async function removeFolder(id) {
  if (!confirm('确认删除该分类？')) return
  await folderApi.remove(id)
  ElMessage.success('已删除')
  await refresh()
}
async function loadFolders() { folders.value = (await folderApi.list()).data.data }

async function refresh() { loading.value=true; await loadDocs(); await loadFolders(); loading.value=false }
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
</style>
