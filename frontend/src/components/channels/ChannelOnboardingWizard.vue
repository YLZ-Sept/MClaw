<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="wizard">
      <!-- ====== 头部 ====== -->
      <div class="wizard-header">
        <div class="wizard-title-row">
          <div class="wizard-icon-wrap">
            <span class="wizard-emoji">{{ serviceEmoji }}</span>
          </div>
          <div class="wizard-title-text">
            <h2 class="wizard-title">{{ serviceName }}</h2>
            <p class="wizard-subtitle">配置 {{ serviceName }} 渠道</p>
          </div>
          <button class="wizard-close" @click="close" title="取消">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <!-- 步骤条 -->
        <div class="stepper" v-if="!isOAuthStyle || currentStep >= 0">
          <div v-for="(label, i) in stepLabels" :key="i" class="step" :class="stepClass(i)">
            <div class="step-circle">
              <svg v-if="i < currentStep" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="step-label">{{ label }}</span>
            <div v-if="i < stepLabels.length - 1" class="step-connector" :class="{ done: i < currentStep }" />
          </div>
        </div>
      </div>

      <!-- ====== Body ====== -->
      <div class="wizard-body">
        <!-- ==================== Step 1 · 配置 ==================== -->
        <div v-if="currentStep === 0" class="step-pane">
          <!-- 名称 -->
          <div class="form-group">
            <label class="form-label">账号名称 <span class="required">*</span></label>
            <input v-model="form.name" class="form-input" placeholder="例如：公司企微助手" />
          </div>

          <!-- ====== 企业微信：OAuth 扫码 + 手动填写（始终可见） ====== -->
          <template v-if="isWecom">
            <div class="oauth-card">
              <p class="oauth-headline">一键授权接入（推荐）</p>
              <p class="oauth-hint">在企业微信客户端中打开本系统，点击按钮自动获取 Bot ID 和 Secret。本地环境请使用下方手动填写。</p>
              <button type="button" class="oauth-btn" :disabled="wecomAuth.loading.value" @click="wecomAuth.start()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/></svg>
                {{ wecomAuth.loading.value ? '加载中…' : '使用企业微信扫码授权' }}
              </button>
            </div>
            <div class="form-divider"><span>或手动填写凭证</span></div>
            <div class="form-grid">
              <div class="form-group full-width">
                <label class="form-label">Corp ID <span class="required">*</span></label>
                <input v-model="channelConfig.corp_id" class="form-input" placeholder="ww...（企业微信管理后台 → 我的企业 → 企业信息）" />
              </div>
              <div class="form-group full-width">
                <label class="form-label">Token <span class="required">*</span></label>
                <div class="password-wrap">
                  <input v-model="channelConfig.token" :type="visibleFields['wc_token'] ? 'text' : 'password'" class="form-input" placeholder="回调验证 Token，10位以上" autocomplete="off" />
                  <button type="button" class="eye-btn" @click="visibleFields['wc_token'] = !visibleFields['wc_token']">
                    <svg v-if="visibleFields['wc_token']" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
              </div>
              <div class="form-group full-width">
                <label class="form-label">Encoding AES Key <span class="required">*</span></label>
                <div class="password-wrap">
                  <input v-model="channelConfig.encoding_aes_key" :type="visibleFields['wc_aes'] ? 'text' : 'password'" class="form-input" placeholder="43位随机字符串（企业微信后台 → 接收消息 → 随机生成）" autocomplete="off" />
                  <button type="button" class="eye-btn" @click="visibleFields['wc_aes'] = !visibleFields['wc_aes']">
                    <svg v-if="visibleFields['wc_aes']" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <div v-if="isWeixin" class="oauth-card">
            <p class="oauth-headline">扫码登录接入</p>
            <p class="oauth-hint">点击按钮获取微信 iLink Bot 登录二维码，使用微信扫码确认后自动填入 Token 并验证连接</p>
            <button v-if="!weixinAuth.qrcodeImg.value" type="button" class="oauth-btn" :disabled="weixinAuth.loading.value" @click="weixinAuth.start()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
                <line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/>
              </svg>
              {{ weixinAuth.loading.value ? '获取中…' : '获取微信登录二维码' }}
            </button>
            <div v-if="weixinAuth.loading.value && !weixinAuth.qrcodeImg.value" class="oauth-qr-loading">
              <div class="spinner" /><p class="oauth-qr-status">正在获取二维码…</p>
            </div>
            <div v-if="weixinAuth.qrcodeImg.value" class="oauth-qr">
              <img :src="weixinAuth.qrcodeImg.value" alt="QR" class="oauth-qr-img" />
              <p class="oauth-qr-status" :class="weixinAuth.pollStatus.value">
                <template v-if="weixinAuth.pollStatus.value === 'scanned'">📱 已扫码，请在手机上确认登录</template>
                <template v-else-if="weixinAuth.pollStatus.value === 'confirmed'">✓ 登录成功</template>
                <template v-else-if="weixinAuth.pollStatus.value === 'expired'">二维码已过期，请重新获取</template>
                <template v-else>请使用微信扫描二维码</template>
              </p>
            </div>
          </div>

          <!-- QQ 混合模式：扫码 + 手动表单 -->
          <div v-if="isQQ" class="oauth-card oauth-card--hybrid">
            <p class="oauth-headline">扫码绑定（推荐）</p>
            <p class="oauth-hint">点击按钮获取 QQ Bot 绑定二维码，扫码后自动填入 App ID 和 Secret</p>
            <button v-if="!qqAuth.qrcodeUrl.value" type="button" class="oauth-btn" :disabled="qqAuth.loading.value" @click="qqAuth.start()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
                <line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/>
              </svg>
              {{ qqAuth.loading.value ? '获取中…' : '获取 QQ 绑定二维码' }}
            </button>
            <div v-if="qqAuth.loading.value && !qqAuth.qrcodeUrl.value" class="oauth-qr-loading">
              <div class="spinner" /><p class="oauth-qr-status">正在获取二维码…</p>
            </div>
            <div v-if="qqAuth.qrcodeUrl.value" class="oauth-qr">
              <img :src="qqAuth.qrcodeUrl.value" alt="QR" class="oauth-qr-img" />
              <p class="oauth-qr-status" :class="qqAuth.status.value">
                <template v-if="qqAuth.status.value === 'confirmed'">✓ 绑定成功</template>
                <template v-else-if="qqAuth.status.value === 'expired'">二维码已过期</template>
                <template v-else-if="qqAuth.status.value === 'denied'">已取消</template>
                <template v-else>请使用 QQ 扫描二维码</template>
              </p>
            </div>
          </div>

          <!-- 零配置类型提示 (web / webchat) -->
          <div v-if="allFields.length === 0 && !isWecom && !isWeixin" class="empty-config">
            <p class="empty-text">{{ emptyConfigText }}</p>
          </div>

          <!-- 手动凭证表单（仅对 paste-token 类型 + QQ 混合模式显示） -->
          <template v-if="allFields.length > 0 && !isWecom && !isWeixin">
            <!-- how-to 指南 -->
            <details v-if="guide" class="how-to">
              <summary class="how-to-summary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                如何获取凭证
              </summary>
              <ol class="how-to-steps"><li v-for="(step, i) in guide" :key="i" v-html="step"></li></ol>
            </details>

            <!-- 凭证字段 -->
            <div class="form-grid">
              <div v-for="field in allFields" :key="field.key" class="form-group full-width">
                <label class="form-label">{{ field.label }} <span v-if="field.required" class="required">*</span></label>
                <div v-if="field.sensitive" class="password-wrap">
                  <input v-model="channelConfig[field.key]" :type="visibleFields[field.key] ? 'text' : 'password'" class="form-input" :class="{ 'field-error': invalidField === field.key }" :placeholder="field.placeholder" autocomplete="off" />
                  <button type="button" class="eye-btn" @click="visibleFields[field.key] = !visibleFields[field.key]">
                    <svg v-if="visibleFields[field.key]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <input v-else v-model="channelConfig[field.key]" class="form-input" :class="{ 'field-error': invalidField === field.key }" :placeholder="field.placeholder" />
                <span v-if="field.tooltip" class="form-hint">{{ field.tooltip }}</span>
              </div>
            </div>

            <!-- 可选手动字段（展开） -->
            <button v-if="optionalFields.length > 0" class="advanced-toggle" @click="showAdvanced = !showAdvanced">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }"><polyline points="9 18 15 12 9 6"/></svg>
              {{ showAdvanced ? '收起' : `更多设置 (${optionalFields.length})` }}
            </button>
            <div v-if="showAdvanced" class="advanced-body">
              <div v-for="field in optionalFields" :key="field.key" class="form-group full-width">
                <label class="form-label">{{ field.label }}</label>
                <input v-model="channelConfig[field.key]" class="form-input" :placeholder="field.placeholder" />
              </div>
            </div>
          </template>
        </div>

        <!-- ==================== Step 2 · 验证 ==================== -->
        <div v-if="currentStep === 1" class="step-pane verify-pane">
          <div v-if="verifying" class="verify-card pending">
            <div class="spinner" /><p class="verify-headline">正在验证 {{ serviceName }} 凭证…</p>
          </div>
          <div v-else-if="verifyResult?.skipped" class="verify-card skipped">
            <div class="verify-icon">⏭</div>
            <p class="verify-headline">跳过验证</p>
            <p class="verify-detail">此渠道类型无需凭证验证，可直接保存</p>
          </div>
          <div v-else-if="verifyResult?.ok" class="verify-card success">
            <div class="verify-icon">✓</div>
            <p class="verify-headline">{{ verifyResult.headline || '验证通过' }}</p>
            <p v-if="verifyResult.durationMs" class="verify-detail">耗时 {{ verifyResult.durationMs }}ms</p>
          </div>
          <div v-else-if="verifyResult" class="verify-card failed">
            <div class="verify-icon">✗</div>
            <p class="verify-headline">{{ verifyResult.headline || '验证失败' }}</p>
            <p v-if="verifyResult.hint" class="verify-detail">{{ verifyResult.hint }}</p>
          </div>
        </div>

        <!-- ==================== Step 3 · 就绪 ==================== -->
        <div v-if="currentStep === 2" class="step-pane ready-pane">
          <div class="ready-hero">
            <div class="ready-check">🎉</div>
            <h3 class="ready-title">{{ readyTitle }}</h3>
            <p class="ready-subtitle">{{ serviceName }} 已通过验证，即将就绪</p>
          </div>
          <div v-if="hasIdentity" class="identity-card">
            <div v-for="(value, key) in identityDisplay" :key="key" class="identity-row">
              <span class="identity-key">{{ formatIdentityKey(key) }}</span>
              <span class="identity-value">{{ value }}</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">绑定数字员工 (可选)</label>
            <el-select v-model="form.agent_id" placeholder="选择 Agent" clearable style="width:100%">
              <el-option v-for="ag in agents" :key="ag.id" :label="ag.name" :value="ag.id" />
            </el-select>
          </div>
          <p class="ready-hint">保存后可在消息列表中测试 {{ serviceName }} 的消息收发</p>
        </div>
      </div>

      <!-- ====== Footer ====== -->
      <div class="wizard-footer">
        <button v-if="currentStep > 0" class="btn-secondary" @click="goBack">上一步</button>
        <div class="footer-spacer" />
        <!-- Step 1: OAuth 类型不显示按钮（自动跳转），手动类型显示保存并验证 -->
        <button v-if="currentStep === 0 && !isOAuthStyle" class="btn-primary" :disabled="!canSubmitConfig" @click="onSaveAndTest">
          {{ hasVerifier ? '保存并验证' : '继续' }}
        </button>
        <template v-else-if="currentStep === 1">
          <button v-if="verifyResult && !verifyResult.ok && !verifyResult.skipped" class="btn-primary" @click="goBack">返回修改</button>
          <button v-else-if="verifyResult" class="btn-primary" @click="goNext">继续</button>
        </template>
        <button v-else-if="currentStep === 2" class="btn-primary" @click="onDone" :disabled="saving">{{ saving ? '保存中…' : '完成' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { CHANNEL_FIELD_DEFS, CHANNEL_GUIDES, buildConfigJson } from '../../utils/channelConfig'
import request from '../../api/index.js'
import { useWecomBotAuth } from '../../composables/channels/useWecomBotAuth'
import { useWeixinQrcodePoll } from '../../composables/channels/useWeixinQrcodePoll'
import { useQqAppRegister } from '../../composables/channels/useQqAppRegister'

const props = defineProps({
  modelValue: Boolean,
  channelType: String,
  agents: { type: Array, default: () => [] },
  defaultName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'created'])

// ====== 基础状态 ======
const currentStep = ref(0)
const stepLabels = ['配置凭证', '验证连接', '准备就绪']
const verifying = ref(false)
const verifyResult = ref(null)
const invalidField = ref(null)
const saving = ref(false)
const visibleFields = ref({})
const showAdvanced = ref(false)

const form = ref({
  name: props.defaultName || translateServiceName(props.channelType),
  desc: '',
  agent_id: null,
})
const channelConfig = ref({})

// ====== 计算属性 ======
const serviceName = computed(() => translateServiceName(props.channelType))
const serviceEmoji = computed(() => {
  const m = { telegram:'✈️',discord:'🎮',slack:'💬',qq:'🐧',wecom:'🏢',weixin:'💚',feishu:'🐦',dingtalk:'📌',web:'🔗',webchat:'🌐',webhook:'🪝' }
  return m[props.channelType] || '📡'
})
const allFields = computed(() => CHANNEL_FIELD_DEFS[props.channelType] || [])
const requiredFields = computed(() => allFields.value.filter(f => f.required))
const optionalFields = computed(() => allFields.value.filter(f => !f.required))

const isWecom = computed(() => props.channelType === 'wecom')
const isWeixin = computed(() => props.channelType === 'wechat')
const isQQ = computed(() => props.channelType === 'qq')
const isOAuthStyle = computed(() => isWecom.value || isWeixin.value)

const hasVerifier = computed(() => allFields.value.length > 0 || isWecom.value)
const guide = computed(() => CHANNEL_GUIDES[props.channelType] || null)

const emptyConfigText = computed(() => {
  const m = { web:'Web 渠道无需凭证，保存后即可使用', webchat:'WebChat 挂件无需凭证，系统将自动生成接入密钥', webhook:'Webhook 渠道可配置签名密钥用于验证请求来源（可选）' }
  return m[props.channelType] || '此渠道类型无需额外凭证'
})

const canSubmitConfig = computed(() => {
  if (!form.value.name) return false
  if (isOAuthStyle.value) return true  // OAuth 类型按钮始终可点（扫码自动跳转，手动可同时填）
  if (allFields.value.length === 0) return true
  return requiredFields.value.every(f => {
    const v = channelConfig.value[f.key]
    return v !== undefined && v !== null && String(v).length > 0
  })
})

const hasIdentity = computed(() => verifyResult.value && Object.keys(verifyResult.value.identity || {}).length > 0)
const identityDisplay = computed(() => verifyResult.value?.identity || {})
const readyTitle = computed(() => {
  const id = verifyResult.value?.identity || {}
  return id.accountName ? `配置完成 — ${id.accountName}` : '配置完成！'
})

// ====== WeCom SDK 授权 ======
const wecomAuth = useWecomBotAuth((bot) => {
  channelConfig.value.bot_id = bot.botid
  channelConfig.value.secret = bot.secret
  onSaveAndTest()
})

// ====== WeChat QR 轮询 ======
const weixinAuth = useWeixinQrcodePoll(({ botToken, baseUrl }) => {
  channelConfig.value.token = botToken
  if (baseUrl) channelConfig.value.base_url = baseUrl
  onSaveAndTest()
})

// ====== QQ 扫码绑定 ======
const qqAuth = useQqAppRegister(({ appId, clientSecret }) => {
  channelConfig.value.app_id = appId
  channelConfig.value.client_secret = clientSecret
})

// ====== 生命周期 ======
onMounted(() => {
  for (const f of allFields.value) {
    if (f.defaultValue !== undefined && channelConfig.value[f.key] === undefined) {
      channelConfig.value[f.key] = f.defaultValue
    }
  }
})

// ====== 步骤导航 ======
function stepClass(i) {
  if (i < currentStep.value) return 'done'
  if (i === currentStep.value) return 'active'
  return 'pending'
}
function goBack() { if (currentStep.value > 0) currentStep.value -= 1 }
function goNext() { if (currentStep.value < 2) currentStep.value += 1 }

async function onSaveAndTest() {
  invalidField.value = null
  if (!hasVerifier.value) {
    verifyResult.value = { ok: true, skipped: true, durationMs: 0, headline: '跳过验证', identity: {} }
    currentStep.value = 2
    return
  }
  currentStep.value = 1
  verifying.value = true
  verifyResult.value = null
  try {
    const configJson = buildConfigJson(props.channelType, channelConfig.value)
    const { data } = await request.post('/channels/preflight', { platform: props.channelType, config: { ...channelConfig.value, configJson } })
    const d = data?.data || data || {}
    verifyResult.value = {
      ok: d.ok !== false, skipped: false, durationMs: d.durationMs || 0,
      headline: d.message || (d.ok !== false ? '验证通过' : '验证失败'),
      identity: d.identity || {}, hint: d.hint || d.message || null,
    }
    if (!verifyResult.value.ok) invalidField.value = d.invalidField || null
  } catch (e) {
    verifyResult.value = { ok: false, skipped: false, durationMs: 0, headline: '验证请求失败', identity: {}, hint: e.response?.data?.message || e.message || '请检查网络连接' }
  } finally { verifying.value = false }
}

async function onDone() {
  saving.value = true
  try {
    // config 直接作为对象发送（后端会 JSON.stringify 存储）
    const cfgObj = {}
    for (const [k, v] of Object.entries(channelConfig.value)) {
      if (v !== undefined && v !== null && v !== '') cfgObj[k] = v
    }
    const payload = {
      platform: props.channelType,
      account_name: form.value.name,
      desc: form.value.desc || '',
      agent_id: form.value.agent_id || null,
      default_reply_mode: 'auto',
      config: cfgObj,
    }
    await request.post('/channel-accounts', payload)
    ElMessage.success('渠道创建成功')
    emit('created', payload)
    close()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.response?.data?.message || e.message))
  } finally { saving.value = false }
}

