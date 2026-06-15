<template>
  <div class="sl-page">
    <div class="pg-hd">
      <span class="pg-title">技能库</span>
      <span class="pg-sub">AI 能力工具箱</span>
    </div>
    <div class="pg-body">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="本地技能" name="local">
          <div class="skill-grid">
            <div v-for="s in skills" :key="s.id" class="skill-card" @click="openSkill(s)">
              <div class="sc-icon">{{ s.emoji || '⚡' }}</div>
              <div class="sc-body">
                <div class="sc-name">{{ s.name }}</div>
                <div class="sc-desc">{{ s.desc || '暂无描述' }}</div>
              </div>
            </div>
            <div v-if="!skills.length" class="skill-empty">
              <el-empty description="暂无可用技能" />
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="OpenClaw 技能" name="openclaw">
          <div class="skill-grid">
            <div v-for="s in openclawSkills" :key="s.name" class="skill-card">
              <div class="sc-icon">{{ s.emoji || '⚡' }}</div>
              <div class="sc-body">
                <div class="sc-name">{{ s.displayName || s.name }}</div>
                <div class="sc-desc">{{ s.description || s.summary || '暂无描述' }}</div>
                <div class="sc-meta" v-if="s.version">v{{ s.version }} · {{ s.source || '' }}</div>
              </div>
              <div class="sc-action">
                <el-tag v-if="!s.disabled" size="small" type="success" effect="plain">已启用</el-tag>
                <el-tag v-else size="small" type="info" effect="plain">已禁用</el-tag>
              </div>
            </div>
            <div v-if="!openclawSkills.length" class="skill-empty">
              <el-empty description="暂无 OpenClaw 技能" />
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="ClawHub 市场" name="clawhub">
          <div class="clawhub-search">
            <el-input v-model="clawhubQuery" placeholder="搜索 ClawHub 技能..." clearable
              @keyup.enter="searchClawHub" style="width: 360px" />
            <el-button type="primary" @click="searchClawHub" :loading="clawhubLoading">搜索</el-button>
          </div>
          <div class="skill-grid" style="margin-top:16px">
            <div v-for="s in clawhubResults" :key="s.slug" class="skill-card">
              <div class="sc-icon">📦</div>
              <div class="sc-body">
                <div class="sc-name">{{ s.name }}</div>
                <div class="sc-desc">{{ s.description || '暂无描述' }}</div>
                <div class="sc-meta" v-if="s.version">v{{ s.version }} · {{ s.owner || '' }}</div>
              </div>
              <div class="sc-action">
                <el-button v-if="isInstalled(s.slug)" size="small" disabled>已安装</el-button>
                <el-button v-else size="small" type="primary" @click.stop="installSkill(s)" :loading="s._installing">安装</el-button>
              </div>
            </div>
            <div v-if="!clawhubLoading && clawhubSearched && !clawhubResults.length" class="skill-empty">
              <el-empty description="未找到匹配技能" />
            </div>
            <div v-if="!clawhubSearched" class="skill-empty">
              <el-empty description="搜索 ClawHub 发现更多 AI 技能" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 技能详情弹窗 -->
    <el-dialog v-model="detailDlg.visible" :title="detailDlg.skill?.name" width="620px" :close-on-click-modal="false">
      <div class="detail-body">
        <div class="detail-desc">{{ detailDlg.skill?.desc }}</div>
        <div class="detail-section">
          <div class="detail-section-title">技能说明</div>
          <div class="detail-content" v-html="renderMd(detailDlg.skill?.prompt_snippet || '')"></div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDlg.visible=false">关闭</el-button>
        <el-button v-if="detailDlg.skill?.id==='ppt-generator-builtin'" type="primary" @click="detailDlg.visible=false; pptDlg.visible=true">生成 PPT</el-button>
      </template>
    </el-dialog>

    <!-- PPT 生成弹窗 -->
    <el-dialog v-model="pptDlg.visible" title="生成 PPT" width="560px" :close-on-click-modal="false">
      <div v-if="pptDlg.result" class="ppt-result">
        <el-result icon="success" title="PPT 生成成功">
          <template #sub-title>共 {{ pptDlg.result.slides_count }} 页幻灯片</template>
          <template #extra>
            <el-button type="primary" @click="downloadPpt(pptDlg.result.download_url)">下载 PPT</el-button>
            <el-button @click="pptDlg.result=null;pptDlg.prompt=''">再生成一份</el-button>
          </template>
        </el-result>
      </div>
      <template v-else>
        <el-form label-width="0">
          <el-form-item>
            <div class="ppt-prompt-label">描述你想要生成的 PPT 内容</div>
            <el-input v-model="pptDlg.prompt" type="textarea" :rows="5"
              placeholder="例如：Q3 营销复盘，包含核心数据、增长引擎和风险预警，Q4 策略规划"/>
          </el-form-item>
        </el-form>
        <div class="ppt-examples">
          <span class="ppt-examples-label">试试这些：</span>
          <el-tag v-for="eg in pptExamples" :key="eg" size="small" class="ppt-eg-tag" @click="pptDlg.prompt=eg">{{ eg }}</el-tag>
        </div>
      </template>
      <template #footer>
        <el-button @click="pptDlg.visible=false">关闭</el-button>
        <el-button v-if="!pptDlg.result" type="primary" :loading="pptDlg.loading" @click="doGeneratePPT">生成 PPT</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import request from '../api/index.js'

