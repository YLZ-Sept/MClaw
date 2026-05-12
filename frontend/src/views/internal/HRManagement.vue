<template>
  <div class="page-container">
    <div class="page-title">人力资源管理</div>
    <el-tabs v-model="tab" type="border-card">
      <el-tab-pane label="员工档案" name="employees">
        <div class="tb"><el-button type="primary" @click="openEmpDlg()">新增员工</el-button></div>
        <el-table :data="employees" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="姓名" width="80" />
          <el-table-column prop="department" label="部门" width="100" />
          <el-table-column prop="role" label="职位" width="100" />
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column prop="email" label="邮箱" min-width="150" />
          <el-table-column label="操作" width="120">
            <template #default="{row}">
              <el-button size="small" type="primary" link @click="openEmpDlg(row)">编辑</el-button>
              <el-button size="small" type="danger" link @click="delEmp(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="empDlg.visible" :title="empDlg.isEdit?'编辑员工':'新增员工'" width="500px">
          <el-form :model="empDlg.form" label-width="80px">
            <el-form-item label="姓名"><el-input v-model="empDlg.form.name" /></el-form-item>
            <el-form-item label="部门"><el-input v-model="empDlg.form.department" /></el-form-item>
            <el-form-item label="职位"><el-input v-model="empDlg.form.role" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="empDlg.form.phone" /></el-form-item>
            <el-form-item label="邮箱"><el-input v-model="empDlg.form.email" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="empDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveEmp">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="组织架构" name="departments">
        <div class="tb"><el-button type="primary" @click="depDlg.visible=true">新增部门</el-button></div>
        <el-table :data="departments" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="部门名" width="140" />
          <el-table-column prop="manager_name" label="负责人" width="100" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delDep(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="depDlg.visible" title="新增部门" width="500px">
          <el-form :model="depDlg.form" label-width="80px">
            <el-form-item label="部门名"><el-input v-model="depDlg.form.name" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="depDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveDep">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="招聘管理" name="recruitment">
        <div class="tb"><el-button type="primary" @click="recDlg.visible=true">新增职位</el-button></div>
        <el-table :data="recruitments" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="position" label="职位" width="140" />
          <el-table-column prop="department" label="部门" width="100" />
          <el-table-column prop="headcount" label="人数" width="60" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delRec(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="recDlg.visible" title="新增职位" width="500px">
          <el-form :model="recDlg.form" label-width="80px">
            <el-form-item label="职位"><el-input v-model="recDlg.form.position" /></el-form-item>
            <el-form-item label="部门"><el-input v-model="recDlg.form.department" /></el-form-item>
            <el-form-item label="人数"><el-input-number v-model="recDlg.form.headcount" :min="1" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="recDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveRec">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="请假管理" name="leaves">
        <div class="tb"><el-button type="primary" @click="leaveDlg.visible=true">申请请假</el-button></div>
        <el-table :data="leaves" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="employee_name" label="员工" width="80" />
          <el-table-column prop="start_date" label="开始" width="110" />
          <el-table-column prop="end_date" label="结束" width="110" />
          <el-table-column prop="reason" label="事由" min-width="140" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}">
              <el-button size="small" type="success" link v-if="row.status==='pending'" @click="approveLeave(row.id)">审批</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="leaveDlg.visible" title="申请请假" width="500px">
          <el-form :model="leaveDlg.form" label-width="80px">
            <el-form-item label="员工"><el-select v-model="leaveDlg.form.employee_id" style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" /></el-select></el-form-item>
            <el-form-item label="开始"><el-date-picker v-model="leaveDlg.form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
            <el-form-item label="结束"><el-date-picker v-model="leaveDlg.form.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
            <el-form-item label="事由"><el-input v-model="leaveDlg.form.reason" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="leaveDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveLeave">提交</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employeeApi, departmentApi, recruitmentApi } from '../../api/hr'

const tab = ref('employees')
const employees = ref([]), departments = ref([]), recruitments = ref([]), leaves = ref([])
const empDlg = reactive({ visible: false, isEdit: false, form: {} })
const depDlg = reactive({ visible: false, form: {} })
const recDlg = reactive({ visible: false, form: {} })
const leaveDlg = reactive({ visible: false, form: {} })

function openEmpDlg(row) {
  empDlg.isEdit = !!row; empDlg.form = row ? { ...row } : {}; empDlg.visible = true
}
async function saveEmp() {
  const f = empDlg.form
  empDlg.isEdit ? await employeeApi.update(f.id, f) : await employeeApi.create(f)
  empDlg.visible = false; empDlg.form = {}; empDlg.isEdit = false; await loadAll(); ElMessage.success('保存成功')
}
async function delEmp(id) { await ElMessageBox.confirm('确认？'); await employeeApi.remove(id); await loadAll() }
async function saveDep() { await departmentApi.create(depDlg.form); depDlg.visible = false; depDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }
async function delDep(id) { await departmentApi.remove(id); await loadAll() }
async function saveRec() { await recruitmentApi.create(recDlg.form); recDlg.visible = false; recDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }
async function delRec(id) { await recruitmentApi.remove(id); await loadAll() }
async function saveLeave() { await employeeApi.applyLeave(leaveDlg.form); leaveDlg.visible = false; leaveDlg.form = {}; await loadAll(); ElMessage.success('已提交') }
async function approveLeave(id) { await employeeApi.approveLeave(id, { status: 'approved' }); await loadAll(); ElMessage.success('已审批') }

async function loadAll() {
  employees.value = (await employeeApi.list()).data.data
  departments.value = (await departmentApi.list()).data.data
  recruitments.value = (await recruitmentApi.list()).data.data
  leaves.value = (await employeeApi.leaveList()).data.data
}

onMounted(loadAll)
</script>

<style scoped>
.tb { margin-bottom: 12px; }
.page-container { padding:24px; background:#fff; height:100%; overflow-y:auto; }
.page-title { font-size:20px; font-weight:600; color:#4a3f5e; margin-bottom:20px; }
</style>
