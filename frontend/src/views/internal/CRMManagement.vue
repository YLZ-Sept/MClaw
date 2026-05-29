<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal/sales')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">客户关系管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="customers">客户信息</el-menu-item>
        <el-menu-item index="opportunities">项目商机</el-menu-item>
        <el-menu-item index="contracts">合同订单</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- ===== 客户信息 ===== -->
        <div v-if="tab==='customers'">
          <div class="tb"><el-button type="primary" @click="openCusDlg()">新增客户</el-button><el-button @click="handleExport('customers')">导出</el-button><el-button @click="handleImport('customers')">导入</el-button></div>
          <el-empty v-if="!loading&&customers.length===0" description="暂无客户"/>
          <el-table v-loading="loading" :data="customers" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="name" label="客户名称" width="120"/>
            <el-table-column prop="phone" label="联系电话" width="130"/>
            <el-table-column prop="company" label="所属单位" min-width="160"/>
            <el-table-column prop="position" label="职务" width="100"/>
            <el-table-column prop="gender" label="性别" width="60"/>
            <el-table-column prop="age" label="年龄" width="60"/>
            <el-table-column prop="contact_frequency" label="接触频次" width="100"/>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{row}">
                <el-button size="small" type="primary" link @click="openCusDlg(row)">编辑</el-button>
                <el-button size="small" type="primary" link @click="openContacts(row)">联系人</el-button>
                <el-button size="small" type="primary" link @click="openFollow(row)">跟进</el-button>
                <el-button size="small" type="danger" link @click="delCus(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <!-- ===== 项目商机 ===== -->
        <div v-else-if="tab==='opportunities'">
          <div class="tb"><el-button type="primary" @click="opDlg.visible=true">新增商机</el-button><el-button @click="handleExport('opportunities')">导出</el-button><el-button @click="handleImport('opportunities')">导入</el-button></div>
          <el-table v-loading="loading" :data="opportunities" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="title" label="商机名称" width="160"/>
            <el-table-column prop="sales_owner" label="所属销售" width="100"/>
            <el-table-column prop="contact_name" label="客户联系人" width="110"/>
            <el-table-column prop="contact_phone" label="联系电话" width="130"/>
            <el-table-column prop="amount" label="商机金额" width="100"/>
            <el-table-column prop="stage" label="阶段" width="90">
              <template #default="{row}"><el-tag :type="stageType(row.stage)" size="small">{{ stageLabel(row.stage) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="140"><template #default="{r}"><el-button size="small" type="primary" link @click="openOpDlg(r)">编辑</el-button><el-button size="small" type="danger" link @click="delOp(r.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
        <!-- ===== 合同订单 ===== -->
        <div v-else-if="tab==='contracts'">
          <div class="tb"><el-button type="primary" @click="cnDlg.visible=true">新增合同</el-button><el-button @click="handleExport('contracts')">导出</el-button><el-button @click="handleImport('contracts')">导入</el-button></div>
          <el-empty v-if="!loading&&contracts.length===0" description="暂无合同"/>
          <el-table v-loading="loading" :data="contracts" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="45" fixed/>
            <el-table-column prop="title" label="合同名称" min-width="180" show-overflow-tooltip fixed/>
            <el-table-column prop="contract_no" label="合同编号" width="140"/>
            <el-table-column prop="sales_owner" label="所属销售" width="80"/>
            <el-table-column prop="contact_name" label="客户联系人" width="100"/>
            <el-table-column prop="contact_phone" label="联系电话" width="120"/>
            <el-table-column prop="content" label="合同内容（产品/服务）" min-width="180" show-overflow-tooltip/>
            <el-table-column prop="amount" label="合同金额" width="110" :formatter="fmtMoney"/>
            <el-table-column prop="signed_date" label="签订时间" width="110"/>
            <el-table-column prop="warranty_period" label="质保期限" width="100"/>
            <el-table-column prop="prepaid_amount" label="预付金额" width="100" :formatter="fmtMoney"/>
            <el-table-column prop="receivable_amount" label="应收金额" width="100" :formatter="fmtMoney"/>
            <el-table-column prop="invoice" label="发票开具" width="90"/>
            <el-table-column prop="delivery_progress" label="交付进度" width="90"/>
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip/>
            <el-table-column label="操作" width="140" fixed="right"><template #default="{r}"><el-button size="small" type="primary" link @click="openCnDlg(r)">编辑</el-button><el-button size="small" type="danger" link @click="delCn(r.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
      </div>
    </div>
    <!-- ===== 客户对话框 ===== -->
    <el-dialog v-model="cusDlg.visible" :title="cusDlg.ed?'编辑客户':'新增客户'" width="650px">
      <el-form :model="cusDlg.form" label-width="80px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="cusDlg.form.name"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="cusDlg.form.phone"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="所属单位"><el-input v-model="cusDlg.form.company"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="职务"><el-input v-model="cusDlg.form.position"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="性别"><el-select v-model="cusDlg.form.gender"><el-option label="男" value="男"/><el-option label="女" value="女"/></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="年龄"><el-input-number v-model="cusDlg.form.age" :min="1" :max="120"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="接触频次"><el-input v-model="cusDlg.form.contact_frequency" placeholder="如：每周"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="个人特征"><el-input v-model="cusDlg.form.traits" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="个人喜好"><el-input v-model="cusDlg.form.preferences" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="地址"><el-input v-model="cusDlg.form.address"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="cusDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCus">保存</el-button></template>
    </el-dialog>
    <!-- 联系人 -->
    <el-dialog v-model="ctDlg.visible" :title="`${ctDlg.cusName} 的联系人`" width="600px">
      <div class="tb" style="margin-bottom:12px"><el-button size="small" type="primary" @click="ctAddDlg.visible=true">新增联系人</el-button></div>
      <el-table :data="ctDlg.list" stripe border row-key="id" size="small">
        <el-table-column prop="name" label="姓名" width="100"/><el-table-column prop="position" label="职位" width="120"/>
        <el-table-column prop="phone" label="电话" width="140"/><el-table-column prop="email" label="邮箱" min-width="160"/>
        <el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delCt(r.id)">删除</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="ctDlg.list.length===0" description="暂无联系人"/>
    </el-dialog>
    <el-dialog v-model="ctAddDlg.visible" title="新增联系人" width="450px">
      <el-form :model="ctAddDlg.form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="ctAddDlg.form.name"/></el-form-item>
        <el-form-item label="职位"><el-input v-model="ctAddDlg.form.position"/></el-form-item>
        <el-form-item label="电话"><el-input v-model="ctAddDlg.form.phone"/></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="ctAddDlg.form.email"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="ctAddDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCt">保存</el-button></template>
    </el-dialog>
    <!-- 跟进 -->
    <el-dialog v-model="flwDlg.visible" title="跟进记录" width="600px">
      <el-timeline><el-timeline-item v-for="f in flwDlg.list" :key="f.id" :timestamp="f.created_at">{{f.content}}</el-timeline-item></el-timeline>
      <el-empty v-if="flwDlg.list.length===0" description="暂无跟进"/>
      <div style="display:flex;gap:8px;margin-top:12px"><el-input v-model="flwDlg.txt" placeholder="添加跟进内容"/><el-button type="primary" @click="addFlw">添加</el-button></div>
    </el-dialog>
    <!-- 项目商机 -->
    <el-dialog v-model="opDlg.visible" :title="opDlg.ed?'编辑商机':'新增商机'" width="650px">
      <el-form :model="opDlg.form" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="商机名称"><el-input v-model="opDlg.form.title"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="所属销售"><el-input v-model="opDlg.form.sales_owner"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户联系人"><el-input v-model="opDlg.form.contact_name"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="opDlg.form.contact_phone"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="需求描述"><el-input v-model="opDlg.form.description" type="textarea" :rows="2"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="商机金额"><el-input-number v-model="opDlg.form.amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="阶段"><el-select v-model="opDlg.form.stage"><el-option label="初步接触" value="contact"/><el-option label="需求确认" value="demo"/><el-option label="方案报价" value="proposal"/><el-option label="商务谈判" value="negotiation"/><el-option label="签约" value="closed"/></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="竞争情况"><el-input v-model="opDlg.form.competition"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="商机进展"><el-input v-model="opDlg.form.progress" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="下一步计划"><el-input v-model="opDlg.form.next_plan" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="opDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveOp(opDlg.ed)">保存</el-button></template>
    </el-dialog>
    <!-- 合同 -->
    <el-dialog v-model="cnDlg.visible" :title="cnDlg.ed?'编辑合同':'新增合同'" width="700px">
      <el-form :model="cnDlg.form" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="合同名称"><el-input v-model="cnDlg.form.title"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="合同编号"><el-input v-model="cnDlg.form.contract_no"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="所属销售"><el-input v-model="cnDlg.form.sales_owner"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户联系人"><el-input v-model="cnDlg.form.contact_name"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="联系电话"><el-input v-model="cnDlg.form.contact_phone"/></el-form-item>
        <el-form-item label="合同内容"><el-input v-model="cnDlg.form.content" type="textarea" :rows="3" placeholder="产品/服务描述"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="合同金额"><el-input-number v-model="cnDlg.form.amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="预付金额"><el-input-number v-model="cnDlg.form.prepaid_amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="应收金额"><el-input-number v-model="cnDlg.form.receivable_amount" :min="0" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="签订时间"><el-date-picker v-model="cnDlg.form.signed_date" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="质保期限"><el-input v-model="cnDlg.form.warranty_period" placeholder="如：2年"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="发票开具"><el-input v-model="cnDlg.form.invoice"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="交付进度"><el-input v-model="cnDlg.form.delivery_progress"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="cnDlg.form.remark" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="cnDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCn(cnDlg.ed)">保存</el-button></template>
    </el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { customerApi, contactApi, opportunityApi, contractApi } from '../../api/crm'
