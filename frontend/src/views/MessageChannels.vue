<template>
  <div class="mc-layout">
    <!-- 左侧会话列表 -->
    <aside class="mc-sidebar">
      <div class="mc-sidebar-hd">
        <span class="mc-title">消息中心</span>
        <el-button size="small" text @click="showAccountDlg = true"><el-icon><Plus /></el-icon></el-button>
      </div>

      <!-- 账号筛选 -->
      <div class="mc-filter">
        <el-select v-model="filterAccount" placeholder="全部账号" size="small" clearable style="width:100%">
          <el-option v-for="a in accounts" :key="a.id" :label="a.account_name" :value="a.id" />
        </el-select>
      </div>

      <!-- 平台筛选 -->
      <div class="mc-tabs">
        <span :class="{ active: filterPlatform==='' }" @click="filterPlatform=''">全部</span>
        <span :class="{ active: filterPlatform==='wechat' }" @click="filterPlatform='wechat'">微信</span>
        <span :class="{ active: filterPlatform==='wecom' }" @click="filterPlatform='wecom'">企微</span>
        <span :class="{ active: filterPlatform==='feishu' }" @click="filterPlatform='feishu'">飞书</span>
        <span :class="{ active: filterPlatform==='douyin' }" @click="filterPlatform='douyin'">抖音</span>
      </div>

      <!-- 会话列表 -->
      <div class="mc-conv-list" v-loading="convLoading">
        <div
          v-for="c in filteredConvs" :key="c.id"
          class="mc-conv-item"
          :class="{ active: activeConv?.id === c.id }"
          @click="selectConv(c)"
        >
          <div class="mc-conv-avatar">
            <el-avatar :size="36" :src="c.contact_avatar">{{ c.contact_name?.[0] || '联' }}</el-avatar>
            <span class="mc-platform-badge" :class="c.platform">{{ platLabel(c.platform) }}</span>
          </div>
          <div class="mc-conv-body">
            <div class="mc-conv-top">
              <span class="mc-conv-name">{{ c.contact_name }}</span>
              <span class="mc-conv-time">{{ fmtTime(c.updated_at || c.last_message_at) }}</span>
            </div>
            <div class="mc-conv-bottom">
              <span class="mc-conv-preview">{{ c.last_message || '暂无消息' }}</span>
              <el-badge v-if="c.unread_count > 0" :value="c.unread_count" class="mc-unread" />
            </div>
            <div class="mc-conv-meta">
              <el-tag size="small" :type="modeType(c.reply_mode)">{{ modeLabel(c.reply_mode) }}</el-tag>
              <span class="mc-conv-agent">{{ agentName(c.agent_id) }}</span>
            </div>
          </div>
          <el-button class="mc-conv-del" size="small" text type="danger" @click.stop="delConv(c.id)" title="删除会话">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-empty v-if="filteredConvs.length===0&&!convLoading" description="暂无会话" :image-size="60" />
      </div>
    </aside>

    <!-- 右侧聊天区 -->
    <main class="mc-main">
      <template v-if="!activeConv">
        <div class="mc-empty">
          <el-empty description="选择一个会话开始聊天" :image-size="120" />
          <div class="mc-empty-hint">
            <p>支持平台：微信 · 企业微信 · 飞书 · 抖音</p>
            <p>微信/抖音需要 <b>Sightflow</b> 桌面端运行，企微/飞书走官方 API</p>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- 聊天头部 -->
        <div class="mc-chat-hd">
          <div class="mc-chat-contact">
            <el-avatar :size="36" :src="activeConv.contact_avatar">{{ activeConv.contact_name?.[0] }}</el-avatar>
            <div>
              <div class="mc-chat-name">{{ activeConv.contact_name }}</div>
              <div class="mc-chat-platform">{{ platLabel(activeConv.platform) }} · {{ activeConv.account_id?.slice(0,8) }}</div>
            </div>
          </div>
          <div class="mc-chat-mode">
            <span class="mc-mode-label">回复模式</span>
            <el-radio-group v-model="activeConv.reply_mode" size="small" @change="changeMode">
              <el-radio-button value="auto">AI 托管</el-radio-button>
              <el-radio-button value="assisted">协同</el-radio-button>
              <el-radio-button value="manual">手动</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 消息列表 -->
        <div class="mc-msg-list" ref="msgListRef" v-loading="msgLoading">
          <div v-for="m in messages" :key="m.id" class="mc-msg-row" :class="m.direction">
            <div class="mc-msg-bubble" :class="m.direction">
              <div class="mc-msg-text">{{ m.content }}</div>
              <div class="mc-msg-time">{{ fmtTime(m.created_at) }}</div>
              <el-tag v-if="m.reply_mode!=='manual'" size="small" :type="m.reply_mode==='auto'?'success':'warning'" class="mc-msg-mode-tag">
                {{ m.reply_mode==='auto'?'AI':'协同' }}
              </el-tag>
            </div>
          </div>
          <div v-if="messages.length===0&&!msgLoading" class="mc-msg-empty">暂无消息</div>
        </div>

        <!-- AI 建议（协同模式） -->
        <div v-if="activeConv.reply_mode==='assisted' && aiSuggestion" class="mc-suggestion">
          <div class="mc-suggestion-hd">
            <el-icon><MagicStick /></el-icon> AI 建议回复
            <el-button size="small" text @click="useSuggestion">采纳并发送</el-button>
            <el-button size="small" text @click="editSuggestion">编辑后发送</el-button>
            <el-button size="small" text @click="aiSuggestion=''">忽略</el-button>
          </div>
          <div class="mc-suggestion-body">{{ aiSuggestion }}</div>
        </div>

        <!-- 输入区 -->
        <div class="mc-input-area">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="3"
            placeholder="输入回复..."
            resize="none"
            @keydown.enter.ctrl="sendReply"
          />
          <div class="mc-input-actions">
            <span class="mc-input-hint">Ctrl+Enter 发送</span>
            <div>
              <el-button v-if="activeConv.reply_mode==='assisted'" size="small" @click="getSuggestion" :loading="suggestLoading">
                <el-icon><MagicStick /></el-icon> 获取建议
              </el-button>
              <el-button type="primary" size="small" @click="sendReply" :loading="sendLoading">
                <el-icon><Promotion /></el-icon> 发送
              </el-button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- 账号管理对话框 -->
    <el-dialog v-model="showAccountDlg" title="渠道账号管理" width="860px" destroy-on-close>
      <el-table :data="accounts" size="small">
        <el-table-column prop="platform" label="平台" width="80">
          <template #default="{row}">{{ platLabel(row.platform) }}</template>
        </el-table-column>
        <el-table-column prop="account_name" label="账号名称" width="140" />
        <el-table-column label="账号 ID" width="120">
          <template #default="{row}">
            <el-tooltip :content="row.id" placement="top">
              <span class="mc-id-text">{{ row.id.slice(0,12) }}...</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="绑定智能体" width="140">
          <template #default="{row}">{{ agentName(row.agent_id) }}</template>
        </el-table-column>
        <el-table-column prop="default_reply_mode" label="默认模式" width="90">
          <template #default="{row}"><el-tag size="small" :type="modeType(row.default_reply_mode)">{{ modeLabel(row.default_reply_mode) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{row}">
            <span class="mc-status-dot" :class="{ online: onlineAccounts.has(row.id) }"></span>
            <span>{{ onlineAccounts.has(row.id) ? '在线' : (row.status==='active'?'离线':'停用') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{row}">
            <el-button size="small" text @click="editAccount(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="delAccount(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showAccountDlg=false">关闭</el-button>
        <el-button type="primary" @click="editAccount()">添加账号</el-button>
      </template>
    </el-dialog>

    <!-- 账号编辑对话框 -->
    <el-dialog v-model="showEditDlg" :title="editingAccount?.id ? '编辑账号' : '添加账号'" width="520px" destroy-on-close>
      <el-form :model="editForm" label-width="90px" size="small">
        <el-form-item label="平台" required>
          <el-select v-model="editForm.platform" style="width:100%">
            <el-option label="微信 (Sightflow 桌面端)" value="wechat" />
            <el-option label="企业微信 (官方 API)" value="wecom" />
            <el-option label="飞书 (官方 API)" value="feishu" />
            <el-option label="抖音 (Sightflow 桌面端)" value="douyin" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号名称" required>
          <el-input v-model="editForm.account_name" placeholder="如：张三的微信" />
          <template v-if="editForm.platform==='wechat'||editForm.platform==='douyin'">
            <span class="mc-form-hint">需在对应电脑上运行 Sightflow 桌面端，启动时使用此账号 ID 连接</span>
          </template>
        </el-form-item>
        <el-form-item label="绑定智能体">
          <el-select v-model="editForm.agent_id" clearable style="width:100%" placeholder="选择应用智能体">
            <el-option v-for="a in agentApps" :key="a.id" :label="a.name" :value="a.id">
              <span>{{ a.emoji }} {{ a.name }}</span>
              <span style="float:right;color:#909399;font-size:12px">{{ a.base_agent }}</span>
            </el-option>
          </el-select>
          <span class="mc-form-hint">从「应用智能体管理」中创建的智能体，用于该渠道的 AI 聊天回复</span>
        </el-form-item>
        <el-form-item label="默认回复模式">
          <el-radio-group v-model="editForm.default_reply_mode">
            <el-radio value="auto">AI 托管</el-radio>
            <el-radio value="assisted">协同</el-radio>
            <el-radio value="manual">手动</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="editForm.platform==='wecom'">
          <el-divider content-position="left">企业微信 API 配置</el-divider>
          <el-form-item label="Corp ID">
            <el-input v-model="editForm.config_corp_id" placeholder="企业 ID（必填）" />
          </el-form-item>
          <el-form-item label="Agent ID">
            <el-input v-model="editForm.config_agent_id" placeholder="应用 AgentID（必填，如 1000002）" />
          </el-form-item>
          <el-form-item label="App Secret">
            <el-input v-model="editForm.app_secret" type="password" placeholder="应用 Secret（必填）" />
          </el-form-item>
          <el-form-item label="Token">
            <el-input v-model="editForm.config_token" placeholder="回调 Token（必填，10-32位）" />
          </el-form-item>
          <el-form-item label="Encoding AES Key">
            <el-input v-model="editForm.config_aes_key" placeholder="消息加解密密钥（必填，43位）" />
          </el-form-item>
        </template>
        <template v-if="editForm.platform==='feishu'">
          <el-divider content-position="left">飞书 API 配置</el-divider>
          <el-form-item label="App ID">
            <el-input v-model="editForm.config_app_id" placeholder="应用 App ID（必填）" />
          </el-form-item>
          <el-form-item label="App Secret">
            <el-input v-model="editForm.app_secret" type="password" placeholder="应用 Secret（必填）" />
          </el-form-item>
          <el-form-item label="Encrypt Key">
            <el-input v-model="editForm.config_encrypt_key" placeholder="加密密钥（可选）" />
          </el-form-item>
          <el-form-item label="Verification Token">
            <el-input v-model="editForm.config_verification_token" placeholder="验证令牌（可选）" />
          </el-form-item>
        </template>
        <el-form-item label="状态">
          <el-switch v-model="editForm.status_active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDlg=false">取消</el-button>
        <el-button type="primary" @click="saveAccount" :loading="saveAcctLoading">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, Promotion, Delete } from '@element-plus/icons-vue'
import { channelAccountsApi, channelConversationsApi, agentAppsApi } from '../api/channels'

// ─── 数据 ───
const accounts = ref([])
const agentApps = ref([])
const conversations = ref([])
const activeConv = ref(null)
const messages = ref([])
const inputText = ref('')
const aiSuggestion = ref('')

const filterAccount = ref('')
const filterPlatform = ref('')

const convLoading = ref(false)
const msgLoading = ref(false)
const sendLoading = ref(false)
const suggestLoading = ref(false)

const showAccountDlg = ref(false)
const showEditDlg = ref(false)
const editingAccount = ref(null)
const saveAcctLoading = ref(false)
const editForm = ref({})
const msgListRef = ref(null)

let pollTimer = null
let wsEvents = null
const onlineAccounts = ref(new Set())

// ─── 平台/模式标签 ───
const platLabel = (p) => ({ wechat: '微信', wecom: '企微', feishu: '飞书', douyin: '抖音' }[p] || p)
const modeLabel = (m) => ({ auto: 'AI托管', assisted: '协同', manual: '手动' }[m] || m)
const modeType = (m) => ({ auto: 'success', assisted: 'warning', manual: 'info' }[m] || '')

function agentName(id) {
  if (!id) return ''
  const app = agentApps.value.find(a => a.id === id)
  if (app) return (app.emoji || '') + ' ' + app.name
  // Fallback: check system agents
  const sys = { 'internal-agent': '小内', 'sales-agent': '小销', 'support-agent': '小客' }
  return sys[id] || id
}

function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t + (t.length <= 19 ? '+08:00' : ''))
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (isToday) return `${hh}:${mm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

// ─── 筛选会话 ───
const filteredConvs = computed(() => {
  let list = conversations.value
  if (filterAccount.value) list = list.filter(c => c.account_id === filterAccount.value)
  if (filterPlatform.value) list = list.filter(c => c.platform === filterPlatform.value)
  return list
})

// ─── 加载账号 + 会话 ───
async function loadAccounts() {
  try {
    const { data } = await channelAccountsApi.list()
    accounts.value = data.data || []
  } catch { /* ignore */ }
}

async function loadAgentApps() {
  try {
    const { data } = await agentAppsApi.list()
    agentApps.value = data.data || []
  } catch { /* ignore */ }
}

async function loadConversations() {
  convLoading.value = true
  try {
    const params = { limit: 200 }
    if (filterAccount.value) params.account_id = filterAccount.value
    if (filterPlatform.value) params.platform = filterPlatform.value
    const { data } = await channelConversationsApi.list(params)
    conversations.value = data.data?.list || []
    // 保持选中状态
    if (activeConv.value) {
      const updated = conversations.value.find(c => c.id === activeConv.value.id)
      if (updated) activeConv.value = updated
    }
  } catch { /* ignore */ }
  convLoading.value = false
}

async function loadMessages() {
  if (!activeConv.value) return
  msgLoading.value = true
  try {
    const { data } = await channelConversationsApi.messages(activeConv.value.id)
    messages.value = data.data || []
    await nextTick()
    scrollBottom()
  } catch { /* ignore */ }
  msgLoading.value = false
}

function selectConv(c) {
  activeConv.value = c
  messages.value = []
  aiSuggestion.value = ''
  loadMessages()
}

async function changeMode(mode) {
  if (!activeConv.value) return
  try {
    await channelConversationsApi.setMode(activeConv.value.id, mode)
    ElMessage.success(`已切换为${modeLabel(mode)}模式`)
    aiSuggestion.value = ''
    // 同步本地
    const idx = conversations.value.findIndex(c => c.id === activeConv.value.id)
    if (idx >= 0) conversations.value[idx].reply_mode = mode
  } catch { ElMessage.error('切换失败') }
}

// ─── 协同：获取 AI 建议 ───
async function getSuggestion() {
  if (!activeConv.value) return
  suggestLoading.value = true
  try {
    const { data } = await channelConversationsApi.suggest(activeConv.value.id)
    aiSuggestion.value = data.data?.suggestion || ''
  } catch { ElMessage.error('获取建议失败') }
  suggestLoading.value = false
}

function useSuggestion() {
  inputText.value = aiSuggestion.value
  aiSuggestion.value = ''
}

function editSuggestion() {
  inputText.value = aiSuggestion.value
  aiSuggestion.value = ''
}

// ─── 发送回复 ───
async function sendReply() {
  if (!activeConv.value || !inputText.value.trim()) return
  sendLoading.value = true
  try {
    const mode = activeConv.value.reply_mode
    await channelConversationsApi.reply(activeConv.value.id, inputText.value.trim(), mode)
    inputText.value = ''
    aiSuggestion.value = ''
    loadMessages()
    loadConversations()
  } catch { ElMessage.error('发送失败') }
  sendLoading.value = false
}

// ─── 账号管理 ───
function editAccount(row) {
  editingAccount.value = row || null
  if (row) {
    let cfg = {}
    try { if (row.config) cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config } catch {}
    editForm.value = {
      platform: row.platform, account_name: row.account_name, agent_id: row.agent_id,
      default_reply_mode: row.default_reply_mode, status_active: row.status === 'active',
      app_secret: '',
      config_corp_id: cfg.corpid || '', config_agent_id: cfg.agentid || '',
      config_token: cfg.token || '', config_aes_key: cfg.encodingAESKey || '',
      config_app_id: cfg.app_id || '', config_encrypt_key: cfg.encrypt_key || '',
      config_verification_token: cfg.verification_token || ''
    }
  } else {
    editForm.value = { platform: 'wechat', account_name: '', agent_id: '', default_reply_mode: 'assisted', status_active: true,
      app_secret: '', config_corp_id: '', config_agent_id: '', config_token: '', config_aes_key: '',
      config_app_id: '', config_encrypt_key: '', config_verification_token: '' }
  }
  showEditDlg.value = true
}

async function saveAccount() {
  saveAcctLoading.value = true
  try {
    const config = {}
    const pf = editForm.value.platform
    if (pf === 'wecom') {
      if (editForm.value.config_corp_id) config.corpid = editForm.value.config_corp_id
      if (editForm.value.config_agent_id) config.agentid = editForm.value.config_agent_id
      if (editForm.value.app_secret) config.corpsecret = editForm.value.app_secret
      if (editForm.value.config_token) config.token = editForm.value.config_token
      if (editForm.value.config_aes_key) config.encodingAESKey = editForm.value.config_aes_key
    } else if (pf === 'feishu') {
      if (editForm.value.config_app_id) config.app_id = editForm.value.config_app_id
      if (editForm.value.app_secret) config.app_secret = editForm.value.app_secret
      if (editForm.value.config_encrypt_key) config.encrypt_key = editForm.value.config_encrypt_key
      if (editForm.value.config_verification_token) config.verification_token = editForm.value.config_verification_token
    } else {
      if (editForm.value.app_secret) config.app_secret = editForm.value.app_secret
    }
    const body = {
      platform: editForm.value.platform,
      account_name: editForm.value.account_name,
      agent_id: editForm.value.agent_id,
      default_reply_mode: editForm.value.default_reply_mode,
      status: editForm.value.status_active ? 'active' : 'inactive',
      config
    }
    if (editingAccount.value?.id) {
      await channelAccountsApi.update(editingAccount.value.id, body)
      ElMessage.success('已更新')
    } else {
      const { data } = await channelAccountsApi.create(body)
      const newId = data.data?.id
      if (newId && (editForm.value.platform === 'wechat' || editForm.value.platform === 'douyin')) {
        ElMessage.success({ message: `账号已创建，Sightflow 连接 ID: ${newId}`, duration: 8000 })
      } else {
        ElMessage.success('已创建')
      }
    }
    showEditDlg.value = false
    loadAccounts()
  } catch { ElMessage.error('保存失败') }
  saveAcctLoading.value = false
}

async function delAccount(id) {
  try {
    await ElMessageBox.confirm('确定删除该渠道账号？关联的会话和消息也将被删除。', '删除确认', { type: 'warning' })
    await channelAccountsApi.remove(id)
    ElMessage.success('已删除')
    loadAccounts()
    loadConversations()
  } catch (e) {
    if (e?.message) ElMessage.error(e.message)
  }
}

async function delConv(id) {
  try {
    await ElMessageBox.confirm('确定删除该会话？所有消息将被清空。', '删除确认', { type: 'warning' })
    await channelConversationsApi.remove(id)
    if (activeConv.value?.id === id) {
      activeConv.value = null
      messages.value = []
    }
    ElMessage.success('已删除')
    loadConversations()
  } catch (e) {
    if (e?.message) ElMessage.error(e.message)
  }
}

function scrollBottom() {
  const el = msgListRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// ─── 轮询刷新 ───
function connectEvents() {
  const url = `ws://${location.hostname}:3001/ws/events`
  wsEvents = new WebSocket(url)
  wsEvents.onmessage = (e) => {
    let event
    try { event = JSON.parse(e.data) } catch { return }
    switch (event.type) {
      case 'account_status':
        if (event.online) onlineAccounts.value.add(event.account_id)
        else onlineAccounts.value.delete(event.account_id)
        onlineAccounts.value = new Set(onlineAccounts.value) // trigger reactivity
        break
      case 'new_conversation': {
        const exists = conversations.value.find(c => c.id === event.conversation.id)
        if (!exists) {
          conversations.value.unshift(event.conversation)
        }
        break
      }
      case 'new_message': {
        if (activeConv.value && activeConv.value.id === event.conversation_id) {
          messages.value.push(event.message)
          nextTick(() => scrollBottom())
        }
        // Refresh the conversation's last_message
        const idx = conversations.value.findIndex(c => c.id === event.conversation_id)
        if (idx >= 0) {
          conversations.value[idx].last_message = event.message.content
          conversations.value[idx].last_message_at = event.message.created_at
          if (event.message.direction === 'incoming' && activeConv.value?.id !== event.conversation_id) {
            conversations.value[idx].unread_count = (conversations.value[idx].unread_count || 0) + 1
          }
        }
        break
      }
    }
  }
  wsEvents.onclose = () => { setTimeout(connectEvents, 5000) }
}

