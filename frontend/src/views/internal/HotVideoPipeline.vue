<template>
  <div>
    <!-- Custom clickable step bar -->
    <div class="step-bar">
      <div
        v-for="(s, i) in steps"
        :key="i"
        class="step-item"
        :class="{ active: step === i, done: stepStat(i) === 'done', process: stepStat(i) === 'process' }"
        @click="step = i"
      >
        <div class="step-num">
          <el-icon v-if="stepStat(i) === 'done'"><Check /></el-icon>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div class="step-info">
          <div class="step-title">{{ s.title }}</div>
          <div class="step-desc">{{ s.desc }}</div>
        </div>
        <div class="step-arrow"><el-icon><ArrowRight /></el-icon></div>
      </div>
    </div>

    <!-- === Step 0: Extract === -->
    <div v-show="step === 0">
      <el-card header="内容提取" class="step-card">
        <el-form :model="extract" label-width="80px" style="max-width:700px">
          <el-form-item label="平台URL">
            <el-input v-model="extract.url" placeholder="粘贴抖音/小红书/快手等平台链接" @keyup.enter="doExtract"/>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="extracting" @click="doExtract">提取内容</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="extractResult" style="margin-top:16px" header="提取结果">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="标题">{{ extractResult.title }}</el-descriptions-item>
          <el-descriptions-item label="平台">{{ extractResult.platform }}</el-descriptions-item>
          <el-descriptions-item label="标签">{{ extractResult.tags }}</el-descriptions-item>
          <el-descriptions-item label="正文"><div style="max-height:200px;overflow-y:auto;white-space:pre-wrap">{{ extractResult.body }}</div></el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:12px">
          <el-button type="primary" @click="step=1;rewriteForm.source_title=extractResult.title;rewriteForm.source_body=extractResult.body;rewriteForm.source_tags=extractResult.tags;rewriteForm.source_url=extractResult.source_url;rewriteForm.source_platform=extractResult.platform">下一步：AI改写</el-button>
        </div>
      </el-card>

      <el-divider style="margin:24px 0 16px"><span style="color:#b8aad0;font-size:13px">个人文案改写</span></el-divider>

      <el-card header="个人文案改写" style="max-width:700px">
        <el-form :model="personal" label-width="80px">
          <el-form-item label="原文"><el-input v-model="personal.text" type="textarea" :rows="5" placeholder="粘贴你要改写的原始文案"/></el-form-item>
          <el-form-item label="改写要求"><el-input v-model="personal.prompt" type="textarea" :rows="2" placeholder="描述改写风格、语气、目标平台等要求（选填）"/></el-form-item>
          <el-form-item><el-button type="primary" :loading="personal.loading" @click="doPersonalRewrite">AI改写并进入编辑</el-button></el-form-item>
        </el-form>
      </el-card>

      <el-card style="margin-top:16px" header="全部内容">
        <HistoryTable :data="contentList" :step="0" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent"/>
      </el-card>
    </div>

    <!-- === Step 1: Rewrite === -->
    <div v-show="step === 1">
      <el-card header="AI改写" class="step-card">
        <el-form label-width="100px" style="max-width:700px">
          <el-form-item label="原标题"><el-input v-model="rewriteForm.source_title"/></el-form-item>
          <el-form-item label="原文"><el-input v-model="rewriteForm.source_body" type="textarea" :rows="5"/></el-form-item>
          <el-form-item label="标签"><el-input v-model="rewriteForm.source_tags"/></el-form-item>
          <el-form-item label="额外要求"><el-input v-model="rewriteForm.user_prompt" placeholder="可选：对改写风格/方向的额外要求"/></el-form-item>
          <el-form-item>
            <el-button @click="step=0">上一步</el-button>
            <el-button type="primary" :loading="rewriting" @click="doRewrite">开始改写</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="rewriteResult" style="margin-top:16px" header="改写结果">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="新标题">{{ rewriteResult.title }}</el-descriptions-item>
          <el-descriptions-item label="新标签">{{ rewriteResult.tags }}</el-descriptions-item>
          <el-descriptions-item label="新正文"><div style="max-height:200px;overflow-y:auto;white-space:pre-wrap">{{ rewriteResult.body }}</div></el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:12px">
          <el-button type="primary" @click="editForm.title=rewriteResult.title;editForm.body=rewriteResult.body;editForm.tags=rewriteResult.tags;step=2">下一步：编辑发布</el-button>
        </div>
      </el-card>

      <el-card style="margin-top:16px" header="待编辑内容">
        <HistoryTable :data="rewriteHistory" :step="1" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent"/>
      </el-card>
    </div>

    <!-- === Step 2: Edit === -->
    <div v-show="step === 2">
      <el-card header="编辑内容" class="step-card">
        <el-form :model="editForm" label-width="90px" style="max-width:700px">
          <el-form-item label="标题"><el-input v-model="editForm.title"/></el-form-item>
          <el-form-item label="正文"><el-input v-model="editForm.body" type="textarea" :rows="6"/></el-form-item>
          <el-form-item label="标签"><el-input v-model="editForm.tags" placeholder="逗号分隔"/></el-form-item>
          <el-form-item>
            <el-button @click="step=1">上一步</el-button>
            <el-button type="primary" :loading="saving" @click="doSaveContent">保存为草稿</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card style="margin-top:16px" header="内容列表">
        <HistoryTable :data="editHistory" :step="2" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent"/>
      </el-card>
    </div>

    <!-- === Step 3: Video === -->
    <div v-show="step === 3">
      <el-card header="生成视频" class="step-card">
        <el-form :model="videoForm" label-width="100px" style="max-width:650px">
          <el-form-item label="当前内容"><strong>{{ videoForm.title || '请先从内容列表选择' }}</strong></el-form-item>
          <el-form-item label="视频模式">
            <el-select v-model="videoForm.mode" style="width:100%">
              <el-option label="蝉镜数字人" value="chanjing"/>
              <el-option label="可灵 Kling AI" value="kling"/>
            </el-select>
          </el-form-item>
          <el-form-item label="画面方向">
            <el-radio-group v-model="videoForm.orientation"><el-radio label="portrait">竖屏 9:16</el-radio><el-radio label="landscape">横屏 16:9</el-radio></el-radio-group>
          </el-form-item>

          <template v-if="videoForm.mode==='chanjing'">
            <el-form-item label="数字人">
              <div v-if="selectedPerson" class="pipe-sel">
                <img v-if="selectedPerson.figures&&selectedPerson.figures[0]&&selectedPerson.figures[0].cover" :src="selectedPerson.figures[0].cover" class="pipe-sel-img"/>
                <span v-else class="pipe-sel-icon">🤖</span>
                <div class="pipe-sel-info"><strong>{{ selectedPerson.name }}</strong><span class="pipe-sel-sub">{{ selectedPerson.gender }}</span></div>
                <el-button size="small" @click="showDpDialog=true">更换</el-button>
              </div>
              <el-button v-else @click="showDpDialog=true;loadDpList()">选择数字人</el-button>
            </el-form-item>
            <el-form-item label="音色">
              <div v-if="selectedVoice" class="pipe-sel">
                <span class="pipe-sel-icon">🎙️</span>
                <div class="pipe-sel-info"><strong>{{ selectedVoice.name }}</strong><span class="pipe-sel-sub">{{ selectedVoice.gender }} · {{ selectedVoice.lang }}</span></div>
                <el-button size="small" @click="showVoiceDialog=true">更换</el-button>
              </div>
              <el-button v-else @click="showVoiceDialog=true;loadVoices()">选择音色</el-button>
            </el-form-item>
            <el-form-item label="音调"><el-slider v-model="videoForm.pitch" :min="0.5" :max="2.0" :step="0.1" show-input style="width:300px"/></el-form-item>
            <el-form-item label="字体">
              <div v-if="selectedFont" class="pipe-sel">
                <span class="pipe-sel-icon">🔤</span>
                <div class="pipe-sel-info"><strong>{{ selectedFont.name || selectedFont.font_name || selectedFont.id }}</strong></div>
                <el-button size="small" @click="showFontDialog=true">更换</el-button>
              </div>
              <el-button v-else @click="showFontDialog=true;loadFonts()">选择字体（可选）</el-button>
            </el-form-item>
          </template>

          <el-form-item>
            <el-button @click="step=2">上一步</el-button>
            <el-button type="primary" :loading="generating" @click="doGenerateVideo" :disabled="!videoForm.contentId">开始生成视频</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="videoStatus" style="margin-top:16px" header="视频状态">
        <el-result v-if="videoStatus==='generating'" icon="info" title="视频生成中..." sub-title="请稍候，通常需要30秒-3分钟">
          <template #extra><el-button :loading="true">生成中</el-button></template>
        </el-result>
        <el-result v-else-if="videoStatus==='failed'" icon="error" title="生成失败" :sub-title="videoError"/>
        <div v-else-if="videoStatus==='done'">
          <video :src="videoUrl" controls style="width:100%;max-width:540px;border-radius:8px"/>
          <div style="margin-top:8px"><el-button type="primary" @click="step=4">下一步：发布</el-button></div>
        </div>
      </el-card>

      <el-card style="margin-top:16px" header="视频历史">
        <HistoryTable :data="videoHistory" :step="3" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent"/>
      </el-card>
    </div>

    <!-- 蝉镜资源选择弹窗 -->
    <el-dialog v-model="showDpDialog" title="选择数字人" width="760px" top="5vh">
      <div v-if="dpFilters.length" style="margin-bottom:12px">
        <div v-for="cat in dpFilters" :key="cat.name" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399;flex-shrink:0;width:36px">{{ cat.name }}</span>
          <el-button v-for="t in cat.items" :key="t.id" size="small" :type="t.active ? 'primary' : ''" plain @click="toggleDpTag(t.id)">{{ t.name }}</el-button>
        </div>
        <el-button v-if="dpFilterTags.length" size="small" type="danger" text @click="dpFilterTags=[];reloadDp()">清除筛选</el-button>
      </div>
      <div v-loading="dpLoading" class="resource-grid">
        <div v-for="p in dpList" :key="p.id" class="resource-card" :class="{selected: videoForm.person_id===p.id}" @click="selectPerson(p)">
          <img v-if="p.figures&&p.figures[0]&&p.figures[0].cover" :src="p.figures[0].cover" class="rc-img"/>
          <div v-else class="rc-placeholder">🤖</div>
          <div class="rc-body"><div class="rc-name">{{ p.name }}</div><div class="rc-meta">{{ p.gender }}</div></div>
          <el-icon v-if="videoForm.person_id===p.id" class="rc-check"><CircleCheckFilled /></el-icon>
        </div>
      </div>
      <div v-if="dpHasMore" style="text-align:center;padding:12px"><el-button :loading="dpLoading" @click="loadMoreDp">加载更多 ({{ dpList.length }}/723)</el-button></div>
      <el-empty v-if="!dpLoading && dpList.length===0" description="暂无数字人"/>
    </el-dialog>

    <el-dialog v-model="showVoiceDialog" title="选择音色" width="700px" top="5vh">
      <div v-loading="voiceLoading" class="resource-grid voice-grid">
        <div v-for="v in voiceList" :key="v.id" class="resource-card voice-card" :class="{selected: videoForm.audio_man_id===v.id}" @click="selectVoice(v)">
          <div class="rc-placeholder voice-icon">🎙️</div>
          <div class="rc-body"><div class="rc-name">{{ v.name }}</div><div class="rc-meta">{{ v.gender }} · {{ v.lang }}</div></div>
          <audio v-if="v.audition" :src="v.audition" controls style="width:100%;height:28px;margin-top:4px" @click.stop/>
          <el-icon v-if="videoForm.audio_man_id===v.id" class="rc-check"><CircleCheckFilled /></el-icon>
        </div>
      </div>
      <el-empty v-if="!voiceLoading && voiceList.length===0" description="暂无音色"/>
    </el-dialog>

    <el-dialog v-model="showFontDialog" title="选择字体" width="500px" top="5vh">
      <el-table v-loading="fontLoading" :data="fontList" stripe border size="small" highlight-current-row max-height="50vh">
        <el-table-column label="字体名称" min-width="160">
          <template #default="{row}">{{ row.name || row.font_name || row.id }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{row}">
            <el-button size="small" type="primary" link @click="selectFont(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!fontLoading && fontList.length===0" description="暂无字体"/>
    </el-dialog>

    <!-- === Step 4: Publish === -->
    <div v-show="step === 4">
      <el-card header="发布内容" class="step-card">
        <el-form :model="publishForm" label-width="100px" style="max-width:500px">
          <el-form-item label="发布平台">
            <el-checkbox-group v-model="publishForm.platforms">
              <el-checkbox label="douyin">抖音</el-checkbox>
              <el-checkbox label="xiaohongshu">小红书</el-checkbox>
              <el-checkbox label="kuaishou">快手</el-checkbox>
              <el-checkbox label="wechat">微信视频号</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item>
            <el-button @click="step=3">上一步</el-button>
            <el-button type="primary" :loading="publishing" @click="doPublish">确认发布</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card style="margin-top:16px" header="已发布内容">
        <HistoryTable :data="publishHistory" :step="4" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent"/>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, ArrowRight, CircleCheckFilled } from '@element-plus/icons-vue'
