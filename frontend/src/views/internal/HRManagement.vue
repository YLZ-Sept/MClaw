<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">人力资源管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="employees">员工档案</el-menu-item>
        <el-menu-item index="departments">组织架构</el-menu-item>
        <el-menu-item index="attReport">考勤月报</el-menu-item>
        <el-menu-item index="performance">绩效管理</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 员工档案 -->
        <div v-if="tab==='employees'">
          <div class="tb"><el-button type="primary" @click="openEmp()">新增员工</el-button><el-button @click="handleExport('employees')">导出</el-button><el-button @click="handleImport('employees')">导入</el-button></div>
          <el-table v-loading="loading" :data="employees" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="80"/><el-table-column prop="gender" label="性别" width="60"/><el-table-column prop="department" label="部门" width="100"/><el-table-column prop="role" label="职位" width="100"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column prop="hire_date" label="入职时间" width="110"/><el-table-column prop="contract_end" label="合同到期" width="110"/><el-table-column prop="email" label="邮箱" min-width="150"/><el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="primary" link @click="openEmp(row)">编辑</el-button><el-button size="small" type="danger" link @click="delEmp(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 组织架构 -->
        <div v-else-if="tab==='departments'">
          <div class="tb" style="flex-wrap:wrap;gap:6px">
            <el-upload :auto-upload="false" :limit="1" :accept="orgChartFormats" :on-change="onOrgChartFile" :show-file-list="false">
              <el-button type="primary">上传架构图</el-button>
            </el-upload>
            <span class="upload-hint">支持 PNG/JPG/PDF/PPT/DOCX/VSDX/XLSX</span>
            <el-button @click="showDepDlg=true" style="margin-left:auto">新增部门</el-button>
          </div>
          <!-- 架构图网格 -->
          <div v-if="orgCharts.length" class="oc-grid">
            <div v-for="oc in orgCharts" :key="oc.id" class="oc-card">
              <div class="oc-thumb" @click="viewOrgChart(oc)">
                <img v-if="isImageType(oc.file_type)" :src="orgChartApi.previewUrl(oc.id)" class="oc-img" />
                <div v-else class="oc-icon-box">
                  <span class="oc-icon">{{ fileTypeIcon(oc.file_type) }}</span>
                  <span class="oc-ext">.{{ oc.file_type }}</span>
                </div>
              </div>
              <div class="oc-body">
                <div class="oc-title" :title="oc.title">{{ oc.title }}</div>
                <div class="oc-meta">{{ fmtSize(oc.file_size) }} · {{ oc.created_at?.slice(0,10) }}</div>
                <div class="oc-actions">
                  <el-button size="small" text type="primary" @click="viewOrgChart(oc)">查看</el-button>
                  <el-button size="small" text @click="window.open(orgChartApi.downloadUrl(oc.id))">下载</el-button>
                  <el-button v-if="oc.file_type==='xlsx'||oc.file_type==='xls'" size="small" text type="success" @click="importDeptsFromOrgChart(oc)">导入为部门</el-button>
                  <el-button size="small" text type="danger" @click="delOrgChart(oc.id)">删除</el-button>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无架构图，上传一个吧" :image-size="80"/>
          <!-- 部门表格 -->
          <el-divider v-if="departments.length" content-position="left">部门列表</el-divider>
          <el-table v-if="departments.length" :data="departments" stripe border row-key="id" style="margin-top:8px">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="name" label="部门名" width="140"/>
            <el-table-column prop="manager_name" label="负责人" width="100"/>
            <el-table-column label="操作" width="100">
              <template #default="{row}"><el-button size="small" type="danger" link @click="delDep(row.id)">删除</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 考勤月报 -->
        <div v-else-if="tab==='attReport'">
          <div class="tb">
            <el-select v-model="rptMonth" style="width:130px" @change="loadReports"><el-option v-for="m in monthOptions" :key="m" :label="m" :value="m"/></el-select>
            <el-button @click="loadReports" style="margin-left:8px">查询</el-button>
            <el-upload :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onAttReportFile" :show-file-list="false" style="margin-left:8px">
              <el-button>导入Excel</el-button>
            </el-upload>
            <span v-if="attImportMsg" style="font-size:12px;color:#7c3aed;margin-left:8px">{{ attImportMsg }}</span>
          </div>
          <el-table v-loading="loading" :data="reportData" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="40" fixed="left"/>
            <el-table-column prop="employee_name" label="姓名" width="70" fixed="left"/>
            <el-table-column prop="department" label="部门" width="90"/>
            <el-table-column prop="position" label="职务" width="90"/>
            <el-table-column label="考勤概况" header-align="center">
              <el-table-column prop="should_work_days" label="应出勤" width="65"/>
              <el-table-column prop="actual_work_days" label="实际" width="55"/>
              <el-table-column prop="rest_days" label="休息" width="55"/>
              <el-table-column prop="normal_days" label="正常" width="55"/>
              <el-table-column prop="abnormal_days" label="异常" width="55"/>
              <el-table-column prop="standard_hours" label="标准(h)" width="65"/>
              <el-table-column prop="actual_hours" label="实际(h)" width="65"/>
            </el-table-column>
            <el-table-column label="异常统计" header-align="center">
              <el-table-column prop="late_count" label="迟到次" width="60"/>
              <el-table-column prop="late_minutes" label="迟到分" width="60"/>
              <el-table-column prop="absent_count" label="旷工次" width="60"/>
              <el-table-column prop="absent_minutes" label="旷工分" width="60"/>
              <el-table-column prop="missing_clock_count" label="缺卡" width="45"/>
              <el-table-column prop="location_abnormal" label="地点异" width="55"/>
            </el-table-column>
            <el-table-column label="假勤统计" header-align="center">
              <el-table-column prop="out_hours" label="外出(h)" width="65"/>
              <el-table-column prop="travel_days" label="出差" width="50"/>
              <el-table-column prop="personal_leave" label="事假" width="50"/>
              <el-table-column prop="sick_leave" label="病假" width="50"/>
              <el-table-column prop="comp_leave" label="调休" width="50"/>
              <el-table-column prop="annual_leave" label="年假" width="50"/>
              <el-table-column prop="other_leave" label="其他" width="50"/>
            </el-table-column>
            <el-table-column label="操作" width="50" fixed="right">
              <template #default="{row}"><el-button size="small" type="danger" link @click="delAttReport(row.id)">删</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 绩效管理 -->
        <div v-else-if="tab==='performance'">
          <div class="tb">
            <el-select v-model="perfMonth" style="width:130px" @change="loadPerfReports"><el-option v-for="m in monthOptions" :key="m" :label="m" :value="m"/></el-select>
            <el-button @click="loadPerfReports" style="margin-left:8px">查询</el-button>
            <el-upload :auto-upload="false" :limit="1" :accept="perfAccept" :on-change="onPerfFile" :show-file-list="false" style="margin-left:8px">
              <el-button type="primary">导入考评</el-button>
            </el-upload>
            <el-button @click="window.open(performanceApi.exportUrl(perfMonth))" style="margin-left:4px" :disabled="!perfData.length">导出</el-button>
            <span v-if="perfImportMsg" style="font-size:12px;color:#7c3aed;margin-left:8px">{{ perfImportMsg }}</span>
          </div>
          <el-table v-loading="loading" :data="perfData" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="40" fixed="left"/>
            <el-table-column prop="employee_name" label="姓名" width="70" fixed="left"/>
            <el-table-column prop="department" label="部门" width="90"/>
            <el-table-column prop="position" label="职位" width="90"/>
            <el-table-column v-for="(d,di) in perfDynDims" :key="'d'+di" :label="d.name+'('+d.weight+'%)'" min-width="110">
              <template #default="{row}">
                <span>{{ row.dims?.find(x=>x.name===d.name)?.score ?? '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="total_score" label="总分" width="65">
              <template #default="{row}"><b :style="{color:row.total_score>=80?'#7c3aed':'#f56c6c'}">{{ row.total_score }}</b></template>
            </el-table-column>
            <el-table-column label="操作" width="50" fixed="right">
              <template #default="{row}"><el-button size="small" type="danger" link @click="delPerfReport(row.id)">删</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 导入预览对话框 -->
        <el-dialog v-model="perfPreviewDlg" title="导入预览" width="800px">
          <p style="margin-bottom:12px;font-size:13px;color:#7c3aed">已解析 {{ perfPreview.dims?.length || 0 }} 个维度，{{ perfPreview.records?.length || 0 }} 条记录</p>
          <el-table v-if="perfPreview.records?.length" :data="perfPreview.records" stripe border size="small" max-height="400">
            <el-table-column type="index" label="#" width="35"/>
            <el-table-column prop="employee_name" label="姓名" width="75"/>
            <el-table-column prop="department" label="部门" width="85"/>
            <el-table-column v-for="(d,di) in (perfPreview.dims||[])" :key="'pd'+di" :label="d.name" width="85">
              <template #default="{row}">{{ row.dims?.find(x=>x.name===d.name)?.score ?? '-' }}</template>
            </el-table-column>
            <el-table-column prop="total_score" label="总分" width="55"><template #default="{row}"><b :style="{color:row.total_score>=80?'#7c3aed':'#f56c6c'}">{{ row.total_score }}</b></template></el-table-column>
          </el-table>
          <template #footer><el-button @click="perfPreviewDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="confirmPerfImport">确认导入</el-button></template>
        </el-dialog>
      </div>
    </div>
    <!-- 员工对话框 -->
    <el-dialog v-model="showEmpDlg" :title="empEdit?'编辑员工':'新增员工'" width="500px"><el-form :model="empForm" label-width="80px"><el-form-item label="姓名"><el-input v-model="empForm.name"/></el-form-item><el-form-item label="性别"><el-select v-model="empForm.gender" style="width:100%"><el-option label="男" value="男"/><el-option label="女" value="女"/></el-select></el-form-item><el-form-item label="部门"><el-input v-model="empForm.department"/></el-form-item><el-form-item label="职位"><el-input v-model="empForm.role"/></el-form-item><el-form-item label="电话"><el-input v-model="empForm.phone"/></el-form-item><el-form-item label="入职时间"><el-input v-model="empForm.hire_date" placeholder="如 2025.1.1"/></el-form-item><el-form-item label="合同到期"><el-input v-model="empForm.contract_end" placeholder="如 2030.6.30"/></el-form-item><el-form-item label="邮箱"><el-input v-model="empForm.email"/></el-form-item></el-form><template #footer><el-button @click="showEmpDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveEmp">保存</el-button></template></el-dialog>
    <!-- 部门对话框 -->
    <el-dialog v-model="showDepDlg" title="新增部门" width="400px"><el-form :model="depForm" label-width="80px"><el-form-item label="部门名"><el-input v-model="depForm.name"/></el-form-item></el-form><template #footer><el-button @click="showDepDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDep">保存</el-button></template></el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employeeApi, departmentApi, attendanceApi, performanceApi, orgChartApi } from '../../api/hr'
import ImportDialog from '../../components/ImportDialog.vue'
const router = useRouter()

const tab = ref('employees')
const importVisible = ref(false)
const importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key, params) { window.open(`/api/io/${key}/export` + (params ? '?' + new URLSearchParams(params).toString() : '')) }
function onImportDone() { reload() }
const employees = ref([]), departments = ref([]), orgCharts = ref([])
const kpis = computed(() => [
  { val: employees.value.length, label: '在职员工' },
  { val: departments.value.length, label: '部门数' },
  { val: perfData.value.length, label: '当月考核' }
])

// 员工
const showEmpDlg = ref(false), empEdit = ref(false), empForm = ref({})
function openEmp(r) { empEdit.value = !!r; empForm.value = r ? { ...r } : {}; showEmpDlg.value = true }
async function saveEmp() { const f = empForm.value; empEdit.value ? await employeeApi.update(f.id, f) : await employeeApi.create(f); showEmpDlg.value = false; await reload(); ElMessage.success('OK') }
async function delEmp(id) { await ElMessageBox.confirm('确认?'); await employeeApi.remove(id); await reload() }

// 部门
const showDepDlg = ref(false), depForm = ref({})
async function saveDep() { await departmentApi.create(depForm.value); showDepDlg.value = false; depForm.value = {}; await reload(); ElMessage.success('OK') }
async function delDep(id) { await departmentApi.remove(id); await reload() }

// 组织架构图
const orgChartFormats = '.png,.jpg,.jpeg,.gif,.bmp,.tiff,.pdf,.ppt,.pptx,.doc,.docx,.vsdx,.xlsx,.xls'
const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff']
function isImageType(ext) { return imageExts.includes(ext) }
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
function fileTypeIcon(ext) {
  const map = { pdf: 'PDF', ppt: 'PPT', pptx: 'PPT', doc: 'DOC', docx: 'DOC', vsdx: 'VSD', xlsx: 'XLS', xls: 'XLS' }
  return map[ext] || ext.toUpperCase()
}

async function loadOrgCharts() {
  try { orgCharts.value = (await orgChartApi.list()).data.data } catch {}
}

async function onOrgChartFile(file) {
  const fd = new FormData()
  fd.append('file', file.raw)
  fd.append('title', file.name.replace(/\.[^.]+$/, ''))
  try {
    await orgChartApi.upload(fd)
    ElMessage.success('上传成功')
    await loadOrgCharts()
  } catch (e) {
    ElMessage.error('上传失败: ' + (e.response?.data?.message || e.message))
  }
}

function viewOrgChart(oc) { window.open(orgChartApi.previewUrl(oc.id), '_blank') }

async function delOrgChart(id) {
  try { await ElMessageBox.confirm('确认删除？'); await orgChartApi.remove(id); await loadOrgCharts(); ElMessage.success('已删除') } catch {}
}

async function importDeptsFromOrgChart(oc) {
  try { await ElMessageBox.confirm('将用此 Excel 文件的数据覆盖导入部门表，确认？') } catch { return }
  try {
    // 下载文件并重新上传到 import-departments 端点
    const res = await fetch(orgChartApi.downloadUrl(oc.id))
    const blob = await res.blob()
    const fd = new FormData()
    fd.append('file', blob, oc.title + '.' + oc.file_type)
    const r = await orgChartApi.importDepartments(fd)
    ElMessage.success(`成功导入 ${r.data.data.imported} 个部门`)
    await reload()
  } catch (e) {
    ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message))
  }
}

