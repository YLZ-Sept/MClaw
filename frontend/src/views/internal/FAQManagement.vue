<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/digital')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">FAQ 知识库</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="list">FAQ 列表</el-menu-item>
        <el-menu-item index="search">知识搜索</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <div v-if="tab==='list'">
          <div class="tb">
            <el-button type="primary" @click="openDlg()">新增 FAQ</el-button>
            <el-upload :http-request="handleImport" :show-file-list="false" accept=".csv,.xlsx,.xls,.pdf,.docx,.doc,.md,.txt" style="display:inline-block;margin-left:8px">
              <el-button>导入文件</el-button>
            </el-upload>
            <el-button @click="exportExcel" style="margin-left:4px">导出 Excel</el-button>
          </div>
          <el-table v-loading="loading" :data="faqs" stripe border row-key="id">
            <el-table-column prop="category" label="分类" width="110"/>
            <el-table-column prop="question" label="问题" min-width="200" show-overflow-tooltip/>
            <el-table-column prop="similar_questions" label="相似问" min-width="160" show-overflow-tooltip>
              <template #default="{row}"><span style="color:#b8aad0;font-size:12px">{{ row.similar_questions || '-' }}</span></template>
            </el-table-column>
            <el-table-column prop="answer" label="答案" min-width="240" show-overflow-tooltip/>
            <el-table-column prop="notes" label="备注" width="100" show-overflow-tooltip>
              <template #default="{row}"><span style="color:#b8aad0;font-size:12px">{{ row.notes || '-' }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{row}">
                <el-button size="small" type="primary" link @click="openDlg(row)">编辑</el-button>
                <el-button size="small" type="danger" link @click="delFaq(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else-if="tab==='search'">
          <div class="tb"><el-input v-model="searchQ" placeholder="输入问题关键词" clearable @keyup.enter="searchFaq"/><el-button type="primary" @click="searchFaq" style="margin-left:8px">搜索</el-button></div>
          <el-empty v-if="searchResults.length===0" description="输入关键词搜索 FAQ"/>
          <div v-for="item in searchResults" :key="item.id" style="margin-bottom:16px;padding:16px;background:#f8f7ff;border-radius:10px">
            <div style="font-weight:600;color:#4a3f5e;margin-bottom:6px">Q: {{ item.question }}</div>
            <div v-if="item.similar_questions" style="font-size:12px;color:#b8aad0;margin-bottom:4px">相似问：{{ item.similar_questions }}</div>
            <div style="color:#666;line-height:1.6">A: {{ item.answer }}</div>
            <div style="color:#b8aad0;font-size:12px;margin-top:4px">匹配度: {{ item.score }} | 分类: {{ item.category }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dlg.visible" :title="dlg.ed?'编辑 FAQ':'新增 FAQ'" width="650px">
      <el-form :model="dlg.form" label-width="70px">
        <el-form-item label="分类"><el-input v-model="dlg.form.category" placeholder="如：安全服务、产品咨询"/></el-form-item>
        <el-form-item label="问题" required><el-input v-model="dlg.form.question" type="textarea" :rows="2" placeholder="必填"/></el-form-item>
        <el-form-item label="相似问"><el-input v-model="dlg.form.similar_questions" type="textarea" :rows="2" placeholder="多个用 | 分隔"/></el-form-item>
        <el-form-item label="答案" required><el-input v-model="dlg.form.answer" type="textarea" :rows="4" placeholder="必填"/></el-form-item>
        <el-form-item label="备注"><el-input v-model="dlg.form.notes" placeholder="非必填"/></el-form-item>
        <el-form-item label="标签"><el-input v-model="dlg.form.tags" placeholder="逗号分隔"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible=false">取消</el-button><el-button type="primary" @click="saveFaq">保存</el-button></template>
    </el-dialog>

    <!-- 导入预览对话框 -->
    <el-dialog v-model="previewDlg.visible" :title="'导入预览 — ' + previewDlg.type + ' (' + previewDlg.items.length + ' 条)'" width="900px" top="3vh">
      <div style="margin-bottom:10px;display:flex;gap:12px;align-items:center">
        <el-button size="small" @click="previewDlg.items.forEach(it=>it._checked=true)">全选</el-button>
        <el-button size="small" @click="previewDlg.items.forEach(it=>it._checked=false)">全不选</el-button>
        <span style="color:#b8aad0;font-size:12px">已选 {{ previewDlg.items.filter(it=>it._checked!==false).length }} / {{ previewDlg.items.length }} 条</span>
      </div>
      <el-table :data="previewDlg.items" stripe border row-key="_idx" max-height="400" @cell-click="(row,col)=>{if(col.property==='_checked')row._checked=!row._checked}">
        <el-table-column prop="_checked" label="导入" width="55" align="center">
          <template #default="{row}"><el-checkbox v-model="row._checked" size="small"/></template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{row}"><el-input v-model="row.category" size="small" :disabled="row._checked===false"/></template>
        </el-table-column>
        <el-table-column prop="question" label="问题" min-width="180">
          <template #default="{row}"><el-input v-model="row.question" size="small" :disabled="row._checked===false"/></template>
        </el-table-column>
        <el-table-column prop="answer" label="答案" min-width="200">
          <template #default="{row}"><el-input v-model="row.answer" size="small" :disabled="row._checked===false"/></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="previewDlg.visible=false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doBatchImport">确认导入 ({{ previewDlg.items.filter(it=>it._checked!==false).length }})</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/index.js'
const router = useRouter()

const tab = ref('list')
const faqs = ref([]), searchQ = ref(''), searchResults = ref([]), loading = ref(false), importing = ref(false)
const dlg = reactive({ visible: false, ed: false, form: {} })
const previewDlg = reactive({ visible: false, type: '', items: [] })

const kpis = computed(() => [
  { val: faqs.value.length, label: 'FAQ 总数' },
  { val: [...new Set(faqs.value.map(f => f.category))].length, label: '分类数' }
])

function openDlg(r) { dlg.ed = !!r; dlg.form = r ? { ...r } : { category: '通用', tags: '' }; dlg.visible = true }
async function saveFaq() {
  const f = dlg.form
  if (!f.question || !f.answer) { ElMessage.warning('问题和答案必填'); return }
  dlg.ed ? await request.put('/faq/' + f.id, f) : await request.post('/faq', f)
  dlg.visible = false; dlg.form = {}; dlg.ed = false; await refresh(); ElMessage.success('OK')
}
async function delFaq(id) { await ElMessageBox.confirm('确认?'); await request.delete('/faq/' + id); await refresh() }
async function searchFaq() {
  if (!searchQ.value) { searchResults.value = []; return }
  const r = await request.get('/faq/match', { params: { q: searchQ.value } })
  searchResults.value = r.data.data
}
function exportExcel() {
  if (faqs.value.length === 0) { ElMessage.warning('无数据'); return }
  window.open('/api/faq/export?token=' + encodeURIComponent(localStorage.getItem('token')))
}

// 新导入流程：上传 → 后端解析 → 预览 → 批量写入
async function handleImport(opt) {
  const formData = new FormData()
  formData.append('file', opt.file.raw || opt.file)
  try {
    const res = await request.post('/faq/import', formData)
    const { type, items } = res.data.data
    if (items.length === 0) { ElMessage.warning('未解析到 FAQ 内容'); return }
    items.forEach(it => it._checked = true)
    previewDlg.type = type
    previewDlg.items = items
    previewDlg.visible = true
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '解析失败')
  }
}

