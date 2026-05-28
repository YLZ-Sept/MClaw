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
      <el-card header="编辑内容 & 上传素材" class="step-card">
        <el-form :model="editForm" label-width="90px" style="max-width:700px">
          <el-form-item label="标题"><el-input v-model="editForm.title"/></el-form-item>
          <el-form-item label="正文"><el-input v-model="editForm.body" type="textarea" :rows="6"/></el-form-item>
          <el-form-item label="标签"><el-input v-model="editForm.tags" placeholder="逗号分隔"/></el-form-item>
          <el-form-item label="BGM">
            <el-upload :auto-upload="false" :limit="1" accept=".mp3,.wav,.m4a" @change="onBgmChange">
              <el-button size="small">选择音频</el-button>
            </el-upload>
            <span v-if="bgmFile" style="color:#67c23a;font-size:12px">{{ bgmFile.name }}</span>
          </el-form-item>
          <el-form-item label="背景图">
            <el-upload :auto-upload="false" :limit="1" accept=".jpg,.jpeg,.png" @change="onBgImgChange">
              <el-button size="small">选择图片</el-button>
            </el-upload>
            <span v-if="bgImgFile" style="color:#67c23a;font-size:12px">{{ bgImgFile.name }}</span>
          </el-form-item>
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
              <el-option label="标准 HUD 字幕 (FFmpeg)" value="standard"/>
              <el-option label="Inference.sh FLUX+Wan" value="inference"/>
              <el-option label="可灵 Kling AI" value="kling"/>
              <el-option label="蝉镜数字人" value="chanjing"/>
              <el-option label="AI 图片序列" value="image_sequence"/>
              <el-option label="HyperFrames 动态视频" value="hyperframes"/>
            </el-select>
          </el-form-item>
          <el-form-item label="画面方向">
            <el-radio-group v-model="videoForm.orientation"><el-radio label="portrait">竖屏 9:16</el-radio><el-radio label="landscape">横屏 16:9</el-radio></el-radio-group>
          </el-form-item>
          <el-form-item label="语音"><el-input v-model="videoForm.voice" placeholder="zh-CN-YunxiNeural"/></el-form-item>
          <el-form-item label="语速"><el-slider v-model="videoForm.speed" :min="0.5" :max="2.0" :step="0.1" show-input style="width:300px"/></el-form-item>

          <template v-if="videoForm.mode==='chanjing'">
            <el-form-item label="数字人ID"><el-input v-model="videoForm.person_id"/></el-form-item>
            <el-form-item label="音色ID"><el-input v-model="videoForm.audio_man_id"/></el-form-item>
            <el-form-item label="音调"><el-slider v-model="videoForm.pitch" :min="0.5" :max="2.0" :step="0.1" show-input style="width:300px"/></el-form-item>
            <el-form-item label="字体ID"><el-input v-model="videoForm.font_id" placeholder="可选"/></el-form-item>
            <el-form-item label="数字人类型"><el-input v-model="videoForm.figure_type" placeholder="如: avatar"/></el-form-item>
            <el-form-item label="数字人尺寸"><el-input-number v-model="videoForm.figure_width" :min="0"/> x <el-input-number v-model="videoForm.figure_height" :min="0"/></el-form-item>
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
import { Check, ArrowRight } from '@element-plus/icons-vue'
import { hotContentApi, hotExtractApi } from '../../api/hot-video'
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
const bgmFile = ref(null), bgImgFile = ref(null)
const saving = ref(false), savedContent = ref(null)
function onBgmChange(file) { bgmFile.value = file?.raw || file }
function onBgImgChange(file) { bgImgFile.value = file?.raw || file }
async function doSaveContent() {
  if (!editForm.title || !editForm.body) return ElMessage.warning('标题和正文必填')
  saving.value = true
  try {
    const res = await hotContentApi.create({ title: editForm.title, body: editForm.body, tags: editForm.tags })
    savedContent.value = res.data.data
    const id = savedContent.value.id
    if (bgmFile.value || bgImgFile.value) {
      const fd = new FormData()
      if (bgmFile.value) fd.append('bgm', bgmFile.value)
      if (bgImgFile.value) fd.append('bg_image', bgImgFile.value)
      await hotContentApi.uploadAssets(id, fd)
    }
    ElMessage.success('已保存为草稿')
    bgmFile.value = null; bgImgFile.value = null
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
const videoForm = reactive({ contentId: '', title: '', mode: 'standard', orientation: 'portrait', voice: 'zh-CN-YunxiNeural', speed: 1.0, person_id: '', audio_man_id: '', pitch: 1.0, font_id: '', figure_type: '', figure_width: 0, figure_height: 0 })
const generating = ref(false), videoStatus = ref(null), videoError = ref(''), videoUrl = ref('')

async function doGenerateVideo() {
  if (!videoForm.contentId) return ElMessage.warning('请先从内容列表选择要生成视频的内容')
  generating.value = true
  videoStatus.value = 'generating'
  try {
    const params = {
      orientation: videoForm.orientation,
      video_mode: videoForm.mode,
      voice: videoForm.voice,
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
</style>