import { hotContentApi, hotExtractApi, hotChanjingApi } from '../../api/hot-video'
import HistoryTable from './HistoryTable.vue'

const step = ref(0)
const steps = [
  { title: '提取', desc: '粘贴爆款链接' },
  { title: '改写', desc: 'AI去重改写' },
  { title: '编辑', desc: '上传素材' },
  { title: '视频', desc: 'AI生成' },
  { title: '发布', desc: '多渠道发布' },
]

// ─── Content list ───
const contentList = ref([])
async function loadContents() {
  try { contentList.value = (await hotContentApi.list()).data.data } catch {}
}

// ─── Step status ───
function stepStat(i) {
  const list = contentList.value
  switch (i) {
    case 0: return list.length > 0 ? 'done' : (step.value === 0 ? 'process' : 'wait')
    case 1: return list.length > 0 ? 'done' : (step.value === 1 ? 'process' : 'wait')
    case 2: return list.some(c => c.status === 'draft' || c.status === 'approved') ? 'done' : (step.value === 2 ? 'process' : 'wait')
    case 3: return list.some(c => c.video_status === 'done') ? 'done' : list.some(c => c.video_status === 'generating') ? 'process' : (step.value === 3 ? 'process' : 'wait')
    case 4: return list.some(c => c.status === 'published') ? 'done' : (step.value === 4 ? 'process' : 'wait')
    default: return 'wait'
  }
}

