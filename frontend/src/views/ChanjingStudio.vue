<template>
  <div>
    <el-tabs v-model="tab" type="border-card">
      <!-- ① 文案提取 -->
      <el-tab-pane label="文案提取" name="extract">
        <el-card header="粘贴平台链接提取文案">
          <el-form :inline="true"><el-form-item><el-input v-model="extractUrl" placeholder="粘贴抖音/小红书/快手等链接" style="width:420px" @keyup.enter="doExtract"/></el-form-item><el-form-item><el-button type="primary" :loading="extracting" @click="doExtract">提取</el-button></el-form-item></el-form>
          <div v-if="extractResult" style="margin-top:12px;background:#f8f7ff;padding:16px;border-radius:8px">
            <div><strong>{{ extractResult.title }}</strong></div>
            <div style="color:#909399;font-size:12px;margin-top:4px">{{ extractResult.platform }} | {{ extractResult.tags }}</div>
            <div style="margin-top:8px;white-space:pre-wrap;max-height:200px;overflow-y:auto">{{ extractResult.body }}</div>
            <div style="margin-top:10px">
              <el-button size="small" type="primary" @click="useForVideo(extractResult)">送入智能成片</el-button>
              <el-button size="small" @click="useForRewrite(extractResult)">送去改写</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ② 文案创作 -->
      <el-tab-pane label="文案创作" name="rewrite">
        <el-card header="AI 文案创作">
          <el-form label-width="80px" style="max-width:600px">
            <el-form-item label="操作"><el-radio-group v-model="rewriteMode"><el-radio value="rewrite">AI 改写</el-radio><el-radio value="create">AI 原创</el-radio></el-radio-group></el-form-item>
            <el-form-item label="原文"><el-input v-model="rewriteForm.text" type="textarea" :rows="4" :placeholder="rewriteMode==='create' ? '输入主题/产品描述...' : '粘贴要改写的原文...'"/></el-form-item>
            <el-form-item label="要求"><el-input v-model="rewriteForm.prompt" type="textarea" :rows="2" placeholder="风格、语气、字数等要求（选填）"/></el-form-item>
            <el-form-item><el-button type="primary" :loading="rewriting" @click="doRewrite">生成</el-button></el-form-item>
          </el-form>
          <div v-if="rewriteResult" style="margin-top:12px;background:#f8f7ff;padding:16px;border-radius:8px">
            <div style="white-space:pre-wrap">{{ rewriteResult }}</div>
            <div style="margin-top:10px">
              <el-button size="small" type="primary" @click="rewriteToVideo">送入智能成片</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ③ 智能成片 -->
      <el-tab-pane label="智能成片" name="smartVideo">
        <el-card header="文字智能成片">
          <el-form label-width="90px" style="max-width:650px">
            <el-form-item label="文案"><el-input v-model="smartForm.text" type="textarea" :rows="5" placeholder="输入要生成视频的口播文案"/></el-form-item>
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="数字人"><el-select v-model="smartForm.personId" filterable placeholder="选择数字人" style="width:100%"><el-option v-for="p in dpList" :key="p.id" :label="p.name" :value="p.id"/></el-select></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="声音"><el-select v-model="smartForm.audioId" filterable placeholder="选择声音" style="width:100%"><el-option v-for="v in voiceList" :key="v.id" :label="`${v.name} (${v.gender||''})`" :value="v.id"/></el-select></el-form-item></el-col>
            </el-row>
            <el-row :gutter="12">
              <el-col :span="8"><el-form-item label="语速"><el-slider v-model="smartForm.speed" :min="0.5" :max="2" :step="0.1" show-input style="width:100%"/></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="音调"><el-slider v-model="smartForm.pitch" :min="0.5" :max="2" :step="0.1" show-input style="width:100%"/></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="画质"><el-select v-model="smartForm.model" style="width:100%"><el-option :value="0" label="基础版"/><el-option :value="1" label="高质版"/></el-select></el-form-item></el-col>
            </el-row>
            <el-form-item label="字幕"><el-switch v-model="smartForm.showSubtitle"/></el-form-item>
            <el-form-item><el-button type="primary" :loading="smartGenerating" @click="doSmartGenerate">生成视频</el-button></el-form-item>
          </el-form>
          <div v-if="smartTaskId" style="margin-top:12px;color:#409eff">任务ID: {{ smartTaskId }} | <el-button link type="primary" @click="checkSmartStatus">刷新状态</el-button></div>
        </el-card>
      </el-tab-pane>

      <!-- ④ 照片说话 -->
      <el-tab-pane label="照片说话" name="lipSync">
        <el-card header="对口型 / 照片说话">
          <el-form label-width="100px" style="max-width:650px">
            <el-form-item label="上传照片/视频">
              <el-upload :auto-upload="false" :limit="1" accept=".jpg,.jpeg,.png,.mp4,.mov,.webm" @change="onLipVideoChange">
                <el-button type="primary">选择文件</el-button>
                <template #tip><div style="color:#909399;font-size:12px;margin-top:4px">上传带人脸的照片或短视频（支持 JPG/PNG/MP4/MOV）</div></template>
              </el-upload>
              <div v-if="lipVideoFile" style="margin-top:8px;display:flex;align-items:center;gap:12px">
                <span style="color:#67c23a;font-size:13px">{{ lipVideoFile.name }}</span>
                <el-button size="small" :loading="lipUploading" @click="uploadLipFile('video')">上传到蝉镜</el-button>
              </div>
              <div v-if="lipVideoId" style="margin-top:4px;color:#409eff;font-size:12px">视频已上传, file_id: {{ lipVideoId }}</div>
              <div v-if="lipVideoPreview" style="margin-top:8px">
                <img v-if="lipVideoPreview.startsWith('data:image')" :src="lipVideoPreview" style="max-width:200px;max-height:200px;border-radius:8px"/>
              </div>
            </el-form-item>
            <el-form-item label="音频来源">
              <el-radio-group v-model="lipForm.audioType"><el-radio value="tts">TTS 文字合成</el-radio><el-radio value="audio">上传音频文件</el-radio></el-radio-group>
            </el-form-item>
            <template v-if="lipForm.audioType==='tts'">
              <el-form-item label="文案"><el-input v-model="lipForm.ttsText" type="textarea" :rows="3" placeholder="输入要让照片说的文案"/></el-form-item>
              <el-form-item label="声音"><el-select v-model="lipForm.audioId" filterable placeholder="选择声音" style="width:100%"><el-option v-for="v in voiceList" :key="v.id" :label="`${v.name} (${v.gender||''})`" :value="v.id"/></el-select></el-form-item>
            </template>
            <template v-else>
              <el-form-item label="上传音频">
                <el-upload :auto-upload="false" :limit="1" accept=".mp3,.wav,.m4a" @change="onLipAudioChange">
                  <el-button type="primary">选择音频</el-button>
                </el-upload>
                <div v-if="lipAudioFile" style="margin-top:8px;display:flex;align-items:center;gap:12px">
                  <span style="color:#67c23a;font-size:13px">{{ lipAudioFile.name }}</span>
                  <el-button size="small" :loading="lipUploading" @click="uploadLipFile('audio')">上传到蝉镜</el-button>
                </div>
                <div v-if="lipAudioId" style="margin-top:4px;color:#409eff;font-size:12px">音频已上传, file_id: {{ lipAudioId }}</div>
              </el-form-item>
            </template>
            <el-form-item>
              <el-button type="primary" :loading="lipGenerating" @click="doLipSync" :disabled="!lipVideoId || (lipForm.audioType==='tts'?!lipForm.ttsText||!lipForm.audioId:!lipAudioId)">开始生成</el-button>
            </el-form-item>
          </el-form>
          <div v-if="lipTaskId" style="margin-top:12px;color:#409eff">任务ID: {{ lipTaskId }} | <el-button link type="primary" @click="checkLipStatus">刷新状态</el-button></div>
        </el-card>
      </el-tab-pane>

      <!-- ⑤ 数字人库 -->
      <el-tab-pane label="数字人库" name="dpLib">
        <el-card>
          <template #header><div style="display:flex;align-items:center;gap:12px"><span>公共数字人</span><el-button size="small" @click="loadDpList">刷新</el-button></div></template>
          <div v-loading="dpLoading" style="display:flex;flex-wrap:wrap;gap:16px">
            <div v-for="p in dpList" :key="p.id" style="width:200px;border:1px solid #ebeef5;border-radius:8px;padding:12px;text-align:center">
              <div style="font-weight:600;margin-bottom:4px">{{ p.name }}</div>
              <div style="font-size:12px;color:#909399">{{ p.gender }} | {{ p.audio_name }}</div>
              <div v-if="p.figures && p.figures[0] && p.figures[0].cover" style="margin:8px 0"><img :src="p.figures[0].cover" style="width:100%;height:120px;object-fit:cover;border-radius:4px"/></div>
              <el-button size="small" type="primary" link @click="smartForm.personId=p.id;tab='smartVideo'">去成片</el-button>
            </div>
          </div>
          <el-empty v-if="!dpLoading && dpList.length===0" description="加载中..."/>
        </el-card>
        <el-card style="margin-top:16px" header="我的定制数字人">
          <el-table v-loading="customDpLoading" :data="customDpList" stripe border size="small">
            <el-table-column prop="name" label="名称" width="140"/>
            <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.status===1?'success':'warning'" size="small">{{ row.status===1?'已完成':'定制中' }}</el-tag></template></el-table-column>
            <el-table-column prop="progress" label="进度" width="80"><template #default="{row}">{{ row.progress }}%</template></el-table-column>
            <el-table-column prop="create_time" label="创建时间" width="170"><template #default="{row}">{{ fmtTime(row.create_time) }}</template></el-table-column>
          </el-table>
          <el-empty v-if="!customDpLoading && customDpList.length===0" description="暂无定制数字人"/>
        </el-card>
      </el-tab-pane>

      <!-- ⑥ 声音库 -->
      <el-tab-pane label="声音库" name="voiceLib">
        <el-card header="公共声音">
          <div v-loading="voiceLoading" style="display:flex;flex-wrap:wrap;gap:12px">
            <div v-for="v in voiceList" :key="v.id" style="width:220px;border:1px solid #ebeef5;border-radius:8px;padding:12px">
              <div style="font-weight:600">{{ v.name }}</div>
              <div style="font-size:12px;color:#909399">{{ v.gender }} | {{ v.lang }}</div>
              <div v-if="v.audition" style="margin-top:4px"><audio :src="v.audition" controls style="width:100%;height:28px"/></div>
              <el-button size="small" type="primary" link @click="smartForm.audioId=v.id;tab='smartVideo'">去成片</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ⑦ 批量生成 -->
      <el-tab-pane label="批量生成" name="batch">
        <el-card header="批量生成视频">
          <el-form label-width="90px" style="max-width:700px">
            <el-form-item label="文案列表">
              <div style="width:100%">
                <div v-for="(item, i) in batchItems" :key="i" style="margin-bottom:8px;display:flex;gap:8px;align-items:flex-start">
                  <span style="flex-shrink:0;width:28px;height:32px;display:flex;align-items:center;justify-content:center;background:#f0ecfc;border-radius:4px;font-size:13px;font-weight:600;color:#7c3aed">{{ i+1 }}</span>
                  <el-input v-model="item.text" type="textarea" :rows="2" placeholder="输入第{{ i+1 }}条文案..." style="flex:1"/>
                  <el-button v-if="batchItems.length>1" size="small" type="danger" circle :icon="Delete" @click="batchItems.splice(i,1)" style="flex-shrink:0"/>
                </div>
                <el-button size="small" type="primary" link @click="batchItems.push({text:''})">+ 添加一条文案</el-button>
                <div style="margin-top:4px;font-size:12px;color:#909399">共 {{ batchItems.filter(b=>b.text.trim()).length }} 条有效文案</div>
              </div>
            </el-form-item>
            <el-form-item label="数字人">
              <div v-if="batchSelectedPerson" class="selected-resource" style="max-width:400px">
                <img v-if="batchSelectedPerson.figures&&batchSelectedPerson.figures[0]&&batchSelectedPerson.figures[0].cover" :src="batchSelectedPerson.figures[0].cover" class="sr-img"/>
                <span v-else class="sr-icon">🤖</span>
                <div class="sr-info"><strong>{{ batchSelectedPerson.name }}</strong><span class="sr-sub">{{ batchSelectedPerson.gender }}</span></div>
                <el-button size="small" @click="showBatchDp=true">更换</el-button>
              </div>
              <el-button v-else type="primary" @click="showBatchDp=true">选择数字人</el-button>
            </el-form-item>
            <el-form-item label="音色">
              <div v-if="batchSelectedVoice" class="selected-resource" style="max-width:400px">
                <span class="sr-icon">🎙️</span>
                <div class="sr-info"><strong>{{ batchSelectedVoice.name }}</strong><span class="sr-sub">{{ batchSelectedVoice.gender }} · {{ batchSelectedVoice.lang }}</span></div>
                <el-button size="small" @click="showBatchVoice=true">更换</el-button>
              </div>
              <el-button v-else type="primary" @click="showBatchVoice=true">选择音色</el-button>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="batchGenerating" @click="doBatchGenerate" :disabled="!batchItems.filter(b=>b.text.trim()).length||!batchPersonId||!batchAudioId">批量提交 ({{ batchItems.filter(b=>b.text.trim()).length }} 条)</el-button>
              <el-button v-if="batchRunning" size="small" @click="refreshBatchStatus">刷新状态</el-button>
            </el-form-item>
          </el-form>
          <div v-if="batchResults.length" style="margin-top:16px">
            <div style="margin-bottom:8px;font-size:13px;color:#909399">完成 {{ batchResults.filter(r=>r.status===1).length }} / {{ batchResults.length }}</div>
            <el-table :data="batchResults" stripe border size="small" max-height="400">
              <el-table-column type="index" label="#" width="40"/>
              <el-table-column prop="text" label="文案" min-width="180" show-overflow-tooltip/>
              <el-table-column label="状态" width="100"><template #default="{row}"><el-tag v-if="row.status===1" type="success" size="small">已完成</el-tag><el-tag v-else-if="row.status===-1" type="danger" size="small">失败</el-tag><el-tag v-else type="warning" size="small">{{ row.queue_status || '排队中' }}</el-tag></template></el-table-column>
              <el-table-column prop="task_id" label="任务ID" width="260" show-overflow-tooltip/>
              <el-table-column label="操作" width="80"><template #default="{row}"><el-button v-if="row.status===1" size="small" type="primary" link @click="downloadBatchVideo(row)">下载</el-button></template></el-table-column>
            </el-table>
          </div>
        </el-card>

        <!-- 批量-数字人弹窗 -->
        <el-dialog v-model="showBatchDp" title="选择数字人" width="700px" top="5vh">
          <div class="resource-grid"><div v-for="p in dpList" :key="p.id" class="resource-card" :class="{selected:batchPersonId===p.id}" @click="selectBatchPerson(p)"><img v-if="p.figures&&p.figures[0]&&p.figures[0].cover" :src="p.figures[0].cover" class="rc-img"/><div v-else class="rc-placeholder">🤖</div><div class="rc-body"><div class="rc-name">{{ p.name }}</div><div class="rc-meta">{{ p.gender }}</div></div><el-icon v-if="batchPersonId===p.id" class="rc-check"><CircleCheckFilled /></el-icon></div></div>
        </el-dialog>

        <!-- 批量-音色弹窗 -->
        <el-dialog v-model="showBatchVoice" title="选择音色" width="700px" top="5vh">
          <div class="resource-grid voice-grid"><div v-for="v in voiceList" :key="v.id" class="resource-card voice-card" :class="{selected:batchAudioId===v.id}" @click="selectBatchVoice(v)"><div class="rc-placeholder voice-icon">🎙️</div><div class="rc-body"><div class="rc-name">{{ v.name }}</div><div class="rc-meta">{{ v.gender }} · {{ v.lang }} {{ v.grade?'⭐'.repeat(Math.min(v.grade,5)):'' }}</div><audio v-if="v.audition" :src="v.audition" controls style="width:100%;height:28px;margin-top:4px" @click.stop/></div><el-icon v-if="batchAudioId===v.id" class="rc-check"><CircleCheckFilled /></el-icon></div></div>
        </el-dialog>
      </el-tab-pane>

      <!-- ⑧ 我的视频 -->
      <el-tab-pane label="我的视频" name="myVideos">
        <el-card header="视频列表">
          <div class="tb"><el-button size="small" @click="loadMyVideos" :loading="myVideosLoading">刷新</el-button><el-button size="small" type="success" @click="loadUserInfo">用户信息</el-button></div>
          <div v-if="userInfo" style="margin-bottom:12px;font-size:13px;color:#909399">剩余蝉豆: <strong>{{ userInfo.remain_bean }}</strong> | 视频时长: {{ userInfo.video_seconds }}s</div>
          <el-table v-loading="myVideosLoading" :data="myVideos" stripe border size="small">
            <el-table-column prop="id" label="视频ID" width="260" show-overflow-tooltip/>
            <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status===1?'success':row.status===-1?'danger':'warning'" size="small">{{ statusLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column prop="duration" label="时长(s)" width="80"/>
            <el-table-column label="预览" width="80"><template #default="{row}"><el-button v-if="row.preview_url" size="small" link type="primary" @click="previewVideo(row)">预览</el-button></template></el-table-column>
            <el-table-column label="操作" width="120"><template #default="{row}"><el-button v-if="row.video_url" size="small" type="primary" link @click="downloadCjVideo(row)">下载</el-button><el-popconfirm title="确认删除?" @confirm="doDeleteVideo(row.id)"><template #reference><el-button size="small" type="danger" link>删除</el-button></template></el-popconfirm></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, CircleCheckFilled, Search } from '@element-plus/icons-vue'
