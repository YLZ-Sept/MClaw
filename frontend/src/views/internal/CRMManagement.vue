<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">客户关系管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="customers">客户管理</el-menu-item>
        <el-menu-item index="contacts">联系人</el-menu-item>
        <el-menu-item index="opportunities">销售机会</el-menu-item>
        <el-menu-item index="leads">线索管理</el-menu-item>
        <el-menu-item index="campaigns">营销活动</el-menu-item>
        <el-menu-item index="quotations">报价管理</el-menu-item>
        <el-menu-item index="contracts">合同管理</el-menu-item>
        <el-menu-item index="tickets">工单系统</el-menu-item>
        <el-menu-item index="feedback">客户反馈</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <div v-if="tab==='customers'">
          <div class="tb"><el-button type="primary" @click="openCusDlg()">新增客户</el-button></div>
          <el-empty v-if="!loading&&customers.length===0" description="暂无客户"/>
          <el-table v-loading="loading" :data="customers" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="100"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column prop="company" label="公司" min-width="150"/><el-table-column prop="source" label="来源" width="80"/><el-table-column label="操作" width="180" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openCusDlg(row)">编辑</el-button><el-button size="small" type="primary" link @click="openFollow(row)">跟进</el-button><el-button size="small" type="danger" link @click="delCus(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='contacts'">
          <div class="tb"><el-button type="primary" @click="ctDlg.visible=true">新增联系人</el-button></div>
          <el-table v-loading="loading" :data="contacts" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="100"/><el-table-column prop="position" label="职位" width="120"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delCt(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='opportunities'">
          <div class="tb"><el-button type="primary" @click="opDlg.visible=true">新增机会</el-button></div>
          <el-table v-loading="loading" :data="opportunities" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="title" label="机会名称" width="160"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="stage" label="阶段" width="90"/><el-table-column prop="amount" label="金额" width="90"/><el-table-column prop="probability" label="赢率" width="70"><template #default="{row}">{{row.probability}}%</template></el-table-column><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delOp(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='leads'">
          <div class="tb"><el-button type="primary" @click="ldDlg.visible=true">新增线索</el-button></div>
          <el-table v-loading="loading" :data="leads" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="100"/><el-table-column prop="company" label="公司" width="140"/><el-table-column prop="source" label="来源" width="80"/><el-table-column prop="status" label="状态" width="90"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delLd(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='campaigns'">
          <div class="tb"><el-button type="primary" @click="cpDlg.visible=true">新增活动</el-button></div>
          <el-table v-loading="loading" :data="campaigns" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="活动名" width="140"/><el-table-column prop="type" label="类型" width="80"/><el-table-column prop="budget" label="预算" width="90"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delCp(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='quotations'">
          <div class="tb"><el-button type="primary" @click="qtDlg.visible=true">新增报价</el-button></div>
          <el-table v-loading="loading" :data="quotations" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="title" label="标题" width="140"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="total" label="金额" width="90"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delQt(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='contracts'">
          <div class="tb"><el-button type="primary" @click="cnDlg.visible=true">新增合同</el-button></div>
          <el-table v-loading="loading" :data="contracts" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="title" label="标题" width="140"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="total" label="金额" width="90"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delCn(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='tickets'">
          <div class="tb"><el-button type="primary" @click="tkDlg.visible=true">新建工单</el-button></div>
          <el-table v-loading="loading" :data="tickets" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="title" label="标题" min-width="160"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="priority" label="优先级" width="70"/><el-table-column prop="status" label="状态" width="70"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delTk(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <div v-else-if="tab==='feedback'">
          <div class="tb"><el-button type="primary" @click="fbDlg.visible=true">新增反馈</el-button></div>
          <el-table v-loading="loading" :data="feedbacks" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="rating" label="评分" width="60"/><el-table-column prop="category" label="类别" width="80"/><el-table-column prop="content" label="内容" min-width="200"/><el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delFb(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
      </div>
    </div>
    <!-- Dialogs -->
    <el-dialog v-model="cusDlg.visible" :title="cusDlg.ed?'编辑客户':'新增客户'" width="500px"><el-form :model="cusDlg.form" label-width="80px"><el-form-item label="姓名"><el-input v-model="cusDlg.form.name"/></el-form-item><el-form-item label="电话"><el-input v-model="cusDlg.form.phone"/></el-form-item><el-form-item label="公司"><el-input v-model="cusDlg.form.company"/></el-form-item><el-form-item label="来源"><el-input v-model="cusDlg.form.source"/></el-form-item></el-form><template #footer><el-button @click="cusDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCus">保存</el-button></template></el-dialog>
    <el-dialog v-model="flwDlg.visible" title="跟进记录" width="600px"><el-timeline><el-timeline-item v-for="f in flwDlg.list" :key="f.id" :timestamp="f.created_at">{{f.content}}</el-timeline-item></el-timeline><el-input v-model="flwDlg.txt" placeholder="添加跟进" style="margin-top:12px"/><el-button type="primary" size="small" style="margin-top:8px" @click="addFlw">添加</el-button></el-dialog>
    <el-dialog v-model="ctDlg.visible" title="新增联系人" width="500px"><el-form :model="ctDlg.form" label-width="80px"><el-form-item label="姓名"><el-input v-model="ctDlg.form.name"/></el-form-item><el-form-item label="职位"><el-input v-model="ctDlg.form.position"/></el-form-item><el-form-item label="电话"><el-input v-model="ctDlg.form.phone"/></el-form-item></el-form><template #footer><el-button @click="ctDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCt">保存</el-button></template></el-dialog>
    <el-dialog v-model="opDlg.visible" title="新增销售机会" width="500px"><el-form :model="opDlg.form" label-width="80px"><el-form-item label="机会名称"><el-input v-model="opDlg.form.title"/></el-form-item><el-form-item label="阶段"><el-select v-model="opDlg.form.stage"><el-option label="初步接触" value="contact"/><el-option label="需求确认" value="demo"/><el-option label="方案报价" value="proposal"/><el-option label="商务谈判" value="negotiation"/><el-option label="签约" value="closed"/></el-select></el-form-item><el-form-item label="金额"><el-input-number v-model="opDlg.form.amount" :min="0"/></el-form-item><el-form-item label="赢率(%)"><el-input-number v-model="opDlg.form.probability" :min="0" :max="100"/></el-form-item></el-form><template #footer><el-button @click="opDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveOp">保存</el-button></template></el-dialog>
    <el-dialog v-model="ldDlg.visible" title="新增线索" width="500px"><el-form :model="ldDlg.form" label-width="80px"><el-form-item label="姓名"><el-input v-model="ldDlg.form.name"/></el-form-item><el-form-item label="公司"><el-input v-model="ldDlg.form.company"/></el-form-item><el-form-item label="来源"><el-input v-model="ldDlg.form.source"/></el-form-item></el-form><template #footer><el-button @click="ldDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveLd">保存</el-button></template></el-dialog>
    <el-dialog v-model="cpDlg.visible" title="新增活动" width="500px"><el-form :model="cpDlg.form" label-width="80px"><el-form-item label="活动名"><el-input v-model="cpDlg.form.name"/></el-form-item><el-form-item label="类型"><el-input v-model="cpDlg.form.type"/></el-form-item><el-form-item label="预算"><el-input-number v-model="cpDlg.form.budget" :min="0"/></el-form-item></el-form><template #footer><el-button @click="cpDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCp">保存</el-button></template></el-dialog>
    <el-dialog v-model="qtDlg.visible" title="新增报价" width="500px"><el-form :model="qtDlg.form" label-width="80px"><el-form-item label="标题"><el-input v-model="qtDlg.form.title"/></el-form-item><el-form-item label="金额"><el-input-number v-model="qtDlg.form.total" :min="0"/></el-form-item></el-form><template #footer><el-button @click="qtDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveQt">保存</el-button></template></el-dialog>
    <el-dialog v-model="cnDlg.visible" title="新增合同" width="500px"><el-form :model="cnDlg.form" label-width="80px"><el-form-item label="标题"><el-input v-model="cnDlg.form.title"/></el-form-item><el-form-item label="金额"><el-input-number v-model="cnDlg.form.total" :min="0"/></el-form-item></el-form><template #footer><el-button @click="cnDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCn">保存</el-button></template></el-dialog>
    <el-dialog v-model="tkDlg.visible" title="新建工单" width="500px"><el-form :model="tkDlg.form" label-width="80px"><el-form-item label="标题"><el-input v-model="tkDlg.form.title"/></el-form-item><el-form-item label="描述"><el-input v-model="tkDlg.form.description" type="textarea"/></el-form-item><el-form-item label="优先级"><el-select v-model="tkDlg.form.priority"><el-option label="低" value="low"/><el-option label="中" value="medium"/><el-option label="高" value="high"/><el-option label="紧急" value="urgent"/></el-select></el-form-item></el-form><template #footer><el-button @click="tkDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTk">保存</el-button></template></el-dialog>
    <el-dialog v-model="fbDlg.visible" title="新增反馈" width="500px"><el-form :model="fbDlg.form" label-width="80px"><el-form-item label="评分"><el-rate v-model="fbDlg.form.rating"/></el-form-item><el-form-item label="类别"><el-input v-model="fbDlg.form.category"/></el-form-item><el-form-item label="内容"><el-input v-model="fbDlg.form.content" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="fbDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveFb">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { customerApi, contactApi, opportunityApi, leadApi, campaignApi, quotationApi, contractApi, ticketApi, feedbackApi } from '../../api/crm'
const router = useRouter()

const tab = ref('customers')
const customers = ref([]), contacts = ref([]), opportunities = ref([]), leads = ref([]), campaigns = ref([]), quotations = ref([]), contracts = ref([]), tickets = ref([]), feedbacks = ref([])

const kpis = computed(() => [
  { val: customers.value.length, label: '客户总数' },
  { val: opportunities.value.length, label: '销售机会' },
  { val: tickets.value.filter(t=>t.status==='open').length, label: '待处理工单' },
  { val: contracts.value.filter(c=>c.status==='active').length, label: '生效合同' }
])

const cusDlg = reactive({ visible: false, ed: false, form: {} })
const flwDlg = reactive({ visible: false, list: [], cid: '', txt: '' })
const ctDlg = reactive({ visible: false, form: {} })
const opDlg = reactive({ visible: false, form: {} })
const ldDlg = reactive({ visible: false, form: {} })
const cpDlg = reactive({ visible: false, form: {} })
const qtDlg = reactive({ visible: false, form: {} })
const cnDlg = reactive({ visible: false, form: {} })
const tkDlg = reactive({ visible: false, form: {} })
const fbDlg = reactive({ visible: false, form: {} })

function openCusDlg(r) { cusDlg.ed = !!r; cusDlg.form = r ? { ...r } : {}; cusDlg.visible = true }
const saving = ref(false)
async function saveCus() { saving.value=true; const f = cusDlg.form; cusDlg.ed ? await customerApi.update(f.id, f) : await customerApi.create(f); cusDlg.visible = false; await ld(); saving.value=false; ElMessage.success('OK') }
async function delCus(id) { await ElMessageBox.confirm('确认?'); await customerApi.remove(id); await ld() }

async function openFollow(r) { flwDlg.cid = r.id; const res = await customerApi.followUps(r.id); flwDlg.list = res.data.data; flwDlg.visible = true }
async function addFlw() { if (!flwDlg.txt) return; await customerApi.addFollowUp(flwDlg.cid, { content: flwDlg.txt }); flwDlg.txt = ''; const res = await customerApi.followUps(flwDlg.cid); flwDlg.list = res.data.data; ElMessage.success('已添加') }

async function saveCt() { await contactApi.create(ctDlg.form); ctDlg.visible = false; ctDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delCt(id) { await contactApi.remove(id); await ld() }

async function saveOp() { await opportunityApi.create(opDlg.form); opDlg.visible = false; opDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delOp(id) { await opportunityApi.remove(id); await ld() }

async function saveLd() { await leadApi.create(ldDlg.form); ldDlg.visible = false; ldDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delLd(id) { await leadApi.remove(id); await ld() }

async function saveCp() { await campaignApi.create(cpDlg.form); cpDlg.visible = false; cpDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delCp(id) { await campaignApi.remove(id); await ld() }

async function saveQt() { await quotationApi.create(qtDlg.form); qtDlg.visible = false; qtDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delQt(id) { await quotationApi.remove(id); await ld() }

async function saveCn() { await contractApi.create(cnDlg.form); cnDlg.visible = false; cnDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delCn(id) { await contractApi.remove(id); await ld() }

async function saveTk() { await ticketApi.create(tkDlg.form); tkDlg.visible = false; tkDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delTk(id) { await ticketApi.remove(id); await ld() }

async function saveFb() { await feedbackApi.create(fbDlg.form); fbDlg.visible = false; fbDlg.form = {}; await ld(); ElMessage.success('OK') }
async function delFb(id) { await feedbackApi.remove(id); await ld() }

const loading = ref(false)
async function ld() {
  loading.value = true
  try { customers.value = (await customerApi.list()).data.data } catch {}
  try { contacts.value = (await contactApi.list()).data.data } catch {}
  try { opportunities.value = (await opportunityApi.list()).data.data } catch {}
  try { leads.value = (await leadApi.list()).data.data } catch {}
  try { campaigns.value = (await campaignApi.list()).data.data } catch {}
  try { quotations.value = (await quotationApi.list()).data.data } catch {}
  try { contracts.value = (await contractApi.list()).data.data } catch {}
  try { tickets.value = (await ticketApi.list()).data.data } catch {}
  try { feedbacks.value = (await feedbackApi.list()).data.data } catch {}
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
.tb { margin-bottom: 12px; }
</style>