// 考勤月报 V2
const rptMonth = ref(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'))
const reportData = ref([])
const attImportMsg = ref('')
const monthOptions = computed(() => {
  const opts = []; const now = new Date();
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); opts.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }
  return opts;
})

async function loadReports() {
  try { reportData.value = (await attendanceApi.reports({ month: rptMonth.value })).data.data } catch {}
}

async function onAttReportFile(file) {
  attImportMsg.value = '导入中...'
  try {
    const fd = new FormData(); fd.append('file', file.raw); fd.append('month', rptMonth.value)
    const r = await attendanceApi.importReports(fd)
    attImportMsg.value = `成功导入 ${r.data.data.imported} 条`
    await loadReports()
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message)); attImportMsg.value = '' }
}

async function delAttReport(id) {
  try { await ElMessageBox.confirm('确认删除？'); await attendanceApi.deleteReport(id); await loadReports(); ElMessage.success('已删除') } catch {}
}

// 绩效考核 V3 — 扁平月报，跟考勤月报一致
const perfMonth = ref(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'))
const perfData = ref([])
const perfImportMsg = ref('')
const perfAccept = '.xlsx,.xls,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.bmp,.webp'

const perfDynDims = computed(() => {
  const set = new Map()
  perfData.value.forEach(r => (r.dims || []).forEach(d => { if (!set.has(d.name)) set.set(d.name, d.weight) }))
  return [...set].map(([name, weight]) => ({ name, weight }))
})

async function loadPerfReports() {
  try { perfData.value = (await performanceApi.reports({ month: perfMonth.value })).data.data } catch {}
}

// 导入预览
const perfPreviewDlg = ref(false), perfPreview = ref({ dims: [], records: [] })

async function onPerfFile(file) {
  perfImportMsg.value = '解析中...'
  try {
    const fd = new FormData(); fd.append('file', file.raw); fd.append('month', perfMonth.value)
    const r = await performanceApi.importPreview(fd)
    perfPreview.value = r.data.data
    perfPreviewDlg.value = true
    perfImportMsg.value = ''
  } catch (e) { ElMessage.error('解析失败: ' + (e.response?.data?.message || e.message)); perfImportMsg.value = '' }
}

async function confirmPerfImport() {
  saving.value = true
  try {
    const r = await performanceApi.batchInsert({ month: perfMonth.value, records: perfPreview.value.records })
    ElMessage.success(`成功导入 ${r.data.data.imported} 条`)
    perfPreviewDlg.value = false
    perfImportMsg.value = `导入 ${r.data.data.imported} 条`
    await loadPerfReports()
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message)) }
  saving.value = false
}

