<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/digital')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">销售管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="bids">招投标采集</el-menu-item>
        <el-menu-item index="content">内容发布</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- ===== 招投标采集 ===== -->
        <div v-if="tab==='bids'">
          <el-tabs v-model="bidTab" type="card" style="margin-bottom:12px">
            <el-tab-pane label="招标项目" name="items"></el-tab-pane>
            <el-tab-pane label="采集来源" name="sources"></el-tab-pane>
            <el-tab-pane label="关键词" name="keywords"></el-tab-pane>
          </el-tabs>
          <div v-if="bidTab==='items'">
            <div class="tb">
              <el-button type="primary" @click="collectDlg.visible=true">手动采集</el-button>
              <el-select v-model="bidFilter" placeholder="筛选状态" clearable style="width:120px;margin-left:8px" @change="loadBidItems">
                <el-option label="全部" value=""/><el-option label="新招标" value="new"/><el-option label="已通知" value="notified"/><el-option label="已忽略" value="ignored"/>
              </el-select>
              <el-button @click="handleExport('bid_items')">导出</el-button><el-button @click="handleImport('bid_items')">导入</el-button>
            </div>
            <el-table v-loading="loading" :data="bidItems" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="序号" width="55"/>
              <el-table-column prop="title" label="项目名称" min-width="280" show-overflow-tooltip/>
              <el-table-column prop="bid_type" label="招投标方式" width="110"/>
              <el-table-column prop="submit_type" label="投标方式" width="90"/>
              <el-table-column prop="url" label="网址" width="150" show-overflow-tooltip>
                <template #default="{row}"><a :href="row.url" target="_blank" style="color:#7c3aed;font-size:12px">查看</a></template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{row}">
                  <el-button size="small" type="primary" link @click="openEditItem(row)">编辑</el-button>
                  <el-button size="small" type="danger" link @click="delBidItem(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-else-if="bidTab==='sources'">
            <div class="tb"><el-button type="primary" @click="srcDlg.visible=true">新增来源</el-button><el-button @click="handleExport('bid_sources')">导出</el-button><el-button @click="handleImport('bid_sources')">导入</el-button></div>
            <el-table :data="bidSources" stripe border row-key="id">
              <el-table-column type="index" label="序号" width="55"/>
              <el-table-column prop="name" label="名称" width="150"/>
              <el-table-column prop="url" label="网址" min-width="240" show-overflow-tooltip/>
              <el-table-column prop="interval_minutes" label="采集间隔(分)" width="110"/>
              <el-table-column prop="enabled" label="状态" width="80"><template #default="{row}"><el-switch :model-value="!!row.enabled" @change="toggleSource(row,$event)" size="small"/></template></el-table-column>
              <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="primary" link @click="openEditSource(row)">编辑</el-button><el-button size="small" type="danger" link @click="delSource(row.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
          <div v-else-if="bidTab==='keywords'">
            <div class="tb"><el-button type="primary" @click="kwDlg.visible=true">新增关键词</el-button><el-button @click="handleExport('bid_keywords')">导出</el-button><el-button @click="handleImport('bid_keywords')">导入</el-button></div>
            <el-tag v-for="k in bidKeywords" :key="k.id" closable @close="delKeyword(k.id)" style="margin:4px">{{ k.keyword }}</el-tag>
            <el-empty v-if="bidKeywords.length===0" description="暂无关键词"/>
          </div>
        </div>
        <!-- ===== 内容发布 ===== -->
        <div v-else-if="tab==='content'">
          <div class="tb"><el-button type="primary" @click="pubDlg.visible=true">新建发布计划</el-button><el-button @click="handleExport('content_publish')">导出</el-button><el-button @click="handleImport('content_publish')">导入</el-button></div>
          <el-table v-loading="loading" :data="pubTasks" stripe border row-key="id">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="platform" label="平台" width="100"/>
            <el-table-column prop="content_type" label="类型" width="80"/>
            <el-table-column prop="content" label="内容" min-width="200"/>
            <el-table-column prop="scheduled_at" label="计划时间" width="160"/>
            <el-table-column prop="status" label="状态" width="80"/>
            <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" type="danger" link @click="delPub(row.id)">删除</el-button></template></el-table-column>
          </el-table>
        </div>
      </div>
    </div>
    <!-- Dialogs -->
    <el-dialog v-model="srcDlg.visible" title="新增采集来源" width="500px"><el-form :model="srcDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcDlg.form.url"/></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item></el-form><template #footer><el-button @click="srcDlg.visible=false">取消</el-button><el-button type="primary" @click="saveSource">保存</el-button></template></el-dialog>
    <el-dialog v-model="srcEditDlg.visible" title="编辑采集来源" width="500px"><el-form :model="srcEditDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcEditDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcEditDlg.form.url"/></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcEditDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item><el-form-item label="状态"><el-switch v-model="srcEditDlg.form.enabled" active-text="启用" inactive-text="停用" :active-value="1" :inactive-value="0"/></el-form-item></el-form><template #footer><el-button @click="srcEditDlg.visible=false">取消</el-button><el-button type="primary" @click="saveEditSource">保存</el-button></template></el-dialog>
    <el-dialog v-model="kwDlg.visible" title="新增关键词" width="400px"><el-form :model="kwDlg.form" label-width="80px"><el-form-item label="关键词"><el-input v-model="kwDlg.form.keyword"/></el-form-item></el-form><template #footer><el-button @click="kwDlg.visible=false">取消</el-button><el-button type="primary" @click="saveKeyword">保存</el-button></template></el-dialog>
    <!-- 编辑招标项目 -->
    <el-dialog v-model="editDlg.visible" title="编辑招标项目" width="600px"><el-form :model="editDlg.form" label-width="120px">
      <el-form-item label="项目名称"><el-input v-model="editDlg.form.title"/></el-form-item>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="招投标方式"><el-select v-model="editDlg.form.bid_type"><el-option label="公开招标" value="公开招标"/><el-option label="邀请招标" value="邀请招标"/><el-option label="竞争性谈判" value="竞争性谈判"/><el-option label="询价" value="询价"/><el-option label="单一来源" value="单一来源"/></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="投标方式"><el-select v-model="editDlg.form.submit_type"><el-option label="线上" value="线上"/><el-option label="线下" value="线下"/></el-select></el-form-item></el-col>
      </el-row>
      <el-form-item label="网址"><el-input v-model="editDlg.form.url"/></el-form-item>
    </el-form><template #footer><el-button @click="editDlg.visible=false">取消</el-button><el-button type="primary" @click="saveEditItem">保存</el-button></template></el-dialog>
    <!-- 手动采集时间范围 -->
    <el-dialog v-model="collectDlg.visible" title="手动采集" width="500px"><el-form :model="collectDlg" label-width="80px">
      <el-form-item label="开始日期"><el-date-picker v-model="collectDlg.start" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item>
      <el-form-item label="结束日期"><el-date-picker v-model="collectDlg.end" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item>
    </el-form><template #footer><el-button @click="collectDlg.visible=false">取消</el-button><el-button type="primary" @click="doCollect">开始采集</el-button></template></el-dialog>
    <el-dialog v-model="pubDlg.visible" title="新建发布计划" width="500px"><el-form :model="pubDlg.form" label-width="80px"><el-form-item label="平台"><el-select v-model="pubDlg.form.platform"><el-option label="微信" value="wechat"/><el-option label="抖音" value="douyin"/><el-option label="小红书" value="xiaohongshu"/></el-select></el-form-item><el-form-item label="类型"><el-select v-model="pubDlg.form.content_type"><el-option label="图文" value="text"/><el-option label="视频" value="video"/></el-select></el-form-item><el-form-item label="内容"><el-input v-model="pubDlg.form.content" type="textarea"/></el-form-item><el-form-item label="计划时间"><el-date-picker v-model="pubDlg.form.scheduled_at" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width:100%"/></el-form-item></el-form><template #footer><el-button @click="pubDlg.visible=false">取消</el-button><el-button type="primary" @click="savePub">保存</el-button></template></el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import ImportDialog from '../../components/ImportDialog.vue'
