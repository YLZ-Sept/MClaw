<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="wizard">
      <div class="wizard-header">
        <div>
          <h2 class="wizard-title">创建数字员工</h2>
          <p class="wizard-subtitle">AI 驱动的智能体创建向导</p>
        </div>
        <button class="wizard-close" @click="close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      <!-- Step 1: 描述需求 -->
      <div v-if="step === 0" class="step-body">
        <div class="step-hint">
          <p>用自然语言描述你需要的数字员工，AI 将自动生成配置。</p>
          <div class="example-chips">
            <span v-for="ex in examples" :key="ex" class="example-chip" @click="form.description = ex">{{ ex }}</span>
          </div>
        </div>
        <textarea v-model="form.description" class="desc-input" placeholder="例如：一个电商客服助手，能查询订单状态、处理退换货、安抚客户情绪……" rows="4"></textarea>
        <div class="step-footer">
          <div></div>
          <button class="btn-primary" :disabled="!form.description.trim()" @click="generate" :loading="generating">
            {{ generating ? 'AI 生成中…' : '✨ AI 生成配置' }}
          </button>
        </div>
      </div>

      <!-- Step 2: 确认配置 -->
      <div v-if="step === 1" class="step-body">
        <div class="gen-header">
          <span class="gen-badge">AI 已生成以下配置</span>
          <span class="gen-hint">你可以直接修改任何字段</span>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>名称</label><input v-model="config.name" class="form-input" placeholder="数字员工名称" />
          </div>
          <div class="form-group">
            <label>图标 (Emoji)</label>
            <div class="emoji-pick">
              <input v-model="config.iconEmoji" class="form-input emoji-input" maxlength="2" />
              <span v-for="e in ['🤖','🧠','💼','📊','🛡️','🎯','💬','✨','🔧','📚']" :key="e" class="emoji-opt" :class="{sel:config.iconEmoji===e}" @click="config.iconEmoji=e">{{ e }}</span>
            </div>
          </div>
          <div class="form-group">
            <label>系统提示词</label>
            <textarea v-model="config.prompt" class="form-input prompt-input" rows="6" placeholder="系统提示词…"></textarea>
          </div>
          <div class="form-group">
            <label>选一个基础 Agent（可选）</label>
            <el-select v-model="config.baseAgent" placeholder="选择…" style="width:100%">
              <el-option v-for="a in baseAgents" :key="a" :label="a" :value="a" />
            </el-select>
          </div>
        </div>
        <div class="step-footer">
          <button class="btn-secondary" @click="step=0">返回修改描述</button>
          <button class="btn-primary" @click="step=2">确认，下一步</button>
        </div>
      </div>

      <!-- Step 3: 完成 -->
      <div v-if="step === 2" class="step-body ready-body">
        <div class="ready-hero">
          <span class="ready-emoji">{{ config.iconEmoji || '🤖' }}</span>
          <h3>{{ config.name || '新数字员工' }}</h3>
          <p>配置完成，保存后可以开始对话</p>
        </div>
        <div class="step-footer">
          <button class="btn-secondary" @click="step=1">返回修改</button>
          <button class="btn-primary" @click="save" :disabled="saving">{{ saving ? '保存中…' : '✨ 创建并开始对话' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/index.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'created'])

const step = ref(0)
const generating = ref(false)
const saving = ref(false)

const form = reactive({ description: '' })
const config = reactive({ name: '', iconEmoji: '🤖', prompt: '', baseAgent: '' })
const baseAgents = ['internal-agent', 'sales-agent', 'support-agent', 'bid-agent']

const examples = [
  '一个客服助手，能查询工单状态、处理退换货、安抚客户情绪',
  '一个销售数据分析师，能分析销售趋势、生成周报、预测业绩',
  '一个招聘专员，能筛选简历、安排面试、发送 Offer',
  '一个合同审核专家，能检查合同条款、标注风险点、提出修改建议',
]

async function generate() {
  if (!form.description.trim()) return
  generating.value = true
  try {
    const { data } = await request.post('/agent-apps/generate-config', { description: form.description })
    if (data.data) {
      config.name = data.data.name || ''
      config.iconEmoji = data.data.iconEmoji || '🤖'
      config.prompt = data.data.prompt || ''
      config.baseAgent = data.data.baseAgent || ''
    } else {
      // Fallback: prefill with sensible defaults
      config.name = form.description.slice(0, 20)
      config.prompt = `你是${form.description}。请始终以专业、友好的态度帮助用户。`
      config.iconEmoji = '🤖'
    }
    step.value = 1
  } catch {
    // AI unavailable: still proceed with basic generation
    config.name = form.description.slice(0, 20)
    config.prompt = `你是${form.description}。请始终以专业、友好的态度帮助用户。`
    step.value = 1
  }
  generating.value = false
}

