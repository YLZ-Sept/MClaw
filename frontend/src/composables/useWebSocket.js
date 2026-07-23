// 共享 WebSocket 连接 — 全局单例，响应式状态
// 替代各模块独立的 HTTP 轮询，统一接收后端推送

import { ref, readonly } from 'vue'

// 模块级单例
let _ws = null
let _reconnectTimer = null
let _reconnectDelay = 1000
let _intentionalClose = false
let _refs = null

function createSingleton() {
  const connected = ref(false)
  const systemHealth = ref(null)       // system_health 事件
  const channelHealth = ref(null)      // channel_health 事件（渠道健康快照）
  const channelStatus = ref({})        // channel_health 单渠道状态变更
  const events = ref([])              // 实时事件日志（最近 100 条）

  function connect() {
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return

    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      _ws = new WebSocket(`${protocol}//${location.hostname}:18621/ws/events`)

      _ws.onopen = () => {
        connected.value = true
        _reconnectDelay = 1000
      }

      _ws.onmessage = (msg) => {
        try {
          const e = JSON.parse(msg.data)
          switch (e.type) {
            case 'system_health':
              systemHealth.value = e
              break
            case 'channel_health':
              // 单渠道状态变更（来自 health.js heartbeat）
              if (e.channel) {
                channelStatus.value = { ...channelStatus.value, [e.channel]: e.status }
              } else {
                // 完整快照（来自 health-pusher）
                channelHealth.value = e
              }
              break
            case 'tool_executed':
            case 'approval_requested':
            case 'new_conversation':
            case 'new_message':
            case 'agent_changed':
            case 'account_status':
              events.value.unshift({ ...e, _time: Date.now() })
              if (events.value.length > 100) events.value.length = 100
              break
            default:
              // 未知类型也记录到事件流
              if (e.type) {
                events.value.unshift({ ...e, _time: Date.now() })
                if (events.value.length > 100) events.value.length = 100
              }
          }
        } catch {}
      }

      _ws.onclose = () => {
        connected.value = false
        if (!_intentionalClose) {
          _reconnectTimer = setTimeout(connect, _reconnectDelay)
          _reconnectDelay = Math.min(_reconnectDelay * 2, 30000)
        }
      }

      _ws.onerror = () => {
        // onclose 会紧随其后触发，由 onclose 处理重连
      }
    } catch {}
  }

  function disconnect() {
    _intentionalClose = true
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
    if (_ws) { _ws.close(); _ws = null }
    connected.value = false
  }

  return { connected, systemHealth, channelHealth, channelStatus, events, connect, disconnect }
}

export function useWebSocket() {
  if (!_refs) {
    _refs = createSingleton()
  }
  return {
    connected: readonly(_refs.connected),
    systemHealth: readonly(_refs.systemHealth),
    channelHealth: readonly(_refs.channelHealth),
    channelStatus: readonly(_refs.channelStatus),
    events: readonly(_refs.events),
    connect: _refs.connect,
    disconnect: _refs.disconnect,
  }
}
