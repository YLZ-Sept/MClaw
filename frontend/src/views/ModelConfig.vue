<template>
  <div class="mc-page">
    <div class="mc-hd">
      <div>
        <h2 class="mc-title">模型配置</h2>
        <p class="mc-sub">管理 AI 模型连接，支持对话与视频生成</p>
      </div>
    </div>

    <!-- 已保存的配置 -->
    <div v-if="configs.length" class="mc-section">
      <h3 class="mc-sec-title">已保存的配置</h3>
      <div class="config-grid">
        <div v-for="c in configs" :key="c.id" class="cfg-card" :class="{ default: c.is_default }">
          <div class="cfg-left">
            <div class="cfg-badge">{{ providerEmoji(c.provider) }}</div>
          </div>
          <div class="cfg-mid">
            <div class="cfg-name">
              {{ c.name }}
              <el-tag v-if="c.is_default" size="small" type="success" effect="dark" round>默认</el-tag>
            </div>
            <div class="cfg-info">
              <span class="cfg-prov">{{ providerLabel(c.provider) }}</span>
              <template v-if="c.category !== 'video'">
                <span class="cfg-div">·</span>
                <span class="cfg-model">{{ c.model }}</span>
                <span class="cfg-div">·</span>
                <span>T={{ c.temperature }} · tk={{ c.max_tokens }}</span>
              </template>
            </div>
          </div>
          <div class="cfg-actions">
            <el-tooltip content="编辑"><el-button size="small" circle @click="editConfig(c)">✏️</el-button></el-tooltip>
            <el-tooltip v-if="!c.is_default" content="设为默认"><el-button size="small" circle @click="setDefault(c.id)">⭐</el-button></el-tooltip>
            <el-tooltip content="检测连接"><el-button size="small" circle @click="testConfig(c)">🔍</el-button></el-tooltip>
            <el-tooltip content="删除"><el-button size="small" circle type="danger" @click="removeConfig(c.id)">🗑</el-button></el-tooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- 表单 -->
    <el-card shadow="never" class="mc-form-card">
      <template #header>
        <span class="mc-form-title">{{ editing ? '✏️ 编辑配置' : '＋ 新增模型配置' }}</span>
      </template>

      <!-- 提供商 -->
      <div class="mc-field">
        <div class="mc-label">选择提供商</div>
        <div class="provider-grid">
          <div v-for="p in chatProviders" :key="p.id"
            class="pv-card" :class="{ sel: form.provider === p.id }"
            @click="selectProvider(p)">
            <div class="pv-emoji">{{ providerEmoji(p.id) }}</div>
            <div class="pv-name">{{ p.label }}</div>
          </div>
          <div v-for="p in videoProviders" :key="p.id"
            class="pv-card pv-video" :class="{ sel: form.provider === p.id }"
            @click="selectProvider(p)">
            <div class="pv-emoji">🎬</div>
            <div class="pv-name">{{ p.label }}</div>
          </div>
        </div>
      </div>

      <el-form label-width="100px" label-position="left" class="mc-form">
        <el-form-item label="配置名称" required>
          <el-input v-model="form.name" placeholder="如：生产环境 DeepSeek" style="max-width:420px"/>
        </el-form-item>
        <el-form-item label="API 地址">
          <el-input v-model="form.api_base" placeholder="https://api.xxx.com/v1" style="max-width:420px"/>
        </el-form-item>
        <el-form-item :label="currentProvider?.fieldLabels?.api_key || 'API Key'">
          <el-input v-model="form.api_key" placeholder="sk-xxx" style="max-width:420px" type="password" show-password/>
          <div v-if="editing && form.api_key?.startsWith('***')" class="mc-hint">留空则不修改已保存的 Key</div>
        </el-form-item>
        <el-form-item v-if="isVideoProvider" :label="currentProvider?.fieldLabels?.secret_key || 'Secret Key'">
          <el-input v-model="form.secret_key" style="max-width:420px" type="password" show-password/>
          <div v-if="editing && form.secret_key?.startsWith('***')" class="mc-hint">留空则不修改已保存的 Secret</div>
        </el-form-item>
        <template v-if="!isVideoProvider">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="模型">
                <div style="display:flex;gap:8px;align-items:center">
                  <el-select v-model="form.model" style="width:260px" filterable allow-create>
                    <el-option v-for="m in currentModels" :key="m" :label="m" :value="m"/>
                  </el-select>
                  <el-button v-if="form.provider==='ollama'" size="small" :loading="probing" @click="probeOllama">🔍 探测</el-button>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="超时">
                <el-input-number v-model="form.timeout" :min="10" :max="300"/> <span class="mc-unit">秒</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="Temperature">
                <div class="slider-row">
                  <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" :format-tooltip="v=>v"/>
                  <span class="slider-val">{{ form.temperature }}</span>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="最大 Token">
                <el-input-number v-model="form.max_tokens" :min="256" :max="32768" :step="256"/>
              </el-form-item>
            </el-col>
          </el-row>
        </template>
        <el-divider/>
        <el-form-item>
          <el-button type="primary" size="large" :loading="saving" @click="save">{{ editing ? '更新配置' : '💾 保存配置' }}</el-button>
          <el-button size="large" :loading="testing" @click="testCurrent">🔍 检测连接</el-button>
          <el-button v-if="editing" size="large" @click="resetForm">取消编辑</el-button>
        </el-form-item>
        <el-form-item v-if="testResult">
          <el-alert :title="testResult" :type="testOk ? 'success' : 'error'" :closable="false" show-icon/>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/index'

