<template>
  <div class="channels-shell">
    <div class="channels-frame">
      <div class="channels-inner">
        <!-- ====== 页面头部 ====== -->
        <div class="page-header">
          <div>
            <div class="page-kicker">Connect</div>
            <h1 class="page-title">消息渠道</h1>
            <p class="page-desc">连接企业微信、飞书、微信 Bot 等平台，统一管理消息收发</p>
          </div>
          <button v-if="accounts.length > 0" class="btn-primary" @click="showTypePicker = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            添加渠道
          </button>
        </div>

        <!-- 加载骨架 -->
        <div class="channel-grid" v-if="loading">
          <div v-for="i in 3" :key="i" class="channel-card skeleton">
            <el-skeleton animated><template #template><el-skeleton-item variant="image" style="width:48px;height:48px;border-radius:14px"/></template></el-skeleton>
            <el-skeleton animated :rows="2" />
          </div>
        </div>

        <!-- 0 渠道空状态 -->
        <div v-else-if="!accounts.length" class="empty-hero">
          <div class="empty-hero-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </div>
          <h2 class="empty-hero-title">还没有渠道</h2>
          <p class="empty-hero-desc">连接第一个消息平台，开始统一管理消息</p>
          <button class="btn-primary empty-hero-cta" @click="showTypePicker = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            连接第一个渠道
          </button>
        </div>

        <!-- 已配置渠道视图：统计栏 + 卡片 -->
        <template v-else>
          <div class="stats-bar">
            <span class="stat" :class="{ ok: stats.active > 0 }">
              <span class="stat-dot stat-dot--connected"></span>
              活跃 {{ stats.active }}
            </span>
            <span v-if="stats.errors > 0" class="stat danger">
              <span class="stat-dot stat-dot--error"></span>
              异常 {{ stats.errors }}
            </span>
            <span v-if="stats.disabled > 0" class="stat muted">
              停用 {{ stats.disabled }}
            </span>
          </div>

          <div class="channel-grid">
            <div v-for="channel in sortedAccounts" :key="channel.id" class="channel-card" @click="viewChannel(channel)">
              <!-- 卡片头部 -->
              <div class="channel-header">
                <div class="channel-icon-wrap">
                  <span class="platform-emoji">{{ platformEmoji(channel.platform) }}</span>
                </div>
                <div class="channel-meta">
                  <h3 class="channel-name">{{ channel.account_name }}</h3>
                  <span class="channel-type">{{ platformLabel(channel.platform) }}</span>
                </div>
                <div class="channel-status-group">
                  <div v-if="channel.status === 'active'" class="connection-indicator" :class="connectionClass(channel)" :title="connectionTooltip(channel)">
                    {{ connectionLabel(channel) }}
                  </div>
                  <div v-else class="connection-indicator conn-disconnected">已停用</div>
                </div>
              </div>

              <!-- 描述 -->
              <p class="channel-desc">{{ channelDesc(channel) }}</p>

              <!-- 操作 -->
              <div class="channel-footer" @click.stop>
                <button class="card-btn" @click="editAccount(channel)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  配置
                </button>
                <button class="card-btn" @click="toggleAccount(channel)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line v-if="channel.status === 'active'" x1="8" y1="12" x2="16" y2="12"/>
                    <polyline v-else points="10 8 16 12 10 16"/>
                  </svg>
                  {{ channel.status === 'active' ? '停用' : '启用' }}
                </button>
                <button class="card-btn danger" @click="delAccount(channel.id)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  删除
                </button>
              </div>
            </div>

            <!-- 紧凑添加卡片 -->
            <button class="add-card-compact" @click="showTypePicker = true">
              <div class="add-icon-compact">+</div>
              <span class="add-label-compact">添加渠道</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- 渠道类型选择器 (mateclaw 风格全屏 Modal) -->
    <ChannelTypePicker v-model="showTypePicker" @pick="onTypePicked" />

    <!-- 新渠道引导向导 (3 步: 配置 → 验证 → 就绪) -->
    <ChannelOnboardingWizard
      v-if="showWizard"
      v-model="showWizard"
      :channel-type="wizardType"
      :agents="agentApps"
      @created="onChannelCreated"
    />

    <!-- 编辑对话框 (保留用于编辑已有渠道) -->
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

    <!-- 会话面板 -->
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
import { channelAccountsApi, channelConversationsApi, agentAppsApi } from '../api/channels'
import { channelHealthApi } from '../api/health'
import request from '../api/index.js'
import ChannelTypePicker from '../components/channels/ChannelTypePicker.vue'
import ChannelOnboardingWizard from '../components/channels/ChannelOnboardingWizard.vue'

