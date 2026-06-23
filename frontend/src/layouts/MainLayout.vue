<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">MC</div>
          <div class="sidebar-logo-info">
            <span class="sidebar-logo-name">MClaw V1.0</span>
            <span class="sidebar-logo-desc">企业智能体管理平台</span>
          </div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-group">
          <div class="nav-group-title">对话</div>
          <div class="nav-item-wrapper" v-if="hasPerm('chat')">
            <a class="nav-item" :class="{ active: isChatActive }" href="#" @click.prevent="toggleChatSessions" style="flex:1">
              <el-icon><ChatDotSquare /></el-icon><span>实时聊天</span>
            </a>
            <el-button class="nav-item-toggle" text size="small" @click="toggleChatSessions">
              <el-icon><component :is="showChatSessions ? ArrowUp : ArrowDown" /></el-icon>
            </el-button>
          </div>
          <div class="nav-sub-group" v-show="showChatSessions && hasPerm('chat')">
            <div class="nav-sub-item nav-sub-add" @click="newChatSession">
              <el-icon :size="14"><Plus /></el-icon>
              <span>新建会话</span>
            </div>
            <div
              v-for="s in chatSessions" :key="s.id"
              class="nav-sub-item"
              :class="{ active: currentSessionId === s.id }"
              @click="goSession(s)"
            >
              <span class="nav-sub-text">{{ s.name }}</span>
              <el-popover placement="right" :width="100" trigger="click" :hide-after="0">
                <template #reference>
                  <el-button class="nav-sub-more" size="small" text @click.stop>
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                </template>
                <div class="session-menu">
                  <div class="session-menu-item" @click.stop="renameSession(s)">重命名</div>
                  <div class="session-menu-item session-menu-danger" @click.stop="delSession(s.id)">删除</div>
                </div>
              </el-popover>
            </div>
            <div v-if="chatSessions.length===0" class="nav-sub-empty">暂无会话</div>
          </div>
          <router-link v-if="hasPerm('digital')" to="/digital-human" class="nav-item" active-class="active">
            <el-icon><UserFilled /></el-icon><span>数字员工</span>
          </router-link>
          <router-link v-if="hasPerm('trending')" to="/trending" class="nav-item" active-class="active">
            <el-icon><TrendCharts /></el-icon><span>一键追爆款</span>
          </router-link>
          <router-link v-if="hasPerm('social_acquisition')" to="/social-acquisition" class="nav-item" active-class="active">
            <el-icon><Aim /></el-icon><span>社媒拓客</span>
          </router-link>
          <router-link v-if="hasPerm('digital')" to="/digital" class="nav-item" active-class="active">
            <el-icon><DataAnalysis /></el-icon><span>应用智能体管理</span>
          </router-link>
          <router-link v-if="hasPerm('digital')" to="/expert-hub" class="nav-item" active-class="active">
            <el-icon><MagicStick /></el-icon><span>专家广场</span>
          </router-link>
          <router-link v-if="hasPerm('channels')" to="/channels" class="nav-item" active-class="active">
            <el-icon><ChatLineSquare /></el-icon><span>消息渠道</span>
          </router-link>
          <router-link v-if="hasPerm('knowledge')" to="/knowledge-base" class="nav-item" active-class="active">
            <el-icon><Collection /></el-icon><span>知识库</span>
          </router-link>
          <router-link v-if="hasPerm('skills')" to="/skill-library" class="nav-item" active-class="active">
            <el-icon><MagicStick /></el-icon><span>技能库</span>
          </router-link>
          <router-link v-if="hasPerm('tasks')" to="/tasks" class="nav-item" active-class="active">
            <el-icon><List /></el-icon><span>任务</span>
          </router-link>
        </div>
        <div class="nav-group">
          <div class="nav-group-title">配置</div>
          <router-link v-if="hasPerm('model')" to="/model-config" class="nav-item" active-class="active">
            <el-icon><Cpu /></el-icon><span>模型配置</span>
          </router-link>
          <router-link v-if="hasAnyPerm('security','security_config','security_sessions','security_maintain','security_logs')" to="/services" class="nav-item" active-class="active">
            <el-icon><Setting /></el-icon><span>服务管理</span>
          </router-link>

          <router-link v-if="hasAnyPerm('security_users','security_roles','security_permissions')" to="/users" class="nav-item" active-class="active">
            <el-icon><Avatar /></el-icon><span>用户管理</span>
          </router-link>
          <router-link v-if="hasAnyPerm('security','security_config','security_sessions','security_maintain','security_logs')" to="/security" class="nav-item" active-class="active">
            <el-icon><Lock /></el-icon><span>安全设置</span>
          </router-link>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <el-icon><UserFilled /></el-icon>
          <span>{{ userName }}</span>
        </div>
        <div class="user-actions">
          <el-button text size="small" @click="handleLogout">退出</el-button>
        </div>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <header class="content-header">
        <div class="header-left"></div>
        <div class="header-right">
          <el-button text size="small" @click="showAbout = true">帮助</el-button>
        </div>
      </header>
      <div class="content-body">
        <router-view />
      </div>
    </main>

    <!-- 帮助对话框 -->
    <el-dialog v-model="showAbout" width="480px" :close-on-click-modal="false">
      <template #header>
        <div class="help-dialog-header">
          <span class="help-dialog-icon"><Service /></span>
          <span>帮助中心</span>
        </div>
      </template>
      <div class="help-content">
        <!-- 品牌区 -->
        <div class="help-brand">
          <div class="help-brand-icon">MC</div>
          <div class="help-brand-info">
            <div class="help-brand-name">MClaw V1.0</div>
            <div class="help-brand-desc">企业智能体管理平台</div>
          </div>
        </div>

        <!-- 简介卡片 -->
        <div class="help-card">
          <div class="help-card-title">
            <el-icon><MagicStick /></el-icon>
            <span>产品简介</span>
          </div>
          <p class="help-card-text">基于多模型 AI 驱动的企业智能体操作系统，集成 CRM、进销存、人事、知识库、内容生产与全渠道消息触达，让 AI Agent 接管公司全部非执行操作。</p>
        </div>

        <!-- 联系方式卡片 -->
        <div class="help-card">
          <div class="help-card-title">
            <el-icon><Phone /></el-icon>
            <span>联系电话</span>
          </div>
          <div class="help-phone">0871-63820616</div>
          <div class="help-hint">工作日 9:00 - 18:00</div>
        </div>

        <!-- 在线客服卡片 -->
        <div class="help-card help-card-service">
          <div class="help-card-title">
            <el-icon><ChatDotSquare /></el-icon>
            <span>在线客服</span>
          </div>
          <p class="help-card-text">扫码或点击下方按钮，通过企业微信联系在线客服，获取即时技术支持。</p>
          <div class="help-qrcode">
            <img src="/kefu-qrcode.png" alt="企业微信客服二维码" />
          </div>
          <a href="https://work.weixin.qq.com/kfid/kfc6ea1e452c2944b7f" target="_blank" rel="noopener" class="help-service-btn">
            <el-icon><Service /></el-icon>
            <span>联系在线客服</span>
          </a>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  ChatDotSquare, DataAnalysis, List,
  Cpu, Setting, ChatLineSquare, Lock, UserFilled, Avatar,
  ArrowDown, ArrowUp, Close, Plus, MoreFilled, TrendCharts, Aim, Collection, MagicStick, Phone, Service
} from '@element-plus/icons-vue'
import request, { logout } from '../api/index.js'