const configs = ref([])
const providers = ref([])
const probing = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref('')
const testOk = ref(false)
const editing = ref(false)
const editingId = ref('')

const form = reactive({
  name: '', provider: 'deepseek', api_base: '', api_key: '', model: 'deepseek-chat',
  temperature: 0.7, max_tokens: 2048, timeout: 60, secret_key: ''
})

const chatProviders = computed(() => providers.value.filter(p => p.category !== 'video'))
const videoProviders = computed(() => providers.value.filter(p => p.category === 'video'))

const currentProvider = computed(() => providers.value.find(p => p.id === form.provider))

const isVideoProvider = computed(() => currentProvider.value?.category === 'video')

const currentModels = computed(() => {
  const p = currentProvider.value
  return p?.models || []
})

const PROVIDER_EMOJI = { deepseek: '🟣', openai: '🟢', ollama: '🦙', moonshot: '🌙', zhipu: '🧠', qwen: '🔵', kling: '🎬', chanjing: '🎥', custom: '⚙️' }
function providerEmoji(id) { return PROVIDER_EMOJI[id] || '🔌' }
function providerLabel(id) {
  const p = providers.value.find(p => p.id === id)
  return p?.label || id
}

function selectProvider(p) {
  form.provider = p.id
  form.api_base = p.baseUrl || ''
  if (p.models?.length) form.model = p.models[0]
  if (!form.name) form.name = p.label + ' 配置'
  if (p.category === 'video') {
    form.model = ''
    form.secret_key = ''
  }
}

async function probeOllama() {
  if (!form.api_base) return ElMessage.warning('请先填写 Ollama API 地址')
  probing.value = true
  try {
    const { data } = await request.post('/model-configs/probe', { api_base: form.api_base })
    if (data.data.models?.length) {
      const p = providers.value.find(p => p.id === 'ollama')
      if (p) {
        p.models = data.data.models
        if (data.data.models.length) form.model = data.data.models[0]
      }
      ElMessage.success(`探测到 ${data.data.models.length} 个本地模型`)
    } else {
      ElMessage.warning('未探测到模型，请确认 Ollama 已启动')
    }
  } catch { ElMessage.error('连接失败') }
  probing.value = false
}

async function testCurrent() {
  testing.value = true; testResult.value = ''
  try {
    // 编辑已有配置时用 ID 测试（后端读真实 Key），新建时用表单值
    const { data } = editing.value
      ? await request.post(`/model-configs/${editingId.value}/test`)
      : await request.post('/model-configs/test', isVideoProvider.value
          ? { api_base: form.api_base, api_key: form.api_key, secret_key: form.secret_key, category: 'video', provider: form.provider }
          : { api_base: form.api_base, api_key: form.api_key, model: form.model }
        )
    testOk.value = data.data.success
    testResult.value = data.data.success
      ? `连接成功！延迟 ${data.data.latency}ms`
      : `连接失败：${data.data.error}`
  } catch (e) {
    testOk.value = false
    testResult.value = '请求异常：' + e.message
  }
  testing.value = false
}

async function testConfig(c) {
  testing.value = true;
  try {
    const { data } = await request.post(`/model-configs/${c.id}/test`)
    if (data.data.success) {
      ElMessage.success(`连接成功，延迟 ${data.data.latency}ms`)
    } else {
      ElMessage.error('连接失败：' + data.data.error)
    }
  } catch (e) { ElMessage.error('请求异常') }
  testing.value = false
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入配置名称')
  saving.value = true
  try {
    if (editing.value) {
      const body = { ...form }
      // 如果 key 没改（仍是掩码），不传 key
      if (body.api_key?.startsWith('***')) delete body.api_key
      if (body.secret_key?.startsWith('***')) delete body.secret_key
      await request.put(`/model-configs/${editingId.value}`, body)
      ElMessage.success('已更新')
    } else {
      const body = { ...form, category: isVideoProvider.value ? 'video' : 'chat' }
      await request.post('/model-configs', body)
      ElMessage.success('已保存')
    }
    resetForm()
    await load()
  } catch (e) { ElMessage.error(e.response?.data?.message || '保存失败') }
  saving.value = false
}

async function setDefault(id) {
  try {
    await ElMessageBox.confirm('将此配置设为默认？所有聊天和数字员工将默认使用此模型。', '切换默认', { type: 'info', confirmButtonText: '确认切换' })
    await request.post(`/model-configs/${id}/set-default`)
    await load()
    ElMessage.success('已切换默认模型')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败：' + (e.response?.data?.message || e.message))
  }
}