onMounted(() => {
  loadAccounts()
  loadAgentApps()
  loadConversations()
  connectEvents()
  pollTimer = setInterval(() => { loadConversations(); if (activeConv.value) loadMessages() }, 5000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
  if (wsEvents) wsEvents.close()
})
</script>

<style scoped>
.mc-layout { display:flex; height:calc(100vh - 100px); background:#f5f7fa; border-radius:8px; overflow:hidden; }
.mc-sidebar { width:340px; min-width:340px; background:#fff; border-right:1px solid #ebeef5; display:flex; flex-direction:column; }
.mc-sidebar-hd { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #ebeef5; }
.mc-title { font-size:16px; font-weight:600; }
.mc-filter { padding:10px 16px; }
.mc-tabs { display:flex; gap:0; padding:0 16px 8px; border-bottom:1px solid #ebeef5; }
.mc-tabs span { flex:1; text-align:center; padding:6px 0; font-size:13px; color:#909399; cursor:pointer; border-bottom:2px solid transparent; transition:all .2s; }
.mc-tabs span.active { color:#7c3aed; border-bottom-color:#7c3aed; }
.mc-tabs span:hover { color:#7c3aed; }
.mc-conv-list { flex:1; overflow-y:auto; }
.mc-conv-item { display:flex; padding:12px 16px; gap:10px; cursor:pointer; border-bottom:1px solid #f2f3f5; transition:background .15s; position:relative; }
.mc-conv-item:hover { background:#f8f7ff; }
.mc-conv-item:hover .mc-conv-del { display:flex; }
.mc-conv-item.active { background:#f5f3ff; }
.mc-conv-del { display:none; position:absolute; right:8px; top:50%; transform:translateY(-50%); }
.mc-conv-avatar { position:relative; }
.mc-platform-badge { position:absolute; bottom:-2px; right:-4px; font-size:10px; background:#7c3aed; color:#fff; padding:1px 4px; border-radius:6px; line-height:1.2; }
.mc-platform-badge.wechat { background:#07c160; }
.mc-platform-badge.douyin { background:#111; }
.mc-platform-badge.wecom { background:#1677ff; }
.mc-platform-badge.feishu { background:#3370ff; }
.mc-conv-body { flex:1; min-width:0; }
.mc-conv-top { display:flex; justify-content:space-between; }
.mc-conv-name { font-size:14px; font-weight:500; }
.mc-conv-time { font-size:11px; color:#c0c4cc; }
.mc-conv-bottom { display:flex; align-items:center; gap:6px; margin-top:4px; }
.mc-conv-preview { font-size:12px; color:#909399; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.mc-conv-meta { display:flex; align-items:center; gap:8px; margin-top:4px; }
.mc-conv-agent { font-size:11px; color:#c0c4cc; }

/* 右侧聊天 */
.mc-main { flex:1; display:flex; flex-direction:column; background:#fff; }
.mc-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.mc-empty-hint { text-align:center; color:#909399; font-size:13px; margin-top:12px; line-height:1.8; }
.mc-chat-hd { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; border-bottom:1px solid #ebeef5; }
.mc-chat-contact { display:flex; align-items:center; gap:10px; }
.mc-chat-name { font-size:15px; font-weight:600; }
.mc-chat-platform { font-size:12px; color:#909399; }
.mc-chat-mode { display:flex; align-items:center; gap:10px; }
.mc-mode-label { font-size:13px; color:#909399; }

.mc-msg-list { flex:1; overflow-y:auto; padding:16px 20px; }
.mc-msg-row { margin-bottom:14px; display:flex; }
.mc-msg-row.incoming { justify-content:flex-start; }
.mc-msg-row.outgoing { justify-content:flex-end; }
.mc-msg-bubble { max-width:70%; padding:10px 14px; border-radius:12px; position:relative; }
.mc-msg-bubble.incoming { background:#f0f2f5; border-bottom-left-radius:4px; }
.mc-msg-bubble.outgoing { background:#7c3aed; color:#fff; border-bottom-right-radius:4px; }
.mc-msg-text { font-size:14px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
.mc-msg-time { font-size:10px; margin-top:4px; opacity:.7; }
.mc-msg-mode-tag { position:absolute; top:-8px; right:8px; font-size:10px; }
.mc-msg-empty { text-align:center; color:#c0c4cc; padding:60px 0; font-size:13px; }

/* AI 建议条 */
.mc-suggestion { border-top:1px solid #e6a23c; background:#fdf6ec; padding:10px 20px; }
.mc-suggestion-hd { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#e6a23c; margin-bottom:6px; }
.mc-suggestion-body { font-size:13px; color:#606266; line-height:1.6; max-height:100px; overflow-y:auto; white-space:pre-wrap; }

/* 输入区 */
.mc-input-area { border-top:1px solid #ebeef5; padding:12px 20px; }
.mc-input-actions { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
.mc-input-hint { font-size:11px; color:#c0c4cc; }
.mc-form-hint { display:block; font-size:11px; color:#909399; margin-top:4px; line-height:1.5; }
.mc-id-text { font-family:monospace; font-size:11px; cursor:pointer; color:#7c3aed; }
.mc-status-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; background:#c0c4cc; }
.mc-status-dot.online { background:#67c23a; }
</style>
