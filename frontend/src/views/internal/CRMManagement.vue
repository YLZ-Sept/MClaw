<template>
  <div class="page-container">
    <div class="page-title">客户关系管理</div>
    <el-tabs v-model="tab" type="border-card">

      <!-- ========== 客户管理 ========== -->
      <el-tab-pane label="客户管理" name="customers">
        <div class="tb"><el-button type="primary" @click="openCusDlg()">新增客户</el-button></div>
        <el-table :data="customers" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column prop="company" label="公司" min-width="150" />
          <el-table-column prop="source" label="来源" width="80" />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{row}">
              <el-button size="small" type="primary" link @click="openCusDlg(row)">编辑</el-button>
              <el-button size="small" type="primary" link @click="showContactDlg(row)">联系人</el-button>
              <el-button size="small" type="primary" link @click="showFollowDlg(row)">跟进</el-button>
              <el-button size="small" type="danger" link @click="delCus(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="cusDlg.visible" :title="cusDlg.isEdit?'编辑客户':'新增客户'" width="500px">
          <el-form :model="cusDlg.form" label-width="80px">
            <el-form-item label="姓名"><el-input v-model="cusDlg.form.name" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="cusDlg.form.phone" /></el-form-item>
            <el-form-item label="公司"><el-input v-model="cusDlg.form.company" /></el-form-item>
            <el-form-item label="来源"><el-input v-model="cusDlg.form.source" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="cusDlg.form.remark" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="cusDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveCus">保存</el-button>
          </template>
        </el-dialog>
        <el-dialog v-model="contactDlg.visible" title="联系人" width="600px">
          <el-table :data="contactDlg.list" stripe border>
            <el-table-column prop="name" label="姓名" width="100" />
            <el-table-column prop="phone" label="电话" width="130" />
            <el-table-column prop="position" label="职位" width="120" />
          </el-table>
          <div style="margin-top:12px;display:flex;gap:8px">
            <el-input v-model="contactDlg.newName" placeholder="姓名" style="width:120px" />
            <el-input v-model="contactDlg.newPhone" placeholder="电话" style="width:140px" />
            <el-button type="primary" @click="addContact">添加</el-button>
          </div>
        </el-dialog>
        <el-dialog v-model="followDlg.visible" title="跟进记录" width="600px">
          <el-timeline>
            <el-timeline-item v-for="f in followDlg.list" :key="f.id" :timestamp="f.created_at">
              {{ f.content }}
            </el-timeline-item>
          </el-timeline>
          <el-input v-model="followDlg.newContent" placeholder="添加跟进" style="margin-top:12px" />
          <el-button type="primary" size="small" style="margin-top:8px" @click="addFollow">添加</el-button>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 联系人 ========== -->
      <el-tab-pane label="联系人" name="contacts">
        <div class="tb"><el-button type="primary" @click="contactAllDlg.visible=true">新增联系人</el-button></div>
        <el-table :data="contacts" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="position" label="职位" width="120" />
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column prop="email" label="邮箱" min-width="160" />
          <el-table-column label="操作" width="120">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delContact(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="contactAllDlg.visible" title="新增联系人" width="500px">
          <el-form :model="contactAllDlg.form" label-width="80px">
            <el-form-item label="姓名"><el-input v-model="contactAllDlg.form.name" /></el-form-item>
            <el-form-item label="职位"><el-input v-model="contactAllDlg.form.position" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="contactAllDlg.form.phone" /></el-form-item>
            <el-form-item label="邮箱"><el-input v-model="contactAllDlg.form.email" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="contactAllDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveContactAll">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 线索管理 ========== -->
      <el-tab-pane label="线索管理" name="leads">
        <div class="tb"><el-button type="primary" @click="leadDlg.visible=true">新增线索</el-button></div>
        <el-table :data="leads" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="company" label="公司" width="140" />
          <el-table-column prop="source" label="来源" width="80" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{row}"><el-tag size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delLead(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="leadDlg.visible" title="新增线索" width="500px">
          <el-form :model="leadDlg.form" label-width="80px">
            <el-form-item label="姓名"><el-input v-model="leadDlg.form.name" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="leadDlg.form.phone" /></el-form-item>
            <el-form-item label="公司"><el-input v-model="leadDlg.form.company" /></el-form-item>
            <el-form-item label="来源"><el-input v-model="leadDlg.form.source" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="leadDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveLead">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 营销活动 ========== -->
      <el-tab-pane label="营销活动" name="campaigns">
        <div class="tb"><el-button type="primary" @click="campDlg.visible=true">新增活动</el-button></div>
        <el-table :data="campaigns" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="活动名" width="140" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="budget" label="预算" width="100" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delCamp(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="campDlg.visible" title="新增活动" width="500px">
          <el-form :model="campDlg.form" label-width="80px">
            <el-form-item label="活动名"><el-input v-model="campDlg.form.name" /></el-form-item>
            <el-form-item label="类型"><el-input v-model="campDlg.form.type" /></el-form-item>
            <el-form-item label="预算"><el-input-number v-model="campDlg.form.budget" :min="0" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="campDlg.form.description" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="campDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveCamp">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 报价管理 ========== -->
      <el-tab-pane label="报价管理" name="quotations">
        <div class="tb"><el-button type="primary" @click="quoteDlg.visible=true">新增报价</el-button></div>
        <el-table :data="quotations" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="标题" width="140" />
          <el-table-column prop="customer_name" label="客户" width="120" />
          <el-table-column prop="total" label="金额" width="100" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delQuote(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="quoteDlg.visible" title="新增报价" width="500px">
          <el-form :model="quoteDlg.form" label-width="80px">
            <el-form-item label="标题"><el-input v-model="quoteDlg.form.title" /></el-form-item>
            <el-form-item label="金额"><el-input-number v-model="quoteDlg.form.total" :min="0" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="quoteDlg.form.remark" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="quoteDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveQuote">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 合同管理 ========== -->
      <el-tab-pane label="合同管理" name="contracts">
        <div class="tb"><el-button type="primary" @click="contractDlg.visible=true">新增合同</el-button></div>
        <el-table :data="contracts" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="标题" width="140" />
          <el-table-column prop="customer_name" label="客户" width="120" />
          <el-table-column prop="total" label="金额" width="100" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delContract(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="contractDlg.visible" title="新增合同" width="500px">
          <el-form :model="contractDlg.form" label-width="80px">
            <el-form-item label="标题"><el-input v-model="contractDlg.form.title" /></el-form-item>
            <el-form-item label="金额"><el-input-number v-model="contractDlg.form.total" :min="0" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="contractDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveContract">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 工单系统 ========== -->
      <el-tab-pane label="工单系统" name="tickets">
        <div class="tb"><el-button type="primary" @click="ticketDlg.visible=true">新建工单</el-button></div>
        <el-table :data="tickets" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="标题" min-width="160" />
          <el-table-column prop="customer_name" label="客户" width="120" />
          <el-table-column prop="priority" label="优先级" width="80" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delTicket(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="ticketDlg.visible" title="新建工单" width="500px">
          <el-form :model="ticketDlg.form" label-width="80px">
            <el-form-item label="标题"><el-input v-model="ticketDlg.form.title" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="ticketDlg.form.description" type="textarea" /></el-form-item>
            <el-form-item label="优先级">
              <el-select v-model="ticketDlg.form.priority">
                <el-option label="低" value="low" /><el-option label="中" value="medium" /><el-option label="高" value="high" /><el-option label="紧急" value="urgent" />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="ticketDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveTicket">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- ========== 客户反馈 ========== -->
      <el-tab-pane label="客户反馈" name="feedback">
        <div class="tb"><el-button type="primary" @click="fbDlg.visible=true">新增反馈</el-button></div>
        <el-table :data="feedbacks" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="customer_name" label="客户" width="120" />
          <el-table-column prop="rating" label="评分" width="60" />
          <el-table-column prop="category" label="类别" width="80" />
          <el-table-column prop="content" label="内容" min-width="200" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delFeedback(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="fbDlg.visible" title="新增反馈" width="500px">
          <el-form :model="fbDlg.form" label-width="80px">
            <el-form-item label="评分"><el-rate v-model="fbDlg.form.rating" /></el-form-item>
            <el-form-item label="类别"><el-input v-model="fbDlg.form.category" /></el-form-item>
            <el-form-item label="内容"><el-input v-model="fbDlg.form.content" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="fbDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveFeedback">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { customerApi, contactApi, leadApi, campaignApi, quotationApi, contractApi, ticketApi, feedbackApi } from '../../api/crm'

const tab = ref('customers')
const customers = ref([]), contacts = ref([]), leads = ref([]), campaigns = ref([])
const quotations = ref([]), contracts = ref([]), tickets = ref([]), feedbacks = ref([])

// 客户对话框
const cusDlg = reactive({ visible: false, isEdit: false, form: {} })
function openCusDlg(row) {
  cusDlg.isEdit = !!row
  cusDlg.form = row ? { ...row } : {}
  cusDlg.visible = true
}
async function saveCus() {
  const f = cusDlg.form
  cusDlg.isEdit ? await customerApi.update(f.id, f) : await customerApi.create(f)
  cusDlg.visible = false; await loadAll(); ElMessage.success('保存成功')
}
async function delCus(id) { await ElMessageBox.confirm('确认？'); await customerApi.remove(id); await loadAll() }

// 联系人弹窗 (从客户行打开)
const contactDlg = reactive({ visible: false, list: [], cid: '', newName: '', newPhone: '' })
async function showContactDlg(row) {
  contactDlg.cid = row.id
  const res = await customerApi.followUps(row.id)
  contactDlg.list = res.data.data
  contactDlg.visible = true
}
async function addContact() {
  if (!contactDlg.newName) return
  await contactApi.create({ customer_id: contactDlg.cid, name: contactDlg.newName, phone: contactDlg.newPhone })
  contactDlg.newName = ''; contactDlg.newPhone = ''
  ElMessage.success('已添加')
}

// 跟进弹窗
const followDlg = reactive({ visible: false, list: [], cid: '', newContent: '' })
async function showFollowDlg(row) {
  followDlg.cid = row.id
  const res = await customerApi.followUps(row.id)
  followDlg.list = res.data.data
  followDlg.visible = true
}
async function addFollow() {
  if (!followDlg.newContent) return
  await customerApi.addFollowUp(followDlg.cid, { content: followDlg.newContent })
  followDlg.newContent = ''
  const res = await customerApi.followUps(followDlg.cid)
  followDlg.list = res.data.data
  ElMessage.success('已添加')
}

// 联系人全量管理
const contactAllDlg = reactive({ visible: false, form: {} })
async function saveContactAll() {
  await contactApi.create(contactAllDlg.form)
  contactAllDlg.visible = false; contactAllDlg.form = {}; await loadAll(); ElMessage.success('保存成功')
}

// 线索
const leadDlg = reactive({ visible: false, form: {} })
async function saveLead() { await leadApi.create(leadDlg.form); leadDlg.visible = false; leadDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

// 活动
const campDlg = reactive({ visible: false, form: {} })
async function saveCamp() { await campaignApi.create(campDlg.form); campDlg.visible = false; campDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

// 报价
const quoteDlg = reactive({ visible: false, form: {} })
async function saveQuote() { await quotationApi.create(quoteDlg.form); quoteDlg.visible = false; quoteDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

// 合同
const contractDlg = reactive({ visible: false, form: {} })
async function saveContract() { await contractApi.create(contractDlg.form); contractDlg.visible = false; contractDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

// 工单
const ticketDlg = reactive({ visible: false, form: {} })
async function saveTicket() { await ticketApi.create(ticketDlg.form); ticketDlg.visible = false; ticketDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

// 反馈
const fbDlg = reactive({ visible: false, form: {} })
async function saveFeedback() { await feedbackApi.create(fbDlg.form); fbDlg.visible = false; fbDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }

async function loadAll() {
  customers.value = (await customerApi.list()).data.data
  contacts.value = (await contactApi.list()).data.data
  leads.value = (await leadApi.list()).data.data
  campaigns.value = (await campaignApi.list()).data.data
  quotations.value = (await quotationApi.list()).data.data
  contracts.value = (await contractApi.list()).data.data
  tickets.value = (await ticketApi.list()).data.data
  feedbacks.value = (await feedbackApi.list()).data.data
}
async function delContact(id) { await contactApi.remove(id); await loadAll() }
async function delLead(id) { await leadApi.remove(id); await loadAll() }
async function delCamp(id) { await campaignApi.remove(id); await loadAll() }
async function delQuote(id) { await quotationApi.remove(id); await loadAll() }
async function delContract(id) { await contractApi.remove(id); await loadAll() }
async function delTicket(id) { await ticketApi.remove(id); await loadAll() }
async function delFeedback(id) { await feedbackApi.remove(id); await loadAll() }

onMounted(loadAll)
</script>

<style scoped>
.tb { margin-bottom: 12px; }
.page-container { padding: 24px; background: #fff; height: 100%; overflow-y: auto; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; margin-bottom: 20px; }
</style>