const router = useRouter()
const route = useRoute()
const userName = ref('')
const showAbout = ref(false)

// 聊天会话（侧边栏子列表）
const chatSessions = ref([])
const showChatSessions = ref(false)
const currentSessionId = computed(() => route.query.session || null)
const isChatActive = computed(() => route.path === '/chat')

async function loadChatSessions() {
  try {
    const { data } = await request.get('/chat-sessions')
    chatSessions.value = data.data || []
  } catch { chatSessions.value = [] }
}

function toggleChatSessions() {
  showChatSessions.value = !showChatSessions.value
  if (showChatSessions.value) loadChatSessions()
}

function goSession(s) {
  const q = { session: s.id }
  if (s.agent_id) q.agent = s.agent_id
  if (s.employee_id) q.employee_id = s.employee_id
  router.push({ path: '/chat', query: q })
}

async function newChatSession() {
  try {
    const { value } = await ElMessageBox.prompt('请输入会话名称', '新建会话', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: '新会话',
      inputValidator: (v) => v.trim() ? true : '名称不能为空'
    })
    const name = value.trim()
    const { data } = await request.post('/chat-sessions', {
      name,
      agent_id: route.query.agent || '',
      employee_id: route.query.employee_id || ''
    })
    await loadChatSessions()
    goSession({ id: data.data.id, agent_id: route.query.agent || '', employee_id: route.query.employee_id || '' })
    ElMessage.success('会话已创建')
  } catch { /* 用户取消 */ }
}

async function renameSession(s) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新名称', '重命名会话', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: s.name,
      inputValidator: (v) => v.trim() ? true : '名称不能为空'
    })
    await request.put('/chat-sessions/' + s.id, { name: value.trim() })
    await loadChatSessions()
    ElMessage.success('已重命名')
  } catch { /* 取消 */ }
}

async function delSession(id) {
  await request.delete('/chat-sessions/' + id)
  if (currentSessionId.value === id) router.push('/chat')
  await loadChatSessions()
}

watch(() => route.query.agent, () => {
  if (route.path === '/chat') {
    showChatSessions.value = true
    loadChatSessions()
  } else if (showChatSessions.value) {
    loadChatSessions()
  }
})

const userRole = ref('')
const userPerms = ref([])
onMounted(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    userName.value = user.name || '管理员'
    userRole.value = user.role || ''
    userPerms.value = user.permissions || []
  } catch { userName.value = '管理员' }
})
function hasPerm(p) {
  if (userRole.value === 'superadmin') return true
  return userPerms.value.includes(p)
}
function hasAnyPerm(...perms) {
  if (userRole.value === 'superadmin') return true
  return perms.some(p => userPerms.value.includes(p))
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
    await logout()
  } catch { /* 取消 */ return }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>