// ─── Filtered lists ───
const rewriteHistory = computed(() => contentList.value.filter(c => c.status === 'draft'))
const editHistory = computed(() => contentList.value.filter(c => c.status === 'draft' || c.status === 'approved'))
const videoHistory = computed(() => contentList.value.filter(c => c.video_status))
const publishHistory = computed(() => contentList.value.filter(c => c.status === 'published'))

function goStep(row, s) {
  if (s === 2) {
    editForm.title = row.title
    editForm.body = row.body
    editForm.tags = row.tags || ''
  } else if (s === 3) {
    goToVideo(row)
    return
  }
  step.value = s
}

// ─── Step 0: Extract ───
const extract = reactive({ url: '' })
const extracting = ref(false)
const extractResult = ref(null)
async function doExtract() {
  if (!extract.url) return ElMessage.warning('请输入URL')
  extracting.value = true
  try {
    const res = await hotExtractApi.extract(extract.url)
    extractResult.value = res.data.data
    ElMessage.success('提取成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '提取失败')
  } finally { extracting.value = false }
}

// ─── Personal rewrite ───
const personal = reactive({ text: '', prompt: '', loading: false })
async function doPersonalRewrite() {
  if (!personal.text) return ElMessage.warning('请输入原文')
  personal.loading = true
  try {
    const res = await hotExtractApi.rewrite({
      source_title: '',
      source_body: personal.text,
      source_tags: '',
      source_platform: 'other',
      user_prompt: personal.prompt
    })
    const data = res.data.data
    editForm.title = data.title || ''
    editForm.body = data.body || ''
    editForm.tags = data.tags || ''
    ElMessage.success('改写完成，进入编辑')
    step.value = 2
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '改写失败')
  } finally { personal.loading = false }
}

