<template>
  <div class="chat-page">
    <div class="chat-header">
      <h3>
        <template v-if="currentAgentName">
          <el-tag size="small" round style="margin-right:8px;background:#ede9fe;border-color:#c4b5fd;color:#7c3aed;">
            {{ currentAgentName }}
          </el-tag>
        </template>
        实时聊天
        <span v-if="currentSessionName" class="session-title">- {{ currentSessionName }}</span>
      </h3>
      <div style="display:flex;align-items:center;gap:8px;">
        <el-button size="small" @click="handleClear" :disabled="streaming">清空记录</el-button>
        <el-tag size="small" type="success" effect="dark">已连接</el-tag>
      </div>
    </div>

    <div class="chat-messages" ref="messagesRef">
      <ChatMessage v-for="(msg, i) in messages" :key="i" :role="msg.role" :content="msg.content" />
      <div v-if="streaming" class="typing-indicator">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    </div>

    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <el-upload
          ref="uploadRef"
          :auto-upload="true"
          :show-file-list="false"
          :http-request="handleUpload"
          :disabled="streaming || uploading"
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.html,.json,.xml,.log,.ppt,.pptx"
        >
          <el-button size="small" circle :icon="Upload" :loading="uploading" title="上传文件并解析"/>
        </el-upload>
        <el-input
          ref="inputRef"
          v-model="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 5 }"
          :placeholder="streaming?'等待回复中...':'输入消息，Enter 发送，Shift+Enter 换行'"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="streaming"
          resize="none"
        />
        <el-button v-if="streaming" type="danger" class="send-btn" @click="handleStop">⏹ 停止</el-button>
        <el-button v-else type="primary" class="send-btn" :icon="Promotion" @click="handleSend" :disabled="!inputText.trim()">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Promotion, Upload } from '@element-plus/icons-vue'
import request, { getChatHistory, clearChat } from '../api/index.js'
import ChatMessage from '../components/ChatMessage.vue'

const router = useRouter()
const route = useRoute()
const messages = ref([])
const inputText = ref('')
const inputRef = ref(null)
const streaming = ref(false)
const abortController = ref(null)
const uploading = ref(false)
const uploadRef = ref(null)
const messagesRef = ref(null)

const sessionId = ref(null)
const currentSessionName = ref('')

const currentAgentName = computed(() => route.query.agentName || null)

function agentKey() {
  return route.query.agent || null
}

async function loadMessages() {
  if (!sessionId.value) {
    // 无会话时从空开始，不伪造历史
    try {
      const res = await getChatHistory(agentKey())
      messages.value = (res.data.data || []).map(m => ({
        role: m.role === 'assistant' ? 'ai' : m.role,
        content: m.content
      }))
    } catch {
      messages.value = []
    }
  } else {
    try {
      const { data } = await request.get('/chat-sessions/' + sessionId.value + '/messages')
      messages.value = (data.data || []).map(m => ({
        role: m.role === 'assistant' ? 'ai' : m.role,
        content: m.content
      }))
    } catch { messages.value = [] }
  }
  scrollToBottom()
}

// ----- 发送消息 -----
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  // 等待 greetExpert 完成，避免竞态创建两个会话
  while (greetingInProgress.value) {
    await new Promise(r => setTimeout(r, 100))
  }

  inputText.value = ''
  streaming.value = true
  abortController.value = new AbortController()

  await ensureSession(text.slice(0, 20))

  messages.value.push({ role: 'user', content: text })
  const aiIdx = messages.value.length
  messages.value.push({ role: 'ai', content: '' })
  scrollToBottom()

  const body = { content: text, agent: agentKey(), stream: true }
  if (sessionId.value) body.session_id = sessionId.value
  await streamResponse(body, aiIdx)
}

