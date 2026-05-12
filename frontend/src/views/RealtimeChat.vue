<template>
  <div class="chat-page">
    <div class="chat-header">
      <h3>
        <template v-if="currentAgentName">
          <el-tag size="small" round style="margin-right: 8px; background: #ede9fe; border-color: #c4b5fd; color: #7c3aed;">
            {{ currentAgentName }}
          </el-tag>
        </template>
        实时聊天
      </h3>
      <div style="display:flex;align-items:center;gap:8px;">
        <el-button size="small" text type="danger" @click="handleClear" :disabled="messages.length === 0">
          清空记录
        </el-button>
        <el-tag size="small" type="success" effect="dark">已连接</el-tag>
      </div>
    </div>

    <div class="chat-messages" ref="messagesRef">
      <ChatMessage
        v-for="(msg, i) in messages"
        :key="i"
        :role="msg.role"
        :content="msg.content"
      />
    </div>

    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <el-input
          v-model="inputText"
          :placeholder="'输入消息，Enter 发送，/ 打开指令'"
          @keyup.enter="handleSend"
          clearable
        />
        <el-button
          type="primary"
          class="send-btn"
          :icon="Promotion"
          @click="handleSend"
          :disabled="!inputText.trim()"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Promotion, Delete } from '@element-plus/icons-vue'
import { getChatHistory, sendMessage as apiSendMessage, clearChat } from '../api'
import ChatMessage from '../components/ChatMessage.vue'

const route = useRoute()
const messages = ref([])
const inputText = ref('')
const messagesRef = ref(null)

const currentAgentName = computed(() => route.query.agentName || null)

function agentKey() {
  return route.query.agent || null
}

async function loadHistory() {
  try {
    const res = await getChatHistory(agentKey())
    messages.value = res.data.data
  } catch {
    messages.value = [
      { role: 'ai', content: '你好！我是 MClaw 助手，有什么可以帮助你的？' }
    ]
  }
  scrollToBottom()
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''

  messages.value.push({ role: 'user', content: text })
  scrollToBottom()

  try {
    const res = await apiSendMessage(text, agentKey())
    messages.value.push({ role: 'ai', content: res.data.data.content })
  } catch {
    messages.value.push({ role: 'ai', content: `已收到：${text}，OpenClaw 正在处理...` })
  }
  scrollToBottom()
}

async function handleClear() {
  await clearChat(agentKey())
  messages.value = []
  scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// 切换 Agent 时重新加载历史
watch(() => route.query.agent, () => loadHistory())

onMounted(loadHistory)
</script>
