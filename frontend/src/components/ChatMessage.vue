<template>
  <div class="chat-message" :class="[role, { 'status-msg': isStatus }]">
    <div class="chat-avatar" v-if="role === 'ai' || role === 'tool'">
      <el-icon><ChatDotRound /></el-icon>
    </div>
    <div class="chat-avatar" v-else-if="role === 'user'">
      <el-icon><UserFilled /></el-icon>
    </div>
    <div class="msg-body">
      <!-- 工具调用进度 -->
      <div v-if="toolCalls && toolCalls.length" class="tool-progress">
        <div v-for="(tc, i) in toolCalls" :key="i" class="tool-item" :class="tc.status">
          <el-icon :size="14" class="tool-icon">
            <Loading v-if="tc.status === 'running'" class="is-loading" />
            <CircleCheck v-else-if="tc.status === 'done'" />
            <CircleClose v-else />
          </el-icon>
          <span class="tool-name">{{ formatToolName(tc.name) }}</span>
          <span v-if="tc.summary" class="tool-summary">{{ tc.summary }}</span>
        </div>
      </div>
      <!-- 审批卡片 -->
      <div v-if="approval" class="approval-card">
        <div class="approval-header">
          <el-icon size="16" color="#f59e0b"><WarningFilled /></el-icon>
          <span>危险操作需要审批</span>
          <el-tag :type="approval.level === 'critical' ? 'danger' : 'warning'" size="small" round>
            {{ approval.level }}
          </el-tag>
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
      <!-- 消息气泡 -->
      <div v-if="isStatus && !approval" class="message-bubble status-bubble">{{ content }}</div>
      <div v-else-if="!approval" class="message-bubble markdown-body" v-html="rendered"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({
  role: { type: String, required: true },
  content: { type: String, required: true },
  toolCalls: { type: Array, default: () => [] }
})

