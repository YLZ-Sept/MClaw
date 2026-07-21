<template>
  <div class="page-container">
    <div class="page-hd">
      <div>
        <span class="page-title">消息渠道</span>
        <p class="page-desc">连接企业微信、飞书、微信 Bot 等平台，统一管理消息收发</p>
      </div>
      <el-button type="primary" size="small" round @click="showTypePicker = true"><el-icon><Plus /></el-icon>添加渠道</el-button>
    </div>

    <!-- 统计栏 -->
    <div class="stats-bar" v-if="accounts.length">
      <div class="stat-chip stat-active"><span class="stat-dot active"></span>{{ activeCount }} 活跃</div>
      <div class="stat-chip stat-errors" v-if="errorCount"><span class="stat-dot error"></span>{{ errorCount }} 异常</div>
      <div class="stat-chip stat-disabled" v-if="disabledCount"><span class="stat-dot disabled"></span>{{ disabledCount }} 停用</div>
    </div>

    <!-- 加载骨架 -->
    <div class="channel-grid" v-if="loading">
      <div v-for="i in 3" :key="i" class="channel-card skeleton">
        <el-skeleton animated><template #template><el-skeleton-item variant="image" style="width:48px;height:48px;border-radius:14px"/></template></el-skeleton>
        <el-skeleton animated :rows="2" />
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-hero" v-else-if="!accounts.length && !loading">
      <div class="empty-icon"><el-icon :size="48"><ChatDotSquare /></el-icon></div>
      <h3>还没有渠道</h3>
      <p>连接第一个消息平台，开始统一管理消息</p>
      <el-button type="primary" round @click="showTypePicker = true">连接第一个渠道</el-button>
    </div>

    <!-- 渠道卡片网格 -->
    <div class="channel-grid" v-else>
      <div v-for="a in sortedAccounts" :key="a.id" class="channel-card" @click="viewChannel(a)">
        <!-- 卡片头部 -->
        <div class="card-hd">
          <div class="card-platform" :style="{ background: platformColor(a.platform) }">
            <span class="platform-emoji">{{ platformEmoji(a.platform) }}</span>
          </div>
          <div class="card-title">
            <span class="card-name">{{ a.account_name }}</span>
            <span class="card-type">{{ platformLabel(a.platform) }}</span>
          </div>
          <div class="card-status" :class="healthClass(a)">
            <span class="pulse-dot" :class="healthDotClass(a)"></span>
            <span>{{ healthLabel(a) }}</span>
          </div>
        </div>

        <!-- 身份信息 -->
        <div class="card-body" v-if="a.identity_desc">
          <p>{{ a.identity_desc || '未获取到身份信息' }}</p>
        </div>

        <!-- 元数据 -->
        <div class="card-meta">
          <span v-if="a.agent_id"><el-icon size="12"><MagicStick /></el-icon> {{ a.agent_name || a.agent_id }}</span>
          <span v-if="a.desc">{{ a.desc }}</span>
        </div>

        <!-- 操作 -->
        <div class="card-actions" @click.stop>
          <el-button size="small" text @click="editAccount(a)"><el-icon><Edit /></el-icon>配置</el-button>
          <el-button size="small" text :type="a.status==='active'?'warning':'success'" @click="toggleAccount(a)">
            {{ a.status === 'active' ? '停用' : '启用' }}
          </el-button>
          <el-button size="small" text type="danger" @click="delAccount(a.id)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>

      <!-- 添加卡片 -->
      <div class="channel-card add-card" @click="showTypePicker = true">
        <el-icon :size="28"><Plus /></el-icon>
        <span>添加渠道</span>
      </div>
    </div>

    <!-- 健康条 -->
    <div class="health-bar" v-if="channelHealth?.channels?.length">
      <span v-for="ch in channelHealth.channels" :key="ch.id" class="health-chip" :class="ch.status">
        <span class="health-dot" :class="ch.status"></span>{{ ch.name }}
      </span>
      <span class="health-summary">{{ healthSummary.healthy }}/{{ healthSummary.total }} 正常</span>
    </div>

    <!-- 渠道类型选择器 -->
    <el-dialog v-model="showTypePicker" title="选择平台" width="560px" destroy-on-close>
      <div class="type-grid">
        <div v-for="pt in platformTypes" :key="pt.value" class="type-card" :class="{ 'type-disabled': !pt.ready }" @click="pt.ready && startCreate(pt)">
          <span class="type-emoji">{{ pt.emoji }}</span>
          <div class="type-info">
            <span class="type-name">{{ pt.label }}</span>
            <span class="type-desc">{{ pt.desc }}</span>
          </div>
          <el-tag v-if="!pt.ready" size="small" type="info" round>即将推出</el-tag>
        </div>
      </div>
    </el-dialog>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="showEditDlg" :title="editingId ? '编辑渠道' : '新建渠道'" width="560px" destroy-on-close @closed="resetEdit">
      <el-form :model="editForm" label-position="top" size="default">
        <el-form-item label="平台">
          <el-input :model-value="platformLabel(editForm.platform)" disabled />
        </el-form-item>
        <el-form-item label="账号名称" required>
          <el-input v-model="editForm.account_name" placeholder="例如：公司企微助手" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="editForm.desc" placeholder="可选，备注用途" />
        </el-form-item>
        <el-form-item label="绑定 Agent">
          <el-select v-model="editForm.agent_id" placeholder="选择 Agent" clearable style="width:100%">
            <el-option v-for="ag in agentApps" :key="ag.id" :label="ag.name" :value="ag.id" />
          </el-select>
        </el-form-item>
        <template v-if="editForm.platform === 'wecom'">
          <el-form-item label="Corp ID">
            <el-input v-model="editForm.corp_id" placeholder="企业微信 Corp ID" />
          </el-form-item>
          <el-form-item label="Token">
            <el-input v-model="editForm.token" placeholder="回调 Token" />
          </el-form-item>
          <el-form-item label="Encoding AES Key">
            <el-input v-model="editForm.encoding_aes_key" placeholder="回调加密 Key" />
          </el-form-item>
        </template>
        <template v-if="editForm.platform === 'feishu'">
          <el-form-item label="App ID">
            <el-input v-model="editForm.app_id" placeholder="飞书 App ID" />
          </el-form-item>
          <el-form-item label="App Secret">
            <el-input v-model="editForm.app_secret" placeholder="飞书 App Secret" type="password" show-password />
          </el-form-item>
        </template>
        <template v-if="editForm.platform === 'wechat'">
          <el-form-item label="Bot ID">
            <el-input v-model="editForm.bot_id" placeholder="微信 iLink Bot ID" />
          </el-form-item>
        </template>
        <el-divider>访问控制</el-divider>
        <el-form-item label="私聊策略">
          <el-select v-model="editForm.dm_policy" style="width:100%">
            <el-option label="开放（所有人可私聊）" value="open" />
            <el-option label="关闭（禁止私聊）" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="群聊策略">
          <el-select v-model="editForm.group_policy" style="width:100%">
            <el-option label="开放（所有群消息）" value="open" />
            <el-option label="需前缀（@Bot 触发）" value="prefix" />
            <el-option label="关闭（禁止群聊）" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="Bot 前缀" v-if="editForm.group_policy==='prefix'">
          <el-input v-model="editForm.bot_prefix" placeholder="例如: @小助手" />
        </el-form-item>
        <el-form-item label="白名单（逗号分隔）">
          <el-input v-model="editForm.allow_from" placeholder="用户ID，逗号分隔，留空=不限" />
        </el-form-item>
        <el-form-item label="拒绝提示语">
          <el-input v-model="editForm.deny_message" placeholder="无权限时的回复" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDlg = false">取消</el-button>
        <el-button type="primary" @click="saveAccount" :loading="saving">{{ editingId ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 会话面板（点击渠道卡片打开） -->
    <el-drawer v-model="showConversations" :title="activeAccount?.account_name" size="420px" destroy-on-close>
      <div class="conv-list" v-loading="convLoading">
        <div v-for="c in accountConvs" :key="c.id" class="conv-item" @click="openConv(c)">
          <el-avatar :size="40" :src="c.contact_avatar">{{ c.contact_name?.[0] }}</el-avatar>
          <div class="conv-body">
            <div class="conv-top">
              <span class="conv-name">{{ c.contact_name }}</span>
              <span class="conv-time">{{ fmtTime(c.last_message_at) }}</span>
            </div>
            <div class="conv-preview">{{ c.last_message || '暂无消息' }}</div>
            <el-tag size="small" :type="c.reply_mode==='auto'?'success':'info'">{{ c.reply_mode==='auto'?'自动':'人工' }}</el-tag>
          </div>
        </div>
        <el-empty v-if="!accountConvs.length" description="暂无会话" :image-size="60" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, MagicStick, ChatDotSquare } from '@element-plus/icons-vue'
import { channelAccountsApi, channelConversationsApi, agentAppsApi } from '../api/channels'
import { channelHealthApi } from '../api/health'
import request from '../api/index.js'

const loading = ref(true)
const accounts = ref([])
const agentApps = ref([])
const channelHealth = ref(null)
const showTypePicker = ref(false)
const showEditDlg = ref(false)
const showConversations = ref(false)
const editingId = ref(null)
const editForm = ref({})
const saving = ref(false)
const activeAccount = ref(null)
const accountConvs = ref([])
const convLoading = ref(false)
let timer = null

const sortedAccounts = computed(() => [...accounts.value].sort((a, b) => {
  if (a.status === 'active' && b.status !== 'active') return -1
  if (a.status !== 'active' && b.status === 'active') return 1
  return 0
}))

const activeCount = computed(() => accounts.value.filter(a => a.status === 'active').length)
const errorCount = computed(() => accounts.value.filter(a => a._health === 'unhealthy').length)
const disabledCount = computed(() => accounts.value.filter(a => a.status !== 'active').length)
const healthSummary = computed(() => channelHealth.value?.summary || { total: 0, healthy: 0 })

const platformTypes = [
  { value: 'wecom', label: '企业微信', emoji: '💬', desc: '企业微信回调接入', ready: true },
  { value: 'feishu', label: '飞书', emoji: '🐦', desc: '飞书应用消息接入', ready: true },
  { value: 'wechat', label: '微信 Bot', emoji: '💚', desc: 'iLink Bot 长轮询', ready: true },
  { value: 'dingtalk', label: '钉钉', emoji: '📌', desc: '钉钉机器人接入', ready: false },
  { value: 'telegram', label: 'Telegram', emoji: '✈️', desc: 'Telegram Bot API', ready: false },
  { value: 'discord', label: 'Discord', emoji: '🎮', desc: 'Discord Bot 接入', ready: false },
  { value: 'slack', label: 'Slack', emoji: '💬', desc: 'Slack Bot 接入', ready: false },
  { value: 'qq', label: 'QQ', emoji: '🐧', desc: 'QQ Bot 接入', ready: false },
  { value: 'webchat', label: '网页聊天', emoji: '🌐', desc: '嵌入式 WebChat 挂件', ready: true },
  { value: 'webhook', label: 'Webhook', emoji: '🪝', desc: '通用 Webhook 接入', ready: false },
  { value: 'douyin', label: '抖音', emoji: '🎵', desc: '抖音私信接入', ready: false },
]

const PLAT_MAP = {
  wecom:    { emoji:'💬', label:'企业微信', color:'#e8f5e9' },
  feishu:   { emoji:'🐦', label:'飞书',     color:'#e3f2fd' },
  wechat:   { emoji:'💚', label:'微信Bot',  color:'#f1f8e9' },
  dingtalk: { emoji:'📌', label:'钉钉',     color:'#e3f2fd' },
  telegram: { emoji:'✈️', label:'Telegram', color:'#e0f2fe' },
  discord:  { emoji:'🎮', label:'Discord',  color:'#ede9fe' },
  slack:    { emoji:'💬', label:'Slack',    color:'#fce4ec' },
  qq:       { emoji:'🐧', label:'QQ',       color:'#e0f2fe' },
  webchat:  { emoji:'🌐', label:'WebChat',  color:'#fef3c7' },
  webhook:  { emoji:'🪝', label:'Webhook',  color:'#f0ecf8' },
  douyin:   { emoji:'🎵', label:'抖音',     color:'#fce4ec' }
}
function platformEmoji(p) { return PLAT_MAP[p]?.emoji || '📡' }
function platformLabel(p) { return PLAT_MAP[p]?.label || p }
function platformColor(p) { return PLAT_MAP[p]?.color || '#f5f3ff' }

function healthClass(a) {
  if (a.status !== 'active') return 'status-off'
  const h = a._health
  if (h === 'healthy') return 'conn-healthy'
  if (h === 'unhealthy') return 'conn-error'
  return 'conn-unknown'
}
function healthDotClass(a) {
  if (a.status !== 'active') return 'stopped'
  const h = a._health
  if (h === 'healthy') return 'running'
  if (h === 'unhealthy') return 'stopped'
  return ''
}
function healthLabel(a) {
  if (a.status !== 'active') return '已停用'
  const h = a._health
  if (h === 'healthy') return '已连接'
  if (h === 'unhealthy') return '异常'
  return '未知'
}

function fmtTime(t) { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString() + ' ' + d.toTimeString().slice(0,5) }

function resetEdit() {
  editingId.value = null
  editForm.value = {}
}

function startCreate(pt) {
  showTypePicker.value = false
  editingId.value = null
  editForm.value = { platform: pt.value, account_name: '', desc: '', agent_id: '', corp_id: '', token: '', encoding_aes_key: '', app_id: '', app_secret: '', bot_id: '' }
  showEditDlg.value = true
}

function editAccount(a) {
  editingId.value = a.id
  editForm.value = { ...a }
  showEditDlg.value = true
}

async function saveAccount() {
  saving.value = true
  try {
    const payload = { ...editForm.value }
    delete payload._health

    // 预检验证（新建时）
    if (!editingId.value) {
      try {
        const { data } = await request.post('/channels/preflight', {
          platform: payload.platform,
          config: payload
        })
        if (data?.data && !data.data.ok) {
          ElMessage.warning('凭证验证: ' + data.data.message)
        } else if (data?.data?.ok) {
          ElMessage.success(data.data.message)
        }
      } catch {} // 预检失败不阻止保存
    }

    if (editingId.value) {
      await channelAccountsApi.update(editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await channelAccountsApi.create(payload)
      ElMessage.success('已创建')
    }
    showEditDlg.value = false
    loadAccounts()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  }
  saving.value = false
}

async function toggleAccount(a) {
  const newStatus = a.status === 'active' ? 'inactive' : 'active'
  try {
    await channelAccountsApi.update(a.id, { status: newStatus })
    ElMessage.success(newStatus === 'active' ? '已启用' : '已停用')
    loadAccounts()
  } catch { ElMessage.error('操作失败') }
}

async function delAccount(id) {
  try { await ElMessageBox.confirm('确定删除该渠道？', '确认', { type: 'warning' }) } catch { return }
  try { await channelAccountsApi.remove(id); ElMessage.success('已删除'); loadAccounts() } catch { ElMessage.error('删除失败') }
}

async function viewChannel(a) {
  activeAccount.value = a
  showConversations.value = true
  convLoading.value = true
  try {
    const { data } = await channelConversationsApi.list({ account_id: a.id })
    accountConvs.value = data?.data || data || []
  } catch { accountConvs.value = [] }
  convLoading.value = false
}

function openConv(c) {
  showConversations.value = false
  window.open('/channels?conv=' + c.id, '_self')
}

async function loadAccounts() {
  try {
    const { data } = await channelAccountsApi.list()
    accounts.value = data?.data || data || []
  } catch { accounts.value = [] }
}

async function loadHealth() {
  try { const { data } = await channelHealthApi.get(); channelHealth.value = data?.data || null;
    // 将健康状态映射到账号
    if (channelHealth.value?.channels) {
      for (const ch of channelHealth.value.channels) {
        const a = accounts.value.find(ac => ac.id === ch.id || ac.platform === ch.type)
        if (a) a._health = ch.status
      }
    }
  } catch { channelHealth.value = null }
}

async function init() {
  loading.value = true
  try {
    const [accRes, agRes] = await Promise.all([
      channelAccountsApi.list().catch(() => ({ data: { data: [] } })),
      agentAppsApi.list().catch(() => ({ data: { data: [] } }))
    ])
    accounts.value = accRes.data?.data || accRes.data || []
    agentApps.value = agRes.data?.data || agRes.data || []
  } catch {}
  loading.value = false
  loadHealth()
  timer = setInterval(loadHealth, 10000)
}

onMounted(init)
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.page-container { padding: 20px 24px; background: #fafafe; height: 100%; overflow-y: auto }
.page-hd { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e }
.page-desc { font-size: 13px; color: #909399; margin: 4px 0 0 }

/* 统计栏 */
.stats-bar { display: flex; gap: 10px; margin-bottom: 18px }
.stat-chip { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; background: #fff; border: 1px solid #f0ecf8 }
.stat-dot { width: 8px; height: 8px; border-radius: 50% }
.stat-dot.active { background: #22c55e }
.stat-dot.error { background: #ef4444 }
.stat-dot.disabled { background: #9ca3af }

/* 卡片网格 */
.channel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px }
.channel-card {
  background: #fff; border-radius: 14px; border: 1px solid #f0ecf8;
  padding: 18px 20px; cursor: pointer; transition: all .2s;
  display: flex; flex-direction: column; gap: 12px;
}
.channel-card:hover { box-shadow: 0 4px 16px rgba(124,58,237,.08); border-color: #c4b5fd; transform: translateY(-1px) }
.channel-card.skeleton { cursor: default }
.add-card {
  border: 2px dashed #e0d6f5; background: #fafafe;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 180px; color: #b8aad0; gap: 8px; font-size: 13px;
}
.add-card:hover { border-color: #7c3aed; color: #7c3aed }

/* 卡片头部 */
.card-hd { display: flex; align-items: center; gap: 12px }
.card-platform { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0 }
.card-title { flex: 1; min-width: 0 }
.card-name { font-weight: 600; font-size: 14px; color: #4a3f5e; display: block }
.card-type { font-size: 11px; color: #909399 }
.card-status { display: flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 10px; border-radius: 8px; background: #f8f9fc }
.card-status.conn-healthy { color: #166534; background: #f0fdf0 }
.card-status.conn-error { color: #991b1b; background: #fef2f2 }
.card-status.status-off { color: #6b7280; background: #f3f4f6 }

/* 卡片内容 */
.card-body { font-size: 12px; color: #6b7280; line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical }
.card-meta { display: flex; gap: 12px; font-size: 11px; color: #909399; align-items: center }
.card-meta span { display: flex; align-items: center; gap: 3px }

/* 操作 */
.card-actions { display: flex; gap: 4px; border-top: 1px solid #f0ecf8; padding-top: 10px; justify-content: flex-end }

/* 脉冲点 */
.pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; flex-shrink: 0 }
.pulse-dot.running { background: #22c55e; animation: pulse 2s infinite }
.pulse-dot.stopped { background: #ef4444 }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5) } 50% { box-shadow: 0 0 0 5px rgba(34,197,94,0) } }

/* 空状态 */
.empty-hero { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; text-align: center }
.empty-icon { width: 80px; height: 80px; border-radius: 20px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; color: #7c3aed; margin-bottom: 16px }
.empty-hero h3 { font-size: 18px; color: #4a3f5e; margin: 0 0 8px }
.empty-hero p { color: #909399; margin: 0 0 20px; font-size: 13px }

/* 类型选择器 */
.type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px }
.type-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid #f0ecf8; cursor: pointer; transition: all .15s }
.type-card:hover { border-color: #7c3aed; background: #f5f3ff }
.type-card.type-disabled { opacity: .55; cursor: not-allowed }
.type-card.type-disabled:hover { border-color: #f0ecf8; background: #fff }
.type-emoji { font-size: 28px }
.type-name { font-weight: 600; font-size: 14px; color: #4a3f5e; display: block }
.type-desc { font-size: 11px; color: #909399 }

/* 健康条 */
.health-bar { margin-top: 20px; padding: 10px 14px; background: #fff; border-radius: 12px; border: 1px solid #f0ecf8; display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.health-chip { display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 10px; border-radius: 10px; background: #f0f0f0; color: #666 }
.health-chip.healthy { background: #f0fdf0; color: #166534 }
.health-chip.degraded { background: #fffbeb; color: #92400e }
.health-chip.unhealthy { background: #fef2f2; color: #991b1b }
.health-dot { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af }
.health-dot.healthy { background: #22c55e }
.health-dot.degraded { background: #f59e0b }
.health-dot.unhealthy { background: #ef4444 }
.health-summary { font-size: 11px; color: #909399; margin-left: 4px }

/* 会话列表 */
.conv-list { display: flex; flex-direction: column }
.conv-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f8f9fc; cursor: pointer }
.conv-item:hover { background: #fafafe }
.conv-body { flex: 1; min-width: 0 }
.conv-top { display: flex; justify-content: space-between; align-items: center }
.conv-name { font-weight: 500; font-size: 13px; color: #334155 }
.conv-time { font-size: 11px; color: #909399 }
.conv-preview { font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 2px 0 }
</style>
