<template>
  <div class="chat-message" :class="role">
    <div class="chat-avatar" v-if="role === 'ai'">
      <el-icon><ChatDotRound /></el-icon>
    </div>
    <div class="chat-avatar" v-else>
      <el-icon><UserFilled /></el-icon>
    </div>
    <div class="message-bubble">{{ content }}</div>
  </div>
</template>

<script setup>
defineProps({
  role: { type: String, required: true },
  content: { type: String, required: true }
})
</script>
