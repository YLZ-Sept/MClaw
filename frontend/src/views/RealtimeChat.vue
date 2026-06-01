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
          <el-button size="small" circle :icon="Upload" :disabled="streaming||uploading" :loading="uploading" title="上传文件并解析"/>
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
        <el-button type="primary" class="send-btn" :icon="Promotion" @click="handleSend" :loading="streaming" :disabled="!inputText.trim()||streaming">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Promotion, Upload } from '@element-plus/icons-vue'
import { getChatHistory, clearChat } from '../api'
import ChatMessage from '../components/ChatMessage.vue'
import axios from 'axios'
const req = axios.create({ baseURL: '/api' })

const route = useRoute()
const messages = ref([])
const inputText = ref('')
const inputRef = ref(null)
const streaming = ref(false)
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
    // 无会话时用旧方式
    try {
      const res = await getChatHistory(agentKey())
      messages.value = res.data.data
    } catch {
      messages.value = [{ role: 'ai', content: '你好！我是 MClaw 助手，有什么可以帮助你的？' }]
    }
  } else {
    try {
      const { data } = await req.get('/chat-sessions/' + sessionId.value + '/messages')
      messages.value = (data.data || []).map(m => ({
        role: m.role === 'assistant' ? 'ai' : m.role,
        content: m.content
      }))
      if (messages.value.length === 0) {
        messages.value = [{ role: 'ai', content: '你好！开始新的对话吧。' }]
      }
    } catch { messages.value = [{ role: 'ai', content: '会话加载失败' }] }
  }
  scrollToBottom()
}

// ----- 发送消息 -----
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return
  inputText.value = ''
  streaming.value = true

  messages.value.push({ role: 'user', content: text })
  const aiIdx = messages.value.length
  messages.value.push({ role: 'ai', content: '' })
  scrollToBottom()

  const body = { content: text, agent: agentKey(), stream: true }
  if (sessionId.value) body.session_id = sessionId.value
  await streamResponse(body, aiIdx)
}

function toolLabel(name) {
  const map = {
    list_customers: '查询客户列表', get_customer: '获取客户详情', create_customer: '创建客户',
    list_products: '查询产品', query_stock: '查询库存', stock_in: '入库', stock_out: '出库',
    list_employees: '查询员工', search_employee: '搜索员工',
    list_leaves: '查询请假', apply_leave: '提交请假', clock_in: '打卡',
    list_tickets: '查询工单', create_ticket: '创建工单',
    search_faq: '搜索知识库', list_documents: '查询文档',
    get_dashboard_stats: '获取数据概览', search_customer: '搜索客户',
    list_opportunities: '查询机会', list_contracts: '查询合同',
    list_suppliers: '查询供应商', list_purchase_orders: '查询采购单',
    list_sales_orders: '查询销售单', list_warehouses: '查询仓库',
    list_recruitment: '查询招聘', list_performance_schemes: '查询绩效',
    attendance_records: '查询考勤', attendance_monthly_report: '查询月报',
    list_feedback: '查询反馈', create_feedback: '记录反馈',
    generate_pptx: '生成 PPT', generate_excel: '生成 Excel',
    generate_pdf: '生成 PDF', generate_docx: '生成 Word',
    generate_diagram: '生成图表',
  }
  return map[name] || ('执行' + name)
}

const genLabels = { generate_pptx: 'PPT', generate_excel: 'Excel 报表', generate_pdf: 'PDF', generate_docx: 'Word 文档', generate_diagram: '图表' }

