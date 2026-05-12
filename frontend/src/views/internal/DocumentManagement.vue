<template>
  <div class="page-container">
    <div class="page-title">文档管理</div>
    <el-tabs v-model="tab" type="border-card">
      <el-tab-pane label="文档列表" name="docs">
        <div class="tb">
          <el-upload :http-request="handleUpload" :show-file-list="false" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg">
            <el-button type="primary">上传文档</el-button>
          </el-upload>
          <el-input v-model="searchQ" placeholder="搜索" clearable style="width:250px;margin-left:12px" @keyup.enter="searchDocs" />
          <el-button @click="searchDocs" style="margin-left:4px">搜索</el-button>
        </div>
        <el-table :data="documents" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="文件名" min-width="200" />
          <el-table-column prop="file_type" label="类型" width="80" />
          <el-table-column prop="file_size" label="大小" width="80">
            <template #default="{row}">{{ (row.file_size / 1024).toFixed(1) }}KB</template>
          </el-table-column>
          <el-table-column prop="created_at" label="上传时间" width="170" />
          <el-table-column label="操作" width="100">
            <template #default="{row}">
              <el-button size="small" type="danger" link @click="delDoc(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { documentApi } from '../../api/docs'

const tab = ref('docs')
const documents = ref([])
const searchQ = ref('')

async function loadDocs() {
  documents.value = (await documentApi.list()).data.data
}

async function handleUpload(opt) {
  const fd = new FormData(); fd.append('file', opt.file)
  await documentApi.upload(fd); ElMessage.success('上传成功'); await loadDocs()
}

async function searchDocs() {
  if (!searchQ.value) return loadDocs()
  documents.value = (await documentApi.search(searchQ.value)).data.data
}

async function delDoc(id) {
  await ElMessageBox.confirm('确认删除？'); await documentApi.remove(id); await loadDocs()
}

onMounted(loadDocs)
</script>

<style scoped>
.tb { margin-bottom: 12px; display:flex; align-items:center; }
.page-container { padding:24px; background:#fff; height:100%; overflow-y:auto; }
.page-title { font-size:20px; font-weight:600; color:#4a3f5e; margin-bottom:20px; }
</style>
