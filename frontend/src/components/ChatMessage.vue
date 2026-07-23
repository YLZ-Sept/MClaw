<template>
  <div class="chat-message" :class="[roleClass, { 'status-msg': isStatus }]">
    <div class="chat-avatar" v-if="role === 'ai' || role === 'tool'">
      <el-icon><ChatDotRound /></el-icon>
    </div>
    <div class="chat-avatar" v-else-if="role === 'user'">
      <el-icon><UserFilled /></el-icon>
    </div>
    <div class="msg-body">
      <!-- ====== 审批卡片 ====== -->
      <div v-if="approval" class="approval-card">
        <div class="approval-header">
          <el-icon size="16" color="#f59e0b"><WarningFilled /></el-icon>
          <span>危险操作需要审批</span>
          <el-tag :type="approval.level === 'critical' ? 'danger' : 'warning'" size="small" round>{{ approval.level }}</el-tag>
        </div>
        <div class="approval-body">
          <div class="approval-row"><span class="al">工具</span><code>{{ approval.tool }}</code></div>
          <div class="approval-row"><span class="al">说明</span>{{ approval.desc }}</div>
          <div class="approval-row"><span class="al">ID</span><code>{{ approval.approval_id }}</code></div>
        </div>
        <div class="approval-actions" v-if="approval.approval_id">
          <el-button size="small" type="success" @click="handleApprove">批准</el-button>
          <el-button size="small" type="danger" @click="handleDeny">拒绝</el-button>
        </div>
      </div>

      <!-- ====== 用户消息 / 状态消息：纯文本渲染 ====== -->
      <template v-if="role === 'user' || (isStatus && !hasSegments)">
        <div class="message-bubble status-bubble" v-if="isStatus">{{ content }}</div>
        <div class="message-bubble user-bubble" v-else>{{ content }}</div>
      </template>

      <!-- ====== AI 消息：分段渲染 ====== -->
      <template v-else-if="role === 'ai' && hasSegments">
        <div v-for="(seg, i) in segments" :key="i" class="segment-wrapper">
          <!-- 思考段 -->
          <div v-if="seg.type === 'thinking'" class="thinking-segment">
            <button class="thinking-toggle" @click="seg.expanded = !seg.expanded">
              <span class="thinking-icon">{{ seg.expanded ? '▾' : '▸' }}</span>
              <span class="thinking-label">思考过程</span>
              <span class="thinking-chars">{{ formatCharCount(seg.content.length) }}</span>
            </button>
            <div v-if="seg.expanded" class="thinking-body markdown-body" v-html="seg.rendered"></div>
          </div>

          <!-- 工具调用段 -->
          <div v-if="seg.type === 'tools'" class="tools-segment">
            <div v-for="(tc, j) in seg.calls" :key="j" class="tool-card" :class="tc.status">
              <button class="tool-card-header" @click="tc.expanded = !tc.expanded">
                <span class="tool-status-icon">
                  <el-icon v-if="tc.status === 'running'" class="is-loading"><Loading /></el-icon>
                  <el-icon v-else-if="tc.status === 'done'" style="color:#22c55e"><CircleCheck /></el-icon>
                  <el-icon v-else style="color:#ef4444"><CircleClose /></el-icon>
                </span>
                <span class="tool-card-name">{{ formatToolName(tc.name) }}</span>
                <span v-if="tc.status === 'running'" class="tool-card-state">运行中</span>
                <span v-else-if="tc.status === 'done'" class="tool-card-state done">完成</span>
                <span v-else class="tool-card-state error">失败</span>
                <span class="tool-card-chevron">{{ tc.expanded ? '▾' : '▸' }}</span>
              </button>
              <div v-if="tc.expanded && tc.summary" class="tool-card-body">
                <div class="tool-card-summary">{{ tc.summary }}</div>
              </div>
            </div>
          </div>

          <!-- 文本段 -->
          <div v-if="seg.type === 'text'" class="message-bubble markdown-body" v-html="seg.rendered"></div>
        </div>
      </template>

      <!-- 回退：无分段的 AI 消息 -->
      <div v-else-if="role === 'ai'" class="message-bubble markdown-body" v-html="rendered"></div>

      <!-- 工具角色消息 -->
      <div v-else-if="role === 'tool'" class="message-bubble status-bubble" v-html="renderedInline"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, CircleCheck, CircleClose, WarningFilled, ChatDotRound, UserFilled } from '@element-plus/icons-vue'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({
  role: { type: String, required: true },
  content: { type: String, required: true },
  toolCalls: { type: Array, default: () => [] },
  segments: { type: Array, default: () => [] },  // 预解析的段（由父组件传入）
})

// ====== 分段解析 ======
const hasSegments = computed(() => props.segments && props.segments.length > 0)

// ====== 纯文本渲染 ======
const rendered = computed(() => renderMarkdown(props.content || ''))
const renderedInline = computed(() => {
  let t = props.content || ''
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return t.replace(/\n/g, '<br>')
})

