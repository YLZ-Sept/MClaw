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
        <span :class="{ active: filterPlatform==='wechat' }" @click="filterPlatform='wechat'"><i class="mc-dot wechat"></i>微信</span>
        <span :class="{ active: filterPlatform==='wecom' }" @click="filterPlatform='wecom'"><i class="mc-dot wecom"></i>企微</span>
        <span :class="{ active: filterPlatform==='feishu' }" @click="filterPlatform='feishu'"><i class="mc-dot feishu"></i>飞书</span>
        <span :class="{ active: filterPlatform==='douyin' }" @click="filterPlatform='douyin'"><i class="mc-dot douyin"></i>抖音</span>
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
            <el-avatar :size="40" :src="c.contact_avatar">{{ c.contact_name?.[0] || '联' }}</el-avatar>
            <span class="mc-online-dot" v-if="onlineAccounts.has(c.account_id)"></span>
            <span class="mc-platform-badge" :class="c.platform">{{ platShort(c.platform) }}</span>
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
          <template v-for="(m, i) in messages" :key="m.id">
            <div v-if="i===0 || fmtDate(m.created_at)!==fmtDate(messages[i-1].created_at)" class="mc-date-sep">{{ fmtDate(m.created_at) }}</div>
            <div class="mc-msg-row" :class="m.direction">
              <div class="mc-msg-bubble" :class="m.direction">
                <div class="mc-msg-text">{{ m.content }}</div>
                <div class="mc-msg-time">{{ fmtTime(m.created_at) }}</div>
                <el-tag v-if="m.reply_mode!=='manual'" size="small" :type="m.reply_mode==='auto'?'success':'warning'" class="mc-msg-mode-tag">
                  {{ m.reply_mode==='auto'?'AI':'协同' }}
                </el-tag>
              </div>
            </div>
          </template>
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
        <el-table-column label="绑定智能体" width="200">
          <template #default="{row}">
            <template v-if="row.agent_ids?.length">
              <el-tag v-for="aid in row.agent_ids" :key="aid" size="small" type="primary" effect="plain" style="margin:1px 2px">{{ agentName(aid) }}</el-tag>
            </template>
            <span v-else style="color:#c0c4cc">未设置</span>
          </template>
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
          <el-select v-model="editForm.agent_ids" multiple clearable style="width:100%" placeholder="选择数字人或智能体">
            <el-option-group v-if="digitalEmployees.length" label="数字人">
              <el-option v-for="d in digitalEmployees" :key="d.id" :label="d.name" :value="d.id">
                <span>{{ d.avatar_emoji || '\u{1F9D1}' }} {{ d.name }}</span>
                <span style="float:right;color:#909399;font-size:12px">{{ d.role }}</span>
              </el-option>
            </el-option-group>
            <el-option-group label="智能体">
              <el-option v-for="a in agentApps" :key="a.id" :label="a.name" :value="a.id">
                <span>{{ a.emoji }} {{ a.name }}</span>
                <span style="float:right;color:#909399;font-size:12px">{{ a.base_agent }}</span>
              </el-option>
            </el-option-group>
          </el-select>
          <span class="mc-form-hint">可选择多个数字人或智能体，新建会话默认使用第一个</span>
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
import { channelAccountsApi, channelConversationsApi, agentAppsApi, digitalEmployeesApi } from '../api/channels'

// ─── 数据 ───
const accounts = ref([])
const agentApps = ref([])
const digitalEmployees = ref([])
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
const platShort = (p) => ({ wechat: '微', wecom: '企', feishu: '飞', douyin: '抖' }[p] || p?.charAt(0))
const modeLabel = (m) => ({ auto: 'AI托管', assisted: '协同', manual: '手动' }[m] || m)
const modeType = (m) => ({ auto: 'success', assisted: 'warning', manual: 'info' }[m] || '')