import { hotChanjingApi, hotExtractApi } from '../api/hot-video'

const tab = ref('extract')

// ─── ① 文案提取 ───
const extractUrl = ref(''), extracting = ref(false), extractResult = ref(null)
async function doExtract() {
  if (!extractUrl.value) return ElMessage.warning('请输入URL')
  extracting.value = true
  try { extractResult.value = (await hotExtractApi.extract(extractUrl.value)).data.data; ElMessage.success('提取成功') }
  catch (e) { ElMessage.error(e.response?.data?.message || '提取失败') }
  finally { extracting.value = false }
}
function useForVideo(r) { smartForm.text = `${r.title || ''}\n\n${r.body || ''}`; tab.value = 'smartVideo' }
function useForRewrite(r) { rewriteForm.text = r.body || ''; rewriteForm.source_title = r.title || ''; rewriteForm.source_tags = r.tags || ''; tab.value = 'rewrite' }

// ─── ② 文案创作 ───
const rewriteMode = ref('rewrite'), rewriting = ref(false), rewriteResult = ref('')
const rewriteForm = reactive({ text: '', prompt: '', source_title: '', source_tags: '' })
async function doRewrite() {
  if (!rewriteForm.text) return ElMessage.warning('请输入文案')
  rewriting.value = true
  try {
    const res = await hotExtractApi.rewrite({
      source_title: rewriteForm.source_title || (rewriteMode.value==='create'?rewriteForm.text.slice(0,30):''),
      source_body: rewriteForm.text, source_tags: rewriteForm.source_tags,
      source_platform: 'other', user_prompt: rewriteForm.prompt
    })
    const d = res.data.data
    rewriteResult.value = rewriteMode.value==='create' ? (d.body || d.title) : `${d.title}\n\n${d.body}`
    ElMessage.success('生成完成')
  } catch (e) { ElMessage.error(e.response?.data?.message || '生成失败') }
  finally { rewriting.value = false }
}
function rewriteToVideo() { smartForm.text = rewriteResult.value; tab.value = 'smartVideo' }

