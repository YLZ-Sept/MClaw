<template>
  <div class="dh-page">
    <div class="dh-hd">
      <span class="dh-title">数字员工</span>
      <span class="dh-sub">AI 数字员工管理</span>
    </div>
    <div class="dh-body">
      <div class="tb-bar">
        <el-button type="primary" @click="openAdd">添加数字员工</el-button>
      </div>
      <div v-if="employees.length" class="employee-grid">
        <div v-for="e in employees" :key="e.id" class="employee-card" :class="{ inactive: e.status !== 'active' }" @click="chatWith(e)">
          <div class="ec-pic" :style="{ background: e.avatar_bg || '#7c3aed' }">
            <img v-if="e.avatar_url" :src="e.avatar_url" class="ec-img" />
            <span v-else class="ec-emoji">{{ e.avatar_emoji || e.role_emoji || '🤖' }}</span>
          </div>
          <div class="ec-info">
            <div class="ec-name">{{ e.name }}</div>
            <div class="ec-role">{{ e.role }}</div>
            <div class="ec-agent" v-if="getAgentIds(e).length">
              <el-tag v-for="aid in getAgentIds(e)" :key="aid" size="small" class="agent-tag">{{ agentName(aid) }}</el-tag>
            </div>
            <div class="ec-agent" v-else style="color:#ddd">未绑定 Agent</div>
          </div>
          <div class="ec-actions" @click.stop>
            <el-button size="small" type="primary" link @click="chatWith(e)" :disabled="!getAgentIds(e).length">聊天</el-button>
            <el-button size="small" type="primary" link @click="openEdit(e)">编辑</el-button>
            <el-button size="small" type="danger" link @click="delEmployee(e.id)">删除</el-button>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无数字员工，点击上方按钮添加" />
    </div>
    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑数字员工' : '添加数字员工'" width="480px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" placeholder="如：小薇"/></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="dlg.form.role" style="width:100%">
            <el-option v-for="r in roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定 Agent">
          <el-select v-model="dlg.form.agent_ids" style="width:100%" multiple clearable placeholder="选择要绑定的 Agent（可多选）">
            <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认头像">
          <div class="avatar-preset-grid">
            <div
              v-for="av in avatarPresets" :key="av.id"
              class="avatar-preset"
              :class="{ selected: dlg.form.avatar_emoji === av.emoji && dlg.form.avatar_bg === av.bg }"
              @click="selectPreset(av)"
            >
              <div class="ap-pic" :style="{ background: av.bg }">
                <span>{{ av.emoji }}</span>
              </div>
              <div class="ap-name">{{ av.name }}</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="自定义头像">
          <el-upload :auto-upload="false" :limit="1" accept="image/*" :file-list="avatarFiles" :on-change="onAvatarChange" :on-remove="onAvatarRemove" list-type="picture">
            <el-button type="primary" plain size="small">上传图片</el-button>
            <template #tip><span class="upload-tip">可选，覆盖默认头像</span></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveEmployee">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
const req = axios.create({ baseURL: '/api' })
const router = useRouter()

const roles = ['销售', '行政', '售后', '市场', '技术', '客服']
const employees = ref([])
const agents = ref([])
const dlg = reactive({ visible: false, isEdit: false, form: {} })
const avatarFiles = ref([])
let avatarFile = null

const avatarPresets = [
  { id: 'av1', emoji: '🦊', bg: 'linear-gradient(135deg,#ff6d00 0%,#ff9100 100%)', name: '赤狐' },
  { id: 'av2', emoji: '🐼', bg: 'linear-gradient(135deg,#1a237e 0%,#4fc3f7 100%)', name: '竹熊' },
  { id: 'av3', emoji: '🦄', bg: 'linear-gradient(135deg,#e91e63 0%,#ce93d8 100%)', name: '独角兽' },
  { id: 'av4', emoji: '🐲', bg: 'linear-gradient(135deg,#b71c1c 0%,#ff7043 100%)', name: '炎龙' },
  { id: 'av5', emoji: '🦉', bg: 'linear-gradient(135deg,#004d40 0%,#80cbc4 100%)', name: '智鸮' },
  { id: 'av6', emoji: '🐺', bg: 'linear-gradient(135deg,#311b92 0%,#9575cd 100%)', name: '夜狼' },
  { id: 'av7', emoji: '🦋', bg: 'linear-gradient(135deg,#0d47a1 0%,#40c4ff 100%)', name: '蓝蝶' },
  { id: 'av8', emoji: '🐬', bg: 'linear-gradient(135deg,#006064 0%,#00bcd4 100%)', name: '海豚' },
]