// ── 文件上传 & 解析 ──
async function handleUpload(options) {
  uploading.value = true
  const form = new FormData()
  form.append('file', options.file)

  try {
    const { data: res } = await req.post('/doc-import/upload', form)
    if (res.code === 200) {
      const d = res.data
      // 显示文件解析结果
      let info = `📎 已上传并解析文件：**${d.fileName}** (${(d.size/1024).toFixed(1)} KB)\n\n`
      if (d.error) {
        info += `⚠️ 解析警告：${d.error}\n\n`
      }
      if (d.text) {
        const preview = d.text.slice(0, 6000)
        info += `---\n### 📄 文件内容预览\n\n${preview}`
        if (d.text.length > 6000) info += `\n\n*(内容过长，仅展示前 6000 字符)*`
      }
      messages.value.push({ role: 'user', content: info })
      scrollToBottom()

      // 将文件全文作为上下文发送给 Agent
      if (d.text) {
        const fc = d.text.slice(0, 8000)
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
  const toolMsgs = []
  let pptDownloadUrl = null
  try {
    const dsRes = await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!dsRes.ok) throw new Error(`HTTP ${dsRes.status}`)
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
        if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); continue }
        if (!line.startsWith('data: ')) { if (line === '') eventType = 'message'; continue }
        let data; try { data = JSON.parse(line.slice(6)) } catch { continue }
        switch (eventType) {
          case 'tool':
            if (data.status === 'calling') {
              const tm = { role: 'tool', content: '🔍 正在' + toolLabel(data.name) + '...' }
              messages.value.push(tm); toolMsgs.push(messages.value.length - 1); scrollToBottom()
            } else if (data.status === 'done' && genLabels[data.name] && data.download_url) {
              pptDownloadUrl = data.download_url
              const label = genLabels[data.name]
              const isImg = data.name === 'generate_diagram'
              const tm = { role: 'ai', content: isImg
                ? `✅ ${label}已生成\n\n![${label}](${data.download_url})\n\n[📥 点击下载](${data.download_url})`
                : `✅ ${label}已生成\n\n[📥 点击下载 ${label}](${data.download_url})` }
              messages.value.push(tm); scrollToBottom()
            }
            break
          case 'text':
            rawText += data.content; messages.value[aiIdx].content = rawText; scrollToBottom(); break
          case 'polished':
            messages.value[aiIdx].content = data.content
            if (pptDownloadUrl) {
              messages.value[aiIdx].content = data.content
                .replace(/\[([^\]]*)\]\((?:sandbox:\/)?\/mnt\/data\/[^)\s]+\.pptx\)/g, `[$1](${pptDownloadUrl})`)
                .replace(/(?:sandbox:\/)?\/mnt\/data\/[\w.-]+\.pptx/g, pptDownloadUrl)
            }
            for (let i = toolMsgs.length - 1; i >= 0; i--) messages.value.splice(toolMsgs[i], 1)
            scrollToBottom(); break
          case 'error':
            messages.value[aiIdx].content = '抱歉，服务出现错误：' + (data.message || '未知错误'); break
          case 'done': break
        }
        eventType = 'message'
      }
    }
  } catch {
    messages.value[aiIdx].content = '消息发送失败，请检查后端服务后重试。'
  }
  streaming.value = false
  scrollToBottom()
  nextTick(() => inputRef.value?.focus())
}

async function handleClear() {
  if (sessionId.value) {
    await req.delete('/chat-sessions/' + sessionId.value + '/messages')
    messages.value = [{ role: 'ai', content: '对话已清空，开始新的交流吧。' }]
  } else {
    await clearChat(agentKey()); messages.value = []
  }
  scrollToBottom()
}

function scrollToBottom() { nextTick(() => { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight }) }

// ----- 初始化 -----
async function init() {
  // 如果 URL 带 session 参数，直接加载该会话
  const sid = route.query.session
  if (sid) {
    sessionId.value = sid
    try {
      const { data } = await req.get('/chat-sessions/' + sid)
      currentSessionName.value = data.data.name
    } catch {}
  }
  await loadMessages()
}

watch(() => route.query.session, (sid) => {
  if (sid) {
    sessionId.value = sid
    req.get('/chat-sessions/' + sid).then(({ data }) => { currentSessionName.value = data.data.name }).catch(() => {})
    loadMessages()
  }
})
watch(() => route.query.agent, () => init())
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