// ─── ③ 智能成片 ───
const smartForm = reactive({ text: '', personId: '', audioId: '', speed: 1.0, pitch: 1.0, model: 0, showSubtitle: true })
const smartGenerating = ref(false), smartTaskId = ref('')
async function doSmartGenerate() {
  if (!smartForm.text || !smartForm.personId || !smartForm.audioId) return ElMessage.warning('文案/数字人/声音 必填')
  smartGenerating.value = true
  try {
    const params = {
      screen_height: 1920, screen_width: 1080, resolution_rate: 0,
      person: { id: smartForm.personId, figure_type: 'avatar', height: 0, width: 0, x: 0, y: 0 },
      audio: { type: 'tts', tts: { audio_man: smartForm.audioId, speed: smartForm.speed, pitch: smartForm.pitch, text: [smartForm.text] }, volume: 100 },
      subtitle_config: { show: smartForm.showSubtitle, font_size: 36, x: 0, y: 0, width: 1080, height: 240, color: '#E8954C', stroke_color: '#080F1A', stroke_width: 2.0, asr_type: 0 },
      model: smartForm.model,
    }
    smartTaskId.value = (await hotChanjingApi.createVideo(params)).data.data
    ElMessage.success(`任务已提交: ${smartTaskId.value}`)
  } catch (e) { ElMessage.error(e.response?.data?.message || '提交失败') }
  finally { smartGenerating.value = false }
}
async function checkSmartStatus() {
  if (!smartTaskId.value) return
  try { const d = (await hotChanjingApi.getVideo(smartTaskId.value)).data.data; ElMessage.success(`状态: ${d.queue_status || d.status}`) }
  catch (e) { ElMessage.error('查询失败') }
}