const req = axios.create({ baseURL: '/api' })
const router = useRouter()

const tab = ref('bids'), bidTab = ref('items'), bidFilter = ref('')
const importVisible = ref(false)
const importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key) { window.open(`/api/io/${key}/export`) }
function onImportDone() { refresh() }
const bidItems = ref([]), bidSources = ref([]), bidKeywords = ref([])
const pubTasks = ref([])
const loading = ref(false)

const kpis = computed(() => [
  { val: bidItems.value.filter(i=>i.status==='new').length, label: '新招标' },
  { val: bidSources.value.length, label: '采集源' },
  { val: pubTasks.value.filter(t=>t.status==='scheduled').length, label: '待发布' }
])

const srcDlg = reactive({ visible: false, form: {} })
const kwDlg = reactive({ visible: false, form: {} })
const pubDlg = reactive({ visible: false, form: {} })
const editDlg = reactive({ visible: false, form: {} })
const srcEditDlg = reactive({ visible: false, form: {} })
const collectDlg = reactive({ visible: false, start: '', end: '' })

async function loadBidItems() {
  const p = bidFilter.value ? { params: { status: bidFilter.value } } : {}
  bidItems.value = (await req.get('/bids/items', p)).data.data
}
async function loadBidSources() { bidSources.value = (await req.get('/bids/sources')).data.data }
async function loadBidKeywords() { bidKeywords.value = (await req.get('/bids/keywords')).data.data }
async function loadPubTasks() { pubTasks.value = (await req.get('/content-publish')).data.data }

