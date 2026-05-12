<template>
  <div class="chat-page">
    <div class="chat-header">
      <h3>
        <template v-if="currentAgent">
          <el-tag size="small" round style="margin-right: 8px; background: #ede9fe; border-color: #c4b5fd; color: #7c3aed;">
            {{ currentAgent }}
          </el-tag>
        </template>
        实时聊天
      </h3>
      <el-tag size="small" type="success" effect="dark">已连接</el-tag>
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
import { ref, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Promotion } from '@element-plus/icons-vue'
import { getChatHistory, sendMessage as apiSendMessage } from '../api'
import ChatMessage from '../components/ChatMessage.vue'

const route = useRoute()
const messages = ref([])
const inputText = ref('')
const messagesRef = ref(null)

const currentAgentId = ref(null)
const currentAgent = computed(() => route.query.agentName || null)

async function loadHistory() {
  currentAgentId.value = route.query.agent || null
  try {
    const res = await getChatHistory()
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
    const agent = route.query.agent || null
    const res = await apiSendMessage(text, agent)
    messages.value.push({ role: 'ai', content: res.data.data.content })
  } catch {
    messages.value.push({ role: 'ai', content: `已收到：${text}，OpenClaw 正在处理...` })
  }
  scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

onMounted(loadHistory)
</script>