// ─── ④ 照片说话 ───
const lipForm = reactive({ audioType: 'tts', ttsText: '', audioId: '' })
const lipGenerating = ref(false), lipTaskId = ref(''), lipUploading = ref(false)
const lipVideoFile = ref(null), lipVideoId = ref(''), lipVideoPreview = ref('')
const lipAudioFile = ref(null), lipAudioId = ref('')

function onLipVideoChange(file) {
  lipVideoFile.value = file?.raw || file; lipVideoId.value = ''
  if (lipVideoFile.value && lipVideoFile.value.type.startsWith('image/')) {
    const reader = new FileReader(); reader.onload = e => { lipVideoPreview.value = e.target.result }; reader.readAsDataURL(lipVideoFile.value)
  } else { lipVideoPreview.value = '' }
}
function onLipAudioChange(file) { lipAudioFile.value = file?.raw || file; lipAudioId.value = '' }
async function uploadLipFile(type) {
  const file = type === 'video' ? lipVideoFile.value : lipAudioFile.value
  if (!file) return ElMessage.warning('请先选择文件')
  lipUploading.value = true
  try {
    const service = type === 'video' ? 'lip_sync_video' : 'lip_sync_audio'
    // 1. Get upload URL from Chanjing
    const res = await hotChanjingApi.getUploadUrl(service, file.name)
    const upData = res.data.data
    // Response: sign_url + file_id + key + headers
    const uploadUrl = upData.sign_url || upData.upload_url || upData.url || ''
    const fileId = upData.file_id || upData.id || ''
    const mimeType = upData.mime_type || file.type || 'application/octet-stream'
    if (!uploadUrl || !fileId) { ElMessage.error('获取上传链接失败，响应: ' + JSON.stringify(upData).slice(0,200)); return }
    // 2. Upload to OSS with correct mime type from signed URL
    const putResp = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } })
    if (!putResp.ok) { ElMessage.error(`上传失败: HTTP ${putResp.status}`); return }
    if (type === 'video') lipVideoId.value = fileId
    else lipAudioId.value = fileId
    ElMessage.success(`${type==='video'?'照片/视频':'音频'}上传成功, file_id: ${fileId}`)
  } catch (e) { ElMessage.error('上传失败: ' + (e.message || '未知错误')) }
  finally { lipUploading.value = false }
}
async function doLipSync() {
  if (!lipVideoId.value) return ElMessage.warning('请先上传照片/视频')
  if (lipForm.audioType === 'tts' && (!lipForm.ttsText || !lipForm.audioId)) return ElMessage.warning('请输入文案并选择声音')
  if (lipForm.audioType === 'audio' && !lipAudioId.value) return ElMessage.warning('请先上传音频')
  lipGenerating.value = true
  try {
    const params = { video_file_id: lipVideoId.value, model: 0, screen_width: 1080, screen_height: 1920 }
    if (lipForm.audioType === 'tts') {
      params.audio_type = 'tts'; params.tts_config = { audio_man_id: lipForm.audioId, speed: 1.0, pitch: 1.0, text: [lipForm.ttsText] }
    } else {
      params.audio_type = 'audio'; params.audio_file_id = lipAudioId.value
    }
    lipTaskId.value = (await hotChanjingApi.createLipSync(params)).data.data
    ElMessage.success(`任务已提交: ${lipTaskId.value}`)
  } catch (e) { ElMessage.error(e.response?.data?.message || '提交失败') }
  finally { lipGenerating.value = false }
}
async function checkLipStatus() {
  if (!lipTaskId.value) return
  try { const d = (await hotChanjingApi.getLipSync(lipTaskId.value)).data.data; ElMessage.success(`状态: ${d.status===1?'已完成':d.status===-1?'失败':'处理中'} (${d.progress||0}%)`) }
  catch (e) { ElMessage.error('查询失败') }
}