async function delPerfReport(id) {
  try { await ElMessageBox.confirm('确认删除？'); await performanceApi.deleteReport(id); await loadPerfReports(); ElMessage.success('已删除') } catch {}
}

const saving = ref(false)

async function reload() {
  try { employees.value = (await employeeApi.list()).data.data } catch {}
  try { departments.value = (await departmentApi.list()).data.data } catch {}
  try { orgCharts.value = (await orgChartApi.list()).data.data } catch {}
}

const loading = ref(false)
onMounted(async () => {
  loading.value = true
  await reload()
  loading.value = false
})
</script>

<style scoped>
.pg { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px 0; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.kpi-row { display: flex; gap: 16px; margin-bottom: 16px; margin-top: 12px; }
.kpi { padding: 10px 20px; background: #f8f7ff; border-radius: 10px; text-align: center; min-width: 100px; }
.kpi-val { font-size: 22px; font-weight: 700; color: #7c3aed; }
.kpi-lbl { font-size: 12px; color: #b8aad0; margin-top: 2px; }
.pg-body { flex: 1; display: flex; overflow: hidden; }
.side-tabs { width: 140px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; }
.upload-hint { font-size: 11px; color: #b8aad0; }

/* 组织架构图卡片 */
.oc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.oc-card {
  background: #fff; border: 1px solid #f0ecfc; border-radius: 10px; overflow: hidden;
  transition: all .15s; display: flex; flex-direction: column;
}
.oc-card:hover { border-color: #c4b5fd; box-shadow: 0 2px 8px rgba(124,58,237,.06); }
.oc-thumb {
  height: 140px; background: #f8f7ff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden;
}
.oc-img { width: 100%; height: 100%; object-fit: cover; }
.oc-icon-box {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.oc-icon { font-size: 36px; font-weight: 700; color: #7c3aed; }
.oc-ext { font-size: 12px; color: #b8aad0; }
.oc-body { padding: 10px 12px 8px; flex: 1; display: flex; flex-direction: column; }
.oc-title { font-size: 13px; font-weight: 600; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-meta { font-size: 11px; color: #b8aad0; margin-top: 2px; }
.oc-actions { display: flex; gap: 2px; margin-top: 6px; flex-wrap: wrap; }
</style>