function agentName(id) {
  const a = agents.value.find(a => a.id === id)
  return a ? a.name : id
}
function getAgentIds(e) {
  const ids = e.agent_ids || e.agent_id || ''
  return ids ? ids.split(',').filter(Boolean) : []
}
function selectPreset(av) {
  dlg.form.avatar_bg = av.bg
  dlg.form.avatar_emoji = av.emoji
  dlg.form.avatar_url = ''
  avatarFiles.value = []; avatarFile = null
}
function onAvatarChange(file) {
  avatarFile = file.raw
  dlg.form.avatar_url = ''
}
function onAvatarRemove() {
  avatarFile = null
  dlg.form.avatar_url = ''
}

async function loadEmployees() {
  const { data } = await req.get('/digital-employees')
  employees.value = data.data || []
}
async function loadAgents() {
  const { data } = await req.get('/agents')
  agents.value = data.data || []
}

function openAdd() {
  dlg.isEdit = false
  dlg.form = { name: '', role: '销售', agent_ids: [], avatar_bg: avatarPresets[0].bg, avatar_emoji: avatarPresets[0].emoji }
  avatarFiles.value = []; avatarFile = null
  dlg.visible = true
}
function openEdit(e) {
  dlg.isEdit = true
  dlg.form = { ...e, agent_ids: getAgentIds(e) }
  avatarFiles.value = e.avatar_url ? [{ name: '当前头像', url: e.avatar_url }] : []
  avatarFile = null
  dlg.visible = true
}
async function saveEmployee() {
  if (!dlg.form.name) return ElMessage.warning('请输入名称')
  const fd = new FormData()
  fd.append('name', dlg.form.name)
  fd.append('role', dlg.form.role)
  fd.append('agent_ids', (dlg.form.agent_ids || []).join(','))
  fd.append('avatar_bg', dlg.form.avatar_bg || '')
  fd.append('avatar_emoji', dlg.form.avatar_emoji || '')
  if (avatarFile) { fd.append('avatar', avatarFile) }
  else if (dlg.form.avatar_url === '') { fd.append('avatar_url', '') }

  if (dlg.isEdit) {
    await req.put('/digital-employees/' + dlg.form.id, fd)
  } else {
    await req.post('/digital-employees', fd)
  }
  dlg.visible = false; await loadEmployees(); ElMessage.success('OK')
}
async function delEmployee(id) {
  try { await ElMessageBox.confirm('确认删除？'); await req.delete('/digital-employees/' + id); await loadEmployees(); ElMessage.success('已删除') } catch {}
}
async function chatWith(e) {
  const ids = getAgentIds(e)
  if (!ids.length) return ElMessage.warning('该数字员工未绑定 Agent，无法聊天')
  try {
    const { data } = await req.post('/chat-sessions', {
      name: `${e.name}的对话`,
      agent_id: ids[0],
      employee_id: e.id
    })
    router.push(`/chat?session=${data.data.id}&agent=${ids[0]}&agentName=${e.name}&employee_id=${e.id}`)
  } catch {
    router.push(`/chat?agent=${ids[0]}&agentName=${e.name}`)
  }
}

onMounted(() => { loadAgents().then(() => loadEmployees()) })
</script>

<style scoped>
.dh-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.dh-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.dh-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.dh-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.dh-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb-bar { margin-bottom: 16px; }
.employee-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.employee-card {
  display: flex; align-items: center; gap: 14px; padding: 16px;
  background: #fff; border-radius: 12px; border: 1px solid #f0ecfc; transition: all .2s; cursor: pointer;
}
.employee-card:hover { border-color: #7c3aed; box-shadow: 0 2px 12px rgba(124,58,237,.08); }
.employee-card.inactive { opacity: .5; }
.ec-pic { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.ec-img { width: 100%; height: 100%; object-fit: cover; }
.ec-emoji { font-size: 24px; }
.ec-info { flex: 1; min-width: 0; }
.ec-name { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.ec-role { font-size: 12px; color: #7c3aed; margin-top: 2px; }
.ec-agent { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
.agent-tag { font-size: 10px; }
.ec-actions { display: flex; flex-direction: column; gap: 2px; }
.avatar-preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.avatar-preset {
  padding: 8px; border-radius: 8px; border: 2px solid #f0ecfc; cursor: pointer;
  text-align: center; transition: all .15s;
}
.avatar-preset:hover { border-color: #b8aad0; }
.avatar-preset.selected { border-color: #7c3aed; background: #f8f7ff; }
.ap-pic { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.ap-name { font-size: 11px; color: #6b5f80; }
.upload-tip { font-size: 11px; color: #b8aad0; margin-left: 8px; }
</style>