const loading = ref(true)
const accounts = ref([])
const agentApps = ref([])
const channelStatusMap = ref({})
const showTypePicker = ref(false)
const showWizard = ref(false)
const wizardType = ref('')
const showEditDlg = ref(false)
const showConversations = ref(false)
const editingId = ref(null)
const editForm = ref({})
const saving = ref(false)
const activeAccount = ref(null)
const accountConvs = ref([])
const convLoading = ref(false)
let timer = null

// ========== 排序 & 统计 ==========
const sortedAccounts = computed(() => [...accounts.value].sort((a, b) => {
  if (a.status === 'active' && b.status !== 'active') return -1
  if (a.status !== 'active' && b.status === 'active') return 1
  return 0
}))

const stats = computed(() => {
  let active = 0, errors = 0, disabled = 0
  for (const a of accounts.value) {
    if (a.status !== 'active') { disabled++; continue }
    const state = channelStatusMap.value[a.id]
    if (state === 'CONNECTED') active++
    else if (state === 'ERROR') errors++
    else active++ // healthy if no status data yet
  }
  return { active, errors, disabled }
})

// ========== 平台数据 ==========
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

// ========== 连接状态 ==========
function getConnectionState(channel) {
  return channelStatusMap.value[channel.id] || 'CONNECTED'
}
function connectionClass(channel) {
  const s = getConnectionState(channel)
  return s === 'CONNECTED' ? 'conn-connected'
    : s === 'ERROR' ? 'conn-error'
    : s === 'RECONNECTING' ? 'conn-reconnecting'
    : 'conn-disconnected'
}
function connectionLabel(channel) {
  const s = getConnectionState(channel)
  return s === 'CONNECTED' ? '已连接'
    : s === 'ERROR' ? '异常'
    : s === 'RECONNECTING' ? '重连中'
    : '未连接'
}
function connectionTooltip(channel) {
  const st = channelStatusMap.value[channel.id]
  if (!st || st === 'CONNECTED') return ''
  // 如果有最后错误，展示
  const err = channel._lastError
  return err ? `错误: ${err}` : connectionLabel(channel)
}
function channelDesc(channel) {
  if (channel.identity_desc) return channel.identity_desc
  if (channel.desc) return channel.desc
  return `${platformLabel(channel.platform)} 渠道 — 点击配置`
}

// ========== 时间 & 表单 ==========
function fmtTime(t) { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString() + ' ' + d.toTimeString().slice(0,5) }

function resetEdit() { editingId.value = null; editForm.value = {} }

function onTypePicked(type) {
  wizardType.value = type
  showWizard.value = true
}

async function onChannelCreated() {
  showWizard.value = false
  await loadAccounts()
  loadHealth()
}

function editAccount(a) { editingId.value = a.id; editForm.value = { ...a }; showEditDlg.value = true }

async function saveAccount() {
  saving.value = true
  try {
    const payload = { ...editForm.value }
    delete payload._health; delete payload._lastError
    if (!editingId.value) {
      try {
        const { data } = await request.post('/channels/preflight', { platform: payload.platform, config: payload })
        if (data?.data && !data.data.ok) { ElMessage.warning('凭证验证: ' + data.data.message) }
        else if (data?.data?.ok) { ElMessage.success(data.data.message) }
      } catch {}
    }
    if (editingId.value) { await channelAccountsApi.update(editingId.value, payload); ElMessage.success('已更新') }
    else { await channelAccountsApi.create(payload); ElMessage.success('已创建') }
    showEditDlg.value = false
    loadAccounts()
  } catch (e) { ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message)) }
  saving.value = false
}