async function doBatchImport() {
  const checked = previewDlg.items.filter(it => it._checked !== false)
  if (checked.length === 0) { ElMessage.warning('请至少选择一条'); return }
  importing.value = true
  try {
    const res = await request.post('/faq/batch', { items: checked })
    ElMessage.success(`导入完成: ${res.data.data.imported} 条`)
    previewDlg.visible = false
    await refresh()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '导入失败')
  }
  importing.value = false
}

async function refresh() { loading.value = true; faqs.value = (await request.get('/faq')).data.data; loading.value = false }
onMounted(refresh)
</script>

<style scoped>
.pg { height:100%; display:flex; flex-direction:column; background:#fafafe }
.pg-hd { padding:20px 24px 0; background:#fff; border-bottom:1px solid #f0ecfc }
.pg-title { font-size:20px; font-weight:600; color:#4a3f5e }
.kpi-row { display:flex; gap:16px; margin-bottom:16px; margin-top:12px }
.kpi { padding:10px 20px; background:#f8f7ff; border-radius:10px; text-align:center; min-width:100px }
.kpi-val { font-size:22px; font-weight:700; color:#7c3aed }
.kpi-lbl { font-size:12px; color:#b8aad0; margin-top:2px }
.pg-body { flex:1; display:flex; overflow:hidden }
.side-tabs { width:140px; flex-shrink:0; border-right:1px solid #f0ecfc; padding-top:4px }
.side-tabs .el-menu-item { height:40px; line-height:40px; font-size:13px }
.tab-content { flex:1; padding:16px 24px; overflow-y:auto }
.tb { margin-bottom:12px; display:flex; align-items:center }
</style>