function close() { emit('update:modelValue', false) }

function translateServiceName(t) {
  const m = { telegram:'Telegram',discord:'Discord',slack:'Slack',qq:'QQ',wecom:'企业微信',weixin:'微信',feishu:'飞书',dingtalk:'钉钉',web:'Web',webchat:'网页聊天',webhook:'Webhook' }
  return m[t] || t
}
function formatIdentityKey(key) {
  const m = { accountName:'账号',account:'账号',team:'团队',botName:'Bot 名称' }
  return m[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()).trim()
}
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1001; padding: 20px; }
.wizard { background: #fff; border-radius: 18px; width: 100%; max-width: 640px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.18); overflow: hidden; }
.wizard-header { padding: 22px 26px 18px; border-bottom: 1px solid #f0ecfc; flex-shrink: 0; }
.wizard-title-row { display: flex; align-items: center; gap: 14px; }
.wizard-icon-wrap { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,rgba(124,58,237,0.08),rgba(99,102,241,0.04)); flex-shrink: 0; }
.wizard-emoji { font-size: 26px; }
.wizard-title-text { flex: 1; min-width: 0; }
.wizard-title { font-size: 19px; font-weight: 700; color: #4a3f5e; margin: 0; }
.wizard-subtitle { font-size: 13px; color: #94a3b8; margin: 2px 0 0; }
.wizard-close { width: 32px; height: 32px; border: none; background: none; cursor: pointer; color: #b8aad0; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; }
.wizard-close:hover { background: #f5f3ff; color: #4a3f5e; }

/* Stepper */
.stepper { display: flex; align-items: center; gap: 0; margin-top: 18px; padding: 0 4px; }
.step { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.step-circle { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; transition: all 0.18s; background: #f0ecfc; color: #b8aad0; border: 1.5px solid #ddd6fe; }
.step.active .step-circle { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.step.done .step-circle { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.step-label { font-size: 13px; color: #b8aad0; font-weight: 500; }
.step.active .step-label { color: #7c3aed; font-weight: 700; }
.step.done .step-label { color: #4a3f5e; }
.step-connector { flex: 1; min-width: 36px; height: 1.5px; background: #ddd6fe; margin: 0 12px; align-self: center; transition: background 0.18s; }
.step-connector.done { background: #7c3aed; }

/* Body */
.wizard-body { flex: 1; overflow-y: auto; padding: 22px 26px; min-height: 240px; }
.step-pane { display: flex; flex-direction: column; gap: 18px; }

/* Forms */
.form-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group.full-width { grid-column: 1/-1; }
.form-label { font-size: 13px; font-weight: 600; color: #4a3f5e; display: flex; align-items: center; gap: 5px; }
.required { color: #ef4444; }
.form-input { padding: 10px 12px; border: 1px solid #f0ecfc; border-radius: 10px; font-size: 14px; color: #4a3f5e; outline: none; background: #fff; width: 100%; box-sizing: border-box; transition: border-color 0.15s; font-family: inherit; }
.form-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
.form-input.field-error { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.12); }
.form-hint { font-size: 12px; color: #b8aad0; line-height: 1.5; }
.password-wrap { position: relative; display: flex; align-items: center; }
.password-wrap .form-input { padding-right: 36px; }
.eye-btn { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #b8aad0; padding: 2px; display: flex; align-items: center; }
.eye-btn:hover { color: #4a3f5e; }

/* OAuth card */
.oauth-card { background: linear-gradient(135deg,rgba(7,193,96,0.06),rgba(7,193,96,0.02)); border: 1px solid rgba(7,193,96,0.18); border-radius: 12px; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 8px; }
.oauth-card--hybrid { background: linear-gradient(135deg,rgba(124,58,237,0.04),rgba(99,102,241,0.02)); border-color: rgba(124,58,237,0.12); }
.oauth-headline { font-size: 14px; font-weight: 600; color: #4a3f5e; margin: 0; line-height: 1.5; }
.oauth-hint { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
.oauth-btn { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; padding: 11px 18px; background: #07C160; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.18s; }
.oauth-btn:hover:not(:disabled) { background: #06AD56; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(7,193,96,0.3); }
.oauth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.manual-toggle { background: none; border: none; cursor: pointer; font-size: 12px; color: #94a3b8; padding: 4px 0; align-self: flex-start; text-decoration: underline; text-underline-offset: 2px; font-family: inherit; }
.manual-toggle:hover { color: #7c3aed; }
.form-divider { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #b8aad0; font-weight: 600; }
.form-divider::before, .form-divider::after { content: ''; flex: 1; height: 1px; background: #f0ecfc; }
.oauth-qr { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 8px; padding: 14px; background: #fff; border-radius: 10px; border: 1px solid #f0ecfc; }
.oauth-qr-img { width: 200px; height: 200px; border-radius: 4px; }
.oauth-qr-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 220px; padding: 14px; background: #fff; border-radius: 10px; border: 1px dashed #ddd6fe; margin-top: 8px; }
.oauth-qr-status { font-size: 13px; color: #94a3b8; margin: 0; text-align: center; }
.oauth-qr-status.scanned { color: #e6a23c; }
.oauth-qr-status.confirmed { color: #10b981; font-weight: 600; }
.oauth-qr-status.expired,.oauth-qr-status.denied,.oauth-qr-status.error { color: #f56c6c; }

/* How-to */
.how-to { background: #faf8ff; border-radius: 10px; padding: 10px 14px; }
.how-to-summary { font-size: 13px; font-weight: 600; color: #94a3b8; cursor: pointer; display: flex; align-items: center; gap: 6px; list-style: none; user-select: none; }
.how-to-summary::-webkit-details-marker { display: none; }
.how-to[open] .how-to-summary svg { transform: rotate(90deg); }
.how-to-steps { margin: 10px 0 0; padding: 12px 12px 12px 36px; font-size: 13px; color: #4a3f5e; line-height: 1.8; background: #fff; border-radius: 8px; }
.how-to-steps :deep(a) { color: #7c3aed; text-decoration: none; }
.how-to-steps :deep(a:hover) { text-decoration: underline; }
.how-to-steps :deep(code) { font-size: 12px; background: #ede9fe; padding: 1px 5px; border-radius: 3px; color: #7c3aed; }
.how-to-steps :deep(b) { color: #4a3f5e; }
.advanced-toggle { display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #94a3b8; padding: 4px 0; align-self: flex-start; }
.advanced-toggle:hover { color: #4a3f5e; }
.advanced-body { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 0; }

/* Verify */
.verify-pane { min-height: 220px; align-items: center; justify-content: center; }
.verify-card { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 36px 20px; border-radius: 14px; text-align: center; width: 100%; max-width: 420px; }
.verify-card.pending { background: #faf8ff; }
.verify-card.success { background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); }
.verify-card.failed { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); }
.verify-card.skipped { background: #faf8ff; }
.verify-icon { font-size: 36px; line-height: 1; }
.verify-card.success .verify-icon { color: #10b981; }
.verify-card.failed .verify-icon { color: #ef4444; }
.verify-headline { font-size: 16px; font-weight: 600; color: #4a3f5e; margin: 0; }
.verify-detail { font-size: 13px; color: #94a3b8; margin: 0; line-height: 1.6; }
.spinner { width: 36px; height: 36px; border: 3px solid #f0ecfc; border-top-color: #7c3aed; border-radius: 50%; animation: wizard-spin 0.8s linear infinite; }
@keyframes wizard-spin { to { transform: rotate(360deg); } }

/* Ready */
.ready-pane { gap: 20px; }
.ready-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 16px 0 8px; }
.ready-check { font-size: 44px; line-height: 1; }
.ready-title { font-size: 18px; font-weight: 700; color: #4a3f5e; margin: 10px 0 4px; }
.ready-subtitle { font-size: 13px; color: #94a3b8; margin: 0; }
.identity-card { background: #faf8ff; border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.identity-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.identity-key { color: #b8aad0; font-weight: 500; }
.identity-value { color: #4a3f5e; font-weight: 600; word-break: break-all; text-align: right; }
.ready-hint { font-size: 12px; color: #b8aad0; margin: 0; line-height: 1.5; text-align: center; }
.empty-config { padding: 24px 16px; text-align: center; background: #f5f3ff; border-radius: 10px; }
.empty-text { font-size: 14px; color: #7c3aed; margin: 0; line-height: 1.6; }

/* Footer */
.wizard-footer { display: flex; align-items: center; gap: 10px; padding: 16px 26px; border-top: 1px solid #f0ecfc; background: #fff; flex-shrink: 0; }
.footer-spacer { flex: 1; }
.btn-primary { display: flex; align-items: center; gap: 6px; padding: 10px 22px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(124,58,237,0.2); transition: all 0.15s; }
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
.btn-primary:disabled { background: #ddd6fe; cursor: not-allowed; box-shadow: none; }
.btn-secondary { padding: 10px 18px; background: #fff; color: #4a3f5e; border: 1px solid #f0ecfc; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.btn-secondary:hover { background: #f5f3ff; }
</style>
