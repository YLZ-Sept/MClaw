<template>
  <div>
    <!-- Header -->
    <div class="page-hd">
      <div>
        <span class="page-title">一键追爆款</span>
        <span class="page-sub">内容提取 · AI改写 · 视频生成 · 抖音发布</span>
      </div>
    </div>

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
          <el-button type="primary" @click="step=1;rewriteForm.source_title=extractResult.title;rewriteForm.source_body=extractResult.body;rewriteForm.source_tags=extractResult.tags;rewriteForm.source_url=extractResult.source_url;rewriteForm.source_platform=extractResult.platform;rewriteForm.user_prompt='';rewriteResult=null">下一步：AI改写</el-button>
        </div>
      </el-card>

      <el-card style="margin-top:16px" header="全部内容">
        <HistoryTable :data="contentList" :step="0" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent" @retry-video="retryVideo"/>
      </el-card>
    </div>

    <!-- === Step 1: Rewrite === -->
    <div v-show="step === 1">
      <el-card header="AI改写" class="step-card" style="max-width:700px">
        <el-form label-width="90px">
          <el-form-item label="原标题">
            <el-input v-model="rewriteForm.source_title" placeholder="选填：原内容的标题"/>
          </el-form-item>
          <el-form-item label="原文">
            <el-input v-model="rewriteForm.source_body" type="textarea" :rows="5" placeholder="粘贴原始文案，或从Step 0提取后自动填充"/>
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="rewriteForm.source_tags" placeholder="选填：原内容的标签，逗号分隔"/>
          </el-form-item>
          <el-form-item label="改写要求">
            <el-input v-model="rewriteForm.user_prompt" type="textarea" :rows="2" placeholder="选填：描述改写风格、语气、目标平台等要求"/>
          </el-form-item>
          <el-form-item>
            <el-button @click="step=0">上一步</el-button>
            <el-button type="primary" :loading="rewriting" @click="doRewrite">开始改写</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="rewriteResult" style="margin-top:16px;max-width:700px" header="改写结果">
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
        <HistoryTable :data="rewriteHistory" :step="1" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent" @retry-video="retryVideo"/>
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
        <HistoryTable :data="editHistory" :step="2" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent" @retry-video="retryVideo"/>
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

          <!-- 蝉镜模式：数字人 + 音色 + 音调 + 字体 -->
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
        <HistoryTable :data="videoHistory" :step="3" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent" @view-video="viewHistoryVideo" @download-video="downloadHistoryVideo"/>
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
      <!-- 多平台账号状态卡片 -->
      <el-alert v-if="publishHealth !== 'healthy'" :title="publishHealth === 'unreachable' ? '发布服务未连接' : '服务状态未知'"
        :type="publishHealth === 'unreachable' ? 'error' : 'warning'" :closable="false" show-icon style="margin-bottom:12px"/>
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <el-card v-for="p in PLATFORMS" :key="p.key" shadow="hover" style="flex:1;min-width:240px">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span><span style="font-size:18px;margin-right:6px">{{ p.icon }}</span><b>{{ p.label }}</b></span>
              <el-button size="small" text type="primary" @click="addAccount(p.key)">+ 添加账号</el-button>
            </div>
          </template>
          <div v-for="acc in platformAccounts[p.key]" :key="acc.id" style="display:flex;align-items:center;gap:8px;margin-bottom:8px"
            :style="{ paddingBottom: '8px', borderBottom: platformAccounts[p.key].length > 1 ? '1px solid #ebeef5' : 'none' }">
            <el-checkbox v-model="publishTargets" :value="acc.id" :disabled="!acc.status?.is_logged_in" />
            <template v-if="acc.checking">
              <el-tag type="info" size="small">检查中...</el-tag>
            </template>
            <template v-else-if="acc.status?.is_logged_in">
              <el-tag type="success" size="small">✓ {{ acc.accountName }}</el-tag>
            </template>
            <template v-else>
              <el-input v-model="acc.accountName" placeholder="账号名" size="small" style="width:90px" clearable />
              <el-button size="small" type="primary" :loading="acc.loggingIn" @click="doLogin(p.key, acc)">
                {{ acc.loggingIn ? '扫码中...' : '登录' }}
              </el-button>
              <el-button v-if="platformAccounts[p.key].length > 1" size="small" text type="danger" @click="removeAccount(p.key, acc.id)" style="margin-left:auto">×</el-button>
            </template>
          </div>
        </el-card>
      </div>

      <div class="douyin-publish-layout">
        <!-- 左：作品描述 -->
        <div class="publish-main">
          <el-card shadow="hover" class="publish-card">
            <template #header><div class="card-header-title">📝 作品描述</div></template>
            <div class="form-block">
              <div class="form-label">作品标题 <span class="char-count">{{ (publishForm.title || videoForm.title || '').length }}/55</span></div>
              <el-input v-model="publishForm.title" :placeholder="videoForm.title || '请输入作品标题'" maxlength="55" size="large"/>
            </div>
            <div class="form-block">
              <div class="form-label">作品介绍</div>
              <el-input v-model="publishForm.description" type="textarea" :rows="4" placeholder="添加作品介绍，让观众更了解你的内容" maxlength="1000" show-word-limit/>
            </div>
            <div class="form-block">
              <div class="form-label"># 添加话题</div>
              <div class="tag-input-wrap" @click="focusTagInput">
                <el-tag v-for="(t,i) in publishForm.tagList" :key="i" closable size="large" round
                  @close="publishForm.tagList.splice(i,1)" style="margin-right:6px;margin-bottom:4px">
                  #{{ t }}
                </el-tag>
                <el-input v-model="tagInputText" ref="tagInputRef" size="large" placeholder="输入话题后回车添加"
                  @keyup.enter="addTag" @keydown.delete="tryRemoveLastTag" style="flex:1;min-width:120px"
                  class="tag-plain-input"/>
              </div>
            </div>
          </el-card>

          <!-- 设置封面 -->
          <el-card shadow="hover" class="publish-card" style="margin-top:16px">
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span class="card-header-title">🖼️ 设置封面</span>
                <el-radio-group v-model="coverOrientation" size="small" @change="generateCover">
                  <el-radio-button label="portrait">竖 3:4</el-radio-button>
                  <el-radio-button label="landscape">横 4:3</el-radio-button>
                </el-radio-group>
              </div>
            </template>
            <div v-if="!coverUrl" style="padding:40px 0;text-align:center;color:#999">
              <el-button type="primary" :loading="coverLoading" @click="generateCover">提取视频封面</el-button>
              <div style="margin-top:8px;font-size:12px;color:#bbb">自动从视频中智能选取最佳帧</div>
            </div>
            <div v-else class="cover-section">
              <div class="cover-preview">
                <img :src="coverUrl" :class="coverOrientation==='landscape'?'cover-img-landscape':'cover-img'"/>
                <div class="cover-actions">
                  <el-button size="small" :loading="coverLoading" @click="generateCover">重新提取</el-button>
                  <el-button size="small" text @click="coverUrl=''">移除</el-button>
                </div>
              </div>
              <div class="cover-samples" v-if="coverSamples.length">
                <div class="form-label" style="margin-top:0">智能推荐封面</div>
                <div class="sample-grid">
                  <div v-for="(s,i) in coverSamples" :key="i" class="sample-item"
                    :class="{active: s===coverUrl}" @click="pickCover(s)">
                    <img :src="s" :class="coverOrientation==='landscape'?'sample-img-landscape':''"/>
                    <span class="sample-time">{{ coverTimes[i] }}s</span>
                  </div>
                </div>
              </div>
            </div>
          </el-card>

          <!-- 发布按钮 -->
          <div class="publish-actions">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <el-switch v-model="publishForm.scheduled" active-text="定时发布" inactive-text="立即发布" size="large"/>
              <el-date-picker v-if="publishForm.scheduled" v-model="publishForm.publishDate"
                type="datetime" placeholder="选择发布时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm"/>
            </div>
            <div style="display:flex;gap:12px">
              <el-button @click="step=3" size="large">上一步</el-button>
              <el-button type="primary" size="large" :loading="publishing" @click="doPublish"
                :disabled="!publishTargets.length || !publishTargets.some(id => getAccountById(id)?.acc?.status?.is_logged_in)">
                {{ publishForm.scheduled ? '定时发布' : '发布' }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- 右：发布预览 -->
        <div class="publish-sidebar">
          <el-card shadow="hover">
            <template #header><div class="card-header-title">📱 发布预览</div></template>
            <div class="preview-card">
              <div v-if="coverUrl" :class="coverOrientation==='landscape'?'preview-cover-landscape':'preview-cover'">
                <img :src="coverUrl"/>
              </div>
              <div v-else :class="coverOrientation==='landscape'?'preview-cover-landscape preview-cover-placeholder':'preview-cover preview-cover-placeholder'">
                <el-icon :size="36"><VideoCamera /></el-icon>
                <span>未设置封面</span>
              </div>
              <div class="preview-body">
                <div class="preview-title">{{ publishForm.title || videoForm.title || '作品标题' }}</div>
                <div class="preview-desc">{{ publishForm.description || '(无介绍)' }}</div>
                <div class="preview-tags">
                  <span v-for="(t,i) in publishForm.tagList" :key="i" class="preview-tag">#{{ t }}</span>
                  <span v-if="!publishForm.tagList.length" style="color:#bbb">#未添加话题</span>
                </div>
              </div>
            </div>
          </el-card>
        </div>
      </div>

      <el-card style="margin-top:16px" header="已发布内容">
        <HistoryTable :data="publishHistory" :step="4" @go-step="goStep" @go-video="goToVideo" @publish="publishContent" @approve="approveContent" @reject="rejectContent" @delete="deleteContent" @retry-video="retryVideo" @republish="republishContent" @view-publish="viewPublishContent"/>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, ArrowRight, CircleCheckFilled, VideoCamera } from '@element-plus/icons-vue'