// ─── ⑤ 数字人库 ───
const dpList = ref([]), dpLoading = ref(false)
const customDpList = ref([]), customDpLoading = ref(false)
async function loadDpList() {
  dpLoading.value = true
  try { const d = (await hotChanjingApi.digitalPersons(1, 200)).data.data; dpList.value = d?.list || [] }
  catch {}
  dpLoading.value = false
}
async function loadCustomDp() {
  customDpLoading.value = true
  try { const d = (await hotChanjingApi.listCustomPersons(1, 50)).data.data; customDpList.value = d?.list || [] }
  catch {}
  customDpLoading.value = false
}

// ─── ⑥ 声音库 ───
const voiceList = ref([]), voiceLoading = ref(false)
async function loadVoices() {
  voiceLoading.value = true
  try { const d = (await hotChanjingApi.voices(1, 100)).data.data; voiceList.value = d?.list || [] }
  catch {}
  voiceLoading.value = false
}

// ─── ⑦ 批量生成 ───
const batchItems = reactive([{ text: '' }]), batchPersonId = ref(''), batchAudioId = ref('')
const batchGenerating = ref(false), batchResults = ref([]), batchRunning = ref(false)
const showBatchDp = ref(false), showBatchVoice = ref(false)

const batchSelectedPerson = computed(() => dpList.value.find(p => p.id === batchPersonId.value))
const batchSelectedVoice = computed(() => voiceList.value.find(v => v.id === batchAudioId.value))