async function doCollect() {
  await req.post('/bids/collect', { start: collectDlg.start, end: collectDlg.end })
  collectDlg.visible = false; collectDlg.start = ''; collectDlg.end = ''
  ElMessage.success('采集完成'); await refresh()
}

async function saveSource() { await req.post('/bids/sources', srcDlg.form); srcDlg.visible = false; srcDlg.form = {}; await refresh(); ElMessage.success('OK') }
function openEditSource(row) { srcEditDlg.form = { ...row }; srcEditDlg.visible = true }
async function toggleSource(row, val) { await req.put('/bids/sources/'+row.id, { enabled: val ? 1 : 0 }); await refresh() }
async function saveEditSource() { await req.put('/bids/sources/'+srcEditDlg.form.id, srcEditDlg.form); srcEditDlg.visible = false; await refresh(); ElMessage.success('OK') }
async function delSource(id) { await ElMessageBox.confirm('确认?'); await req.delete('/bids/sources/'+id); await refresh() }
async function saveKeyword() { try { await req.post('/bids/keywords', kwDlg.form); kwDlg.visible = false; kwDlg.form = {}; await refresh(); ElMessage.success('OK') } catch { ElMessage.error('关键词已存在') } }
async function delKeyword(id) { await req.delete('/bids/keywords/'+id); await refresh() }
function openEditItem(row) { editDlg.form = { ...row }; editDlg.visible = true }
async function saveEditItem() { await req.put('/bids/items/'+editDlg.form.id, editDlg.form); editDlg.visible = false; await refresh(); ElMessage.success('OK') }
async function delBidItem(id) { await ElMessageBox.confirm('确认?'); await req.delete('/bids/items/'+id); await refresh() }
async function savePub() { await req.post('/content-publish', pubDlg.form); pubDlg.visible = false; pubDlg.form = {}; await refresh(); ElMessage.success('OK') }
async function delPub(id) { await ElMessageBox.confirm('确认?'); await req.delete('/content-publish/'+id); await refresh() }

async function refresh() {
  loading.value = true
  await loadBidItems(); await loadBidSources(); await loadBidKeywords(); await loadPubTasks()
  loading.value = false
}
onMounted(refresh)
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
