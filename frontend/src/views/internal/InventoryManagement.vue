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
        <el-menu-item index="products">产品管理</el-menu-item>
        <el-menu-item index="suppliers">供应商</el-menu-item>
        <el-menu-item index="purchase">采购订单</el-menu-item>
        <el-menu-item index="sales">销售订单</el-menu-item>
        <el-menu-item index="stock">出入库</el-menu-item>
        <el-menu-item index="assets">设备台账</el-menu-item>
        <el-menu-item index="warehouses">仓库管理</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 产品 -->
        <div v-if="tab==='products'">
          <div class="tb"><el-button type="primary" @click="openPdDlg()">新增产品</el-button></div>
          <el-table v-loading="loading" :data="products" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="产品名" width="140"/><el-table-column prop="sku" label="SKU" width="90"/><el-table-column prop="unit" label="单位" width="60"/><el-table-column prop="sale_price" label="售价" width="80"/><el-table-column prop="cost_price" label="成本" width="80"/><el-table-column prop="quantity" label="库存" width="60"/><el-table-column label="操作" width="140"><template #default="{r}"><el-button size="small" type="primary" link @click="openPdDlg(r)">编辑</el-button><el-button size="small" type="danger" link @click="delPd(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 供应商 -->
        <div v-else-if="tab==='suppliers'">
          <div class="tb"><el-button type="primary" @click="spDlg.visible=true">新增供应商</el-button></div>
          <el-table v-loading="loading" :data="suppliers" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="名称" width="140"/><el-table-column prop="contact_person" label="联系人" width="100"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delSp(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 采购 -->
        <div v-else-if="tab==='purchase'">
          <div class="tb"><el-button type="primary" @click="poDlg.visible=true">新增采购单</el-button></div>
          <el-table v-loading="loading" :data="purchaseOrders" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="supplier_name" label="供应商" width="120"/><el-table-column prop="total" label="总额" width="100"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delPo(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 销售 -->
        <div v-else-if="tab==='sales'">
          <div class="tb"><el-button type="primary" @click="soDlg.visible=true">新增销售单</el-button></div>
          <el-table v-loading="loading" :data="salesOrders" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="customer_name" label="客户" width="120"/><el-table-column prop="total" label="总额" width="100"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delSo(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 出入库 -->
        <div v-else-if="tab==='stock'">
          <div class="tb"><el-button type="primary" @click="siDlg.visible=true">入库</el-button><el-button @click="soOutDlg.visible=true" style="margin-left:8px">出库</el-button></div>
          <el-table v-loading="loading" :data="stockList" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="产品" width="140"/><el-table-column prop="warehouse_name" label="仓库" width="100"/><el-table-column prop="quantity" label="数量" width="70"/><el-table-column prop="sku" label="SKU" width="90"/></el-table>
        </div>
        <!-- 设备台账 -->
        <div v-else-if="tab==='assets'">
          <div class="tb"><el-button type="primary" @click="alDlg.visible=true">登记设备</el-button></div>
          <el-table v-loading="loading" :data="assetList" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="product_name" label="产品名称" width="140"/><el-table-column prop="serial_no" label="序列号" width="120"/><el-table-column prop="deploy_date" label="部署日期" width="110"/><el-table-column prop="warranty_expire" label="维保到期" width="110"/><el-table-column prop="license_expire" label="许可到期" width="110"/><el-table-column prop="status" label="状态" width="80"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delAl(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 仓库 -->
        <div v-else-if="tab==='warehouses'">
          <div class="tb"><el-button type="primary" @click="whDlg.visible=true">新增仓库</el-button></div>
          <el-table v-loading="loading" :data="warehouses" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="仓库名" width="140"/><el-table-column prop="manager" label="负责人" width="100"/><el-table-column label="操作" width="100"><template #default="{r}"><el-button size="small" type="danger" link @click="delWh(r.id)">删除</el-button></template></el-table-column></el-table>
        </div>
      </div>
    </div>
    <!-- Dialogs -->
    <el-dialog v-model="pdDlg.visible" :title="pdDlg.ed?'编辑产品':'新增产品'" width="500px"><el-form :model="pdDlg.form" label-width="80px"><el-form-item label="产品名"><el-input v-model="pdDlg.form.name"/></el-form-item><el-form-item label="SKU"><el-input v-model="pdDlg.form.sku"/></el-form-item><el-form-item label="单位"><el-input v-model="pdDlg.form.unit"/></el-form-item><el-form-item label="售价"><el-input-number v-model="pdDlg.form.sale_price" :min="0"/></el-form-item><el-form-item label="成本"><el-input-number v-model="pdDlg.form.cost_price" :min="0"/></el-form-item></el-form><template #footer><el-button @click="pdDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePd">保存</el-button></template></el-dialog>
    <el-dialog v-model="siDlg.visible" title="入库" width="400px"><el-form :model="siDlg.form" label-width="60px"><el-form-item label="产品"><el-select v-model="siDlg.form.product_id" style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select></el-form-item><el-form-item label="数量"><el-input-number v-model="siDlg.form.quantity" :min="1"/></el-form-item><el-form-item label="备注"><el-input v-model="siDlg.form.remark"/></el-form-item></el-form><template #footer><el-button @click="siDlg.visible=false">取消</el-button><el-button type="primary" @click="doSi">确认入库</el-button></template></el-dialog>
    <el-dialog v-model="soOutDlg.visible" title="出库" width="400px"><el-form :model="soOutDlg.form" label-width="60px"><el-form-item label="产品"><el-select v-model="soOutDlg.form.product_id" style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select></el-form-item><el-form-item label="数量"><el-input-number v-model="soOutDlg.form.quantity" :min="1"/></el-form-item><el-form-item label="备注"><el-input v-model="soOutDlg.form.remark"/></el-form-item></el-form><template #footer><el-button @click="soOutDlg.visible=false">取消</el-button><el-button type="primary" @click="doSo">确认出库</el-button></template></el-dialog>
    <el-dialog v-model="spDlg.visible" title="新增供应商" width="500px"><el-form :model="spDlg.form" label-width="80px"><el-form-item label="名称"><el-input v-model="spDlg.form.name"/></el-form-item><el-form-item label="联系人"><el-input v-model="spDlg.form.contact_person"/></el-form-item><el-form-item label="电话"><el-input v-model="spDlg.form.phone"/></el-form-item></el-form><template #footer><el-button @click="spDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveSp">保存</el-button></template></el-dialog>
    <el-dialog v-model="poDlg.visible" title="新增采购单" width="500px"><el-form :model="poDlg.form" label-width="80px"><el-form-item label="供应商"><el-select v-model="poDlg.form.supplier_id" style="width:100%"><el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id"/></el-select></el-form-item><el-form-item label="总额"><el-input-number v-model="poDlg.form.total" :min="0"/></el-form-item></el-form><template #footer><el-button @click="poDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePo">保存</el-button></template></el-dialog>
    <el-dialog v-model="soDlg.visible" title="新增销售单" width="500px"><el-form :model="soDlg.form" label-width="80px"><el-form-item label="总额"><el-input-number v-model="soDlg.form.total" :min="0"/></el-form-item></el-form><template #footer><el-button @click="soDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveSales">保存</el-button></template></el-dialog>
    <el-dialog v-model="alDlg.visible" title="登记设备" width="500px"><el-form :model="alDlg.form" label-width="80px"><el-form-item label="产品名称"><el-input v-model="alDlg.form.product_name"/></el-form-item><el-form-item label="序列号"><el-input v-model="alDlg.form.serial_no"/></el-form-item><el-form-item label="部署日期"><el-date-picker v-model="alDlg.form.deploy_date" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item><el-form-item label="维保到期"><el-date-picker v-model="alDlg.form.warranty_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item><el-form-item label="许可到期"><el-date-picker v-model="alDlg.form.license_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-form><template #footer><el-button @click="alDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAl">保存</el-button></template></el-dialog>
    <el-dialog v-model="whDlg.visible" title="新增仓库" width="500px"><el-form :model="whDlg.form" label-width="80px"><el-form-item label="仓库名"><el-input v-model="whDlg.form.name"/></el-form-item><el-form-item label="负责人"><el-input v-model="whDlg.form.manager"/></el-form-item></el-form><template #footer><el-button @click="whDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveWh">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { productApi, supplierApi, purchaseOrderApi, salesOrderApi, warehouseApi, assetLedgerApi } from '../../api/inventory'
const router = useRouter()

const tab = ref('products')
const products = ref([]), suppliers = ref([]), purchaseOrders = ref([]), salesOrders = ref([]), warehouses = ref([]), assetList = ref([]), stockList = ref([])

const kpis = computed(() => {
  const lowStock = stockList.value.filter(i => i.quantity < 10).length
  const expired = assetList.value.filter(a => a.warranty_expire && a.warranty_expire < new Date().toISOString().slice(0,10)).length
  return [
    { val: products.value.length, label: '产品数' },
    { val: lowStock, label: '低库存预警' },
    { val: purchaseOrders.value.length, label: '采购单' },
    { val: expired, label: '维保到期' }
  ]
})

const pdDlg = reactive({ visible: false, ed: false, form: {} })
const siDlg = reactive({ visible: false, form: { product_id: '', quantity: 1, remark: '' } })
const soOutDlg = reactive({ visible: false, form: { product_id: '', quantity: 1, remark: '' } })
const spDlg = reactive({ visible: false, form: {} })
const poDlg = reactive({ visible: false, form: {} })
const soDlg = reactive({ visible: false, form: {} })
const whDlg = reactive({ visible: false, form: {} })
const alDlg = reactive({ visible: false, form: {} })

function openPdDlg(r) { pdDlg.ed = !!r; pdDlg.form = r ? { ...r } : {}; pdDlg.visible = true }
const saving = ref(false)
async function savePd() { saving.value = true; const f = pdDlg.form; pdDlg.ed ? await productApi.update(f.id, f) : await productApi.create(f); pdDlg.visible = false; await ld(); saving.value = false; ElMessage.success('OK') }
async function delPd(id) { await ElMessageBox.confirm('确认?'); await productApi.remove(id); await ld() }
async function doSi() { saving.value = true; await productApi.stockIn(siDlg.form); siDlg.visible = false; siDlg.form = { product_id: '', quantity: 1, remark: '' }; await ld(); saving.value = false; ElMessage.success('入库成功') }
async function doSo() { saving.value = true; try { await productApi.stockOut(soOutDlg.form); soOutDlg.visible = false; soOutDlg.form = { product_id: '', quantity: 1, remark: '' }; await ld(); ElMessage.success('出库成功') } catch (e) { ElMessage.error(e.response?.data?.message || '失败') } saving.value = false }
async function saveSp() { saving.value = true; await supplierApi.create(spDlg.form); spDlg.visible = false; spDlg.form = {}; await ld(); saving.value = false; ElMessage.success('OK') }
async function delSp(id) { await supplierApi.remove(id); await ld() }
async function savePo() { saving.value = true; await purchaseOrderApi.create(poDlg.form); poDlg.visible = false; poDlg.form = {}; await ld(); saving.value = false; ElMessage.success('OK') }
async function delPo(id) { await purchaseOrderApi.remove(id); await ld() }
async function saveSales() { saving.value = true; await salesOrderApi.create(soDlg.form); soDlg.visible = false; soDlg.form = {}; await ld(); saving.value = false; ElMessage.success('OK') }
async function delSo(id) { await salesOrderApi.remove(id); await ld() }
async function saveWh() { saving.value = true; await warehouseApi.create(whDlg.form); whDlg.visible = false; whDlg.form = {}; await ld(); saving.value = false; ElMessage.success('OK') }
async function delWh(id) { await warehouseApi.remove(id); await ld() }
async function saveAl() { saving.value = true; await assetLedgerApi.create(alDlg.form); alDlg.visible = false; alDlg.form = {}; await ld(); saving.value = false; ElMessage.success('OK') }
async function delAl(id) { await assetLedgerApi.remove(id); await ld() }

const loading = ref(false)
async function ld() {
  loading.value = true
  try { products.value = (await productApi.list()).data.data } catch {}
  try { suppliers.value = (await supplierApi.list()).data.data } catch {}
  try { purchaseOrders.value = (await purchaseOrderApi.list()).data.data } catch {}
  try { salesOrders.value = (await salesOrderApi.list()).data.data } catch {}
  try { warehouses.value = (await warehouseApi.list()).data.data } catch {}
  try { assetList.value = (await assetLedgerApi.list()).data.data } catch {}
  try { stockList.value = (await productApi.stockQuery()).data.data } catch {}
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
.tb { margin-bottom: 12px; }
</style>