const activeTab = ref('local')
const skills = ref([])
const detailDlg = ref({ visible: false, skill: null })
const pptDlg = ref({ visible: false, prompt: '', loading: false, result: null })
const pptExamples = ['Q3 营收复盘，分析增长引擎与风险', '新产品发布会，面向投资人', '季度技术分享：AI 在企业中的应用', '年度工作总结与明年规划']

// ClawHub state
const clawhubQuery = ref('')
const clawhubResults = ref([])
const clawhubLoading = ref(false)
const clawhubSearched = ref(false)
const installedSlugs = ref(new Set())
const openclawSkills = ref([])

function skillEmoji(name) {
  if (name.includes('PPT')) return '📊'
  if (name.includes('文档') || name.includes('Word')) return '📝'
  if (name.includes('表') || name.includes('Excel')) return '📈'
  return '⚡'
}

function renderMd(text) {
  return marked(text || '')
}

function isInstalled(slug) {
  return installedSlugs.value.has(slug)
}

async function loadSkills() {
  try {
    const { data } = await request.get('/agent-skills')
    skills.value = (data.data || []).map(s => ({ ...s, emoji: skillEmoji(s.name) }))
  } catch {}
}

async function loadInstalledSlugs() {
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      installedSlugs.value = new Set(data.data.skills.map(s => s.name).filter(Boolean))
    }
  } catch {}
}

async function loadOpenClawSkills() {
  try {
    const { data } = await request.get('/clawhub/status')
    if (data.code === 200 && data.data?.skills) {
      openclawSkills.value = data.data.skills.map(s => ({
        ...s,
        emoji: skillEmoji(s.name || s.displayName || '')
      }))
    }
  } catch {}
}

async function searchClawHub() {
  if (!clawhubQuery.value.trim()) return
  clawhubLoading.value = true
  clawhubSearched.value = true
  try {
    const { data } = await request.get('/clawhub/search', { params: { q: clawhubQuery.value, limit: 20 } })
    clawhubResults.value = (data.data || []).map(s => ({ ...s, _installing: false }))
  } catch (e) {
    ElMessage.error('搜索失败: ' + (e.response?.data?.message || e.message))
  }
  clawhubLoading.value = false
}

async function installSkill(s) {
  s._installing = true
  try {
    await request.post('/clawhub/install', { slug: s.slug })
    ElMessage.success(`已安装技能: ${s.name}`)
    installedSlugs.value.add(s.slug)
    loadSkills()
  } catch (e) {
    ElMessage.error('安装失败: ' + (e.response?.data?.message || e.message))
  }
  s._installing = false
}

function openSkill(s) {
  detailDlg.value = { visible: true, skill: s }
}

async function doGeneratePPT() {
  if (!pptDlg.value.prompt.trim()) return
  pptDlg.value.loading = true
  try {
    const { data } = await request.post('/ppt/generate', { prompt: pptDlg.value.prompt })
    if (data.code === 200) {
      pptDlg.value.result = data.data
    } else {
      ElMessage.error(data.message || '生成失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '生成失败')
  }
  pptDlg.value.loading = false
}

function downloadPpt(url) {
  window.open(url, '_blank')
}

watch(activeTab, (tab) => { if (tab === 'openclaw') loadOpenClawSkills() })
onMounted(() => { loadSkills(); loadInstalledSlugs() })
</script>

<style scoped>
.sl-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.pg-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.pg-body { flex: 1; padding: 24px; overflow-y: auto; }

.skill-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.skill-card {
  display: flex; align-items: center; gap: 14px;
  width: 340px; padding: 20px;
  background: #fff; border: 1px solid #f0ecfc; border-radius: 14px;
  cursor: pointer; transition: all .2s;
}
.skill-card:hover { border-color: #7c3aed; box-shadow: 0 6px 20px rgba(124,58,237,.1); transform: translateY(-2px); }
.sc-icon { width: 48px; height: 48px; border-radius: 12px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.sc-body { flex: 1; min-width: 0; }
.sc-name { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.sc-desc { font-size: 12px; color: #909399; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-meta { font-size: 11px; color: #b8aad0; margin-top: 4px; }
.sc-action { flex-shrink: 0; }
.skill-empty { padding: 60px 0; text-align: center; width: 100%; }

.clawhub-search { display: flex; gap: 10px; align-items: center; }

/* 详情弹窗 */
.detail-body { max-height: 55vh; overflow-y: auto; }
.detail-desc { font-size: 14px; color: #606266; margin-bottom: 16px; padding: 10px 14px; background: #f8f7ff; border-radius: 8px; border-left: 3px solid #7c3aed; }
.detail-section { margin-top: 8px; }
.detail-section-title { font-size: 13px; font-weight: 600; color: #4a3f5e; margin-bottom: 8px; }
.detail-content { font-size: 13px; color: #4a3f5e; line-height: 1.8; }
.detail-content :deep(h2) { font-size: 15px; margin: 14px 0 6px; color: #4a3f5e; }
.detail-content :deep(h3) { font-size: 13px; margin: 10px 0 4px; }
.detail-content :deep(ul), .detail-content :deep(ol) { padding-left: 18px; margin: 6px 0; }
.detail-content :deep(li) { margin: 3px 0; }
.detail-content :deep(code) { background: #f5f3ff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.detail-content :deep(pre) { background: #2d2640; color: #e8e0f0; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }

/* PPT 生成 */
.ppt-prompt-label { font-size: 13px; color: #606266; margin-bottom: 8px; }
.ppt-examples { margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ppt-examples-label { font-size: 12px; color: #b8aad0; }
.ppt-eg-tag { cursor: pointer; }
.ppt-eg-tag:hover { background: #ede9fe; color: #7c3aed; }
.ppt-result { padding: 20px 0; }
</style>