function selectBatchPerson(p) {
  batchPersonId.value = p.id
  if (p.audio_man_id && !batchAudioId.value) batchAudioId.value = p.audio_man_id
  showBatchDp.value = false
}
function selectBatchVoice(v) { batchAudioId.value = v.id; showBatchVoice.value = false }

async function doBatchGenerate() {
  const items = batchItems.filter(b => b.text.trim())
  if (!items.length) return ElMessage.warning('请输入至少一条文案')
  if (!batchPersonId.value || !batchAudioId.value) return ElMessage.warning('请选择数字人和声音')
  batchGenerating.value = true; batchResults.value = []; batchRunning.value = true
  const person = dpList.value.find(p => p.id === batchPersonId.value)
  const f = (person?.figures && person.figures[0]) ? person.figures[0] : {}
  for (const item of items) {
    try {
      const params = {
        screen_height: 1920, screen_width: 1080, resolution_rate: 0,
        person: { id: batchPersonId.value, figure_type: f.type || 'avatar', height: f.height || 1080, width: f.width || 1080, x: 0, y: 0 },
        audio: { type: 'tts', tts: { audio_man: batchAudioId.value, speed: 1.0, pitch: 1.0, text: [item.text.trim()] }, volume: 100 },
        subtitle_config: { show: true, font_size: 36, x: 0, y: 1680, width: 1080, height: 240, color: '#E8954C', stroke_color: '#080F1A', stroke_width: 2.0, asr_type: 0 },
        model: 0,
      }
      const taskId = (await hotChanjingApi.createVideo(params)).data.data
      batchResults.value.push({ text: item.text.trim().slice(0, 60), task_id: taskId, status: 0, queue_status: 'queued' })
    } catch (e) {
      batchResults.value.push({ text: item.text.trim().slice(0, 60), task_id: '', status: -1, queue_status: e.response?.data?.message || e.message })
    }
  }
  batchGenerating.value = false
  ElMessage.success(`提交完成: ${batchResults.value.length} 条，可在「我的视频」查看进度`)
}

