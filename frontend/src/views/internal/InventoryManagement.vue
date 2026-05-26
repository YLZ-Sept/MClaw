<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">进销存管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="purchase">采购入库</el-menu-item>
        <el-menu-item index="sales">销售出库</el-menu-item>
        <el-menu-item index="ledger">库存台账</el-menu-item>
        <el-menu-item index="returns">退换货管理</el-menu-item>
        <el-menu-item index="alerts">库存预警</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 采购入库 -->
        <div v-if="tab==='purchase'">
          <div class="tb"><el-input v-model="poKeyword" placeholder="搜索供应商/品牌/名称/型号/序列号" style="width:260px" clearable @input="ldPurchase"/><el-button type="primary" style="margin-left:12px" @click="openPoDlg()">新增采购入库</el-button><el-button @click="handleImport('purchase_orders')">导入 Excel</el-button></div>
          <el-table v-loading="loading" :data="purchaseOrders" stripe border row-key="id" max-height="calc(100vh - 280px)">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="supplier" label="供应商" width="120"/>
            <el-table-column prop="brand" label="品牌" width="100"/>
            <el-table-column prop="category" label="品类" width="80"/>
            <el-table-column prop="name" label="名称" min-width="120"/>
            <el-table-column prop="model" label="型号" width="100"/>
            <el-table-column prop="quantity" label="数量" width="70"/>
            <el-table-column prop="unit" label="单位" width="60"/>
            <el-table-column prop="serial_number" label="序列号" width="120"/>
            <el-table-column prop="unit_price" label="单价" width="80"/>
            <el-table-column prop="total_price" label="总价" width="90"/>
            <el-table-column prop="stock_date" label="入库日期" width="110"/>
            <el-table-column prop="status" label="状态" width="80"><template #default="{row}"><el-tag :type="row.status==='confirmed'?'success':row.status==='draft'?'info':'warning'" size="small">{{ row.status==='draft'?'草稿':row.status==='confirmed'?'已确认':'已取消' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="160" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openPoDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delPo(row.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
        <!-- 销售出库 -->
        <div v-else-if="tab==='sales'">
          <div class="tb"><el-input v-model="soKeyword" placeholder="搜索客户/经销商/产品/型号/序列号" style="width:260px" clearable @input="ldSales"/><el-button type="primary" style="margin-left:12px" @click="openSoDlg()">新增销售出库</el-button><el-button @click="handleImport('sales_orders')">导入 Excel</el-button></div>
          <el-table v-loading="loading" :data="salesOrders" stripe border row-key="id" max-height="calc(100vh - 280px)">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="customer_name" label="客户" width="100"/>
            <el-table-column prop="distributor" label="经销商" width="120"/>
            <el-table-column prop="product_name" label="产品名称" min-width="120"/>
            <el-table-column prop="model" label="型号" width="100"/>
            <el-table-column prop="quantity" label="数量" width="70"/>
            <el-table-column prop="unit" label="单位" width="60"/>
            <el-table-column prop="serial_number" label="序列号" width="120"/>
            <el-table-column prop="out_date" label="出库日期" width="110"/>
            <el-table-column prop="unit_price" label="单价" width="80"/>
            <el-table-column prop="total_price" label="总价" width="90"/>
            <el-table-column prop="remark" label="备注" width="100"/>
            <el-table-column prop="status" label="状态" width="80"><template #default="{row}"><el-tag :type="row.status==='confirmed'?'success':row.status==='draft'?'info':'warning'" size="small">{{ row.status==='draft'?'草稿':row.status==='confirmed'?'已确认':'已取消' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="160" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openSoDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delSo(row.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
        <!-- 库存台账 -->
        <div v-else-if="tab==='ledger'">
          <div class="tb"><el-input v-model="alKeyword" placeholder="搜索厂商/品类/产品/型号" style="width:260px" clearable @input="ldLedger"/><el-button type="primary" style="margin-left:12px" @click="openAlDlg()">登记台账</el-button><el-button @click="handleImport('asset_ledger')">导入 Excel</el-button></div>
          <el-table v-loading="loading" :data="assetList" stripe border row-key="id" max-height="calc(100vh - 280px)">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="manufacturer" label="厂商" width="100"/>
            <el-table-column prop="category" label="品类" width="80"/>
            <el-table-column prop="product_name" label="产品名称" min-width="130"/>
            <el-table-column prop="model" label="型号" width="100"/>
            <el-table-column prop="unit" label="单位" width="60"/>
            <el-table-column prop="in_quantity" label="入库数量" width="80"/>
            <el-table-column prop="out_quantity" label="出库数量" width="80"/>
            <el-table-column prop="balance" label="库存余量" width="80"><template #default="{row}"><span :style="{color:row.balance<10?'#ef4444':row.balance<50?'#f59e0b':'#10b981',fontWeight:'600'}">{{ row.balance }}</span></template></el-table-column>
            <el-table-column prop="unit_price" label="单价" width="80"/>
            <el-table-column prop="order_total" label="订单总价" width="90"/>
            <el-table-column prop="inventory_value" label="库存价值" width="90"/>
            <el-table-column prop="stock_date" label="入库日期" width="110"/>
            <el-table-column label="操作" width="160" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openAlDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delAl(row.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
        <!-- 退换货管理 -->
        <div v-else-if="tab==='returns'">
          <div class="tb"><el-button type="primary" @click="openRtDlg()">新增退换货</el-button><el-button @click="handleImport('returns')">导入 Excel</el-button></div>
          <el-table v-loading="loading" :data="returns" stripe border row-key="id" max-height="calc(100vh - 280px)">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="order_type" label="单据类型" width="80"><template #default="{row}">{{ row.order_type==='purchase'?'采购':row.order_type==='sales'?'销售':'销售' }}</template></el-table-column>
            <el-table-column prop="order_id" label="关联单号" width="140"/>
            <el-table-column prop="product_name" label="产品名称" min-width="120"/>
            <el-table-column prop="model" label="型号" width="100"/>
            <el-table-column prop="quantity" label="数量" width="70"/>
            <el-table-column prop="reason" label="原因" min-width="140"/>
            <el-table-column prop="type" label="类型" width="80"><template #default="{row}"><el-tag :type="row.type==='exchange'?'warning':row.type==='return'?'danger':'info'" size="small">{{ row.type==='return'?'退货':row.type==='exchange'?'换货':'其他' }}</el-tag></template></el-table-column>
            <el-table-column prop="exchange_product" label="换货产品" width="120"/>
            <el-table-column prop="status" label="状态" width="80"><template #default="{row}"><el-tag :type="row.status==='approved'?'success':row.status==='approved'?'success':row.status==='rejected'?'danger':'warning'" size="small">{{ row.status==='pending'?'待处理':row.status==='approved'?'已通过':row.status==='rejected'?'已驳回':'处理中' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="200" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openRtDlg(row)">编辑</el-button><el-button size="small" type="success" link v-if="row.status==='pending'" @click="updateRtStatus(row.id,'approved')">通过</el-button><el-button size="small" type="warning" link v-if="row.status==='pending'" @click="updateRtStatus(row.id,'rejected')">驳回</el-button><el-button size="small" type="danger" link @click="delRt(row.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
        <!-- 库存预警 -->
        <div v-else-if="tab==='alerts'">
          <div class="tb"><span style="color:#b8aad0;font-size:13px">库存余量低于安全阈值的产品</span></div>
          <el-table v-loading="loading" :data="alertList" stripe border row-key="id" max-height="calc(100vh - 280px)">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="product_name" label="产品名称" min-width="130"/>
            <el-table-column prop="model" label="型号" width="100"/>
            <el-table-column prop="manufacturer" label="厂商" width="100"/>
            <el-table-column prop="category" label="品类" width="80"/>
            <el-table-column prop="balance" label="当前库存" width="90"><template #default="{row}"><span style="color:#ef4444;font-weight:600">{{ row.balance }}</span></template></el-table-column>
            <el-table-column prop="unit" label="单位" width="60"/>
            <el-table-column prop="unit_price" label="单价" width="80"/>
            <el-table-column prop="inventory_value" label="库存价值" width="90"/>
            <el-table-column prop="stock_date" label="最近入库" width="110"/>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 采购入库对话框 -->
    <el-dialog v-model="poDlg.visible" :title="poDlg.ed?'编辑采购入库':'新增采购入库'" width="620px" @closed="poDlg.form={}">
      <el-form :model="poDlg.form" label-width="80px" inline>
        <el-form-item label="供应商"><el-input v-model="poDlg.form.supplier" style="width:180px"/></el-form-item>
        <el-form-item label="品牌"><el-input v-model="poDlg.form.brand" style="width:180px"/></el-form-item>
        <el-form-item label="品类"><el-input v-model="poDlg.form.category" style="width:180px"/></el-form-item>
        <el-form-item label="名称" required><el-input v-model="poDlg.form.name" style="width:180px"/></el-form-item>
        <el-form-item label="型号"><el-input v-model="poDlg.form.model" style="width:180px"/></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="poDlg.form.quantity" :min="1" style="width:180px"/></el-form-item>
        <el-form-item label="单位"><el-input v-model="poDlg.form.unit" placeholder="套" style="width:180px"/></el-form-item>
        <el-form-item label="序列号"><el-input v-model="poDlg.form.serial_number" style="width:180px"/></el-form-item>
        <el-form-item label="单价"><el-input-number v-model="poDlg.form.unit_price" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="总价"><el-input-number v-model="poDlg.form.total_price" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="入库日期"><el-date-picker v-model="poDlg.form.stock_date" type="date" value-format="YYYY-MM-DD" style="width:180px"/></el-form-item>
        <el-form-item label="状态"><el-select v-model="poDlg.form.status" style="width:180px"><el-option label="草稿" value="draft"/><el-option label="已确认" value="confirmed"/><el-option label="已取消" value="cancelled"/></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="poDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePo">保存</el-button></template>
    </el-dialog>

    <!-- 销售出库对话框 -->
    <el-dialog v-model="soDlg.visible" :title="soDlg.ed?'编辑销售出库':'新增销售出库'" width="620px" @closed="soDlg.form={}">
      <el-form :model="soDlg.form" label-width="80px" inline>
        <el-form-item label="客户"><el-input v-model="soDlg.form.customer_name" style="width:180px"/></el-form-item>
        <el-form-item label="经销商"><el-input v-model="soDlg.form.distributor" style="width:180px"/></el-form-item>
        <el-form-item label="产品名称" required><el-input v-model="soDlg.form.product_name" style="width:180px"/></el-form-item>
        <el-form-item label="型号"><el-input v-model="soDlg.form.model" style="width:180px"/></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="soDlg.form.quantity" :min="1" style="width:180px"/></el-form-item>
        <el-form-item label="单位"><el-input v-model="soDlg.form.unit" placeholder="套" style="width:180px"/></el-form-item>
        <el-form-item label="序列号"><el-input v-model="soDlg.form.serial_number" style="width:180px"/></el-form-item>
        <el-form-item label="出库日期"><el-date-picker v-model="soDlg.form.out_date" type="date" value-format="YYYY-MM-DD" style="width:180px"/></el-form-item>
        <el-form-item label="单价"><el-input-number v-model="soDlg.form.unit_price" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="总价"><el-input-number v-model="soDlg.form.total_price" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="备注"><el-input v-model="soDlg.form.remark" style="width:180px"/></el-form-item>
        <el-form-item label="状态"><el-select v-model="soDlg.form.status" style="width:180px"><el-option label="草稿" value="draft"/><el-option label="已确认" value="confirmed"/><el-option label="已取消" value="cancelled"/></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="soDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveSo">保存</el-button></template>
    </el-dialog>

    <!-- 库存台账对话框 -->
    <el-dialog v-model="alDlg.visible" :title="alDlg.ed?'编辑库存台账':'登记台账'" width="620px" @closed="alDlg.form={}">
      <el-form :model="alDlg.form" label-width="80px" inline>
        <el-form-item label="厂商"><el-input v-model="alDlg.form.manufacturer" style="width:180px"/></el-form-item>
        <el-form-item label="品类"><el-input v-model="alDlg.form.category" style="width:180px"/></el-form-item>
        <el-form-item label="产品名称" required><el-input v-model="alDlg.form.product_name" style="width:180px"/></el-form-item>
        <el-form-item label="型号"><el-input v-model="alDlg.form.model" style="width:180px"/></el-form-item>
        <el-form-item label="单位"><el-input v-model="alDlg.form.unit" placeholder="套" style="width:180px"/></el-form-item>
        <el-form-item label="入库数量"><el-input-number v-model="alDlg.form.in_quantity" :min="0" style="width:180px"/></el-form-item>
        <el-form-item label="出库数量"><el-input-number v-model="alDlg.form.out_quantity" :min="0" style="width:180px"/></el-form-item>
        <el-form-item label="库存余量"><el-input-number v-model="alDlg.form.balance" :min="0" style="width:180px"/></el-form-item>
        <el-form-item label="单价"><el-input-number v-model="alDlg.form.unit_price" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="订单总价"><el-input-number v-model="alDlg.form.order_total" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="库存价值"><el-input-number v-model="alDlg.form.inventory_value" :min="0" :precision="2" style="width:180px"/></el-form-item>
        <el-form-item label="入库日期"><el-date-picker v-model="alDlg.form.stock_date" type="date" value-format="YYYY-MM-DD" style="width:180px"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="alDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAl">保存</el-button></template>
    </el-dialog>

    <!-- 退换货对话框 -->
    <el-dialog v-model="rtDlg.visible" :title="rtDlg.ed?'编辑退换货':'新增退换货'" width="560px" @closed="rtDlg.form={}">
      <el-form :model="rtDlg.form" label-width="80px" inline>
        <el-form-item label="单据类型"><el-select v-model="rtDlg.form.order_type" style="width:180px"><el-option label="销售" value="sales"/><el-option label="采购" value="purchase"/></el-select></el-form-item>
        <el-form-item label="关联单号"><el-input v-model="rtDlg.form.order_id" style="width:180px"/></el-form-item>
        <el-form-item label="产品名称" required><el-input v-model="rtDlg.form.product_name" style="width:180px"/></el-form-item>
        <el-form-item label="型号"><el-input v-model="rtDlg.form.model" style="width:180px"/></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="rtDlg.form.quantity" :min="1" style="width:180px"/></el-form-item>
        <el-form-item label="原因"><el-input v-model="rtDlg.form.reason" type="textarea" :rows="2" style="width:180px"/></el-form-item>
        <el-form-item label="类型"><el-select v-model="rtDlg.form.type" style="width:180px"><el-option label="退货" value="return"/><el-option label="换货" value="exchange"/><el-option label="其他" value="other"/></el-select></el-form-item>
        <el-form-item label="换货产品" v-if="rtDlg.form.type==='exchange'"><el-input v-model="rtDlg.form.exchange_product" style="width:180px"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="rtDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveRt">保存</el-button></template>
    </el-dialog>

    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone"/>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { purchaseOrderApi, salesOrderApi, assetLedgerApi, returnApi } from '../../api/inventory'
import ImportDialog from '../../components/ImportDialog.vue'

const router = useRouter()
const tab = ref('purchase')
const loading = ref(false)
const saving = ref(false)

const purchaseOrders = ref([])
const salesOrders = ref([])
const assetList = ref([])
const returns = ref([])

const poKeyword = ref('')
const soKeyword = ref('')
const alKeyword = ref('')

const importVisible = ref(false)
const importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function onImportDone() { ld() }

const kpis = computed(() => {
  const lowStock = assetList.value.filter(a => a.balance < 10).length
  return [
    { val: purchaseOrders.value.length, label: '采购入库' },
    { val: salesOrders.value.length, label: '销售出库' },
    { val: assetList.value.length, label: '台账记录' },
    { val: lowStock, label: '低库存预警' }
  ]
})

const alertList = computed(() => assetList.value.filter(a => a.balance < 10))

// 采购入库
const poDlg = reactive({ visible: false, ed: false, form: {} })
function openPoDlg(r) { poDlg.ed = !!r; poDlg.form = r ? { ...r } : { quantity: 1, unit: '套', status: 'draft' }; poDlg.visible = true }
async function savePo() { saving.value = true; const f = poDlg.form; if (poDlg.ed) { await purchaseOrderApi.update(f.id, f) } else { await purchaseOrderApi.create(f) }; poDlg.visible = false; await ldPurchase(); saving.value = false; ElMessage.success('OK') }
async function delPo(id) { await ElMessageBox.confirm('确认删除?', '提示', { type: 'warning' }); await purchaseOrderApi.remove(id); await ldPurchase(); ElMessage.success('已删除') }

// 销售出库
const soDlg = reactive({ visible: false, ed: false, form: {} })
function openSoDlg(r) { soDlg.ed = !!r; soDlg.form = r ? { ...r } : { quantity: 1, unit: '套', status: 'draft' }; soDlg.visible = true }
async function saveSo() { saving.value = true; const f = soDlg.form; if (soDlg.ed) { await salesOrderApi.update(f.id, f) } else { await salesOrderApi.create(f) }; soDlg.visible = false; await ldSales(); saving.value = false; ElMessage.success('OK') }
async function delSo(id) { await ElMessageBox.confirm('确认删除?', '提示', { type: 'warning' }); await salesOrderApi.remove(id); await ldSales(); ElMessage.success('已删除') }

// 库存台账
const alDlg = reactive({ visible: false, ed: false, form: {} })
function openAlDlg(r) { alDlg.ed = !!r; alDlg.form = r ? { ...r } : { unit: '套', in_quantity: 0, out_quantity: 0, balance: 0, unit_price: 0, order_total: 0, inventory_value: 0 }; alDlg.visible = true }
async function saveAl() { saving.value = true; const f = alDlg.form; if (alDlg.ed) { await assetLedgerApi.update(f.id, f) } else { await assetLedgerApi.create(f) }; alDlg.visible = false; await ldLedger(); saving.value = false; ElMessage.success('OK') }
async function delAl(id) { await ElMessageBox.confirm('确认删除?', '提示', { type: 'warning' }); await assetLedgerApi.remove(id); await ldLedger(); ElMessage.success('已删除') }

// 退换货
const rtDlg = reactive({ visible: false, ed: false, form: {} })
function openRtDlg(r) { rtDlg.ed = !!r; rtDlg.form = r ? { ...r } : { order_type: 'sales', quantity: 1, type: 'return' }; rtDlg.visible = true }
async function saveRt() { saving.value = true; const f = rtDlg.form; if (rtDlg.ed) { await returnApi.update(f.id, f) } else { await returnApi.create(f) }; rtDlg.visible = false; await ldReturns(); saving.value = false; ElMessage.success('OK') }
async function delRt(id) { await ElMessageBox.confirm('确认删除?', '提示', { type: 'warning' }); await returnApi.remove(id); await ldReturns(); ElMessage.success('已删除') }
async function updateRtStatus(id, status) { await returnApi.update(id, { status }); await ldReturns(); ElMessage.success(status === 'approved' ? '已通过' : '已驳回') }

async function ldPurchase() {
  try { const r = await purchaseOrderApi.list(poKeyword.value); purchaseOrders.value = r.data.data } catch {}
}
async function ldSales() {
  try { const r = await salesOrderApi.list(soKeyword.value); salesOrders.value = r.data.data } catch {}
}
async function ldLedger() {
  try { const r = await assetLedgerApi.list(alKeyword.value); assetList.value = r.data.data } catch {}
}
async function ldReturns() {
  try { const r = await returnApi.list(); returns.value = r.data.data } catch {}
}

async function ld() {
  loading.value = true
  await Promise.all([ldPurchase(), ldSales(), ldLedger(), ldReturns()])
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
.side-tabs { width: 140px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; }
</style>