async function removeConfig(id) {
  try {
    await ElMessageBox.confirm('确认删除此配置？', '提示', { type: 'warning' })
    await request.delete(`/model-configs/${id}`)
    await load()
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败：' + (e.response?.data?.message || e.message))
  }
}

function editConfig(c) {
  editing.value = true
  editingId.value = c.id
  form.name = c.name
  form.provider = c.provider
  form.api_base = c.api_base
  form.api_key = c.api_key  // 掩码值
  form.secret_key = c.secret_key || ''  // 掩码值
  form.model = c.model
  form.temperature = c.temperature
  form.max_tokens = c.max_tokens
  form.timeout = c.timeout
  testResult.value = ''
}

function resetForm() {
  editing.value = false
  editingId.value = ''
  form.name = ''; form.provider = 'deepseek'; form.api_base = ''; form.api_key = ''
  form.model = 'deepseek-chat'; form.temperature = 0.7; form.max_tokens = 2048; form.timeout = 60
  form.secret_key = ''
  testResult.value = ''
  // 重置 provider 默认值
  const dp = providers.value.find(p => p.id === 'deepseek')
  if (dp) selectProvider(dp)
}

async function load() {
  try {
    const [cr, pr] = await Promise.all([
      request.get('/model-configs'),
      request.get('/model-configs/providers')
    ])
    configs.value = cr.data.data || []
    providers.value = pr.data.data || []
    // 如果当前没选 provider，默认选 deepseek
    if (!form.provider) {
      const dp = providers.value.find(p => p.id === 'deepseek')
      if (dp) selectProvider(dp)
    }
  } catch {}
}

onMounted(load)
</script>

<style scoped>
.mc-page { padding: 24px; background: #fafafe; min-height: 100%; }
.mc-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.mc-title { margin: 0; font-size: 22px; font-weight: 700; color: #4a3f5e; }
.mc-sub { margin: 4px 0 0; font-size: 13px; color: #b8aad0; }

/* 已保存配置 */
.mc-section { margin-bottom: 28px; }
.mc-sec-title { font-size: 15px; font-weight: 600; color: #4a3f5e; margin: 0 0 14px; }
.config-grid { display: flex; flex-direction: column; gap: 10px; }
.cfg-card {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px; background: #fff; border: 1px solid #e8e3f0;
  border-radius: 14px; transition: all .2s;
}
.cfg-card:hover { border-color: #c4b5fd; box-shadow: 0 2px 12px rgba(124,58,237,.06); }
.cfg-card.default {
  border-color: #a78bfa; background: linear-gradient(135deg, #faf8ff 0%, #f5f0ff 100%);
  box-shadow: 0 0 0 1px rgba(124,58,237,.12);
}
.cfg-left { flex-shrink: 0; }
.cfg-badge { width: 44px; height: 44px; border-radius: 12px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.cfg-mid { flex: 1; min-width: 0; }
.cfg-name { font-size: 15px; font-weight: 600; color: #4a3f5e; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.cfg-info { font-size: 12px; color: #909399; }
.cfg-prov { color: #7c3aed; font-weight: 500; }
.cfg-div { margin: 0 6px; color: #ddd; }
.cfg-model { color: #6b7280; }
.cfg-actions { display: flex; gap: 6px; flex-shrink: 0; }
.cfg-actions .el-button { transition: all .15s; }
.cfg-actions .el-button:hover { transform: scale(1.1); }

/* 表单 */
.mc-form-card { border-radius: 14px !important; border: 1px solid #e8e3f0 !important; box-shadow: none !important; }
.mc-form-card :deep(.el-card__header) { background: #faf8ff; border-bottom: 1px solid #f0ecfc; padding: 14px 20px; border-radius: 14px 14px 0 0; }
.mc-form-title { font-weight: 600; color: #4a3f5e; }
.mc-field { margin-bottom: 20px; }
.mc-label { font-size: 13px; color: #909399; margin-bottom: 10px; }
.mc-hint { color: #909399; font-size: 12px; margin-top: 2px; }
.mc-unit { margin-left: 6px; color: #909399; font-size: 13px; }
.mc-form :deep(.el-form-item) { margin-bottom: 18px; }

/* 提供商 */
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
.pv-card {
  padding: 14px 10px; border: 1px solid #e8e3f0; border-radius: 12px; cursor: pointer;
  text-align: center; transition: all .2s; background: #fff;
}
.pv-card:hover { border-color: #a78bfa; background: #faf8ff; transform: translateY(-1px); }
.pv-card.sel { border-color: #7c3aed; background: #ede9fe; box-shadow: 0 0 0 2px rgba(124,58,237,.18); }
.pv-emoji { font-size: 26px; margin-bottom: 4px; }
.pv-name { font-size: 13px; font-weight: 600; color: #4a3f5e; }
.pv-video { border-style: dashed; }

/* 滑块 */
.slider-row { display: flex; align-items: center; gap: 14px; width: 100%; }
.slider-row .el-slider { flex: 1; }
.slider-val { font-size: 14px; font-weight: 600; color: #7c3aed; min-width: 28px; text-align: right; }
</style>