async function toggleAccount(a) {
  const newStatus = a.status === 'active' ? 'inactive' : 'active'
  try { await channelAccountsApi.update(a.id, { status: newStatus }); ElMessage.success(newStatus === 'active' ? '已启用' : '已停用'); loadAccounts(); loadHealth() }
  catch { ElMessage.error('操作失败') }
}

async function delAccount(id) {
  try { await ElMessageBox.confirm('确定删除该渠道？', '确认', { type: 'warning' }) } catch { return }
  try { await channelAccountsApi.remove(id); ElMessage.success('已删除'); loadAccounts() } catch { ElMessage.error('删除失败') }
}

async function viewChannel(a) {
  activeAccount.value = a; showConversations.value = true; convLoading.value = true
  try { const { data } = await channelConversationsApi.list({ account_id: a.id }); accountConvs.value = data?.data || data || [] }
  catch { accountConvs.value = [] }
  convLoading.value = false
}

function openConv(c) { showConversations.value = false; window.open('/channels?conv=' + c.id, '_self') }

async function loadAccounts() {
  try { const { data } = await channelAccountsApi.list(); accounts.value = data?.data || data || [] }
  catch { accounts.value = [] }
}

async function loadHealth() {
  try {
    const { data } = await channelHealthApi.get()
    const list = data?.data?.channels || []
    const map = {}
    for (const ch of list) {
      const a = accounts.value.find(ac => ac.id === ch.id || ac.platform === ch.type)
      if (a) {
        a._health = ch.status
        a._lastError = ch.message || ch.error || null
        a.identity_desc = ch.identity || null
        map[a.id] = ch.status === 'healthy' ? 'CONNECTED'
          : ch.status === 'unhealthy' ? 'ERROR'
          : ch.status === 'degraded' ? 'RECONNECTING'
          : 'CONNECTED'
      }
    }
    channelStatusMap.value = map
  } catch { channelStatusMap.value = {} }
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
/* ============================================
   消息渠道 — mateclaw 风格
   ============================================ */

/* ----- 页面壳 ----- */
.channels-shell { height: 100%; overflow: hidden; }
.channels-frame { height: 100%; overflow: hidden; }
.channels-inner { display: flex; flex-direction: column; height: 100%; gap: 18px; padding: 28px 32px 32px; overflow-y: auto; }

/* ----- 页面头部 ----- */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-shrink: 0; flex-wrap: wrap; }
.page-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7c3aed; margin-bottom: 8px; }
.page-title { font-size: 26px; font-weight: 800; letter-spacing: -0.04em; color: #4a3f5e; margin: 0 0 6px; }
.page-desc { font-size: 13px; color: #b8aad0; margin: 0; line-height: 1.5; }

/* ----- 主按钮 ----- */
.btn-primary { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; border: none; border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(124,58,237,0.2); transition: all 0.15s; }
.btn-primary:hover { background: #7c3aed; box-shadow: 0 4px 14px rgba(124,58,237,0.3); transform: translateY(-1px); }
.btn-primary:disabled { background: #ddd6fe; cursor: not-allowed; box-shadow: none; transform: none; }

/* ----- 统计栏 ----- */
.stats-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; flex-shrink: 0; }
.stat { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #b8aad0; }
.stat.ok { color: #4a3f5e; }
.stat.danger { color: #ef4444; }
.stat.muted { color: #b8aad0; }
.stat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.stat-dot--connected { background: #22c55e; }
.stat-dot--error { background: #ef4444; }

/* ----- 卡片网格 ----- */
.channel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
.channel-card {
  background: #fff; border-radius: 16px; border: 1px solid #f0ecfc;
  padding: 16px 18px 14px; cursor: pointer; transition: all 0.15s;
  display: flex; flex-direction: column;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.channel-card:hover { border-color: #c4b5fd; box-shadow: 0 4px 18px rgba(124,58,237,0.08); transform: translateY(-2px); }
.channel-card.skeleton { cursor: default; pointer-events: none; opacity: 0.85; }

/* ----- 卡片头部 ----- */
.channel-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.channel-icon-wrap {
  width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 24px;
  background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(99,102,241,0.04));
}
.channel-meta { flex: 1; min-width: 0; }
.channel-name { font-size: 16px; font-weight: 700; color: #4a3f5e; margin: 0 0 2px; }
.channel-type { font-size: 12px; color: #b8aad0; }

/* ----- 连接状态指示器 ----- */
.channel-status-group { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.connection-indicator { font-size: 11px; padding: 2px 8px; border-radius: 12px; white-space: nowrap; cursor: default; font-weight: 500; }
.conn-connected { color: #7c3aed; background: #ede9fe; }
.conn-reconnecting { color: #7c3aed; background: #ede9fe; animation: pulse-reconnect 1.5s ease-in-out infinite; }
.conn-error { color: #dc2626; background: #fef2f2; }
.conn-disconnected { color: #94a3b8; background: #f3f4f6; }
@keyframes pulse-reconnect { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* ----- 描述 ----- */
.channel-desc {
  font-size: 13px; color: #94a3b8; margin: 0 0 12px; line-height: 1.55;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis;
}

/* ----- 操作按钮 ----- */
.channel-footer { display: flex; gap: 6px; border-top: 1px solid #f0ecfc; padding-top: 10px; flex-wrap: wrap; }
.card-btn {
  display: flex; align-items: center; gap: 4px; padding: 7px 11px;
  border: 1px solid #f0ecfc; background: #faf8ff; border-radius: 10px;
  font-size: 12px; color: #4a3f5e; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: inherit;
}
.card-btn:hover { background: #f0ecfc; }
.card-btn.danger:hover { background: #fef2f2; border-color: #dc2626; color: #dc2626; }

/* ----- 紧凑添加卡片 ----- */
.add-card-compact {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 158px; padding: 16px; border: 2px dashed #ddd6fe; border-radius: 16px;
  cursor: pointer; background: transparent; transition: all 0.15s; font-family: inherit;
}
.add-card-compact:hover { border-color: #7c3aed; background: #f5f3ff; }
.add-icon-compact { font-size: 22px; color: #b8aad0; line-height: 1; }
.add-label-compact { font-size: 14px; color: #b8aad0; font-weight: 600; }
.add-card-compact:hover .add-icon-compact, .add-card-compact:hover .add-label-compact { color: #7c3aed; }

/* ----- 空状态 ----- */
.empty-hero {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 56px 32px; text-align: center; gap: 14px;
  background: #fff; border-radius: 16px; border: 1px solid #f0ecfc;
  box-shadow: 0 1px 2px rgba(124,58,237,0.04);
}
.empty-hero-icon { width: 84px; height: 84px; border-radius: 24px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(99,102,241,0.04)); color: #7c3aed; margin-bottom: 4px; }
.empty-hero-title { font-size: 22px; font-weight: 700; color: #4a3f5e; margin: 0; }
.empty-hero-desc { font-size: 14px; color: #94a3b8; margin: 0; max-width: 480px; line-height: 1.6; }
.empty-hero-cta { margin-top: 6px; padding: 12px 24px; font-size: 15px; }

/* ----- 会话列表 ----- */
.conv-list { display: flex; flex-direction: column }
.conv-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f8f9fc; cursor: pointer }
.conv-item:hover { background: #fafafe }
.conv-body { flex: 1; min-width: 0 }
.conv-top { display: flex; justify-content: space-between; align-items: center }
.conv-name { font-weight: 500; font-size: 13px; color: #334155 }
.conv-time { font-size: 11px; color: #b8aad0 }
.conv-preview { font-size: 12px; color: #b8aad0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 2px 0 }
</style>