// ─── Step 1: Rewrite ───
const rewriteForm = reactive({ source_title: '', source_body: '', source_tags: '', source_url: '', source_platform: 'other', user_prompt: '' })
const rewriting = ref(false), rewriteResult = ref(null)
async function doRewrite() {
  if (!rewriteForm.source_body && !rewriteForm.source_title) return ElMessage.warning('缺少原文')
  rewriting.value = true
  try {
    const res = await hotExtractApi.rewrite(rewriteForm)
    rewriteResult.value = res.data.data
    ElMessage.success('改写完成')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '改写失败')
  } finally { rewriting.value = false }
}

// ─── Step 2: Edit ───
const editForm = reactive({ title: '', body: '', tags: '' })
const saving = ref(false), savedContent = ref(null)
async function doSaveContent() {
  if (!editForm.title || !editForm.body) return ElMessage.warning('标题和正文必填')
  saving.value = true
  try {
    const res = await hotContentApi.create({ title: editForm.title, body: editForm.body, tags: editForm.tags })
    savedContent.value = res.data.data
    ElMessage.success('已保存为草稿')
    await loadContents()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally { saving.value = false }
}

async function approveContent(row) {
  await hotContentApi.review(row.id, { action: 'approve' })
  ElMessage.success('已通过审核，进入视频生成')
  await loadContents()
  goToVideo(row)
}
async function rejectContent(row) {
  try {
    const { value } = await ElMessageBox.prompt('驳回理由', '驳回', { inputType: 'textarea' })
    await hotContentApi.review(row.id, { action: 'reject', feedback: value })
    ElMessage.success('已驳回')
    await loadContents()
  } catch {}
}
function goToVideo(row) {
  videoForm.contentId = row.id
  videoForm.title = row.title
  step.value = 3
}
async function publishContent(row) {
  try {
    await ElMessageBox.confirm('确认发布?')
    await hotContentApi.publish(row.id, { platforms: 'douyin' })
    ElMessage.success('已发布')
    await loadContents()
  } catch {}
}
async function deleteContent(id) {
  try { await ElMessageBox.confirm('确认删除?'); await hotContentApi.remove(id); await loadContents() } catch {}
}

// ─── Step 3: Video ───
const videoForm = reactive({ contentId: '', title: '', mode: 'chanjing', orientation: 'portrait', speed: 1.0, person_id: '', audio_man_id: '', pitch: 1.0, font_id: '', figure_type: '', figure_width: 0, figure_height: 0 })
const generating = ref(false), videoStatus = ref(null), videoError = ref(''), videoUrl = ref('')

// ─── 蝉镜资源选择 ───
const dpList = ref([]), voiceList = ref([]), fontList = ref([])
const dpLoading = ref(false), voiceLoading = ref(false), fontLoading = ref(false)
const showDpDialog = ref(false), showVoiceDialog = ref(false), showFontDialog = ref(false)

const selectedPerson = computed(() => dpList.value.find(p => p.id === videoForm.person_id))
const selectedVoice = computed(() => voiceList.value.find(v => v.id === videoForm.audio_man_id))
const selectedFont = computed(() => fontList.value.find(f => f.id === videoForm.font_id))
const dpPage = ref(1), dpHasMore = ref(true)
const dpFilterTags = ref([]) // selected tag_ids
const dpTagMap = ref({}) // name → id mapping extracted from data

const FILTER_CATEGORIES = [
  { name: '性别', keys: ['男性', '女性'] },
  { name: '年龄', keys: ['青年', '中年', '老年'] },
  { name: '职业', keys: ['教师', '主持人', '商务', '律师', '金融', '医生', '厨师', '农民', '家政', '学生', '工程师', '带货博主', '程序员'] },
]
const dpFilters = computed(() => {
  return FILTER_CATEGORIES.map(cat => ({
    name: cat.name,
    items: cat.keys.filter(k => dpTagMap.value[k] != null).map(k => ({
      name: k, id: dpTagMap.value[k], active: dpFilterTags.value.includes(dpTagMap.value[k])
    }))
  })).filter(c => c.items.length)
})

function _extractTags(list) {
  for (const p of list) {
    if (p.tag_ids && p.tag_names) {
      for (let i = 0; i < p.tag_ids.length; i++) {
        if (!dpTagMap.value[p.tag_names[i]]) dpTagMap.value[p.tag_names[i]] = p.tag_ids[i]
      }
    }
  }
}

function toggleDpTag(tagId) {
  const idx = dpFilterTags.value.indexOf(tagId)
  if (idx >= 0) dpFilterTags.value.splice(idx, 1)
  else dpFilterTags.value.push(tagId)
  reloadDp()
}

async function reloadDp() {
  dpPage.value = 1; dpHasMore.value = true; dpLoading.value = true
  try {
    const d = (await hotChanjingApi.digitalPersons(1, 50, dpFilterTags.value)).data.data
    dpList.value = d?.list || []
    dpHasMore.value = (d?.list?.length || 0) >= 50
    _extractTags(dpList.value)
  } catch (e) { ElMessage.error('加载数字人失败: ' + (e.response?.data?.message || e.message)) }
  dpLoading.value = false
}

async function loadDpList() {
  if (dpList.value.length) return
  dpPage.value = 1; dpHasMore.value = true; dpFilterTags.value = []
  dpLoading.value = true
  try {
    const d = (await hotChanjingApi.digitalPersons(1, 50)).data.data
    dpList.value = d?.list || []
    dpHasMore.value = (d?.list?.length || 0) >= 50
    _extractTags(dpList.value)
  } catch (e) { ElMessage.error('加载数字人失败: ' + (e.response?.data?.message || e.message)) }
  dpLoading.value = false
}
async function loadMoreDp() {
  dpLoading.value = true; dpPage.value++
  try {
    const d = (await hotChanjingApi.digitalPersons(dpPage.value, 50, dpFilterTags.value)).data.data
    const more = d?.list || []
    dpList.value = [...dpList.value, ...more]
    dpHasMore.value = more.length >= 50
  } catch (e) { ElMessage.error('加载数字人失败: ' + (e.response?.data?.message || e.message)) }
  dpLoading.value = false
}
async function loadVoices() {
  if (voiceList.value.length) return
  voiceLoading.value = true
  try { const d = (await hotChanjingApi.voices(1, 100)).data.data; voiceList.value = d?.list || [] } catch (e) { ElMessage.error('加载音色失败: ' + (e.response?.data?.message || e.message)) }
  voiceLoading.value = false
}
async function loadFonts() {
  if (fontList.value.length) return
  fontLoading.value = true
  try { const d = (await hotChanjingApi.fonts()).data.data; fontList.value = Array.isArray(d) ? d : (d?.list || []) } catch (e) { ElMessage.error('加载字体失败: ' + (e.response?.data?.message || e.message)) }
  fontLoading.value = false
}
function selectPerson(p) {
  videoForm.person_id = p.id
  if (p.audio_man_id && !videoForm.audio_man_id) videoForm.audio_man_id = p.audio_man_id
  const firstFig = p.figures?.[0]
  if (firstFig) {
    videoForm.figure_type = firstFig.type
    videoForm.figure_width = firstFig.width || 0
    videoForm.figure_height = firstFig.height || 0
  }
  showDpDialog.value = false
}
function selectVoice(v) { videoForm.audio_man_id = v.id; showVoiceDialog.value = false }
function selectFont(f) { videoForm.font_id = f.id; showFontDialog.value = false }

async function doGenerateVideo() {
  if (!videoForm.contentId) return ElMessage.warning('请先从内容列表选择要生成视频的内容')
  generating.value = true
  videoStatus.value = 'generating'
  try {
    const params = {
      orientation: videoForm.orientation,
      video_mode: videoForm.mode,
      speed: videoForm.speed,
      person_id: videoForm.person_id,
      audio_man_id: videoForm.audio_man_id,
      pitch: videoForm.pitch,
      font_id: videoForm.font_id,
      figure_type: videoForm.figure_type,
      figure_width: videoForm.figure_width,
      figure_height: videoForm.figure_height,
    }
    await hotContentApi.generateVideo(videoForm.contentId, params)
    let attempts = 0
    while (attempts < 120) {
      await new Promise(r => setTimeout(r, 5000))
      const res = await hotContentApi.get(videoForm.contentId)
      const data = res.data.data
      if (data.video_status === 'done') {
        videoStatus.value = 'done'
        videoUrl.value = hotContentApi.videoUrl(videoForm.contentId, videoForm.orientation)
        ElMessage.success('视频生成完成')
        await loadContents()
        return
      }
      if (data.video_status === 'failed') {
        videoStatus.value = 'failed'
        videoError.value = data.error_message || '未知错误'
        await loadContents()
        return
      }
      attempts++
    }
    videoStatus.value = 'failed'
    videoError.value = '超时（10分钟）'
  } catch (e) {
    videoStatus.value = 'failed'
    videoError.value = e.response?.data?.message || '生成失败'
  } finally { generating.value = false }
}

// ─── Step 4: Publish ───
const publishForm = reactive({ platforms: [] })
const publishing = ref(false)
async function doPublish() {
  if (!publishForm.platforms.length) return ElMessage.warning('请选择发布平台')
  publishing.value = true
  try {
    await hotContentApi.publish(videoForm.contentId, { platforms: publishForm.platforms.join(',') })
    ElMessage.success('已发布')
    publishForm.platforms = []
    await loadContents()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '发布失败')
  } finally { publishing.value = false }
}

