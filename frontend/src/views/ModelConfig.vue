<template>
  <div class="page-container">
    <div class="page-title">模型配置</div>

    <!-- 已保存的配置列表 -->
    <div v-if="configs.length" style="margin-bottom:24px">
      <div style="font-size:15px;font-weight:600;color:#4a3f5e;margin-bottom:12px">已保存的配置</div>
      <div class="config-list">
        <div v-for="c in configs" :key="c.id" class="config-card" :class="{ default: c.is_default }">
          <div class="cc-provider">
            <span class="cc-tag">{{ providerLabel(c.provider) }}</span>
            <el-tag v-if="c.is_default" type="success" size="small" effect="dark">默认</el-tag>
          </div>
          <div class="cc-name">{{ c.name }}</div>
          <div v-if="c.category!=='video'" class="cc-model">{{ c.model }}</div>
          <div v-if="c.category!=='video'" class="cc-params">T={{ c.temperature }} max_tokens={{ c.max_tokens }}</div>
          <div v-else class="cc-params" style="color:#7c3aed">{{ providerLabel(c.provider) }}</div>
          <div class="cc-actions">
            <el-button size="small" type="primary" link @click="editConfig(c)">编辑</el-button>
            <el-button v-if="!c.is_default" size="small" type="success" link @click="setDefault(c.id)">设为默认</el-button>
            <el-button size="small" type="warning" link @click="testConfig(c)">检测</el-button>
            <el-button size="small" type="danger" link @click="removeConfig(c.id)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑表单 -->
    <el-card shadow="hover" style="border-radius:12px">
      <template #header><span style="font-weight:600">{{ editing ? '编辑配置' : '新增模型配置' }}</span></template>

      <!-- 提供商选择 -->
      <div style="margin-bottom:20px">
        <div style="font-size:13px;color:#909399;margin-bottom:8px">选择提供商</div>
        <div style="font-size:12px;color:#b8aad0;margin-bottom:6px">对话模型</div>
        <div class="provider-grid">
          <div v-for="p in chatProviders" :key="p.id"
            class="provider-card" :class="{ selected: form.provider === p.id }"
            @click="selectProvider(p)">
            <div class="pv-name">{{ p.label }}</div>
            <div class="pv-base">{{ p.baseUrl || '自定义地址' }}</div>
          </div>
        </div>
        <div style="font-size:12px;color:#b8aad0;margin:12px 0 6px">视频生成</div>
        <div class="provider-grid">
          <div v-for="p in videoProviders" :key="p.id"
            class="provider-card" :class="{ selected: form.provider === p.id }"
            @click="selectProvider(p)">
            <div class="pv-name">{{ p.label }}</div>
            <div class="pv-base">{{ p.baseUrl || '自定义地址' }}</div>
          </div>
        </div>
      </div>

      <el-form label-width="100px" label-position="left">
        <el-form-item label="配置名称" required>
          <el-input v-model="form.name" placeholder="如：生产环境 DeepSeek" style="width:400px"/>
        </el-form-item>
        <el-form-item label="API 地址">
          <el-input v-model="form.api_base" placeholder="https://api.xxx.com/v1" style="width:400px"/>
        </el-form-item>
        <el-form-item :label="currentProvider?.fieldLabels?.api_key || 'API Key'">
          <el-input v-model="form.api_key" :placeholder="isVideoProvider ? '' : 'sk-xxx'" style="width:400px" type="password" show-password/>
          <div v-if="editing && form.api_key?.startsWith('***')" style="color:#909399;font-size:12px">留空则不修改已保存的 Key</div>
        </el-form-item>
        <el-form-item v-if="isVideoProvider" :label="currentProvider?.fieldLabels?.secret_key || 'Secret Key'">
          <el-input v-model="form.secret_key" style="width:400px" type="password" show-password/>
          <div v-if="editing && form.secret_key?.startsWith('***')" style="color:#909399;font-size:12px">留空则不修改已保存的 Secret</div>
        </el-form-item>
        <template v-if="!isVideoProvider">
          <el-form-item label="模型">
            <div style="display:flex;gap:8px;align-items:center">
              <el-select v-model="form.model" style="width:300px" filterable allow-create>
                <el-option v-for="m in currentModels" :key="m" :label="m" :value="m"/>
              </el-select>
              <el-button v-if="form.provider==='ollama'" size="small" :loading="probing" @click="probeOllama">探测本地模型</el-button>
            </div>
          </el-form-item>
          <el-form-item label="Temperature">
            <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" style="width:300px" :format-tooltip="v=>v"/>
            <span style="margin-left:10px;color:#909399">{{ form.temperature }}</span>
          </el-form-item>
          <el-form-item label="最大 Token">
            <el-input-number v-model="form.max_tokens" :min="256" :max="32768" :step="256"/>
          </el-form-item>
          <el-form-item label="超时时间">
            <el-input-number v-model="form.timeout" :min="10" :max="300"/> 秒
          </el-form-item>
        </template>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ editing ? '更新配置' : '保存配置' }}</el-button>
          <el-button :loading="testing" @click="testCurrent">检测连接</el-button>
          <el-button v-if="editing" @click="resetForm">取消编辑</el-button>
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
  await request.post(`/model-configs/${id}/set-default`)
  await load()
  ElMessage.success('已切换默认模型')
}

async function removeConfig(id) {
  await ElMessageBox.confirm('确认删除此配置？', '提示', { type: 'warning' })
  await request.delete(`/model-configs/${id}`)
  await load()
  ElMessage.success('已删除')
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
.page-container { padding: 24px; background: #fff; height: 100%; overflow-y: auto; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; margin-bottom: 24px; }
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.provider-card {
  padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px; cursor: pointer;
  transition: all 0.2s; text-align: center;
}
.provider-card:hover { border-color: #a78bfa; background: #f8f7ff; }
.provider-card.selected { border-color: #7c3aed; background: #ede9fe; box-shadow: 0 0 0 2px rgba(124,58,237,0.2); }
.pv-name { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.pv-base { font-size: 11px; color: #b8aad0; margin-top: 4px; word-break: break-all; }
.config-list { display: flex; flex-direction: column; gap: 10px; }
.config-card {
  padding: 16px 20px; border: 1px solid #e5e7eb; border-radius: 12px;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap; transition: all 0.2s;
}
.config-card.default { border-color: #7c3aed; background: #f8f7ff; }
.cc-provider { display: flex; align-items: center; gap: 8px; min-width: 100px; }
.cc-tag { font-size: 12px; padding: 2px 10px; background: #ede9fe; color: #7c3aed; border-radius: 20px; font-weight: 600; }
.cc-name { font-weight: 600; color: #4a3f5e; min-width: 120px; }
.cc-model { color: #6b7280; font-size: 13px; min-width: 120px; }
.cc-params { color: #b8aad0; font-size: 12px; }
.cc-actions { margin-left: auto; display: flex; gap: 4px; }
</style>
