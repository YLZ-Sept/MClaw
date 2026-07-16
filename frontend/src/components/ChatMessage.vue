<template>
  <div class="chat-message" :class="[role, { 'status-msg': isStatus }]">
    <div class="chat-avatar" v-if="role === 'ai' || role === 'tool'">
      <el-icon><ChatDotRound /></el-icon>
    </div>
    <div class="chat-avatar" v-else-if="role === 'user'">
      <el-icon><UserFilled /></el-icon>
    </div>
    <div v-if="isStatus" class="message-bubble status-bubble">{{ content }}</div>
    <div v-else class="message-bubble markdown-body" v-html="rendered"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'

// marked 配置
marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({
  role: { type: String, required: true },
  content: { type: String, required: true }
})

const isStatus = computed(() => props.role === 'tool' || props.content.startsWith('🔍'))

const rendered = computed(() => {
  try {
    let text = props.content || ''
    // 自动将下载链接转为可点击的 markdown 链接（跳过已在链接中的 URL）
    text = text.replace(/(?<!\]\()(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[\w.-]+)/g, '[$1]($1)')
    let html = marked.parse(text)
    // 所有链接新标签打开，避免 SPA 路由拦截
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener" ')
    // 下载链接注入 token，避免新标签页打开时 401
    const token = localStorage.getItem('token')
    if (token) {
      html = html.replace(/href="(\/api\/download\/(?:ppt|excel|pdf|docx|diagram|openclaw)\/[\w.-]+)"/g, (_, url) => `href="${url}?token=${encodeURIComponent(token)}"`)
    }
    return html
  } catch {
    return props.content
  }
})
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
</style>