import ImportDialog from '../../components/ImportDialog.vue'
const router = useRouter()

const tab = ref('customers')
const importVisible = ref(false), importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key) { window.open(`/api/io/${key}/export`) }
function onImportDone() { ld() }

const customers = ref([]), opportunities = ref([]), contracts = ref([])

const kpis = computed(() => [
  { val: customers.value.length, label: '客户总数' },
  { val: opportunities.value.filter(o => o.stage !== 'closed').length, label: '进行中机会' },
  { val: contracts.value.length, label: '合同总数' }
])

// ─── 客户 ───
const cusDlg = reactive({ visible: false, ed: false, form: {} })
const saving = ref(false)

function openCusDlg(r) { cusDlg.ed = !!r; cusDlg.form = r ? { ...r } : {}; cusDlg.visible = true }
async function saveCus() {
  saving.value = true
  const f = cusDlg.form
  cusDlg.ed ? await customerApi.update(f.id, f) : await customerApi.create(f)
  cusDlg.visible = false
  await ld()
  saving.value = false
  ElMessage.success('OK')
}
async function delCus(id) { await ElMessageBox.confirm('确认删除?'); await customerApi.remove(id); await ld() }

// ─── 联系人 ───
const ctDlg = reactive({ visible: false, cid: '', cusName: '', list: [] })
const ctAddDlg = reactive({ visible: false, form: {} })