function agentName(id) {
  if (!id) return ''
  const de = digitalEmployees.value.find(d => d.id === id)
  if (de) return (de.avatar_emoji || '\u{1F9D1}') + ' ' + de.name
  const app = agentApps.value.find(a => a.id === id)
  if (app) return (app.emoji || '') + ' ' + app.name
  const sys = { 'internal-agent': '小内', 'sales-agent': '小销', 'support-agent': '小客' }
  return sys[id] || id
}

// 合并数字人+智能体，用于下拉选项
const bindingOptions = computed(() => {
  const options = []
  // 智能体分组
  for (const a of agentApps.value) {
    options.push({ id: a.id, name: (a.emoji || '') + ' ' + a.name, type: '智能体', base: a.base_agent })
  }
  // 数字人分组
  for (const d of digitalEmployees.value) {
    options.push({ id: d.id, name: (d.avatar_emoji || '\u{1F9D1}') + ' ' + d.name, type: '数字人', base: d.role })
  }
  return options
})

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

function fmtDate(t) {
  if (!t) return ''
  const d = new Date(t + (t.length <= 19 ? '+08:00' : ''))
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now.getTime() - 86400000)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  if (isToday) return '今天'
  if (isYesterday) return '昨天'
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
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

async function loadDigitalEmployees() {
  try {
    const { data } = await digitalEmployeesApi.list()
    digitalEmployees.value = data.data || []
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
    const agentIds = row.agent_ids || (row.agent_id ? [row.agent_id] : [])
    editForm.value = {
      platform: row.platform, account_name: row.account_name, agent_ids: agentIds,
      default_reply_mode: row.default_reply_mode, status_active: row.status === 'active',
      app_secret: '',
      config_corp_id: cfg.corpid || '', config_agent_id: cfg.agentid || '',
      config_token: cfg.token || '', config_aes_key: cfg.encodingAESKey || '',
      config_app_id: cfg.app_id || '', config_encrypt_key: cfg.encrypt_key || '',
      config_verification_token: cfg.verification_token || ''
    }
  } else {
    editForm.value = { platform: 'wechat', account_name: '', agent_ids: [], default_reply_mode: 'assisted', status_active: true,
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
      agent_ids: editForm.value.agent_ids || [],
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
  const url = `ws://${location.hostname}:18621/ws/events`
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
  loadDigitalEmployees()
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
/* ─── Design Tokens ─── */
.mc-layout {
  --mc-primary: #7c3aed;
  --mc-primary-light: #a78bfa;
  --mc-primary-bg: #f5f3ff;
  --mc-primary-hover: #f0ecff;
  --mc-bg: #f8f9fc;
  --mc-white: #fff;
  --mc-border: #e8eaef;
  --mc-text: #1f2937;
  --mc-text-secondary: #6b7280;
  --mc-text-muted: #9ca3af;
  --mc-wechat: #07c160;
  --mc-wecom: #1677ff;
  --mc-feishu: #3370ff;
  --mc-douyin: #111827;
  --mc-success: #10b981;
  --mc-warning: #f59e0b;
  --mc-radius: 12px;
  --mc-shadow-sm: 0 1px 3px rgba(0,0,0,.04);
  --mc-shadow-md: 0 4px 12px rgba(0,0,0,.06);
  --mc-shadow-lg: 0 8px 24px rgba(0,0,0,.08);
  --mc-transition: .2s cubic-bezier(.4,0,.2,1);
}

/* ─── Layout ─── */
.mc-layout {
  display:flex; height:calc(100vh - 100px); background:var(--mc-bg);
  border-radius:var(--mc-radius); overflow:hidden;
  box-shadow:var(--mc-shadow-sm);
}

/* ─── Sidebar ─── */
.mc-sidebar {
  width:340px; min-width:340px; background:var(--mc-white);
  border-right:1px solid var(--mc-border); display:flex; flex-direction:column;
}
.mc-sidebar-hd {
  display:flex; align-items:center; justify-content:space-between;
  padding:16px 20px; border-bottom:1px solid var(--mc-border);
}
.mc-title { font-size:17px; font-weight:700; color:var(--mc-text); letter-spacing:-.01em; }
.mc-filter { padding:12px 16px; }

/* ─── Platform Tabs ─── */
.mc-tabs {
  display:flex; gap:2px; padding:4px 12px 0;
  border-bottom:1px solid var(--mc-border); background:var(--mc-white);
}
.mc-tabs span {
  flex:1; text-align:center; padding:8px 0; font-size:12.5px; color:var(--mc-text-muted);
  cursor:pointer; border-bottom:2px solid transparent; transition:all var(--mc-transition);
  display:flex; align-items:center; justify-content:center; gap:5px;
  position:relative; top:1px;
}
.mc-tabs span.active { color:var(--mc-primary); border-bottom-color:var(--mc-primary); font-weight:600; }
.mc-tabs span:hover { color:var(--mc-primary); }
.mc-dot {
  display:inline-block; width:7px; height:7px; border-radius:50%; flex-shrink:0;
  background:var(--mc-text-muted); transition:background var(--mc-transition);
}
.mc-dot.wechat { background:var(--mc-wechat); }
.mc-dot.wecom { background:var(--mc-wecom); }
.mc-dot.feishu { background:var(--mc-feishu); }
.mc-dot.douyin { background:var(--mc-douyin); }
.mc-tabs span.active .mc-dot { box-shadow:0 0 0 3px rgba(124,58,237,.15); }

/* ─── Conversation List ─── */
.mc-conv-list { flex:1; overflow-y:auto; padding:4px 8px; }
.mc-conv-item {
  display:flex; padding:10px 12px; gap:10px; cursor:pointer;
  border-radius:10px; transition:all var(--mc-transition); position:relative;
  margin-bottom:2px; border:1px solid transparent;
}
.mc-conv-item:hover {
  background:var(--mc-primary-hover);
  box-shadow:var(--mc-shadow-sm);
}
.mc-conv-item:hover .mc-conv-del { display:flex; }
.mc-conv-item.active {
  background:var(--mc-primary-bg);
  border-color:rgba(124,58,237,.15);
  box-shadow:inset 3px 0 0 var(--mc-primary);
}
.mc-conv-del {
  display:none; position:absolute; right:4px; top:50%; transform:translateY(-50%);
  width:28px; height:28px; border-radius:6px; align-items:center; justify-content:center;
  background:rgba(255,255,255,.9); box-shadow:var(--mc-shadow-sm);
}
.mc-conv-del:hover { background:#fee2e2; }
.mc-conv-avatar { position:relative; flex-shrink:0; }
.mc-online-dot {
  position:absolute; bottom:0; right:0; width:11px; height:11px;
  background:var(--mc-success); border-radius:50%;
  border:2px solid var(--mc-white); z-index:1;
  animation:mc-pulse 2s ease-in-out infinite;
}
@keyframes mc-pulse {
  0%, 100% { box-shadow:0 0 0 0 rgba(16,185,129,.4); }
  50% { box-shadow:0 0 0 5px rgba(16,185,129,0); }
}
.mc-platform-badge {
  position:absolute; bottom:-3px; right:-5px;
  width:17px; height:17px; border-radius:50%;
  font-size:10px; color:#fff; display:flex; align-items:center; justify-content:center;
  font-weight:600; box-shadow:0 2px 4px rgba(0,0,0,.18); z-index:2;
  background:var(--mc-primary);
}
.mc-platform-badge.wechat { background:var(--mc-wechat); }
.mc-platform-badge.wecom { background:var(--mc-wecom); }
.mc-platform-badge.feishu { background:var(--mc-feishu); }
.mc-platform-badge.douyin { background:var(--mc-douyin); }

.mc-conv-body { flex:1; min-width:0; overflow:hidden; }
.mc-conv-top { display:flex; justify-content:space-between; align-items:baseline; }
.mc-conv-name { font-size:14px; font-weight:600; color:var(--mc-text); }
.mc-conv-time { font-size:11px; color:var(--mc-text-muted); flex-shrink:0; margin-left:8px; }
.mc-conv-bottom { display:flex; align-items:center; gap:6px; margin-top:3px; }
.mc-conv-preview {
  font-size:12px; color:var(--mc-text-secondary); flex:1;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.mc-conv-meta { display:flex; align-items:center; gap:6px; margin-top:4px; }
.mc-conv-agent { font-size:11px; color:var(--mc-text-muted); }

/* ─── Chat Area ─── */
.mc-main { flex:1; display:flex; flex-direction:column; background:var(--mc-white); }
.mc-empty {
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:linear-gradient(180deg, var(--mc-white) 0%, var(--mc-bg) 100%);
}
.mc-empty-hint {
  text-align:center; color:var(--mc-text-muted); font-size:13px; margin-top:16px;
  line-height:1.8; background:var(--mc-white); padding:16px 24px;
  border-radius:var(--mc-radius); box-shadow:var(--mc-shadow-sm);
  border:1px solid var(--mc-border);
}
.mc-empty-hint p { margin:4px 0; }

/* ─── Chat Header ─── */
.mc-chat-hd {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 20px; border-bottom:1px solid var(--mc-border);
  background:var(--mc-white);
}
.mc-chat-contact { display:flex; align-items:center; gap:10px; }
.mc-chat-name { font-size:15px; font-weight:700; color:var(--mc-text); }
.mc-chat-platform { font-size:12px; color:var(--mc-text-muted); display:flex; align-items:center; gap:4px; }
.mc-chat-mode { display:flex; align-items:center; gap:10px; }
.mc-mode-label { font-size:12px; color:var(--mc-text-muted); font-weight:500; }

/* ─── Messages ─── */
.mc-msg-list { flex:1; overflow-y:auto; padding:16px 20px; background:var(--mc-bg); }
.mc-date-sep {
  text-align:center; margin:14px 0; font-size:11px; color:var(--mc-text-muted);
  display:flex; align-items:center; gap:12px;
}
.mc-date-sep::before,
.mc-date-sep::after {
  content:''; flex:1; height:1px; background:var(--mc-border);
}
.mc-msg-row { margin-bottom:8px; display:flex; animation:mc-msg-in .25s ease-out; }
@keyframes mc-msg-in {
  from { opacity:0; transform:translateY(8px); }
  to { opacity:1; transform:translateY(0); }
}
.mc-msg-row.incoming { justify-content:flex-start; }
.mc-msg-row.outgoing { justify-content:flex-end; }
.mc-msg-bubble {
  max-width:72%; padding:10px 14px; position:relative; word-break:break-word;
}
.mc-msg-bubble.incoming {
  background:#fff; border-radius:4px 16px 16px 16px;
  box-shadow:var(--mc-shadow-sm); border:1px solid var(--mc-border);
}
.mc-msg-bubble.incoming::after {
  content:''; position:absolute; left:-7px; top:6px;
  width:0; height:0;
  border:7px solid transparent;
  border-right-color:var(--mc-border);
  border-left:0; border-top:0;
}
.mc-msg-bubble.incoming::before {
  content:''; position:absolute; left:-5px; top:8px;
  width:0; height:0;
  border:6px solid transparent;
  border-right-color:#fff;
  border-left:0; border-top:0;
  z-index:1;
}
.mc-msg-bubble.outgoing {
  background:linear-gradient(135deg, #7c3aed, #8b5cf6);
  color:#fff; border-radius:16px 4px 16px 16px;
  box-shadow:0 2px 8px rgba(124,58,237,.25);
}
.mc-msg-bubble.outgoing::after {
  content:''; position:absolute; right:-7px; top:6px;
  width:0; height:0;
  border:7px solid transparent;
  border-left-color:#8b5cf6;
  border-right:0; border-top:0;
}
.mc-msg-text { font-size:14px; line-height:1.6; white-space:pre-wrap; }
.mc-msg-time { font-size:10px; margin-top:4px; opacity:.6; }
.mc-msg-mode-tag {
  position:absolute; top:-9px; right:10px; font-size:10px;
  backdrop-filter:blur(4px);
}
.mc-msg-empty {
  text-align:center; color:var(--mc-text-muted); padding:60px 0; font-size:13px;
}

/* ─── AI Suggestion ─── */
.mc-suggestion {
  border:1px solid #fcd34d; background:linear-gradient(135deg, #fffbeb, #fef3c7);
  padding:12px 20px; margin:0 16px 0 16px;
  border-radius:10px 10px 0 0;
}
.mc-suggestion-hd {
  display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600;
  color:#d97706; margin-bottom:6px;
}
.mc-suggestion-hd .el-button { margin-left:auto; }
.mc-suggestion-hd .el-button:first-of-type { margin-left:4px; }
.mc-suggestion-body {
  font-size:13px; color:var(--mc-text); line-height:1.6;
  max-height:80px; overflow-y:auto; white-space:pre-wrap;
}

/* ─── Input Area ─── */
.mc-input-area {
  border-top:1px solid var(--mc-border); padding:12px 20px; background:var(--mc-white);
}
.mc-input-area :deep(.el-textarea__inner) {
  border-radius:10px; border-color:var(--mc-border); font-size:14px;
  transition:all var(--mc-transition);
}
.mc-input-area :deep(.el-textarea__inner:focus) {
  border-color:var(--mc-primary); box-shadow:0 0 0 3px rgba(124,58,237,.1);
}
.mc-input-actions { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
.mc-input-hint { font-size:11px; color:var(--mc-text-muted); }

/* ─── Forms & Dialogs ─── */
.mc-form-hint { display:block; font-size:11px; color:var(--mc-text-muted); margin-top:4px; line-height:1.5; }
.mc-id-text { font-family:'SF Mono',monospace; font-size:11px; cursor:pointer; color:var(--mc-primary); }
.mc-status-dot {
  display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px;
  background:var(--mc-text-muted); vertical-align:middle;
}
.mc-status-dot.online { background:var(--mc-success); animation:mc-pulse 2s ease-in-out infinite; }

/* ─── Account Dialog Table ─── */
.mc-layout :deep(.el-table) { border-radius:8px; overflow:hidden; }
.mc-layout :deep(.el-table .el-table__row) { transition:background var(--mc-transition); }
.mc-layout :deep(.el-table .el-table__row:hover) { background:var(--mc-primary-hover); }

/* ─── Scrollbar ─── */
.mc-conv-list::-webkit-scrollbar,
.mc-msg-list::-webkit-scrollbar,
.mc-suggestion-body::-webkit-scrollbar { width:5px; }
.mc-conv-list::-webkit-scrollbar-track,
.mc-msg-list::-webkit-scrollbar-track { background:transparent; }
.mc-conv-list::-webkit-scrollbar-thumb,
.mc-msg-list::-webkit-scrollbar-thumb,
.mc-suggestion-body::-webkit-scrollbar-thumb {
  background:#d1d5db; border-radius:3px;
}
.mc-conv-list::-webkit-scrollbar-thumb:hover,
.mc-msg-list::-webkit-scrollbar-thumb:hover { background:#9ca3af; }

/* ─── Mode Radio Button Polish ─── */
.mc-chat-mode :deep(.el-radio-group) { border-radius:8px; overflow:hidden; }
.mc-chat-mode :deep(.el-radio-button__inner) {
  border:1px solid var(--mc-border); font-size:12px; padding:5px 12px;
  transition:all var(--mc-transition);
}
.mc-chat-mode :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background:var(--mc-primary); border-color:var(--mc-primary); color:#fff;
  box-shadow:none;
}

/* ─── Send Button Polish ─── */
.mc-input-actions :deep(.el-button--primary) {
  background:linear-gradient(135deg, #7c3aed, #8b5cf6); border:none;
  box-shadow:0 2px 6px rgba(124,58,237,.3); transition:all var(--mc-transition);
}
.mc-input-actions :deep(.el-button--primary:hover) {
  box-shadow:0 4px 12px rgba(124,58,237,.4); transform:translateY(-1px);
}
</style>
