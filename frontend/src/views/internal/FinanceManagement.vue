<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">财务管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>{tab=t;loadData()}">
        <el-menu-item index="receivable">应收账款</el-menu-item>
        <el-menu-item index="payable">应付账款</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <div class="tb">
          <el-button type="primary" @click="openDlg()">新增记录</el-button>
          <el-upload :http-request="handleImport" :show-file-list="false" accept=".xlsx,.xls" style="display:inline-block;margin-left:8px">
            <el-button>导入</el-button>
          </el-upload>
          <el-button @click="exportExcel" style="margin-left:4px">导出</el-button>
          <el-button v-if="selectedIds.length" type="danger" plain @click="batchDelete" style="margin-left:8px">删除选中 ({{ selectedIds.length }})</el-button>
        </div>
        <el-table v-loading="loading" :data="data" stripe border row-key="id" @selection-change="onSelectionChange" max-height="calc(100vh - 280px)">
          <el-table-column type="selection" width="40"/>
          <el-table-column type="index" label="序号" width="55"/>
          <el-table-column prop="customer_name" label="客户名称" min-width="200" show-overflow-tooltip/>
          <el-table-column prop="receivable_amount" label="应收金额(元)" width="130" sortable>
            <template #default="{row}">{{ fmtMoney(row.receivable_amount) }}</template>
          </el-table-column>
          <el-table-column prop="received_amount" label="已收金额(元)" width="130" sortable>
            <template #default="{row}">{{ fmtMoney(row.received_amount) }}</template>
          </el-table-column>
          <el-table-column prop="unreceived_amount" label="未收金额(元)" width="130" sortable>
            <template #default="{row}"><b :style="{color: row.unreceived_amount>0?'#f56c6c':'#67c23a'}">{{ fmtMoney(row.unreceived_amount) }}</b></template>
          </el-table-column>
          <el-table-column prop="contract_date" label="合同签订时间" width="120"/>
          <el-table-column prop="payment_term" label="账期" width="90"/>
          <el-table-column prop="due_date" label="到期日期" width="110"/>
          <el-table-column prop="overdue_days" label="逾期天数" width="90">
            <template #default="{row}"><span :style="{color: parseOverdue(row.overdue_days)>90?'#f56c6c':parseOverdue(row.overdue_days)>0?'#e6a23c':''}">{{ row.overdue_days || '-' }}</span></template>
          </el-table-column>
          <el-table-column prop="invoiced" label="是否开票" width="100"/>
          <el-table-column prop="notes" label="备注" width="120" show-overflow-tooltip/>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{row}"><el-button size="small" type="primary" link @click="openDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delRow(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dlg.visible" :title="dlg.ed?'编辑记录':'新增记录'" width="600px">
      <el-form :model="dlg.form" label-width="100px">
        <el-form-item label="客户名称" required><el-input v-model="dlg.form.customer_name" placeholder="必填"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="应收金额"><el-input-number v-model="dlg.form.receivable_amount" :min="0" :precision="2" style="width:100%" controls-position="right"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="已收金额"><el-input-number v-model="dlg.form.received_amount" :min="0" :precision="2" style="width:100%" controls-position="right"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="未收金额"><el-input-number v-model="dlg.form.unreceived_amount" :min="0" :precision="2" style="width:100%" controls-position="right"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="合同签订时间"><el-input v-model="dlg.form.contract_date" placeholder="如 2025.1.1"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="账期"><el-input v-model="dlg.form.payment_term" placeholder="如 6个月"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="到期日期"><el-input v-model="dlg.form.due_date" placeholder="如 2025.7.1"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="逾期天数"><el-input v-model="dlg.form.overdue_days" placeholder="如 30天"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="是否开票">
          <el-select v-model="dlg.form.invoiced" style="width:100%">
            <el-option label="已开票" value="已开票"/><el-option label="未开票" value="未开票"/><el-option label="已开票50%" value="已开票50%"/><el-option label="已开票80%" value="已开票80%"/>
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="dlg.form.notes" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>

    <!-- 导入预览 -->
    <el-dialog v-model="previewDlg.visible" title="导入预览" width="1000px" top="3vh">
      <div style="margin-bottom:10px;display:flex;gap:12px;align-items:center">
        <el-button size="small" @click="previewDlg.items.forEach(it=>it._checked=true)">全选</el-button>
        <el-button size="small" @click="previewDlg.items.forEach(it=>it._checked=false)">全不选</el-button>
        <span style="color:#b8aad0;font-size:12px">已选 {{ previewDlg.items.filter(it=>it._checked!==false).length }} / {{ previewDlg.items.length }} 条</span>
      </div>
      <el-table :data="previewDlg.items" stripe border row-key="_idx" max-height="400">
        <el-table-column prop="_checked" label="导入" width="55" align="center">
          <template #default="{row}"><el-checkbox v-model="row._checked" size="small"/></template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户名称" min-width="180">
          <template #default="{row}"><el-input v-model="row.customer_name" size="small" :disabled="row._checked===false"/></template>
        </el-table-column>
        <el-table-column prop="receivable_amount" label="应收金额" width="110"/>
        <el-table-column prop="received_amount" label="已收金额" width="110"/>
        <el-table-column prop="unreceived_amount" label="未收金额" width="110"/>
        <el-table-column prop="contract_date" label="合同签订" width="110"/>
        <el-table-column prop="due_date" label="到期日期" width="110"/>
        <el-table-column prop="overdue_days" label="逾期天数" width="90"/>
        <el-table-column prop="invoiced" label="开票" width="90"/>
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
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/index.js'
const router = useRouter()

const tab = ref('receivable')
const data = ref([]), loading = ref(false), importing = ref(false), selectedIds = ref([])
const dlg = reactive({ visible: false, ed: false, form: {} })
const previewDlg = reactive({ visible: false, items: [] })

const summary = reactive({ receivable: {}, payable: {} })

async function loadSummary() {
  try { const r = await request.get('/finance/summary'); Object.assign(summary, r.data.data) } catch {}
}

const kpis = computed(() => {
  const s = tab.value === 'receivable' ? summary.receivable : summary.payable
  return [
    { val: s.count || 0, label: tab.value === 'receivable' ? '应收账款数' : '应付账款数' },
    { val: '¥' + fmtMoney(s.total_receivable || 0), label: '应收总额' },
    { val: '¥' + fmtMoney(s.total_received || 0), label: '已收总额' },
    { val: '¥' + fmtMoney(s.total_unreceived || 0), label: '未收总额' },
  ]
})

function fmtMoney(v) {
  const n = Number(v)
  if (!n || isNaN(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseOverdue(v) {
  if (!v) return 0
  const m = String(v).match(/(\d+)/)
  return m ? parseInt(m[1]) : 0
}

async function loadData() {
  loading.value = true
  try { data.value = (await request.get('/finance', { params: { type: tab.value } })).data.data } catch {}
  loading.value = false
  await loadSummary()
}

function onSelectionChange(rows) { selectedIds.value = rows.map(r => r.id) }

function openDlg(r) {
  dlg.ed = !!r
  dlg.form = r ? { ...r } : { customer_name: '', receivable_amount: 0, received_amount: 0, unreceived_amount: 0, contract_date: '', payment_term: '', due_date: '', overdue_days: '', invoiced: '未开票', notes: '' }
  dlg.visible = true
}

async function save() {
  const f = dlg.form
  if (!f.customer_name) { ElMessage.warning('客户名称必填'); return }
  if (dlg.ed) { await request.put('/finance/' + f.id, f) }
  else { await request.post('/finance', { ...f, type: tab.value }) }
  dlg.visible = false; await loadData(); ElMessage.success('OK')
}

async function delRow(id) {
  try { await ElMessageBox.confirm('确认删除？'); await request.delete('/finance/' + id); await loadData(); ElMessage.success('已删除') } catch {}
}

async function batchDelete() {
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selectedIds.value.length} 条记录？`)
    await request.post('/finance/batch-delete', { ids: selectedIds.value })
    selectedIds.value = []; await loadData(); ElMessage.success('已删除')
  } catch {}
}

async function handleImport(opt) {
  const formData = new FormData()
  formData.append('file', opt.file.raw || opt.file)
  formData.append('type', tab.value)
  try {
    const res = await request.post('/finance/import', formData)
    const { items } = res.data.data
    if (!items.length) { ElMessage.warning('未解析到数据'); return }
    items.forEach((it, i) => { it._idx = i; it._checked = true })
    previewDlg.items = items
    previewDlg.visible = true
  } catch (e) { ElMessage.error(e.response?.data?.message || '解析失败') }
}

async function doBatchImport() {
  const checked = previewDlg.items.filter(it => it._checked !== false)
  if (!checked.length) { ElMessage.warning('请至少选择一条'); return }
  importing.value = true
  try {
    await request.post('/finance/batch', { type: tab.value, items: checked })
    ElMessage.success(`导入完成: ${checked.length} 条`)
    previewDlg.visible = false; await loadData()
  } catch (e) { ElMessage.error(e.response?.data?.message || '导入失败') }
  importing.value = false
}

function exportExcel() {
  if (!data.value.length) { ElMessage.warning('暂无数据'); return }
  const token = localStorage.getItem('token')
  const a = document.createElement('a')
  a.href = `/api/finance/export?type=${tab.value}&token=${encodeURIComponent(token)}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

onMounted(loadData)
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