async function openContacts(r) {
  ctDlg.cid = r.id; ctDlg.cusName = r.name
  const res = await contactApi.list(r.id); ctDlg.list = res.data.data || []
  ctDlg.visible = true
}
async function saveCt() {
  await contactApi.create({ ...ctAddDlg.form, customer_id: ctDlg.cid })
  ctAddDlg.visible = false; ctAddDlg.form = {}
  const res = await contactApi.list(ctDlg.cid); ctDlg.list = res.data.data || []
  ElMessage.success('OK')
}
async function delCt(id) { await contactApi.remove(id); const res = await contactApi.list(ctDlg.cid); ctDlg.list = res.data.data || [] }

// ─── 跟进 ───
const flwDlg = reactive({ visible: false, list: [], cid: '', txt: '' })
async function openFollow(r) {
  flwDlg.cid = r.id
  const res = await customerApi.followUps(r.id); flwDlg.list = res.data.data || []
  flwDlg.txt = ''; flwDlg.visible = true
}
async function addFlw() {
  if (!flwDlg.txt) return
  await customerApi.addFollowUp(flwDlg.cid, { content: flwDlg.txt })
  flwDlg.txt = ''
  const res = await customerApi.followUps(flwDlg.cid); flwDlg.list = res.data.data || []
  ElMessage.success('已添加')
}

// ─── 机会 ───
const opDlg = reactive({ visible: false, ed: false, editId: '', form: {} })
const stageMap = { contact: '初步接触', demo: '需求确认', proposal: '方案报价', negotiation: '商务谈判', closed: '签约' }
function stageLabel(s) { return stageMap[s] || s }
function stageType(s) { return s === 'closed' ? 'success' : s === 'negotiation' ? 'warning' : 'info' }
function openOpDlg(r) { opDlg.ed = !!r; opDlg.editId = r?.id || ''; opDlg.form = r ? { ...r } : {}; opDlg.visible = true }
async function saveOp(isEdit) {
  saving.value = true
  isEdit ? await opportunityApi.update(opDlg.editId, opDlg.form) : await opportunityApi.create(opDlg.form)
  opDlg.visible = false; opDlg.form = {}
  await ld(); saving.value = false
  ElMessage.success('OK')
}
async function delOp(id) { try { await ElMessageBox.confirm('确认删除?'); await opportunityApi.remove(id); await ld() } catch {} }

// ─── 合同 ───
const cnDlg = reactive({ visible: false, ed: false, editId: '', form: {} })
function openCnDlg(r) { cnDlg.ed = !!r; cnDlg.editId = r?.id || ''; cnDlg.form = r ? { ...r } : {}; cnDlg.visible = true }
async function saveCn(isEdit) {
  saving.value = true
  isEdit ? await contractApi.update(cnDlg.editId, cnDlg.form) : await contractApi.create(cnDlg.form)
  cnDlg.visible = false; cnDlg.form = {}
  await ld(); saving.value = false
  ElMessage.success('OK')
}
async function delCn(id) { try { await ElMessageBox.confirm('确认删除?'); await contractApi.remove(id); await ld() } catch {} }

function fmtMoney(r,c,v) { if (v==null||v===0) return ''; return '¥'+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2}) }

const loading = ref(false)
async function ld() {
  loading.value = true
  try { customers.value = (await customerApi.list()).data.data } catch {}
  try { opportunities.value = (await opportunityApi.list()).data.data } catch {}
  try { contracts.value = (await contractApi.list()).data.data } catch {}
  loading.value = false
}
onMounted(ld)
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
.side-tabs { width: 160px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
</style>