onMounted(loadContents)
</script>

<style scoped>
.step-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  padding: 16px 0;
  background: #fafafa;
  border-radius: 12px;
  gap: 0;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s;
  position: relative;
  user-select: none;
}
.step-item:hover {
  background: #ecf5ff;
}
.step-item.active {
  background: #ecf5ff;
}
.step-item.active .step-num {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}
.step-item.done .step-num {
  background: #67c23a;
  border-color: #67c23a;
  color: #fff;
}
.step-item.process .step-num {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}
.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #c0c4cc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #909399;
  background: #fff;
  flex-shrink: 0;
  transition: all 0.25s;
}
.step-info {
  line-height: 1.3;
}
.step-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.step-item:not(.active):not(.done):not(.process) .step-title {
  color: #909399;
}
.step-desc {
  font-size: 12px;
  color: #909399;
}
.step-arrow {
  color: #c0c4cc;
  font-size: 14px;
  margin-left: 4px;
}
.step-item:last-child .step-arrow {
  display: none;
}
.step-card {
  border-top: 3px solid #409eff;
}

/* ─── 蝉镜资源选择 ─── */
.pipe-sel {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: #f8f7ff; border-radius: 8px;
  border: 1px solid #ece8f8; max-width: 420px;
}
.pipe-sel-img { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; }
.pipe-sel-icon { width: 44px; height: 44px; border-radius: 6px; background: #f0ecfc; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.pipe-sel-info { flex: 1; min-width: 0; }
.pipe-sel-info strong { display: block; font-size: 14px; }
.pipe-sel-sub { font-size: 12px; color: #909399; }

.resource-grid { display: flex; flex-wrap: wrap; gap: 12px; max-height: 60vh; overflow-y: auto; }
.resource-card {
  width: 190px; border: 2px solid #ebeef5; border-radius: 10px; padding: 10px;
  cursor: pointer; position: relative; transition: all 0.2s; text-align: center;
}
.resource-card:hover { border-color: #409eff; box-shadow: 0 2px 12px rgba(64,158,255,0.1); }
.resource-card.selected { border-color: #409eff; background: #ecf5ff; }
.rc-img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; }
.rc-placeholder { width: 100%; height: 120px; border-radius: 6px; background: #f0ecfc; display: flex; align-items: center; justify-content: center; font-size: 48px; }
.voice-card .rc-placeholder { height: 80px; font-size: 36px; }
.rc-body { margin-top: 8px; text-align: left; }
.rc-name { font-weight: 600; font-size: 14px; }
.rc-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.rc-check { position: absolute; top: 8px; right: 8px; font-size: 22px; color: #409eff; }
</style>
