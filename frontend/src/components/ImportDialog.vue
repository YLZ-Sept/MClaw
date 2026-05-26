<template>
  <el-dialog v-model="visible" title="导入数据" width="900px" top="3vh" :close-on-click-modal="false" @close="handleClose">
    <!-- 步骤1：上传 -->
    <div v-if="step === 1">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        <template #title>
          请先<a :href="templateUrl" style="color:#409eff;cursor:pointer" @click.prevent="downloadTemplate">下载模板</a>，按模板格式填写数据后再上传。
        </template>
      </el-alert>
      <el-upload
        ref="uploadRef"
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="handleFileChange"
        :file-list="fileList"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将 Excel 文件拖到此处，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 文件</div>
        </template>
      </el-upload>
      <div v-if="uploadError" style="color:#f56c6c;margin-top:8px">{{ uploadError }}</div>
    </div>

    <!-- 步骤2：预览 -->
    <div v-else>
      <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <el-button size="small" @click="toggleAll">{{ allSelected ? '全不选' : '全选' }}</el-button>
          <span style="margin-left:8px;color:#909399;font-size:13px">
            已选 {{ selectedCount }} / {{ previewRows.length }} 条
            <span v-if="previewErrors > 0" style="color:#f56c6c">（{{ previewErrors }} 条有误）</span>
          </span>
        </div>
        <el-button size="small" @click="step = 1">返回上传</el-button>
      </div>
      <div class="import-preview-table">
        <el-table :data="previewRows" size="small" border max-height="400" style="width:100%">
          <el-table-column width="45" fixed="left">
            <template #default="{ row }">
              <el-checkbox v-model="row._selected" :disabled="!row._valid" />
            </template>
          </el-table-column>
          <el-table-column
            v-for="col in previewColumns"
            :key="col"
            :label="col"
            :min-width="Math.max(col.length * 16, 80)"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span v-if="row._valid" style="font-size:13px">{{ row._data[col] ?? '' }}</span>
              <span v-else style="font-size:13px;color:#f56c6c">{{ row._data[col] ?? '' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button v-if="step === 1" type="primary" :disabled="!uploadFile" :loading="parsing" @click="handleParse">
        解析文件
      </el-button>
      <el-button v-else type="primary" :disabled="selectedCount === 0" :loading="importing" @click="handleConfirm">
        确认导入 {{ selectedCount }} 条
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import request from '../api'

const props = defineProps({
  modelValue: Boolean,
  ioKey: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue', 'done'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const templateUrl = computed(() => `/api/io/${props.ioKey}/template`)

const step = ref(1)
const uploadFile = ref(null)
const fileList = ref([])
const uploadError = ref('')
const parsing = ref(false)
const importing = ref(false)
const previewColumns = ref([])
const previewRows = ref([])

function downloadTemplate() {
  window.open(templateUrl.value)
}

function handleFileChange(file) {
  uploadFile.value = file.raw
  uploadError.value = ''
}

async function handleParse() {
  if (!uploadFile.value) return
  parsing.value = true
  uploadError.value = ''
  try {
    const formData = new FormData()
    formData.append('file', uploadFile.value)
    const res = await request.post(`/io/${props.ioKey}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    if (res.data.code === 200) {
      const d = res.data.data
      previewColumns.value = d.columns
      previewRows.value = (d.rows || []).map(r => ({
        ...r,
        _selected: r._valid,
      }))
      step.value = 2
    } else {
      uploadError.value = res.data.message || '解析失败'
    }
  } catch (e) {
    uploadError.value = '网络错误，请重试'
  } finally {
    parsing.value = false
  }
}

const allSelected = computed(() => {
  return previewRows.value.length > 0 && previewRows.value.every(r => r._selected)
})
const selectedCount = computed(() => previewRows.value.filter(r => r._selected).length)
const previewErrors = computed(() => previewRows.value.filter(r => !r._valid).length)

function toggleAll() {
  const val = !allSelected.value
  previewRows.value.forEach(r => { r._selected = val && r._valid })
}

async function handleConfirm() {
  const selected = previewRows.value.filter(r => r._selected)
  if (selected.length === 0) return
  importing.value = true
  try {
    const res = await request.post(`/io/${props.ioKey}/batch`, {
      rows: selected.map(r => r._data),
    })
    if (res.data.code === 200) {
      ElMessage.success(`成功导入 ${res.data.data.imported} 条`)
      emit('done')
      handleClose()
    } else {
      ElMessage.error(res.data.message || '导入失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    importing.value = false
  }
}

function handleClose() {
  step.value = 1
  uploadFile.value = null
  fileList.value = []
  uploadError.value = ''
  previewColumns.value = []
  previewRows.value = []
  visible.value = false
}
</script>

<style scoped>
.import-preview-table {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
</style>
