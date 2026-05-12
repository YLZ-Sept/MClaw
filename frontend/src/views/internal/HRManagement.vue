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
        <el-menu-item index="recruitment">招聘管理</el-menu-item>
        <el-menu-item index="leaves">考勤假期</el-menu-item>
        <el-menu-item index="attendance">考勤打卡</el-menu-item>
        <el-menu-item index="changes">人事异动</el-menu-item>
        <el-menu-item index="performance">绩效管理</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 员工档案 -->
        <div v-if="tab==='employees'">
          <div class="tb"><el-button type="primary" @click="openEmp()">新增员工</el-button></div>
          <el-table v-loading="loading" :data="employees" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="80"/><el-table-column prop="department" label="部门" width="100"/><el-table-column prop="role" label="职位" width="100"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column prop="email" label="邮箱" min-width="150"/><el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="primary" link @click="openEmp(row)">编辑</el-button><el-button size="small" type="danger" link @click="delEmp(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 组织架构 -->
        <div v-else-if="tab==='departments'">
          <div class="tb"><el-button type="primary" @click="showDepDlg=true">新增部门</el-button></div>
          <el-table v-loading="loading" :data="departments" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="部门名" width="140"/><el-table-column prop="manager_name" label="负责人" width="100"/><el-table-column label="操作" width="100"><template #default="{row}"><el-button size="small" type="danger" link @click="delDep(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 招聘管理 -->
        <div v-else-if="tab==='recruitment'">
          <div class="tb"><el-button type="primary" @click="showRecDlg=true">新增职位</el-button></div>
          <el-table v-loading="loading" :data="recruitments" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="position" label="职位" width="140"/><el-table-column prop="department" label="部门" width="100"/><el-table-column prop="headcount" label="人数" width="60"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{row}"><el-button size="small" type="danger" link @click="delRec(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 考勤假期 -->
        <div v-else-if="tab==='leaves'">
          <div class="tb"><el-button type="primary" @click="showLeaveDlg=true">申请请假</el-button></div>
          <el-table v-loading="loading" :data="leaves" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="employee_name" label="员工" width="80"/><el-table-column prop="start_date" label="开始" width="110"/><el-table-column prop="end_date" label="结束" width="110"/><el-table-column prop="reason" label="事由" min-width="140"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{row}"><el-button size="small" type="success" link v-if="row.status==='pending'" @click="apprLeave(row.id)">审批</el-button></template></el-table-column></el-table>
        </div>
        <!-- 考勤打卡 -->
        <div v-else-if="tab==='attendance'">
          <div class="tb">
            <el-select v-model="clockEmpId" placeholder="选择员工" style="width:200px"><el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id"/></el-select>
            <el-button type="primary" @click="doClockIn" style="margin-left:8px" :disabled="!clockEmpId">上班打卡</el-button>
            <el-button @click="doClockOut" style="margin-left:4px" :disabled="!clockEmpId">下班打卡</el-button>
            <el-button @click="loadClockRecords" style="margin-left:12px">刷新</el-button>
          </div>
          <el-table v-loading="loading" :data="clockRecords" stripe border row-key="id">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="employee_name" label="员工" width="80"/>
            <el-table-column prop="clock_type" label="类型" width="80"><template #default="{row}"><el-tag size="small" :type="row.clock_type==='in'?'success':''">{{ row.clock_type==='in'?'上班':'下班' }}</el-tag></template></el-table-column>
            <el-table-column prop="clock_time" label="时间" width="180"/>
            <el-table-column prop="source" label="来源" width="80"/>
          </el-table>
        </div>
        <!-- 人事异动 -->
        <div v-else-if="tab==='changes'">
          <div class="tb"><el-button type="primary" @click="showChgDlg=true">新增异动</el-button></div>
          <el-table v-loading="loading" :data="changes" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="employee_name" label="员工" width="80"/><el-table-column prop="type" label="类型" width="80"/><el-table-column prop="old_role" label="原职位" width="100"/><el-table-column prop="new_role" label="新职位" width="100"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{row}"><el-button size="small" type="danger" link @click="delChg(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 绩效管理 -->
        <div v-else-if="tab==='performance'">
          <div class="tb" style="flex-wrap:wrap">
            <el-button type="primary" @click="showPerfSchDlg=true">新建考核方案</el-button>
            <el-select v-model="perfSchemeId" placeholder="选择方案" clearable style="width:180px;margin:0 8px" @change="loadPerfItems"><el-option v-for="s in perfSchemes" :key="s.id" :label="s.name" :value="s.id"/></el-select>
            <el-button v-if="perfSchemeId" @click="showPerfItemDlg=true">新增考核项</el-button>
          </div>
          <el-table v-loading="loading" :data="perfItems" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="employee_name" label="员工" width="80"/><el-table-column prop="indicator" label="指标" width="140"/><el-table-column prop="weight" label="权重" width="60"/><el-table-column prop="target" label="目标" width="140"/><el-table-column prop="self_score" label="自评" width="60"/><el-table-column prop="leader_score" label="上级评分" width="80"/><el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" type="danger" link @click="delPerfItem(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
      </div>
    </div>
    <!-- 员工对话框 -->
    <el-dialog v-model="showEmpDlg" :title="empEdit?'编辑员工':'新增员工'" width="500px"><el-form :model="empForm" label-width="80px"><el-form-item label="姓名"><el-input v-model="empForm.name"/></el-form-item><el-form-item label="部门"><el-input v-model="empForm.department"/></el-form-item><el-form-item label="职位"><el-input v-model="empForm.role"/></el-form-item><el-form-item label="电话"><el-input v-model="empForm.phone"/></el-form-item><el-form-item label="邮箱"><el-input v-model="empForm.email"/></el-form-item></el-form><template #footer><el-button @click="showEmpDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveEmp">保存</el-button></template></el-dialog>
    <!-- 部门对话框 -->
    <el-dialog v-model="showDepDlg" title="新增部门" width="400px"><el-form :model="depForm" label-width="80px"><el-form-item label="部门名"><el-input v-model="depForm.name"/></el-form-item></el-form><template #footer><el-button @click="showDepDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDep">保存</el-button></template></el-dialog>
    <!-- 招聘对话框 -->
    <el-dialog v-model="showRecDlg" title="新增职位" width="500px"><el-form :model="recForm" label-width="80px"><el-form-item label="职位"><el-input v-model="recForm.position"/></el-form-item><el-form-item label="部门"><el-input v-model="recForm.department"/></el-form-item><el-form-item label="人数"><el-input-number v-model="recForm.headcount" :min="1"/></el-form-item></el-form><template #footer><el-button @click="showRecDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveRec">保存</el-button></template></el-dialog>
    <!-- 请假对话框 -->
    <el-dialog v-model="showLeaveDlg" title="申请请假" width="500px"><el-form :model="leaveForm" label-width="80px"><el-form-item label="员工"><el-select v-model="leaveForm.employee_id" style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item><el-form-item label="开始"><el-date-picker v-model="leaveForm.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item><el-form-item label="结束"><el-date-picker v-model="leaveForm.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item><el-form-item label="事由"><el-input v-model="leaveForm.reason" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="showLeaveDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveLeave">提交</el-button></template></el-dialog>
    <!-- 异动对话框 -->
    <el-dialog v-model="showChgDlg" title="新增异动" width="500px"><el-form :model="chgForm" label-width="80px"><el-form-item label="员工"><el-select v-model="chgForm.employee_id" style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item><el-form-item label="类型"><el-select v-model="chgForm.type"><el-option label="晋升" value="promotion"/><el-option label="调岗" value="transfer"/><el-option label="离职" value="resignation"/></el-select></el-form-item><el-form-item label="新部门"><el-input v-model="chgForm.new_department"/></el-form-item><el-form-item label="新职位"><el-input v-model="chgForm.new_role"/></el-form-item></el-form><template #footer><el-button @click="showChgDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveChg">保存</el-button></template></el-dialog>
    <!-- 绩效方案对话框 -->
    <el-dialog v-model="showPerfSchDlg" title="新建考核方案" width="400px"><el-form :model="perfSchForm" label-width="80px"><el-form-item label="方案名"><el-input v-model="perfSchForm.name"/></el-form-item><el-form-item label="周期"><el-select v-model="perfSchForm.period"><el-option label="月度" value="monthly"/><el-option label="季度" value="quarterly"/><el-option label="年度" value="yearly"/></el-select></el-form-item></el-form><template #footer><el-button @click="showPerfSchDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePerfSch">保存</el-button></template></el-dialog>
    <!-- 绩效项对话框 -->
    <el-dialog v-model="showPerfItemDlg" title="新增考核项" width="500px"><el-form :model="perfItemForm" label-width="80px"><el-form-item label="员工"><el-select v-model="perfItemForm.employee_id" style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item><el-form-item label="指标"><el-input v-model="perfItemForm.indicator"/></el-form-item><el-form-item label="权重"><el-input-number v-model="perfItemForm.weight" :min="0" :max="100"/></el-form-item><el-form-item label="目标"><el-input v-model="perfItemForm.target"/></el-form-item></el-form><template #footer><el-button @click="showPerfItemDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePerfItem">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employeeApi, departmentApi, recruitmentApi, attendanceApi, personnelChangeApi, performanceApi } from '../../api/hr'
const router = useRouter()

const tab = ref('employees')
const employees = ref([]), departments = ref([]), recruitments = ref([]), leaves = ref([]), changes = ref([])
const perfSchemes = ref([]), perfItems = ref([]), perfSchemeId = ref('')

const kpis = computed(() => [
  { val: employees.value.length, label: '在职员工' },
  { val: leaves.value.filter(l => l.status === 'pending').length, label: '待审批请假' },
  { val: recruitments.value.filter(r => r.status === 'open').length, label: '招聘中' },
  { val: perfSchemes.value.length, label: '考核方案' }
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

// 招聘
const showRecDlg = ref(false), recForm = ref({})
async function saveRec() { await recruitmentApi.create(recForm.value); showRecDlg.value = false; recForm.value = {}; await reload(); ElMessage.success('OK') }
async function delRec(id) { await recruitmentApi.remove(id); await reload() }

// 请假
const showLeaveDlg = ref(false), leaveForm = ref({})
async function saveLeave() { await employeeApi.applyLeave(leaveForm.value); showLeaveDlg.value = false; leaveForm.value = {}; await reload(); ElMessage.success('已提交') }
async function apprLeave(id) { await employeeApi.approveLeave(id, { status: 'approved' }); await reload(); ElMessage.success('已审批') }

// 异动
const showChgDlg = ref(false), chgForm = ref({})
async function saveChg() { await personnelChangeApi.create(chgForm.value); showChgDlg.value = false; chgForm.value = {}; await reload(); ElMessage.success('OK') }
async function delChg(id) { await personnelChangeApi.remove(id); await reload() }

// 绩效
const showPerfSchDlg = ref(false), perfSchForm = ref({})
const showPerfItemDlg = ref(false), perfItemForm = ref({})
const clockEmpId = ref(''), clockRecords = ref([]), saving = ref(false)
async function savePerfSch() { await performanceApi.createScheme(perfSchForm.value); showPerfSchDlg.value = false; perfSchForm.value = {}; await loadPerfSchemes(); ElMessage.success('OK') }
async function savePerfItem() { await performanceApi.addItem(perfSchemeId.value, perfItemForm.value); showPerfItemDlg.value = false; perfItemForm.value = {}; await loadPerfItems(); ElMessage.success('OK') }
async function delPerfItem(id) { await performanceApi.deleteItem(id); await loadPerfItems() }
async function loadPerfSchemes() { try { perfSchemes.value = (await performanceApi.schemes()).data.data } catch {} }
async function loadPerfItems() { if (perfSchemeId.value) { try { perfItems.value = (await performanceApi.items(perfSchemeId.value)).data.data } catch {} } }

async function doClockIn() { await attendanceApi.clockIn({ employee_id: clockEmpId.value }); ElMessage.success('打卡成功'); await loadClockRecords() }
async function doClockOut() { await attendanceApi.clockOut({ employee_id: clockEmpId.value }); ElMessage.success('打卡成功'); await loadClockRecords() }
async function loadClockRecords() { try { const res = await attendanceApi.records({}); clockRecords.value = res.data.data } catch {} }

async function reload() {
  try { employees.value = (await employeeApi.list()).data.data } catch {}
  try { departments.value = (await departmentApi.list()).data.data } catch {}
  try { recruitments.value = (await recruitmentApi.list()).data.data } catch {}
  try { leaves.value = (await employeeApi.leaveList()).data.data } catch {}
  try { changes.value = (await personnelChangeApi.list()).data.data } catch {}
  try { perfSchemes.value = (await performanceApi.schemes()).data.data } catch {}
}

const loading = ref(false)
onMounted(async () => {
  loading.value = true
  await reload()
  await loadPerfSchemes()
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
</style>