// 自动创建会话（有 agent 但无 session 时）
async function ensureSession(fallbackName = '新会话') {
  if (!agentKey() || sessionId.value || route.query.employee_id) return
  try {
    const sessionName = currentAgentName.value || fallbackName
    const { data } = await request.post('/chat-sessions', { name: sessionName, agent_id: agentKey() })
    if (data.data?.id) {
      sessionId.value = data.data.id
      router.replace({ query: { ...route.query, session: data.data.id } })
    }
  } catch { /* 创建失败不阻塞发送 */ }
}

// ── 文件上传 & 解析 ──
async function handleUpload(options) {
  uploading.value = true
  const form = new FormData()
  form.append('file', options.file)

  try {
    const { data: res } = await request.post('/doc-import/upload', form)
    if (res.code === 200) {
      const d = res.data
      // 显示文件解析结果
      let info = `📎 已上传并解析文件：**${d.fileName}** (${(d.size/1024).toFixed(1)} KB)\n\n`
      if (d.error) {
        info += `⚠️ 解析警告：${d.error}\n\n`
      }
      if (d.text) {
        const preview = d.text.slice(0, 10000)
        info += `---\n### 📄 文件内容预览\n\n${preview}`
        if (d.text.length > 10000) info += `\n\n*(内容过长，仅展示前 10000 字符)*`
      }
      messages.value.push({ role: 'user', content: info })
      ElMessage.success(`已解析：${d.fileName}`)
      scrollToBottom()

      // 将文件全文作为上下文发送给 Agent
      if (d.text) {
        await ensureSession(d.fileName.slice(0, 20))
        const fc = d.text.slice(0, 10000)
        const body = {
          content: `[系统上下文] 用户上传了文件「${d.fileName}」，以下是文件内容。请根据此内容主动引导用户，询问用户需要什么帮助：\n\n${fc}`,
          agent: agentKey(),
          stream: true
        }
        if (sessionId.value) body.session_id = sessionId.value
        const aiIdx = messages.value.length
        messages.value.push({ role: 'ai', content: '' })
        streaming.value = true
        await streamResponse(body, aiIdx)
      }
    } else {
      messages.value.push({ role: 'tool', content: `❌ 文件上传失败：${res.message}` })
      scrollToBottom()
    }
  } catch (e) {
    messages.value.push({ role: 'tool', content: `❌ 上传出错：${e.message || '未知错误'}` })
    scrollToBottom()
  }
  uploading.value = false
}

// ── SSE 流式响应抽取 ──
async function streamResponse(body, aiIdx) {
  const signal = abortController.value?.signal
  try {
    const token = localStorage.getItem('token')
    const dsRes = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal
    })
    if (!dsRes.ok) {
      let errMsg = `HTTP ${dsRes.status}`
      try {
        const errData = await dsRes.json()
        if (errData.message) errMsg = errData.message
      } catch {}
      throw new Error(errMsg)
    }
    const reader = dsRes.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', rawText = '', eventType = 'message'
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (signal?.aborted) break
        if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); continue }
        if (!line.startsWith('data: ')) { if (line === '') eventType = 'message'; continue }
        let data; try { data = JSON.parse(line.slice(6)) } catch { continue }
        if (eventType === 'text') {
          rawText += data.content; messages.value[aiIdx].content = rawText; scrollToBottom()
        } else if (eventType === 'error') {
          messages.value[aiIdx].content = '抱歉，服务出现错误：' + (data.message || '未知错误')
        }
        eventType = 'message'
      }
    }
    if (signal?.aborted) {
      if (!messages.value[aiIdx].content) messages.value[aiIdx].content = '(已停止生成)'
      else messages.value[aiIdx].content += '\n\n*(已停止生成)*'
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      if (!messages.value[aiIdx].content) messages.value[aiIdx].content = '(已停止生成)'
      else messages.value[aiIdx].content += '\n\n*(已停止生成)*'
    } else {
      messages.value[aiIdx].content = '消息发送失败：' + (e.message || '请检查后端服务后重试')
    }
  }
  streaming.value = false
  abortController.value = null
  scrollToBottom()
  nextTick(() => inputRef.value?.focus())
}

