<template>
  <div class="sa-page">
    <div class="sa-header">
      <h3>社媒拓客</h3>
      <span class="sa-subtitle">多平台关键词搜索 · 评论洞察 · AI回复</span>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- Tab 1: 搜索发现 -->
      <el-tab-pane label="搜索发现" name="search">
        <div class="search-form">
          <el-select v-model="searchPlatform" placeholder="选择平台" style="width:140px">
            <el-option v-for="p in platforms" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
          <el-input v-model="searchKeyword" placeholder="输入关键词，如：美妆 测评 广州" style="width:260px" @keydown.enter="startSearch" />
          <el-select v-model="searchPublishTime" style="width:130px">
            <el-option label="不限时间" value="0" />
            <el-option label="一天内" value="1" />
            <el-option label="一周内" value="7" />
            <el-option label="半年内" value="180" />
          </el-select>
          <el-input-number v-model="searchLimit" :min="5" :max="50" :step="5" style="width:100px" />
          <el-button type="primary" @click="startSearch" :loading="searching">开始搜索</el-button>
          <el-button size="small" @click="handleSwitchAccount" :loading="switchingAcc">切换账号</el-button>
        </div>

        <el-table :data="tasks" v-loading="loadingTasks" stripe size="small" style="margin-top:16px">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="platform" label="平台" width="90" />
          <el-table-column prop="keyword" label="关键词" width="120" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{row}">
              <el-tag :type="row.status==='done'?'success':row.status==='running'?'warning':row.status==='failed'?'danger':'info'" size="small">
                {{ {pending:'等待中',running:'进行中',done:'完成',failed:'失败'}[row.status]||row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="total_posts" label="帖子" width="70" />
          <el-table-column prop="total_comments" label="评论" width="70" />
          <el-table-column prop="created_at" label="时间" width="150" />
          <el-table-column label="操作" width="160">
            <template #default="{row}">
              <el-button link type="primary" size="small" @click="viewComments(row)" :disabled="row.status!=='done'">查看评论</el-button>
              <el-button link type="danger" size="small" @click="delTask(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="tasks.length===0 && !loadingTasks" style="text-align:center;padding:40px;color:#b8aad0">
          输入平台和关键词，开始搜索行业相关帖子和评论
        </div>
      </el-tab-pane>

      <!-- Tab 2: 评论洞察 -->
      <el-tab-pane label="评论洞察" name="insight">
        <div v-if="!activeTask" style="text-align:center;padding:60px;color:#b8aad0">
          <el-icon style="font-size:48px"><ChatDotSquare /></el-icon>
          <div style="margin-top:12px">请先在"搜索发现"中选择一个任务查看评论</div>
        </div>

        <template v-else>
          <div class="insight-toolbar">
            <el-tag type="info" size="small">任务：{{ activeTask.name }}</el-tag>
            <el-tag size="small">平台：{{ activeTask.platform }}</el-tag>
            <el-tag size="small">评论数：{{ activeTask.total_comments }}</el-tag>
            <el-button size="small" @click="loadWordcloud" :loading="loadingWc">词云分析</el-button>
            <el-input v-model="commentLocation" placeholder="地点过滤，如：广州" size="small" style="width:140px" clearable @change="loadComments" />
            <div style="flex:1" />
            <el-select v-model="commentSort" size="small" style="width:120px" @change="loadComments">
              <el-option label="按热度" value="comment_likes" />
              <el-option label="按时间" value="time" />
            </el-select>
          </div>

          <!-- 词云 -->
          <div v-if="wcloud.length" class="wordcloud-box">
            <div v-for="w in wcloud.slice(0,80)" :key="w.word" class="wc-tag"
              :style="{fontSize: Math.max(12, Math.min(40, 10+w.count*2))+'px', color: wcColors[w.count%wcColors.length]}">
              {{ w.word }}
            </div>
          </div>

          <!-- 评论列表 -->
          <el-table :data="comments" stripe size="small" max-height="400" style="margin-top:12px" @selection-change="onSelChange">
            <el-table-column type="selection" width="40" />
            <el-table-column prop="comment_content" label="评论内容" min-width="200" show-overflow-tooltip />
            <el-table-column prop="comment_author" label="评论者" width="100" />
            <el-table-column prop="comment_likes" label="点赞" width="60" />
            <el-table-column prop="post_title" label="帖子" min-width="150" show-overflow-tooltip />
            <el-table-column prop="post_author" label="帖主" width="90" />
          </el-table>
          <el-pagination
            v-if="commentTotal>30" :current-page="commentPage" :page-size="30"
            :total="commentTotal" layout="prev,next" @current-change="p=>{commentPage=p;loadComments()}"
            style="margin-top:12px;justify-content:center" small
          />
          <div style="margin-top:12px">
            <el-button type="primary" size="small" @click="genReplies" :loading="generating" :disabled="selectedComments.length===0">
              AI 生成回复 ({{ selectedComments.length }} 条选中)
            </el-button>
          </div>
        </template>
      </el-tab-pane>

      <!-- Tab 3: 回复管理 -->
      <el-tab-pane label="回复管理" name="replies">
        <div style="margin-bottom:12px">
          <el-radio-group v-model="replyFilter" size="small" @change="loadReplies">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="draft">草稿</el-radio-button>
            <el-radio-button value="approved">已批准</el-radio-button>
            <el-radio-button value="rejected">已拒绝</el-radio-button>
          </el-radio-group>
        </div>

        <el-table :data="replyList" stripe size="small" max-height="400">
          <el-table-column prop="post_title" label="原帖" min-width="150" show-overflow-tooltip />
          <el-table-column prop="comment_author" label="评论者" width="90" />
          <el-table-column prop="comment_content" label="原始评论" min-width="180" show-overflow-tooltip />
          <el-table-column prop="content" label="AI回复草稿" min-width="200" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{row}">
              <el-tag :type="row.status==='approved'?'success':row.status==='rejected'?'danger':row.status==='sent'?'primary':'info'" size="small">
                {{ {draft:'草稿',approved:'已批准',rejected:'已拒绝',sent:'已发送',send_failed:'发送失败'}[row.status]||row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="420">
            <template #default="{row}">
              <el-button link type="success" size="small" @click="approveReply(row)" :disabled="row.status==='approved'||row.status==='sent'"><el-icon><Check /></el-icon>批准</el-button>
              <el-button link type="danger" size="small" @click="rejectReply(row)" :disabled="row.status==='rejected'"><el-icon><Close /></el-icon>拒绝</el-button>
              <el-button link type="primary" size="small" @click="handleSendReply(row)" :loading="row._sending" :disabled="row.status==='sent'||row.status==='draft'||row.status==='rejected'"><el-icon><Promotion /></el-icon>{{ row.status==='send_failed'?'重发':'发送' }}</el-button>
              <el-button link type="primary" size="small" @click="copyAndOpen(row)" :disabled="!row.post_url"><el-icon><CopyDocument /></el-icon>复制并跳转</el-button>
              <el-button link size="small" @click="editReply(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="delReply(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <!-- Tab 4: 自动回复 -->
      <el-tab-pane label="自动回复" name="auto">
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <!-- 左侧：添加监控 -->
          <div style="flex:1;min-width:320px">
            <el-card header="添加监控帖子" shadow="never" size="small">
              <el-form label-position="top" size="small">
                <el-form-item label="平台">
                  <el-select v-model="monForm.platform" style="width:100%">
                    <el-option v-for="p in platforms" :key="p.value" :label="p.label" :value="p.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="帖子链接">
                  <el-input v-model="monForm.post_url" placeholder="粘贴你自己的帖子URL" />
                </el-form-item>
                <el-form-item label="品牌/产品背景（AI回复用）">
                  <el-input v-model="monForm.reply_prompt" placeholder="例：我们是做企业培训的，主要产品是..." />
                </el-form-item>
                <el-form-item label="触发关键词（逗号分隔，留空匹配所有评论）">
                  <el-input v-model="monForm.trigger_keywords" placeholder="例：价格,怎么买,多少钱,了解" />
                </el-form-item>
                <el-form-item label="检查频率">
                  <el-select v-model="monForm.check_interval" style="width:100%">
                    <el-option :value="300" label="每5分钟" />
                    <el-option :value="900" label="每15分钟" />
                    <el-option :value="1800" label="每30分钟" />
                    <el-option :value="3600" label="每小时" />
                  </el-select>
                </el-form-item>
                <el-button type="primary" @click="addNewMonitor" :loading="addingMon" style="width:100%">添加监控</el-button>
              </el-form>
            </el-card>
          </div>

          <!-- 右侧：监控列表 -->
          <div style="flex:2;min-width:500px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span style="font-weight:600;color:#4a3f5e">已监控的帖子</span>
              <el-button size="small" @click="checkAll" :loading="checkingAll">立即检查全部</el-button>
            </div>
            <el-table :data="monitors" stripe size="small">
              <el-table-column prop="platform" label="平台" width="90" />
              <el-table-column label="帖子" min-width="180" show-overflow-tooltip>
                <template #default="{row}">
                  <a :href="row.post_url" target="_blank" style="color:#7c3aed;font-size:13px">{{ row.post_url?.slice(0,60) }}...</a>
                </template>
              </el-table-column>
              <el-table-column prop="trigger_keywords" label="触发词" width="120">
                <template #default="{row}">
                  <span style="font-size:12px;color:#8b7aaf">{{ row.trigger_keywords || '全部评论' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="enabled" label="启用" width="70">
                <template #default="{row}">
                  <el-switch :model-value="!!row.enabled" @change="v=>toggleMon(row.id, v)" size="small" />
                </template>
              </el-table-column>
              <el-table-column prop="total_replied" label="已回复" width="70" />
              <el-table-column prop="last_checked_at" label="上次检查" width="140">
                <template #default="{row}">{{ row.last_checked_at || '未检查' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{row}">
                  <el-button link size="small" type="primary" @click="checkMon(row.id)" :loading="row._checking">检查</el-button>
                  <el-button link size="small" type="danger" @click="delMon(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="monitors.length===0" style="text-align:center;padding:40px;color:#b8aad0">
              添加你要监控的帖子链接，有新评论时 AI 会自动生成回复
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 编辑回复对话框 -->
    <el-dialog v-model="editDlg.visible" title="编辑回复" width="500px" :close-on-click-modal="false">
      <div style="margin-bottom:8px;font-size:13px;color:#8b7aaf">
        原评论者：{{ editDlg.comment_author }} | 评论内容：{{ editDlg.comment_content }}
      </div>
      <el-input v-model="editDlg.content" type="textarea" :rows="4" />
      <template #footer>
        <el-button @click="editDlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveEditReply">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotSquare, Check, Close, CopyDocument, Promotion } from '@element-plus/icons-vue'
import {
  createSearch, getTasks, getTask, getComments, getWordcloud,
  deleteTask, generateReplies, updateReply, getReplies, deleteReply, sendReply,
  switchAccount, getAccountStatus,
  addMonitor, getMonitors, updateMonitor, deleteMonitor, checkMonitor, checkAllMonitors
} from '../api/social-acquisition.js'

const activeTab = ref('search')

// --- 搜索 ---
const platforms = [
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
  { label: '快手', value: 'kuaishou' },
  { label: 'B站', value: 'bilibili' },
  { label: '微博', value: 'weibo' },
  { label: '知乎', value: 'zhihu' },
  { label: '贴吧', value: 'tieba' },
]
const searchPlatform = ref('xiaohongshu')
const searchKeyword = ref('')
const searchPublishTime = ref('0')
const searchLimit = ref(10)
const searching = ref(false)
const tasks = ref([])
const loadingTasks = ref(false)

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await getTasks()
    tasks.value = data.data || []
  } catch { tasks.value = [] }
  finally { loadingTasks.value = false }
}
loadTasks()

async function startSearch() {
  if (!searchKeyword.value.trim()) {
    ElMessage.warning('请输入关键词')
    return
  }
  searching.value = true
  try {
    await createSearch({
      platform: searchPlatform.value,
      keyword: searchKeyword.value.trim(),
      limit: searchLimit.value,
      publish_time: searchPublishTime.value,
    })
    ElMessage.success('搜索任务已创建，后台执行中...')
    setTimeout(loadTasks, 3000)
    // 持续轮询直到完成
    pollTask()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || e.message || '创建失败')
  }
  finally { searching.value = false }
}

function pollTask() {
  const interval = setInterval(async () => {
    await loadTasks()
    const last = tasks.value[0]
    if (last && last.status !== 'running') {
      clearInterval(interval)
      ElMessage.success('搜索完成')
    }
  }, 5000)
  // 最多轮询 5 分钟
  setTimeout(() => clearInterval(interval), 300000)
}

async function delTask(id) {
  try {
    await ElMessageBox.confirm('删除任务及所有评论数据？', '确认', { type: 'warning' })
    await deleteTask(id)
    loadTasks()
    if (activeTask.value?.id === id) activeTask.value = null
    ElMessage.success('已删除')
  } catch {}
}

// --- 评论洞察 ---
const activeTask = ref(null)
const comments = ref([])
const commentTotal = ref(0)
const commentPage = ref(1)
const commentSort = ref('comment_likes')
const selectedComments = ref([])
const commentLocation = ref('')
const wcloud = ref([])
const loadingWc = ref(false)
const wcColors = ['#7c3aed','#5b21b6','#a78bfa','#c4b5fd','#4c1d95','#8b5cf6','#ede9fe','#6d28d9','#9f7aea','#dcd5f5']

function viewComments(row) {
  activeTask.value = row
  commentPage.value = 1
  loadComments()
  activeTab.value = 'insight'
}

async function loadComments() {
  try {
    const params = {
      page: commentPage.value,
      pageSize: 30,
      sort: commentSort.value,
    }
    if (commentLocation.value) params.location = commentLocation.value
    const { data } = await getComments(activeTask.value.id, params)
    comments.value = (data.data?.list || []).map(c => ({
      ...c,
      // 用 post_url 或 post_title 作为唯一标识
    }))
    commentTotal.value = data.data?.total || 0
  } catch { comments.value = [] }
}

async function loadWordcloud() {
  loadingWc.value = true
  try {
    const { data } = await getWordcloud(activeTask.value.id)
    wcloud.value = data.data || []
  } catch { wcloud.value = [] }
  finally { loadingWc.value = false }
}

function onSelChange(val) {
  selectedComments.value = val
}

// --- 切换账号 ---
const switchingAcc = ref(false)
async function handleSwitchAccount() {
  try {
    await ElMessageBox.confirm(
      `确定要切换 ${searchPlatform.value} 的登录账号吗？下次搜索将需要重新扫码登录。`,
      '切换账号', { type: 'warning' }
    )
    switchingAcc.value = true
    await switchAccount(searchPlatform.value)
    ElMessage.success('已清除登录状态，下次搜索请用新账号扫码')
  } catch {}
  finally { switchingAcc.value = false }
}

// --- 自动回复监控 ---
const monForm = reactive({ platform: 'douyin', post_url: '', reply_prompt: '', trigger_keywords: '', check_interval: 900 })
const monitors = ref([])
const addingMon = ref(false)
const checkingAll = ref(false)

async function loadMonitors() {
  try {
    const { data } = await getMonitors()
    monitors.value = (data.data || []).map(m => ({ ...m, _checking: false }))
  } catch { monitors.value = [] }
}
loadMonitors()

async function addNewMonitor() {
  if (!monForm.post_url) { ElMessage.warning('请输入帖子链接'); return }
  addingMon.value = true
  try {
    await addMonitor({ ...monForm })
    ElMessage.success('已添加监控')
    monForm.post_url = ''; monForm.reply_prompt = ''; monForm.trigger_keywords = ''
    loadMonitors()
  } catch (e) { ElMessage.error(e.response?.data?.message || '添加失败') }
  finally { addingMon.value = false }
}

async function toggleMon(id, v) {
  try {
    await updateMonitor(id, { enabled: v })
    loadMonitors()
  } catch { ElMessage.error('操作失败') }
}

async function delMon(id) {
  try {
    await ElMessageBox.confirm('删除此监控？', '确认', { type: 'warning' })
    await deleteMonitor(id)
    loadMonitors()
    ElMessage.success('已删除')
  } catch {}
}

async function checkMon(id) {
  const m = monitors.value.find(x => x.id === id)
  if (!m) return; m._checking = true
  try {
    await checkMonitor(id)
    ElMessage.success('检查完成，如有新评论已自动生成回复，请到"回复管理"查看')
    loadMonitors()
  } catch (e) { ElMessage.error(e.response?.data?.message || '检查失败') }
  finally { m._checking = false }
}

async function checkAll() {
  checkingAll.value = true
  try {
    await checkAllMonitors()
    ElMessage.success('检查完成')
    loadMonitors()
  } catch (e) { ElMessage.error(e.response?.data?.message || '检查失败') }
  finally { checkingAll.value = false }
}

// --- AI 生成回复 ---
const generating = ref(false)

async function genReplies() {
  generating.value = true
  try {
    const { data } = await generateReplies({ comment_ids: selectedComments.value.map(c => c.id) })
    ElMessage.success(`已生成 ${data.data?.generated || 0} 条回复草稿`)
    loadReplies()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || e.message || '生成失败')
  }
  finally { generating.value = false }
}

// --- 回复管理 ---
const replyFilter = ref('')
const replyList = ref([])

async function loadReplies() {
  try {
    const params = {}
    if (replyFilter.value) params.status = replyFilter.value
    const { data } = await getReplies(params)
    replyList.value = data.data?.list || []
  } catch { replyList.value = [] }
}

async function approveReply(row) {
  try {
    await updateReply(row.id, { status: 'approved' })
    ElMessage.success('已批准')
    loadReplies()
  } catch { ElMessage.error('操作失败') }
}

async function rejectReply(row) {
  try {
    await updateReply(row.id, { status: 'rejected' })
    ElMessage.success('已拒绝')
    loadReplies()
  } catch { ElMessage.error('操作失败') }
}

async function handleSendReply(row) {
  try {
    await ElMessageBox.confirm(
      `确定要将此回复发布到平台吗？\n\n回复内容：${row.content?.slice(0, 80)}...`,
      '确认发布', { type: 'warning', confirmButtonText: '发布' }
    )
    row._sending = true
    await sendReply(row.id)
    ElMessage.success('发布请求已提交，浏览器窗口将自动操作')
    loadReplies()
  } catch { /* 取消 */ }
  finally { row._sending = false }
}

async function copyAndOpen(row) {
  try {
    await navigator.clipboard.writeText(row.content)
    const url = row.post_url ? row.post_url.replace(/\/+$/, '') + '#comment' : ''
    if (url) window.open(url)
    ElMessage.success('已复制！在打开的抖音页面按 Ctrl+V 粘贴到评论框，点发送即可')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = row.content
    ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    const url = row.post_url ? row.post_url.replace(/\/+$/, '') + '#comment' : ''
    if (url) window.open(url)
    ElMessage.success('已复制！在打开的抖音页面按 Ctrl+V 粘贴到评论框，点发送即可')
  }
}

async function delReply(row) {
  try {
    await ElMessageBox.confirm('删除这条回复草稿？', '确认', { type: 'warning' })
    await deleteReply(row.id)
    ElMessage.success('已删除')
    loadReplies()
  } catch {}
}

const editDlg = reactive({ visible: false, id: '', content: '', comment_author: '', comment_content: '' })
function editReply(row) {
  editDlg.visible = true
  editDlg.id = row.id
  editDlg.content = row.content
  editDlg.comment_author = row.comment_author
  editDlg.comment_content = row.comment_content
}
async function saveEditReply() {
  try {
    await updateReply(editDlg.id, { content: editDlg.content })
    editDlg.visible = false
    ElMessage.success('已保存')
    loadReplies()
  } catch { ElMessage.error('保存失败') }
}
</script>

<style scoped>
.sa-page { padding: 20px 24px; height: 100%; overflow-y: auto; }
.sa-header { margin-bottom: 16px; }
.sa-header h3 { margin: 0 0 4px; font-size: 18px; color: #4a3f5e; }
.sa-subtitle { font-size: 13px; color: #b8aad0; }
.search-form { display: flex; gap: 10px; align-items: center; }
.insight-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.wordcloud-box {
  padding: 20px; background: #fafafe; border: 1px solid #f0ecfc; border-radius: 8px;
  display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: center;
  min-height: 100px; margin-bottom: 12px;
}
.wc-tag { font-weight: 600; transition: color .2s; cursor: default; }
</style>