import { hotContentApi, hotExtractApi, hotChanjingApi, publishApi } from '../../api/hot-video'
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
  // 当前步骤始终高亮，不显示 done
  if (i === step.value) return 'process'
  // 未来步骤灰色
  if (i > step.value) return 'wait'
  // 已过去的步骤：有成果则显示 done
  const list = contentList.value
  switch (i) {
    case 0: return list.length > 0 ? 'done' : 'process'
    case 1: return list.length > 0 ? 'done' : 'process'
    case 2: return list.some(c => c.status === 'draft' || c.status === 'approved' || c.status === 'published') ? 'done' : 'process'
    case 3: return list.some(c => c.video_status === 'done') ? 'done' : 'process'
    case 4: return list.some(c => c.status === 'published') ? 'done' : 'process'
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
  // 跳转到 Step 4 进行抖音发布预览
  videoForm.contentId = row.id
  videoForm.title = row.title || ''
  if (row.video_url_landscape) videoForm.orientation = 'landscape'
  else if (row.video_url) videoForm.orientation = 'portrait'
  publishForm.title = row.title || ''
  publishForm.description = row.body || ''
  publishForm.tagList = row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  publishForm.scheduled = false
  publishForm.publishDate = null
  publishForm.location = ''
  coverUrl.value = ''
  coverSamples.value = []
  step.value = 4
}

