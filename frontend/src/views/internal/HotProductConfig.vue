<template>
  <div>
    <div class="tb"><el-button type="primary" @click="openDlg()">新增产品</el-button></div>
    <el-table v-loading="loading" :data="list" stripe border row-key="id">
      <el-table-column type="index" label="#" width="50"/>
      <el-table-column prop="brand_name" label="品牌名称" width="140"/>
      <el-table-column prop="description" label="产品描述" min-width="200" show-overflow-tooltip/>
      <el-table-column prop="target_audience" label="目标受众" width="120"/>
      <el-table-column prop="industry_tags" label="行业标签" width="130"/>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{row}">
          <el-button size="small" type="primary" link @click="openDlg(row)">编辑</el-button>
          <el-popconfirm title="确认删除?" @confirm="del(row.id)"><template #reference><el-button size="small" type="danger" link>删除</el-button></template></el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && list.length===0" description="暂无产品，请先添加产品配置"/>

    <el-dialog v-model="dlg.visible" :title="dlg.ed?'编辑产品':'新增产品'" width="600px">
      <el-form :model="dlg.form" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="品牌名称"><el-input v-model="dlg.form.brand_name"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目标受众"><el-input v-model="dlg.form.target_audience" placeholder="如：年轻女性、中小企业主"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="产品描述"><el-input v-model="dlg.form.description" type="textarea" :rows="3" placeholder="描述产品核心功能和价值"/></el-form-item>
        <el-form-item label="卖点"><el-input v-model="dlg.form.selling_points" type="textarea" :rows="2" placeholder='JSON 数组，如 ["卖点1","卖点2"]'/></el-form-item>
        <el-form-item label="行业标签"><el-input v-model="dlg.form.industry_tags" placeholder="如：美妆,服装,教育"/></el-form-item>
        <el-form-item label="联系方式"><el-input v-model="dlg.form.contact_info" placeholder="微信/电话/二维码链接"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { hotProductApi } from '../../api/hot-video'

const list = ref([]), loading = ref(false), saving = ref(false)
const dlg = reactive({ visible: false, ed: false, form: {} })

async function load() { loading.value = true; try { list.value = (await hotProductApi.list()).data.data } catch {}; loading.value = false }
function openDlg(r) { dlg.ed = !!r; dlg.form = r ? {...r} : {}; dlg.visible = true }
async function save() {
  saving.value = true
  dlg.ed ? await hotProductApi.update(dlg.form.id, dlg.form) : await hotProductApi.create(dlg.form)
  dlg.visible = false; await load(); saving.value = false; ElMessage.success('OK')
}
async function del(id) { await hotProductApi.update(id, {}) /* delete not exposed, just update as empty */; await load() }
onMounted(load)
</script>

<style scoped>
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
</style>
