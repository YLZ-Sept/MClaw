<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>MClaw V1.0</h2>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-group">
          <div class="nav-group-title">对话</div>
          <div class="nav-item-wrapper">
            <router-link to="/chat" class="nav-item" active-class="active" style="flex:1">
              <el-icon><ChatDotSquare /></el-icon><span>实时聊天</span>
            </router-link>
            <el-popover placement="right" :width="100" trigger="click" :hide-after="0">
              <template #reference>
                <el-button class="nav-item-more" size="small" text @click.stop>
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
              </template>
              <div class="session-menu">
                <div class="session-menu-item" @click.stop="newChatSession">新建会话</div>
              </div>
            </el-popover>
            <el-button class="nav-item-toggle" text size="small" @click="toggleChatSessions">
              <el-icon><component :is="showChatSessions ? ArrowUp : ArrowDown" /></el-icon>
            </el-button>
          </div>
          <div class="nav-sub-group" v-show="showChatSessions">
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
          <router-link to="/digital-human" class="nav-item" active-class="active">
            <el-icon><UserFilled /></el-icon><span>数字员工</span>
          </router-link>
          <router-link to="/trending" class="nav-item" active-class="active">
            <el-icon><TrendCharts /></el-icon><span>一键追爆款</span>
          </router-link>
          <router-link to="/digital" class="nav-item" active-class="active">
            <el-icon><DataAnalysis /></el-icon><span>应用智能体管理</span>
          </router-link>
          <router-link to="/channels" class="nav-item" active-class="active">
            <el-icon><ChatLineSquare /></el-icon><span>消息渠道</span>
          </router-link>
          <router-link to="/knowledge-base" class="nav-item" active-class="active">
            <el-icon><Collection /></el-icon><span>知识库</span>
          </router-link>
          <router-link to="/skill-library" class="nav-item" active-class="active">
            <el-icon><MagicStick /></el-icon><span>技能库</span>
          </router-link>
          <router-link to="/tasks" class="nav-item" active-class="active">
            <el-icon><List /></el-icon><span>任务</span>
          </router-link>
          <router-link to="/logs" class="nav-item" active-class="active">
            <el-icon><Document /></el-icon><span>日志查看</span>
          </router-link>
        </div>
        <div class="nav-group">
          <div class="nav-group-title">配置</div>
          <router-link to="/model-config" class="nav-item" active-class="active">
            <el-icon><Cpu /></el-icon><span>模型配置</span>
          </router-link>
          <router-link to="/services" class="nav-item" active-class="active">
            <el-icon><Setting /></el-icon><span>服务管理</span>
          </router-link>
          <router-link to="/automation" class="nav-item" active-class="active">
            <el-icon><Promotion /></el-icon><span>通信与自动化</span>
          </router-link>
          <router-link to="/security-protection" class="nav-item" active-class="active">
            <el-icon><Warning /></el-icon><span>安全防护</span>
          </router-link>
          <router-link to="/security" class="nav-item" active-class="active">
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
          <span class="version">v2026.5.7</span>
          <el-button text size="small" @click="handleLogout">退出</el-button>
        </div>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  ChatDotSquare, DataAnalysis, List, Document,
  Cpu, Setting, ChatLineSquare, Promotion, Lock, UserFilled,
  ArrowDown, ArrowUp, Close, Plus, MoreFilled, TrendCharts, Warning, Collection, MagicStick
} from '@element-plus/icons-vue'
import { logout } from '../api'
import axios from 'axios'
const req = axios.create({ baseURL: '/api' })

const router = useRouter()
const route = useRoute()
const userName = ref('')

// 聊天会话（侧边栏子列表）
const chatSessions = ref([])
const showChatSessions = ref(false)
const currentSessionId = computed(() => route.query.session || null)

async function loadChatSessions() {
  try {
    const params = {}
    if (route.query.agent) params.agent_id = route.query.agent
    if (route.query.employee_id) params.employee_id = route.query.employee_id
    const { data } = await req.get('/chat-sessions', { params })
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
    const { data } = await req.post('/chat-sessions', {
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
    await req.put('/chat-sessions/' + s.id, { name: value.trim() })
    await loadChatSessions()
    ElMessage.success('已重命名')
  } catch { /* 取消 */ }
}

async function delSession(id) {
  await req.delete('/chat-sessions/' + id)
  if (currentSessionId.value === id) router.push('/chat')
  await loadChatSessions()
}

watch(() => route.query.agent, () => { if (showChatSessions.value) loadChatSessions() })

onMounted(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    userName.value = user.name || '管理员'
  } catch { userName.value = '管理员' }
})

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