async function refreshBatchStatus() {
  for (const r of batchResults.value) {
    if (r.status === 1 || r.status === -1 || !r.task_id) continue
    try {
      const d = (await hotChanjingApi.getVideo(r.task_id)).data.data
      r.status = d.status
      r.queue_status = d.queue_status || d.queue_desc
      r.preview_url = d.preview_url
      r.video_url = d.video_url
    } catch {}
  }
}
function downloadBatchVideo(row) {
  const url = row.video_url || row.preview_url
  if (url) window.open(url, '_blank')
}

// ─── ⑧ 我的视频 ───
const myVideos = ref([]), myVideosLoading = ref(false)
const userInfo = ref(null)
async function loadMyVideos() {
  myVideosLoading.value = true
  try { const d = (await hotChanjingApi.listVideos(1, 50)).data.data; myVideos.value = d?.list || [] }
  catch {}
  myVideosLoading.value = false
}
async function loadUserInfo() {
  try {
    const info = (await hotChanjingApi.getUserInfo()).data.data
    const dur = (await hotChanjingApi.getUserDuration()).data.data
    userInfo.value = { ...info, remain_bean: dur?.resi_total_bean || 0, video_seconds: info?.video_create_seconds || 0 }
  } catch {}
}
function statusLabel(row) {
  if (row.status === 1) return '已完成'
  if (row.status === -1 || row.status === 40) return '失败'
  return row.queue_desc || row.queue_status || '处理中'
}
function previewVideo(row) { window.open(row.preview_url || row.video_url, '_blank') }
function downloadCjVideo(row) {
  const url = `/api/hot-chanjing/videos/${row.id}/download`
  window.open(url, '_blank')
}
async function doDeleteVideo(id) {
  try { await hotChanjingApi.deleteVideo(id); await loadMyVideos(); ElMessage.success('已删除') }
  catch (e) { ElMessage.error('删除失败') }
}