function republishContent(row) {
  // 二次发布：填充表单到 Step 4 上方模块
  videoForm.contentId = row.id
  videoForm.title = row.title || ''
  if (row.video_url_landscape) { videoForm.orientation = 'landscape'; coverOrientation.value = 'landscape' }
  else if (row.video_url) { videoForm.orientation = 'portrait'; coverOrientation.value = 'portrait' }
  publishForm.title = row.title || ''
  publishForm.description = row.body || ''
  publishForm.tagList = row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  publishForm.scheduled = false
  publishForm.publishDate = null
  publishForm.location = ''
  coverUrl.value = ''
  coverSamples.value = []
  generateCover()
  ElMessage.success('已填充发布表单，确认后可点击发布')
}

function viewPublishContent(row) {
  // 查看：自动填充表单，与二次发布相同逻辑
  republishContent(row)
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
  if (videoForm.mode === 'chanjing' && (!videoForm.person_id || !videoForm.audio_man_id)) {
    return ElMessage.warning('蝉镜模式需要选择数字人和音色')
  }
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

async function retryVideo(row) {
  videoForm.contentId = row.id
  videoForm.title = row.title || ''
  step.value = 3
  await nextTick()
  doGenerateVideo()
}

function viewHistoryVideo(row) {
  videoForm.contentId = row.id
  videoForm.title = row.title
  videoUrl.value = hotContentApi.videoUrl(row.id, videoForm.orientation)
  videoStatus.value = 'done'
  // scroll to video card
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function downloadHistoryVideo(row) {
  const url = hotContentApi.videoUrl(row.id, videoForm.orientation) + '&download=true'
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Step 4: Publish ───
const publishForm = reactive({ title: '', description: '', tagList: [], tags: '', scheduled: false, publishDate: null, location: '' })

const tagInputText = ref('')
const tagInputRef = ref(null)
function focusTagInput() { tagInputRef.value?.focus() }
function addTag() {
  const v = tagInputText.value.trim()
  if (v && !publishForm.tagList.includes(v)) publishForm.tagList.push(v)
  tagInputText.value = ''
}
function tryRemoveLastTag() {
  if (!tagInputText.value && publishForm.tagList.length)
    publishForm.tagList.pop()
}

// ─── 封面 ───
const coverUrl = ref('')
const coverSamples = ref([])
const coverTimes = [0, 1, 3, 5]
const coverLoading = ref(false)
const coverOrientation = ref('portrait')

async function generateCover() {
  if (!videoForm.contentId) return ElMessage.warning('请先从视频步骤选择内容')
  coverLoading.value = true
  try {
    const base = `/api/hot-contents/${videoForm.contentId}/cover-frame`
    const main = `${base}?orientation=${coverOrientation.value}&t=1&_=${Date.now()}`
    coverUrl.value = main
    const samples = []
    for (const t of coverTimes) {
      samples.push(`${base}?orientation=${coverOrientation.value}&t=${t}&_=${Date.now()}`)
    }
    coverSamples.value = samples
  } catch { ElMessage.error('封面提取失败') }
  coverLoading.value = false
}

function pickCover(url) { coverUrl.value = url }

// ─── 多渠道发布 ───
const PLATFORMS = [
  { key: 'douyin', label: '抖音', icon: '🎵' },
  { key: 'xiaohongshu', label: '小红书', icon: '📕' },
  { key: 'wechat_channel', label: '视频号', icon: '💬' },
]

let accountIdCounter = 0
function newAccount(name = 'default') {
  return { id: `acc_${++accountIdCounter}`, accountName: name, status: null, checking: false, loggingIn: false }
}

const publishHealth = ref(null)
const publishing = ref(false)
const publishTargets = ref([])

// 每个平台一个账号数组，默认各有一个 "default" 账号
const defaultAccounts = Object.fromEntries(PLATFORMS.map(p => [p.key, [newAccount()]]))
const platformAccounts = reactive(defaultAccounts)

function addAccount(platform) {
  platformAccounts[platform].push(newAccount())
}
function removeAccount(platform, id) {
  const list = platformAccounts[platform]
  if (list.length <= 1) return
  const idx = list.findIndex(a => a.id === id)
  if (idx >= 0) list.splice(idx, 1)
  publishTargets.value = publishTargets.value.filter(t => t !== id)
}

async function checkPublishHealth() {
  try {
    const res = await publishApi.health()
    publishHealth.value = res.data.data?.status || 'unknown'
  } catch {
    publishHealth.value = 'unreachable'
  }
}

async function checkAllAccountStatus() {
  if (publishHealth.value !== 'healthy') return
  for (const p of PLATFORMS) {
    for (const acc of platformAccounts[p.key]) {
      acc.checking = true
      try {
        const res = await publishApi.accountStatus(acc.accountName, p.key)
        acc.status = res.data.data
        if (acc.status?.is_logged_in && !publishTargets.value.includes(acc.id)) {
          publishTargets.value.push(acc.id)
        }
      } catch {
        acc.status = null
      }
      acc.checking = false
    }
  }
}

async function doLogin(platform, acc) {
  const label = PLATFORMS.find(p => p.key === platform)?.label || platform
  acc.loggingIn = true
  try {
    const loginRes = await publishApi.login(acc.accountName, platform)
    if (!loginRes.data.data?.success && loginRes.data.data?.message) {
      ElMessage.warning(loginRes.data.data.message)
      acc.loggingIn = false
      return
    }
    ElMessage({ message: `浏览器已打开，请在浏览器中完成${label}扫码登录`, type: 'info', duration: 5000 })
    let attempts = 0
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await publishApi.accountStatus(acc.accountName, platform)
        acc.status = res.data.data
        if (res.data.data?.is_logged_in) {
          ElMessage.success(`${label}账号 ${acc.accountName} 登录成功！`)
          acc.loggingIn = false
          if (!publishTargets.value.includes(acc.id)) publishTargets.value.push(acc.id)
          return
        }
      } catch {}
      attempts++
    }
    ElMessage.warning('登录超时（3分钟），请重试')
  } catch (e) {
    ElMessage.error('启动登录失败: ' + (e.response?.data?.message || e.message))
  }
  acc.loggingIn = false
}

function getAccountById(id) {
  for (const p of PLATFORMS) {
    const found = platformAccounts[p.key].find(a => a.id === id)
    if (found) return { platform: p.key, label: p.label, acc: found }
  }
  return null
}

async function doPublish() {
  if (!videoForm.contentId) return ElMessage.warning('请先从视频步骤生成视频')
  if (publishTargets.value.length === 0) return ElMessage.warning('请至少勾选一个已登录账号')
  publishing.value = true
  const results = []
  for (const id of publishTargets.value) {
    const entry = getAccountById(id)
    if (!entry) continue
    const { platform, label, acc } = entry
    if (!acc.status?.is_logged_in) {
      results.push({ label, success: false, message: `${acc.accountName} 未登录` })
      continue
    }
    try {
      const payload = {
        account_name: acc.accountName,
        platform,
        title: publishForm.title || videoForm.title,
        tags: publishForm.tagList.join(','),
        description: publishForm.description,
        cover_orientation: coverOrientation.value,
        location: publishForm.location || '',
      }
      if (publishForm.scheduled && publishForm.publishDate) {
        payload.publish_date = publishForm.publishDate
      }
      const res = await publishApi.publish(videoForm.contentId, payload)
      results.push({ label: `${label}@${acc.accountName}`, success: res.data.data?.success, message: res.data.data?.message })
    } catch (e) {
      results.push({ label: `${label}@${acc.accountName}`, success: false, message: e.response?.data?.message || e.message })
    }
  }
  const ok = results.filter(r => r.success)
  const fail = results.filter(r => !r.success)
  if (ok.length) ElMessage.success('发布成功: ' + ok.map(r => r.label).join(', '))
  if (fail.length) ElMessage.error('发布失败: ' + fail.map(r => r.label).join(', '))
  await loadContents()
  publishing.value = false
}

// 进入 Step 4 时预填
watch(step, async (s) => {
  if (s === 4) {
    await checkPublishHealth()
    await checkAllAccountStatus()
    // Auto-detect cover orientation from video availability
    const cur = contentList.value.find(c => c.id === videoForm.contentId)
    if (cur?.video_url_landscape && !cur?.video_url) coverOrientation.value = 'landscape'
    else coverOrientation.value = 'portrait'
    if (!publishForm.title) publishForm.title = videoForm.title || ''
    publishForm.location = ''
    if (cur) {
      if (!publishForm.description && cur.body) publishForm.description = cur.body
      if (!publishForm.tagList.length && cur.tags) {
        publishForm.tagList = cur.tags.split(',').map(t => t.trim()).filter(Boolean)
      }
    }
    if (!coverUrl.value) generateCover()
  }
})

onMounted(() => {
  loadContents()
  checkPublishHealth()
})
</script>

<style scoped>
.page-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-sub {
  font-size: 13px;
  color: #b8aad0;
  margin-left: 10px;
}

.step-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  padding: 12px 0;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #f0ecf8;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
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
  background: #f5f3ff;
}
.step-item.active {
  background: #f5f3ff;
  box-shadow: 0 0 0 1px #7c3aed;
}
.step-item.active .step-num {
  background: #7c3aed !important;
  border-color: #7c3aed !important;
  color: #fff;
  box-shadow: 0 0 0 4px rgba(124,58,237,0.2);
}
.step-item.done .step-num {
  background: #67c23a;
  border-color: #67c23a;
  color: #fff;
}
.step-item.process .step-num {
  background: #7c3aed;
  border-color: #7c3aed;
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
  border-radius: 12px;
  border: 1px solid #f0ecf8;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
}
.step-card :deep(.el-card__header) {
  font-weight: 600;
  color: #4a3f5e;
}