function renderMarkdown(text) {
  try {
    // 1. 替换 localhost/openclaw 绝对 URL → 相对路径（流式输出实时可用）
    text = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):18622\/api\/download\/([^\s"'<>)\]]+)/g, '/api/download/openclaw/$1')
    text = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):18622\/([^\s"'<>)\]]+)/g, '/api/openclaw-proxy/$1')
    text = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):18621\/([^\s"'<>)\]]+)/g, '/$1')
    // 2. 替换 OpenClaw workspace 绝对路径 → 下载链接
    text = text.replace(/(\/[^\s"'<>)]*\.openclaw\/workspace\/([^\s"'<>)\]]+\.(?:xlsx|docx|pdf|pptx|png|jpg|csv|txt|md)))/gi, '/api/download/openclaw/$2')
    text = text.replace(/(\/[^\s"'<>)]*\.openclaw\/workspace\/([^\s"'<>)\]]+))/g, '[/api/download/openclaw/$2]')
    // 3. 现有的相对路径 → 可点击链接
    text = text.replace(/(?<!\]\()(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[^\s"'<>)]+)/g, '[$1]($1)')
    let html = marked.parse(text)
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener" ')
    const token = localStorage.getItem('token')
    if (token) {
      html = html.replace(/href="(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[^"]+)"/g, (_, url) => `href="${url}?token=${encodeURIComponent(token)}"`)
    }
    // 添加代码块复制按钮
    html = html.replace(/<pre><code/g, '<div class="code-block-wrapper"><pre><code')
    html = html.replace(/<\/code><\/pre>/g, '</code></pre><button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector(\'code\').textContent);this.textContent=\'已复制!\';setTimeout(()=>this.textContent=\'复制\',2000)">复制</button></div>')
    return html
  } catch { return text }
}

function formatToolName(name) {
  if (!name) return ''
  const short = name.replace(/^(mcp__|tool__)/, '').replace(/_/g, ' ')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

function formatCharCount(n) {
  if (n < 1000) return `${n} 字`
  return `${(n / 1000).toFixed(1)}k 字`
}

// ====== 审批 ======
const approval = computed(() => {
  try {
    const c = props.content || ''
    const match = c.match(/approval_required["\s:]+true/)
    if (!match) return null
    const idMatch = c.match(/审批ID:\s*(\S+)/) || c.match(/"approval_id":"(\S+?)"/)
    const toolMatch = c.match(/工具:\s*(\S+)/) || c.match(/"tool":"(\S+?)"/)
    const levelMatch = c.match(/级别:\s*(\S+)/) || c.match(/"level":"(\S+?)"/)
    const descMatch = c.match(/说明:\s*(.+?)(?:\n|$)/) || c.match(/"desc":"(.+?)"/)
    return {
      approval_id: idMatch?.[1] || '', tool: toolMatch?.[1] || '',
      level: levelMatch?.[1] || 'high', desc: descMatch?.[1] || ''
    }
  } catch { return null }
})

async function handleApprove() {
  if (!approval.value?.approval_id) return
  try {
    await fetch('/api/approval/' + approval.value.approval_id + '/approve', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    ElMessage.success('已批准')
  } catch { ElMessage.error('批准失败') }
}

async function handleDeny() {
  if (!approval.value?.approval_id) return
  try {
    await fetch('/api/approval/' + approval.value.approval_id + '/deny', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    ElMessage.info('已拒绝')
  } catch { ElMessage.error('操作失败') }
}

const isStatus = computed(() => props.role === 'tool')
const roleClass = computed(() => props.role === 'assistant' ? 'ai' : props.role)

// ====== 下载链接拦截 ======
function handleDownloadClick(e) {
  const link = e.target.closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  if (!/\/api\/download\//.test(href)) return
  e.preventDefault()
  const token = localStorage.getItem('token')
  const url = href.includes('?token=') ? href : `${href}${href.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`
  fetch(url).then(res => {
    if (!res.ok) throw new Error('下载失败')
    return res.blob()
  }).then(blob => {
    const filename = href.split('/').pop() || 'download'
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = downloadUrl; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(downloadUrl)
  }).catch(() => { window.open(url, '_blank') })
}
onMounted(() => document.addEventListener('click', handleDownloadClick))
onUnmounted(() => document.removeEventListener('click', handleDownloadClick))
</script>

<style scoped>
.chat-message { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
.chat-message.user { flex-direction: row-reverse; }
.chat-avatar {
  width: 36px; height: 36px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 16px;
}
.chat-message.ai .chat-avatar { background: #f0ecff; color: #7c3aed; }
.chat-message.user .chat-avatar { background: #e8f5e9; color: #2e7d32; }
.chat-message.tool .chat-avatar, .chat-message.status-msg .chat-avatar { background: #fff3e0; color: #e65100; }

.msg-body { flex: 1; min-width: 0 }
.segment-wrapper { margin-bottom: 6px; }
.segment-wrapper:last-child { margin-bottom: 0; }

/* ----- 消息气泡 ----- */
.message-bubble {
  max-width: 78%; padding: 12px 16px; border-radius: 16px;
  font-size: 14px; line-height: 1.65; word-break: break-word;
}
.chat-message.ai .message-bubble { background: #f8f7ff; color: #4a3f5e; }
.user-bubble { background: #7c3aed; color: #fff; }
.status-bubble { background: #fff8e1; color: #e65100; font-size: 13px; }

/* ====== 思考段 ====== */
.thinking-segment { margin-bottom: 4px; }
.thinking-toggle {
  display: flex; align-items: center; gap: 6px;
  background: none; border: 1px solid #ede9fe; border-radius: 8px;
  padding: 6px 10px; cursor: pointer; font-size: 12px; color: #7c3aed;
  font-weight: 600; transition: background 0.15s; font-family: inherit;
}
.thinking-toggle:hover { background: #f5f3ff; }
.thinking-icon { font-size: 10px; }
.thinking-label { flex: 0 0 auto; }
.thinking-chars { color: #b8aad0; font-weight: 400; margin-left: auto; font-size: 11px; }
.thinking-body {
  margin-top: 4px; padding: 10px 14px;
  background: #faf8ff; border: 1px solid #f0ecfc; border-radius: 10px;
  font-size: 13px; line-height: 1.6; color: #6b7280;
}

/* ====== 工具调用卡片 ====== */
.tools-segment { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
.tool-card {
  border: 1px solid #ede9fe; border-radius: 8px; overflow: hidden;
  background: #faf8ff; transition: border-color 0.15s;
}
.tool-card.running { border-color: #c4b5fd; background: #faf5ff; }
.tool-card.done { border-color: #bbf7d0; background: #f0fdf4; }
.tool-card.error { border-color: #fecaca; background: #fff5f5; }
.tool-card-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  background: none; border: none; cursor: pointer; width: 100%;
  font-size: 12px; color: #4a3f5e; font-weight: 500; font-family: inherit;
}
.tool-card-header:hover { opacity: 0.85; }
.tool-status-icon { font-size: 14px; display: flex; }
.tool-card-name { font-weight: 600; }
.tool-card-state { font-size: 11px; color: #7c3aed; margin-left: auto; }
.tool-card-state.done { color: #16a34a; }
.tool-card-state.error { color: #dc2626; }
.tool-card-chevron { font-size: 10px; color: #b8aad0; }
.tool-card-body { padding: 6px 10px 10px; border-top: 1px solid rgba(0,0,0,0.04); }
.tool-card-summary { font-size: 12px; color: #6b7280; line-height: 1.5; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }

/* ====== 代码块复制 ====== */
.markdown-body :deep(.code-block-wrapper) { position: relative; }
.markdown-body :deep(.code-block-wrapper .copy-code-btn) {
  position: absolute; top: 6px; right: 6px;
  padding: 3px 8px; background: rgba(124,58,237,0.1); color: #7c3aed;
  border: 1px solid rgba(124,58,237,0.2); border-radius: 6px;
  font-size: 11px; cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.markdown-body :deep(.code-block-wrapper:hover .copy-code-btn) { opacity: 1; }

/* ----- Markdown 表格 ----- */
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
.markdown-body :deep(th) { background: #ede9fe; color: #5b21b6; padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid #e0d6f5; }
.markdown-body :deep(td) { padding: 6px 12px; border: 1px solid #e0d6f5; }
.markdown-body :deep(tr:nth-child(even)) { background: #fafafe; }
.markdown-body :deep(strong) { color: #7c3aed; }
.markdown-body :deep(code) { background: #ede9fe; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #5b21b6; }
.markdown-body :deep(p) { margin: 0 0 6px; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 4px 0; padding-left: 20px; }
.markdown-body :deep(blockquote) { border-left: 3px solid #c4b5fd; padding-left: 12px; margin: 8px 0; color: #8b7aaf; }

.is-loading { animation: rotate 2s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ----- 审批卡片 ----- */
.approval-card { max-width: 360px; margin-bottom: 8px; background: #fffbeb; border: 2px solid #f59e0b; border-radius: 10px; overflow: hidden; }
.approval-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #fef3c7; font-weight: 600; font-size: 13px; color: #92400e; }
.approval-body { padding: 10px 14px; font-size: 12px; color: #78350f; }
.approval-row { margin: 4px 0; display: flex; align-items: center; gap: 6px; }
.approval-row .al { font-weight: 600; min-width: 32px; color: #92400e; }
.approval-row code { background: #fef3c7; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #d97706; }
.approval-actions { display: flex; gap: 8px; padding: 8px 14px; border-top: 1px solid #fde68a; }
</style>