function formatToolName(name) {
  if (!name) return ''
  const short = name.replace(/^(mcp__|tool__)/, '').replace(/_/g, ' ')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

// 审批检测
const approval = computed(() => {
  try {
    const c = props.content || ''
    const match = c.match(/approval_required["\s:]+true/)
    if (!match) return null
    // 尝试从内容中提取审批信息
    const idMatch = c.match(/审批ID:\s*(\S+)/) || c.match(/"approval_id":"(\S+?)"/)
    const toolMatch = c.match(/工具:\s*(\S+)/) || c.match(/"tool":"(\S+?)"/)
    const levelMatch = c.match(/级别:\s*(\S+)/) || c.match(/"level":"(\S+?)"/)
    const descMatch = c.match(/说明:\s*(.+?)(?:\n|$)/) || c.match(/"desc":"(.+?)"/)
    return {
      approval_id: idMatch?.[1] || '',
      tool: toolMatch?.[1] || '',
      level: levelMatch?.[1] || 'high',
      desc: descMatch?.[1] || ''
    }
  } catch { return null }
})

async function handleApprove() {
  if (!approval.value?.approval_id) return
  try {
    await fetch('/api/approval/' + approval.value.approval_id + '/approve', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    ElMessage.success('已批准')
  } catch { ElMessage.error('批准失败') }
}

async function handleDeny() {
  if (!approval.value?.approval_id) return
  try {
    await fetch('/api/approval/' + approval.value.approval_id + '/deny', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    ElMessage.info('已拒绝')
  } catch { ElMessage.error('操作失败') }
}

const isStatus = computed(() => props.role === 'tool' || props.content.startsWith('🔍'))

const rendered = computed(() => {
  try {
    let text = props.content || ''
    text = text.replace(/(?<!\]\()(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[^\s"'<>)]+)/g, '[$1]($1)')
    let html = marked.parse(text)
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener" ')
    const token = localStorage.getItem('token')
    if (token) {
      html = html.replace(/href="(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[^"]+)"/g, (_, url) => `href="${url}?token=${encodeURIComponent(token)}"`)
    }
    return html
  } catch {
    return props.content
  }
})

// 下载链接拦截：用 blob 下载替代新标签页打开
function handleDownloadClick(e) {
  const link = e.target.closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  if (!/\/api\/download\/(excel|ppt|pdf|docx|diagram|openclaw)\//.test(href)) return
  e.preventDefault()
  const token = localStorage.getItem('token')
  const url = href.includes('?token=') ? href : `${href}${href.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`
  fetch(url).then(res => {
    if (!res.ok) throw new Error('下载失败')
    return res.blob()
  }).then(blob => {
    const filename = href.split('/').pop() || 'download'
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(downloadUrl)
  }).catch(() => {
    // fallback: 直接打开链接
    window.open(url, '_blank')
  })
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
.chat-message.tool .chat-avatar,
.chat-message.status-msg .chat-avatar { background: #fff3e0; color: #e65100; }
.message-bubble {
  max-width: 78%; padding: 12px 16px; border-radius: 16px;
  font-size: 14px; line-height: 1.65; word-break: break-word;
}
.chat-message.ai .message-bubble { background: #f8f7ff; color: #4a3f5e; }
.chat-message.user .message-bubble { background: #7c3aed; color: #fff; }
.chat-message.tool .message-bubble,
.status-bubble { background: #fff8e1; color: #e65100; font-size: 13px; }

/* Markdown 表格 */
.markdown-body :deep(table) {
  width: 100%; border-collapse: collapse; margin: 8px 0;
  font-size: 13px;
}
.markdown-body :deep(th) {
  background: #ede9fe; color: #5b21b6; padding: 8px 12px;
  text-align: left; font-weight: 600; border: 1px solid #e0d6f5;
}
.markdown-body :deep(td) {
  padding: 6px 12px; border: 1px solid #e0d6f5;
}
.markdown-body :deep(tr:nth-child(even)) { background: #fafafe; }
.markdown-body :deep(strong) { color: #7c3aed; }
.markdown-body :deep(code) {
  background: #ede9fe; padding: 2px 6px; border-radius: 4px;
  font-size: 13px; color: #5b21b6;
}
.markdown-body :deep(p) { margin: 0 0 6px; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 4px 0; padding-left: 20px; }
.markdown-body :deep(blockquote) {
  border-left: 3px solid #c4b5fd; padding-left: 12px;
  margin: 8px 0; color: #8b7aaf;
}

/* 工具调用进度 */
.msg-body { flex: 1; min-width: 0 }
.tool-progress {
  display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px;
}
.tool-item {
  display: inline-flex; align-items: center; gap: 5px; max-width: fit-content;
  padding: 3px 10px; border-radius: 6px;
  background: #f5f3ff; border: 1px solid #ede9fe;
  font-size: 12px; color: #5b4a7a;
}
.tool-item.running { border-color: #c4b5fd; background: #faf5ff }
.tool-item.running .tool-icon { color: #7c3aed }
.tool-item.done { border-color: #bbf7d0; background: #f0fdf4 }
.tool-item.done .tool-icon { color: #22c55e }
.tool-item.error { border-color: #fecaca; background: #fff5f5 }
.tool-item.error .tool-icon { color: #ef4444 }
.tool-name { font-weight: 600; white-space: nowrap; font-size: 12px }
.tool-summary {
  color: #909399; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 240px;
}

/* 审批卡片 */
.approval-card {
  max-width: 360px; margin-bottom: 8px;
  background: #fffbeb; border: 2px solid #f59e0b;
  border-radius: 10px; overflow: hidden;
}
.approval-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: #fef3c7;
  font-weight: 600; font-size: 13px; color: #92400e;
}
.approval-body { padding: 10px 14px; font-size: 12px; color: #78350f }
.approval-row { margin: 4px 0; display: flex; align-items: center; gap: 6px }
.approval-row .al { font-weight: 600; min-width: 32px; color: #92400e }
.approval-row code {
  background: #fef3c7; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; color: #d97706;
}
.approval-actions {
  display: flex; gap: 8px; padding: 8px 14px;
  border-top: 1px solid #fde68a;
}
</style>
