<template>
  <div class="page-container">
    <div class="page-title">进销存管理</div>
    <el-tabs v-model="tab" type="border-card">
      <el-tab-pane label="产品管理" name="products">
        <div class="tb">
          <el-button type="primary" @click="openProductDlg()">新增产品</el-button>
          <el-button @click="stockInDlg.visible=true">入库</el-button>
          <el-button @click="stockOutDlg.visible=true">出库</el-button>
        </div>
        <el-table :data="products" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="产品名" width="140" />
          <el-table-column prop="sku" label="SKU" width="90" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column prop="sale_price" label="售价" width="80" />
          <el-table-column prop="cost_price" label="成本" width="80" />
          <el-table-column prop="quantity" label="库存" width="60" />
          <el-table-column label="操作" width="160">
            <template #default="{row}">
              <el-button size="small" type="primary" link @click="openProductDlg(row)">编辑</el-button>
              <el-button size="small" type="primary" link @click="stockInDlg.form.product_id=row.id;stockInDlg.visible=true">入库</el-button>
              <el-button size="small" type="primary" link @click="stockOutDlg.form.product_id=row.id;stockOutDlg.visible=true">出库</el-button>
              <el-button size="small" type="danger" link @click="delProduct(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="productDlg.visible" :title="productDlg.isEdit?'编辑产品':'新增产品'" width="500px">
          <el-form :model="productDlg.form" label-width="80px">
            <el-form-item label="产品名"><el-input v-model="productDlg.form.name" /></el-form-item>
            <el-form-item label="SKU"><el-input v-model="productDlg.form.sku" /></el-form-item>
            <el-form-item label="单位"><el-input v-model="productDlg.form.unit" /></el-form-item>
            <el-form-item label="售价"><el-input-number v-model="productDlg.form.sale_price" :min="0" /></el-form-item>
            <el-form-item label="成本"><el-input-number v-model="productDlg.form.cost_price" :min="0" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="productDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveProduct">保存</el-button>
          </template>
        </el-dialog>
        <el-dialog v-model="stockInDlg.visible" title="入库" width="400px">
          <el-form :model="stockInDlg.form" label-width="60px">
            <el-form-item label="产品"><el-select v-model="stockInDlg.form.product_id" style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" /></el-select></el-form-item>
            <el-form-item label="数量"><el-input-number v-model="stockInDlg.form.quantity" :min="1" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="stockInDlg.form.remark" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="stockInDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="doStockIn">确认入库</el-button>
          </template>
        </el-dialog>
        <el-dialog v-model="stockOutDlg.visible" title="出库" width="400px">
          <el-form :model="stockOutDlg.form" label-width="60px">
            <el-form-item label="产品"><el-select v-model="stockOutDlg.form.product_id" style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" /></el-select></el-form-item>
            <el-form-item label="数量"><el-input-number v-model="stockOutDlg.form.quantity" :min="1" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="stockOutDlg.form.remark" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="stockOutDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="doStockOut">确认出库</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="供应商" name="suppliers">
        <div class="tb"><el-button type="primary" @click="supDlg.visible=true">新增供应商</el-button></div>
        <el-table :data="suppliers" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="名称" width="140" />
          <el-table-column prop="contact_person" label="联系人" width="100" />
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delSup(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="supDlg.visible" title="新增供应商" width="500px">
          <el-form :model="supDlg.form" label-width="90px">
            <el-form-item label="名称"><el-input v-model="supDlg.form.name" /></el-form-item>
            <el-form-item label="联系人"><el-input v-model="supDlg.form.contact_person" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="supDlg.form.phone" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="supDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveSup">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="采购订单" name="purchase">
        <div class="tb"><el-button type="primary" @click="poDlg.visible=true">新增采购单</el-button></div>
        <el-table :data="purchaseOrders" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="supplier_name" label="供应商" width="120" />
          <el-table-column prop="total" label="总额" width="100" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delPo(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="poDlg.visible" title="新增采购单" width="500px">
          <el-form :model="poDlg.form" label-width="80px">
            <el-form-item label="供应商"><el-select v-model="poDlg.form.supplier_id" style="width:100%"><el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
            <el-form-item label="总额"><el-input-number v-model="poDlg.form.total" :min="0" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="poDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="savePo">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane label="仓库管理" name="warehouses">
        <div class="tb"><el-button type="primary" @click="whDlg.visible=true">新增仓库</el-button></div>
        <el-table :data="warehouses" stripe border row-key="id">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="仓库名" width="140" />
          <el-table-column prop="manager" label="负责人" width="100" />
          <el-table-column label="操作" width="100">
            <template #default="{row}"><el-button size="small" type="danger" link @click="delWh(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-dialog v-model="whDlg.visible" title="新增仓库" width="500px">
          <el-form :model="whDlg.form" label-width="80px">
            <el-form-item label="仓库名"><el-input v-model="whDlg.form.name" /></el-form-item>
            <el-form-item label="负责人"><el-input v-model="whDlg.form.manager" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="whDlg.visible=false">取消</el-button>
            <el-button type="primary" @click="saveWh">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { productApi, supplierApi, purchaseOrderApi, warehouseApi } from '../../api/inventory'

const tab = ref('products')
const products = ref([]), suppliers = ref([]), purchaseOrders = ref([]), warehouses = ref([])

const productDlg = reactive({ visible: false, isEdit: false, form: {} })
const stockInDlg = reactive({ visible: false, form: { product_id: '', quantity: 1, remark: '' } })
const stockOutDlg = reactive({ visible: false, form: { product_id: '', quantity: 1, remark: '' } })
const supDlg = reactive({ visible: false, form: {} })
const poDlg = reactive({ visible: false, form: {} })
const whDlg = reactive({ visible: false, form: {} })

function openProductDlg(row) {
  productDlg.isEdit = !!row
  productDlg.form = row ? { ...row } : {}
  productDlg.visible = true
}
async function saveProduct() {
  const f = productDlg.form
  productDlg.isEdit ? await productApi.update(f.id, f) : await productApi.create(f)
  productDlg.visible = false; productDlg.form = {}; productDlg.isEdit = false; await loadAll(); ElMessage.success('保存成功')
}
async function delProduct(id) { await ElMessageBox.confirm('确认？'); await productApi.remove(id); await loadAll() }
async function doStockIn() { await productApi.stockIn(stockInDlg.form); stockInDlg.visible = false; stockInDlg.form = { product_id: '', quantity: 1, remark: '' }; await loadAll(); ElMessage.success('入库成功') }
async function doStockOut() { try { await productApi.stockOut(stockOutDlg.form); stockOutDlg.visible = false; stockOutDlg.form = { product_id: '', quantity: 1, remark: '' }; await loadAll(); ElMessage.success('出库成功') } catch (e) { ElMessage.error(e.response?.data?.message || '出库失败') } }
async function saveSup() { await supplierApi.create(supDlg.form); supDlg.visible = false; supDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }
async function delSup(id) { await supplierApi.remove(id); await loadAll() }
async function savePo() { await purchaseOrderApi.create(poDlg.form); poDlg.visible = false; poDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }
async function delPo(id) { await purchaseOrderApi.remove(id); await loadAll() }
async function saveWh() { await warehouseApi.create(whDlg.form); whDlg.visible = false; whDlg.form = {}; await loadAll(); ElMessage.success('保存成功') }
async function delWh(id) { await warehouseApi.remove(id); await loadAll() }

async function loadAll() {
  products.value = (await productApi.list()).data.data
  suppliers.value = (await supplierApi.list()).data.data
  purchaseOrders.value = (await purchaseOrderApi.list()).data.data
  warehouses.value = (await warehouseApi.list()).data.data
}

onMounted(loadAll)
</script>

<style scoped>
.tb { margin-bottom: 12px; }
.page-container { padding:24px; background:#fff; height:100%; overflow-y:auto; }
.page-title { font-size:20px; font-weight:600; color:#4a3f5e; margin-bottom:20px; }
</style>