/* ─── 蝉镜资源选择 ─── */
.pipe-sel {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: #f8f7ff; border-radius: 10px;
  border: 1px solid #ece8f8; max-width: 440px;
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
.resource-card:hover { border-color: #7c3aed; box-shadow: 0 2px 12px rgba(124,58,237,0.1); }
.resource-card.selected { border-color: #7c3aed; background: #f5f3ff; }
.rc-img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; }
.rc-placeholder { width: 100%; height: 120px; border-radius: 6px; background: #f0ecfc; display: flex; align-items: center; justify-content: center; font-size: 48px; }
.voice-card .rc-placeholder { height: 80px; font-size: 36px; }
.rc-body { margin-top: 8px; text-align: left; }
.rc-name { font-weight: 600; font-size: 14px; }
.rc-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.rc-check { position: absolute; top: 8px; right: 8px; font-size: 22px; color: #7c3aed; }

/* ─── Step 4: Douyin Publish Layout ─── */
.douyin-publish-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.publish-main {
  flex: 1;
  min-width: 0;
}
.publish-sidebar {
  width: 340px;
  flex-shrink: 0;
  position: sticky;
  top: 16px;
}
.publish-card {
  border-radius: 12px;
  border: 1px solid #f0ecf8;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
}
.publish-card :deep(.el-card__header) {
  font-weight: 600;
  color: #4a3f5e;
}
.card-header-title {
  font-size: 15px;
  font-weight: 600;
}
.form-block {
  margin-bottom: 18px;
}
.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.char-count {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}
.tag-input-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  min-height: 42px;
  cursor: text;
  transition: border-color 0.2s;
}
.tag-input-wrap:hover { border-color: #c0c4cc; }
.tag-input-wrap:focus-within { border-color: #7c3aed; }
.tag-plain-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  border: none !important;
  padding: 0 !important;
  background: transparent !important;
}
/* ─── 封面 ─── */
.cover-section { display: flex; gap: 16px; flex-direction: column; }
.cover-preview {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.cover-img {
  width: 200px;
  height: 267px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.cover-img-landscape {
  width: 267px;
  height: 200px;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.cover-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cover-samples { margin-top: 8px; }
.sample-grid {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.sample-item {
  width: 90px;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  position: relative;
  transition: border-color 0.2s;
}
.sample-item.active { border-color: #fe2c55; }
.sample-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sample-item .sample-img-landscape {
  object-fit: cover;
}
.sample-time {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
/* ─── 发布按钮 ─── */
.publish-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 16px 0;
}
/* ─── 预览卡片 ─── */
.preview-card {
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}
.preview-cover {
  width: 100%;
  aspect-ratio: 3/4;
  background: #1a1a1a;
  overflow: hidden;
}
.preview-cover img { width: 100%; height: 100%; object-fit: cover; }
.preview-cover-landscape {
  width: 100%;
  aspect-ratio: 4/3;
  background: #1a1a1a;
  overflow: hidden;
}
.preview-cover-landscape img { width: 100%; height: 100%; object-fit: contain; background: #000; }
.preview-cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
  gap: 8px;
  font-size: 13px;
}
.preview-body {
  padding: 12px;
  background: #111;
}
.preview-title {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.preview-desc {
  color: #999;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.preview-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.preview-tag {
  color: #ffba57;
  font-size: 12px;
}
</style>