function handleStop() {
  if (abortController.value) {
    abortController.value.abort()
  }
}

async function handleClear() {
  try {
    if (sessionId.value) {
      await request.delete('/chat-sessions/' + sessionId.value + '/messages')
      messages.value = [{ role: 'ai', content: '对话已清空，开始新的交流吧。' }]
    } else {
      await clearChat(agentKey()); messages.value = []
    }
  } catch (e) {
    ElMessage.error('清空失败: ' + (e.response?.data?.message || e.message))
  }
  scrollToBottom()
}

function scrollToBottom() { nextTick(() => { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight }) }

// ----- 初始化 -----
const greetingInProgress = ref(false)

async function init() {
  // 如果 URL 带 session 参数，直接加载该会话
  const sid = route.query.session
  if (sid) {
    sessionId.value = sid
    try {
      const { data } = await request.get('/chat-sessions/' + sid)
      currentSessionName.value = data.data.name
    } catch {}
  }
  await loadMessages()

  // 从专家广场进入：无 session、无消息 → 自动创建会话 + 专家自我介绍
  const ag = agentKey()
  if (ag && !sid && messages.value.length === 0 && !greetingInProgress.value) {
    await greetExpert(ag)
  }
}

async function greetExpert(ag) {
  greetingInProgress.value = true
  try {
    const sessionName = currentAgentName.value || '新会话'
    const { data } = await request.post('/chat-sessions', {
      name: sessionName,
      agent_id: ag
    })
    if (!data.data?.id) return
    sessionId.value = data.data.id

    // 先发消息再更新 URL，避免 session watcher 触发 loadMessages 清空消息
    const body = { content: '你好，请简单介绍一下你的身份和能力', agent: ag, stream: true, session_id: data.data.id }
    streaming.value = true
    messages.value.push({ role: 'user', content: '你好' })
    const aiIdx = messages.value.length
    messages.value.push({ role: 'ai', content: '' })
    scrollToBottom()
    await streamResponse(body, aiIdx)
    router.replace({ query: { ...route.query, session: data.data.id } })
  } catch { /* 失败不阻塞 */ }
  finally { greetingInProgress.value = false }
}

watch(() => route.query.session, (sid) => {
  if (sid) {
    sessionId.value = sid
    request.get('/chat-sessions/' + sid).then(({ data }) => { currentSessionName.value = data.data.name }).catch(() => {})
    loadMessages()
  }
})
watch(() => route.query.agent, () => { sessionId.value = null; currentSessionName.value = ''; init() })
onMounted(init)
</script>

<style scoped>
.chat-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.chat-header {
  padding: 14px 24px; background: #fff; border-bottom: 1px solid #f0ecfc;
  display: flex; align-items: center; justify-content: space-between;
}
.chat-header h3 { margin: 0; font-size: 16px; color: #4a3f5e; display: flex; align-items: center; }
.session-title { font-size: 14px; color: #7c3aed; margin-left: 4px; font-weight: 400; }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px 24px; }
.chat-input-area { padding: 12px 24px 20px; background: #fff; border-top: 1px solid #f0ecfc; }
.chat-input-wrapper { display: flex; gap: 10px; align-items: flex-end; }
.chat-input-wrapper .el-input { flex: 1; }
.chat-input-wrapper :deep(.el-textarea__inner) { line-height: 1.6; font-size: 14px; }
.send-btn { flex-shrink: 0; height: 36px; align-self: flex-end; }
.chat-input-wrapper .el-upload { flex-shrink: 0; align-self: flex-end; margin-bottom: 2px; }
.typing-indicator { display: flex; gap: 4px; padding: 8px 0; }
.typing-indicator .dot { width: 8px; height: 8px; border-radius: 50%; background: #c4b5fd; animation: bounce 1.4s infinite ease-in-out both; }
.typing-indicator .dot:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator .dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

</style>
