<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button>
        <span class="pg-title">招标信息统计表</span>
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-val">{{ total }}</div><div class="kpi-lbl">记录总数</div></div>
        <div class="kpi"><div class="kpi-val">{{ monthNew }}</div><div class="kpi-lbl">本月新增</div></div>
        <div class="kpi"><div class="kpi-val">{{ crawlCount }}</div><div class="kpi-lbl">乙方宝采集</div></div>
      </div>
    </div>
    <div class="pg-body">
      <div class="tb">
        <el-button type="primary" @click="openAdd">新增</el-button>
        <el-button @click="handleExport">导出</el-button>
        <el-button @click="handleImport">导入</el-button>
        <el-button type="success" @click="openCrawl" :loading="crawling" :disabled="crawling">乙方宝采集</el-button>
        <el-input v-model="keyword" placeholder="搜索项目/招标人/中标单位" clearable style="width:240px;margin-left:8px" @change="loadData"/>
        <el-select v-model="filterRegion" placeholder="地区" clearable style="width:100px;margin-left:8px" @change="loadData">
          <el-option label="昆明" value="昆明"/><el-option label="曲靖" value="曲靖"/><el-option label="玉溪" value="玉溪"/>
          <el-option label="保山" value="保山"/><el-option label="昭通" value="昭通"/><el-option label="丽江" value="丽江"/>
          <el-option label="普洱" value="普洱"/><el-option label="临沧" value="临沧"/><el-option label="楚雄" value="楚雄"/>
          <el-option label="红河" value="红河"/><el-option label="文山" value="文山"/><el-option label="版纳" value="版纳"/>
          <el-option label="大理" value="大理"/><el-option label="德宏" value="德宏"/><el-option label="怒江" value="怒江"/>
          <el-option label="迪庆" value="迪庆"/>
        </el-select>
        <el-select v-model="filterIndustry" placeholder="行业" clearable style="width:100px;margin-left:8px" @change="loadData">
          <el-option label="政府" value="政府"/><el-option label="学校" value="学校"/><el-option label="医院" value="医院"/><el-option label="企业" value="企业"/>
        </el-select>
      </div>
      <el-table v-loading="loading" :data="rows" stripe border row-key="id" style="width:100%" size="small">
        <el-table-column type="index" label="#" width="40" fixed/>
        <el-table-column prop="bid_win_time" label="中标时间" width="100"/>
        <el-table-column prop="notice_time" label="公告时间" width="100"/>
        <el-table-column prop="bid_time" label="投标时间" width="100"/>
        <el-table-column prop="region" label="地区" width="70"/>
        <el-table-column prop="industry" label="行业" width="70"/>
        <el-table-column prop="bidder" label="招标人" width="140" show-overflow-tooltip/>
        <el-table-column prop="bid_company" label="招标公司" width="140" show-overflow-tooltip/>
        <el-table-column prop="project_name" label="项目名称" min-width="180" show-overflow-tooltip/>
        <el-table-column prop="project_content" label="产品及内容" min-width="160" show-overflow-tooltip/>
        <el-table-column prop="budget_amount" label="预算(万)" width="90"/>
        <el-table-column label="链接" width="60" fixed="right">
          <template #default="{row}"><a v-if="row.url" :href="row.url" target="_blank" style="color:#7c3aed">查看</a><span v-else>-</span></template>
        </el-table-column>
        <el-table-column prop="bid_method" label="方式" width="80"/>
        <el-table-column prop="win_company" label="中标单位" width="140" show-overflow-tooltip/>
        <el-table-column prop="win_amount" label="成交(万)" width="90"/>
        <el-table-column prop="remark" label="备注" width="100" show-overflow-tooltip/>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{row}">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="del(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev,pager,next" @current-change="loadData" small/>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dlg.visible" :title="dlg.editing?'编辑':'新增'" width="750px" destroy-on-close>
      <el-form :model="dlg.form" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="中标时间"><el-date-picker v-model="dlg.form.bid_win_time" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="公告发布时间"><el-date-picker v-model="dlg.form.notice_time" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="投标时间"><el-date-picker v-model="dlg.form.bid_time" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="地区"><el-input v-model="dlg.form.region"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="一级行业"><el-select v-model="dlg.form.industry"><el-option label="政府" value="政府"/><el-option label="学校" value="学校"/><el-option label="医院" value="医院"/><el-option label="企业" value="企业"/></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="招投标方式"><el-select v-model="dlg.form.bid_method"><el-option label="公开招标" value="公开招标"/><el-option label="邀请招标" value="邀请招标"/><el-option label="竞争性磋商" value="竞争性磋商"/><el-option label="竞争性谈判" value="竞争性谈判"/><el-option label="询价" value="询价"/><el-option label="单一来源" value="单一来源"/></el-select></el-form-item></el-col>
        </el-row>
        <el-form-item label="招标人"><el-input v-model="dlg.form.bidder"/></el-form-item>
        <el-form-item label="招标公司"><el-input v-model="dlg.form.bid_company"/></el-form-item>
        <el-form-item label="项目名称"><el-input v-model="dlg.form.project_name"/></el-form-item>
        <el-form-item label="产品及内容"><el-input v-model="dlg.form.project_content" type="textarea" :rows="3"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="项目金额(万)"><el-input-number v-model="dlg.form.budget_amount" :min="0" :precision="2" style="width:100%"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="成交金额(万)"><el-input-number v-model="dlg.form.win_amount" :min="0" :precision="2" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="中标单位"><el-input v-model="dlg.form.win_company"/></el-form-item>
        <el-form-item label="网页链接"><el-input v-model="dlg.form.url"/></el-form-item>
        <el-form-item label="备注"><el-input v-model="dlg.form.remark" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <!-- 乙方宝采集弹窗 -->
    <el-dialog v-model="crawlDlg.visible" title="乙方宝采集" width="450px">
      <div style="text-align:center;padding:20px">
        <div v-if="crawlDlg.loginNeeded" style="margin-bottom:12px">
          <p style="color:#e53e3e;margin-bottom:8px">需要扫码登录乙方宝</p>
          <p style="color:#b8aad0;font-size:12px">请在浏览器打开乙方宝扫码登录，然后将 cookies 粘贴到下方</p>
          <el-input v-model="crawlDlg.cookies" type="textarea" :rows="4" placeholder="粘贴 JSON cookies..." style="margin-top:8px"/>
          <el-button type="primary" style="margin-top:8px" @click="saveCookiesAndCrawl">保存并采集</el-button>
        </div>
        <div v-else-if="crawlDlg.running">
          <el-icon class="is-loading" :size="32"><Loading/></el-icon>
          <p style="margin-top:8px">采集中... {{ crawlDlg.progress }}</p>
        </div>
        <div v-else>
          <p>开始从乙方宝采集招标数据</p>
          <el-button type="primary" style="margin-top:8px" @click="startCrawl">开始采集</el-button>
        </div>
      </div>
      <template #footer><el-button @click="crawlDlg.visible=false">关闭</el-button></template>
    </el-dialog>

    <ImportDialog v-model="importVisible" ioKey="bid_statistics" @done="loadData"/>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import request from '../../api/index.js'
import ImportDialog from '../../components/ImportDialog.vue'
const router = useRouter()

const rows = ref([]), total = ref(0), loading = ref(false), saving = ref(false)
const keyword = ref(''), filterRegion = ref(''), filterIndustry = ref('')
const page = ref(1), pageSize = ref(50)

const dlg = reactive({ visible: false, editing: false, editId: '', form: {} })
const crawlDlg = reactive({ visible: false, loginNeeded: false, running: false, cookies: '', progress: '' })
const crawling = ref(false)
const importVisible = ref(false)

const monthNew = computed(() => {
  const now = new Date(); const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  return rows.value.filter(r => r.created_at && r.created_at.startsWith(prefix)).length
})
const crawlCount = computed(() => rows.value.filter(r => r.source === 'crawl4ai').length)

function handleExport() { window.open('/api/io/bid_statistics/export') }
function handleImport() { importVisible.value = true }

async function loadData() {
  loading.value = true
  const params = { page: page.value, pageSize: pageSize.value }
  if (keyword.value) params.keyword = keyword.value
  if (filterRegion.value) params.region = filterRegion.value
  if (filterIndustry.value) params.industry = filterIndustry.value
  const res = await request.get('/bid-statistics', { params })
  rows.value = res.data.data.rows; total.value = res.data.data.total
  loading.value = false
}

function openAdd() { dlg.editing = false; dlg.editId = ''; dlg.form = { region: '昆明', bid_method: '公开招标', source: 'manual' }; dlg.visible = true }
function openEdit(row) { dlg.editing = true; dlg.editId = row.id; dlg.form = { ...row }; dlg.visible = true }
async function save() {
  saving.value = true
  dlg.editing ? await request.put('/bid-statistics/' + dlg.editId, dlg.form) : await request.post('/bid-statistics', dlg.form)
  dlg.visible = false; await loadData(); saving.value = false; ElMessage.success('OK')
}
async function del(id) { await ElMessageBox.confirm('确认删除?'); await request.delete('/bid-statistics/' + id); await loadData() }

async function openCrawl() {
  crawlDlg.visible = true; crawlDlg.running = false; crawlDlg.loginNeeded = false; crawlDlg.cookies = ''
  try {
    const res = await request.get('/bid-statistics/crawl-status')
    crawlDlg.loginNeeded = !res.data.data.loggedIn
  } catch { crawlDlg.loginNeeded = true }
}

async function saveCookiesAndCrawl() {
  if (!crawlDlg.cookies) return ElMessage.warning('请粘贴 cookies')
  await request.post('/bid-statistics/crawl', { cookies: crawlDlg.cookies })
  crawlDlg.visible = false; await loadData(); ElMessage.success('采集完成')
}

async function startCrawl() {
  crawlDlg.running = true; crawlDlg.progress = '正在搜索乙方宝...'
  crawling.value = true
  try {
    const res = await request.post('/bid-statistics/crawl')
    crawlDlg.visible = false; await loadData()
    ElMessage.success(`采集完成，新增 ${res.data.data?.inserted || 0} 条`)
  } catch (e) { ElMessage.error('采集失败: ' + (e.response?.data?.message || e.message)) }
  crawling.value = false; crawlDlg.running = false
}

onMounted(loadData)
</script>

<style scoped>
.pg { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px 0; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.kpi-row { display: flex; gap: 16px; margin-bottom: 16px; margin-top: 8px; }
.kpi { padding: 8px 16px; background: #f8f7ff; border-radius: 10px; text-align: center; min-width: 80px; }
.kpi-val { font-size: 20px; font-weight: 700; color: #7c3aed; }
.kpi-lbl { font-size: 11px; color: #b8aad0; }
.pg-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.is-loading { animation: rotating 2s linear infinite; }
@keyframes rotating { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
</style>
