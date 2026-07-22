<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="picker">
      <div class="picker-header">
        <div>
          <h2 class="picker-title">添加渠道</h2>
          <p class="picker-subtitle">选择要连接的消息平台，开始统一管理消息</p>
        </div>
        <button class="picker-close" @click="close" title="取消">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="picker-scroll">
        <section v-for="group in groups" :key="group.key" class="picker-section">
          <h3 class="picker-section-title">{{ group.label }}</h3>
          <div class="picker-grid">
            <button
              v-for="type in group.types"
              :key="type.value"
              class="picker-card"
              @click="pick(type.value)"
            >
              <span class="picker-emoji">{{ type.emoji }}</span>
              <div class="picker-text">
                <span class="picker-name">{{ type.label }}</span>
                <span class="picker-desc">{{ type.desc }}</span>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'pick'])

const groups = [
  {
    key: 'im',
    label: '即时通讯',
    types: [
      { value: 'telegram', label: 'Telegram', emoji: '✈️', desc: '连接 Telegram Bot API' },
      { value: 'discord', label: 'Discord', emoji: '🎮', desc: '连接 Discord Bot' },
      { value: 'slack', label: 'Slack', emoji: '💬', desc: '连接 Slack 工作区' },
      { value: 'qq', label: 'QQ', emoji: '🐧', desc: '连接 QQ Bot' },
    ]
  },
  {
    key: 'enterprise',
    label: '企业办公',
    types: [
      { value: 'wecom', label: '企业微信', emoji: '🏢', desc: '企业微信回调接入' },
      { value: 'feishu', label: '飞书', emoji: '🐦', desc: '飞书应用消息接入' },
      { value: 'dingtalk', label: '钉钉', emoji: '📌', desc: '钉钉机器人接入' },
    ]
  },
  {
    key: 'web',
    label: '网页 & 通用',
    types: [
      { value: 'wechat', label: '微信 Bot', emoji: '💚', desc: 'iLink Bot 长轮询' },
      { value: 'webchat', label: '网页聊天', emoji: '🌐', desc: '嵌入式 WebChat 挂件' },
      { value: 'web', label: 'Web', emoji: '🔗', desc: '通用 Web 消息通道' },
      { value: 'webhook', label: 'Webhook', emoji: '🪝', desc: '通用 Webhook 接入' },
    ]
  },
]

function pick(type) { emit('pick', type); emit('update:modelValue', false) }
function close() { emit('update:modelValue', false) }
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.picker { background: #fff; border-radius: 18px; width: 100%; max-width: 640px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.18); overflow: hidden; }
.picker-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 26px 16px; border-bottom: 1px solid #f0ecfc; }
.picker-title { font-size: 19px; font-weight: 700; color: #4a3f5e; margin: 0; }
.picker-subtitle { font-size: 13px; color: #94a3b8; margin: 4px 0 0; line-height: 1.5; }
.picker-close { width: 32px; height: 32px; border: none; background: none; cursor: pointer; color: #b8aad0; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; }
.picker-close:hover { background: #f5f3ff; color: #4a3f5e; }

.picker-scroll { flex: 1; overflow-y: auto; padding: 18px 22px 22px; }
.picker-section { margin-top: 18px; }
.picker-section:first-child { margin-top: 4px; }
.picker-section-title { font-size: 12px; font-weight: 700; color: #b8aad0; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 4px 10px; }
.picker-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

.picker-card { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: #faf8ff; border: 1.5px solid transparent; border-radius: 12px; cursor: pointer; transition: all 0.15s; font-family: inherit; text-align: left; }
.picker-card:hover { border-color: #7c3aed; background: #f5f3ff; transform: translateY(-1px); }
.picker-emoji { font-size: 28px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.picker-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.picker-name { font-size: 14px; font-weight: 600; color: #4a3f5e; line-height: 1.3; }
.picker-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; }
</style>