async function save() {
  saving.value = true
  try {
    await request.post('/agent-apps', {
      name: config.name,
      icon_emoji: config.iconEmoji,
      custom_prompt: config.prompt,
      base_agent: config.baseAgent || null,
    })
    ElMessage.success('数字员工创建成功')
    emit('created')
    close()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  }
  saving.value = false
}

function close() { emit('update:modelValue', false) }
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1001;padding:20px; }
.wizard { background:#fff;border-radius:18px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.18);overflow:hidden; }
.wizard-header { display:flex;align-items:flex-start;justify-content:space-between;padding:22px 26px 16px;border-bottom:1px solid #f0ecfc; }
.wizard-title { font-size:19px;font-weight:700;color:#4a3f5e;margin:0; }
.wizard-subtitle { font-size:13px;color:#94a3b8;margin:4px 0 0; }
.wizard-close { width:32px;height:32px;border:none;background:none;cursor:pointer;color:#b8aad0;display:flex;align-items:center;justify-content:center;border-radius:8px; }
.wizard-close:hover { background:#f5f3ff;color:#4a3f5e; }

.step-body { padding:22px 26px;display:flex;flex-direction:column;gap:16px;flex:1;overflow-y:auto; }
.step-hint p { font-size:14px;color:#4a3f5e;margin:0 0 10px; }
.example-chips { display:flex;flex-wrap:wrap;gap:6px; }
.example-chip { padding:6px 12px;background:#f5f3ff;border-radius:8px;font-size:12px;color:#7c3aed;cursor:pointer;transition:all 0.15s;line-height:1.4;max-width:100%; }
.example-chip:hover { background:#ede9fe; }

.desc-input { width:100%;padding:12px 14px;border:1px solid #f0ecfc;border-radius:12px;font-size:14px;line-height:1.6;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box; }
.desc-input:focus { border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.12); }

.gen-header { display:flex;align-items:center;gap:10px; }
.gen-badge { padding:3px 10px;background:#ede9fe;border-radius:6px;font-size:12px;font-weight:600;color:#7c3aed; }
.gen-hint { font-size:12px;color:#94a3b8; }

.form-grid { display:flex;flex-direction:column;gap:14px; }
.form-group { display:flex;flex-direction:column;gap:6px; }
.form-group label { font-size:13px;font-weight:600;color:#4a3f5e; }
.form-input { padding:10px 12px;border:1px solid #f0ecfc;border-radius:10px;font-size:14px;outline:none;width:100%;box-sizing:border-box;font-family:inherit; }
.form-input:focus { border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
.emoji-input { width:48px!important;text-align:center;font-size:20px; }
.prompt-input { resize:vertical;line-height:1.5; }
.emoji-pick { display:flex;align-items:center;gap:6px;flex-wrap:wrap; }
.emoji-opt { width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;font-size:18px;border:2px solid transparent; }
.emoji-opt:hover { background:#f5f3ff; }
.emoji-opt.sel { border-color:#7c3aed;background:#ede9fe; }

.step-footer { display:flex;align-items:center;justify-content:space-between;padding-top:8px; }
.btn-primary { display:flex;align-items:center;gap:6px;padding:10px 20px;background:linear-gradient(135deg,#7c3aed,#6366f1);color:white;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer; }
.btn-primary:disabled { background:#ddd6fe;cursor:not-allowed; }
.btn-primary:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 4px 14px rgba(124,58,237,0.3); }
.btn-secondary { padding:10px 18px;background:#fff;color:#4a3f5e;border:1px solid #f0ecfc;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer; }
.btn-secondary:hover { background:#f5f3ff; }

.ready-body { align-items:center;justify-content:center;min-height:240px; }
.ready-hero { display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;flex:1;justify-content:center; }
.ready-emoji { font-size:64px; }
.ready-hero h3 { font-size:20px;font-weight:700;color:#4a3f5e;margin:0; }
.ready-hero p { font-size:14px;color:#94a3b8;margin:0; }
</style>