function fmtTime(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return d.toLocaleString('zh-CN') }

onMounted(() => { loadDpList(); loadCustomDp(); loadVoices() })
</script>

<style scoped>
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }

/* Platform chips */
.platform-chip { display:flex;align-items:center;gap:6px;padding:8px 16px;border:2px solid #ebeef5;border-radius:10px;cursor:pointer;transition:all 0.2s;user-select:none;font-size:14px;font-weight:500; }
.platform-chip:hover { border-color:#409eff;background:#ecf5ff; }
.platform-chip.active { border-color:#409eff;background:#ecf5ff;color:#409eff; }

/* Selected resource pill */
.selected-resource { display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8f7ff;border-radius:8px;border:1px solid #ece8f8; }
.selected-resource .sr-img { width:44px;height:44px;border-radius:6px;object-fit:cover; }
.selected-resource .sr-icon { width:44px;height:44px;border-radius:6px;background:#f0ecfc;display:flex;align-items:center;justify-content:center;font-size:20px; }
.selected-resource .sr-info { flex:1;min-width:0; }
.selected-resource .sr-info strong { display:block;font-size:14px; }
.selected-resource .sr-sub { font-size:12px;color:#909399; }

/* Resource grid & cards */
.resource-grid { display:flex;flex-wrap:wrap;gap:12px;max-height:60vh;overflow-y:auto; }
.resource-card { width:190px;border:2px solid #ebeef5;border-radius:10px;padding:10px;cursor:pointer;position:relative;transition:all 0.2s;text-align:center; }
.resource-card:hover { border-color:#409eff;box-shadow:0 2px 12px rgba(64,158,255,0.1); }
.resource-card.selected { border-color:#409eff;background:#ecf5ff; }
.rc-img { width:100%;height:160px;object-fit:cover;border-radius:6px; }
.rc-placeholder { width:100%;height:120px;border-radius:6px;background:#f0ecfc;display:flex;align-items:center;justify-content:center;font-size:48px; }
.voice-card .rc-placeholder { height:80px;font-size:36px; }
.rc-body { margin-top:8px;text-align:left; }
.rc-name { font-weight:600;font-size:14px; }
.rc-meta { font-size:12px;color:#909399;margin-top:2px; }
.rc-check { position:absolute;top:8px;right:8px;font-size:22px;color:#409eff; }
</style>
