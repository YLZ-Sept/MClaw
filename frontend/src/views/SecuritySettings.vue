<template>
  <div class="page-container">
    <!-- 横向导航卡片 -->
    <div class="sec-nav-row">
      <div
        v-for="tab in tabs" :key="tab.key"
        class="sec-nav-card"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="sec-nav-icon" :style="{ background: activeTab === tab.key ? tab.iconBg : '#f5f3ff' }">
          <el-icon :size="18" :color="activeTab === tab.key ? tab.iconColor : '#b8aad0'">
            <component :is="tab.icon" />
          </el-icon>
        </span>
        <div class="sec-nav-text">
          <span class="sec-nav-label">{{ tab.label }}</span>
          <span class="sec-nav-sub" v-if="tab.sub">{{ tab.sub }}</span>
        </div>
        <el-badge v-if="tabBadges[tab.key]" :value="tabBadges[tab.key]" class="sec-nav-badge" />
      </div>
    </div>

    <!-- 展开内容区 -->
    <div class="sec-content">
      <!-- 安全配置 -->
      <div v-show="activeTab === 'config'">
        <div class="card-row cols-2">
          <div class="section-card card-accent-pwd">
            <div class="section-hd">
              <div class="section-title">修改密码</div>
            </div>
            <el-form :model="pwdForm" :rules="pwdRules" ref="pwdFormRef" label-width="100px">
              <el-form-item label="旧密码" prop="oldPassword">
                <el-input v-model="pwdForm.oldPassword" type="password" show-password />
              </el-form-item>
              <el-form-item label="新密码" prop="newPassword">
                <el-input v-model="pwdForm.newPassword" type="password" show-password />
              </el-form-item>
              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="changePwd" :loading="pwdLoading">修改密码</el-button>
              </el-form-item>
            </el-form>
          </div>

          <div class="section-card card-accent-sec">
            <div class="section-hd">
              <div class="section-title">登录安全</div>
            </div>
            <el-form :model="secForm" label-width="140px">
              <el-form-item label="最大登录失败次数">
                <el-input-number v-model="secForm.login_max_attempts" :min="1" :max="20" size="small" />
                <span class="form-hint">次错误后锁定账号</span>
              </el-form-item>
              <el-form-item label="锁定时间">
                <el-input-number v-model="secForm.login_lockout_minutes" :min="1" :max="1440" size="small" />
                <span class="form-hint">分钟</span>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveSettings" :loading="secLoading">保存</el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </div>

      <!-- 用户管理 -->
      <div v-show="activeTab === 'users'">
        <div class="section-card card-accent-user">
          <div class="section-hd">
            <div class="section-title">用户管理</div>
            <div class="section-hd-right">
              <el-button type="primary" size="small" @click="openCreateUser">创建用户</el-button>
            </div>
          </div>
          <el-table :data="users" stripe border style="width:100%" v-loading="userLoading">
            <el-table-column prop="username" label="用户名" width="140" />
            <el-table-column prop="name" label="姓名" width="120" />
            <el-table-column prop="role" label="角色" width="110">
              <template #default="{ row }">
                <el-tag :type="row.role === 'superadmin' ? 'danger' : row.role === 'admin' ? 'success' : 'info'" size="small" effect="dark" round>
                  {{ row.role === 'superadmin' ? '超级管理员' : row.role === 'admin' ? '管理员' : '普通用户' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="180" />
            <el-table-column label="操作" min-width="200">
              <template #default="{ row }">
                <template v-if="row.role !== 'superadmin'">
                  <el-button size="small" @click="openEditUser(row)">编辑</el-button>
                  <el-button size="small" @click="openResetPwd(row)">重置密码</el-button>
                  <el-popconfirm
                    title="确定删除该用户？"
                    confirm-button-text="确定"
                    @confirm="doDeleteUser(row.id)"
                  >
                    <template #reference>
                      <el-button size="small" type="danger" :disabled="row.username === currentUsername">删除</el-button>
                    </template>
                  </el-popconfirm>
                </template>
                <span v-else style="color:#c0c4cc;font-size:12px">内置账号</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 会话管理 -->
      <div v-show="activeTab === 'sessions'">
        <div class="section-card card-accent-sess">
          <div class="section-hd">
            <div class="section-title">活跃会话</div>
            <span class="count-badge">{{ sessions.length }} 个在线</span>
          </div>
          <el-table :data="sessions" stripe border style="width:100%" v-loading="sessLoading">
            <el-table-column prop="name" label="用户" width="120" />
            <el-table-column prop="role" label="角色" width="80">
              <template #default="{ row }">
                <el-tag size="small">{{ row.role === 'admin' ? '管理员' : row.role }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="loginTime" label="登录时间" width="180" />
            <el-table-column prop="token" label="会话标识" min-width="160" show-overflow-tooltip />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.isCurrent" type="success" size="small" effect="dark" round>当前</el-tag>
                <el-popconfirm
                  v-else
                  title="确定强制下线该会话？"
                  confirm-button-text="确定"
                  @confirm="kickSession(row.tokenFull)"
                >
                  <template #reference>
                    <el-button type="danger" size="small" link>强制下线</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 系统维护 -->
      <div v-show="activeTab === 'maintain'">
        <div class="section-card card-accent-sys">
          <div class="section-hd">
            <div class="section-title">系统概览</div>
            <span class="count-badge">v2026.5.7</span>
          </div>
          <div class="sys-stats">
            <div class="sys-stat-item">
              <span class="sys-stat-label">运行时长</span>
              <span class="sys-stat-val">{{ sysInfo.uptime || '--' }}</span>
            </div>
            <div class="sys-stat-item">
              <span class="sys-stat-label">数据库</span>
              <span class="sys-stat-val">{{ sysInfo.dbSize || '--' }}</span>
            </div>
            <div class="sys-stat-item">
              <span class="sys-stat-label">文件存储</span>
              <span class="sys-stat-val">{{ sysInfo.uploadsSize || '--' }}</span>
            </div>
            <div class="sys-stat-item">
              <span class="sys-stat-label">视频存储</span>
              <span class="sys-stat-val">{{ sysInfo.videosSize || '--' }}</span>
            </div>
            <div class="sys-stat-item">
              <span class="sys-stat-label">内存使用</span>
              <span class="sys-stat-val">{{ sysInfo.memory || '--' }}</span>
            </div>
          </div>
        </div>

        <div class="section-card card-accent-backup">
          <div class="section-hd">
            <div class="section-title">备份管理</div>
            <div class="section-hd-right">
              <span class="count-badge" v-if="backups.length">{{ backups.length }} 个备份</span>
              <el-button type="primary" size="small" @click="doCreateBackup" :loading="backupLoading">
                <el-icon style="margin-right:4px"><Download /></el-icon>创建备份
              </el-button>
            </div>
          </div>
          <el-table :data="backups" stripe border style="width:100%" size="small" v-if="backups.length">
            <el-table-column prop="filename" label="文件名" min-width="220" show-overflow-tooltip />
            <el-table-column prop="size" label="大小" width="100" />
            <el-table-column prop="createdAt" label="创建时间" width="180" />
            <el-table-column label="操作" min-width="240">
              <template #default="{ row }">
                <el-button size="small" @click="downloadBackup(row)">下载</el-button>
                <el-popconfirm
                  title="恢复将覆盖当前数据并重启服务，确定继续？"
                  confirm-button-text="确认恢复"
                  @confirm="doRestoreBackup(row.filename)"
                >
                  <template #reference>
                    <el-button size="small" type="warning" link>恢复</el-button>
                  </template>
                </el-popconfirm>
                <el-popconfirm title="确定删除该备份？" @confirm="doDeleteBackup(row.filename)">
                  <template #reference>
                    <el-button size="small" type="danger" link>删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-hint">
            <el-icon :size="32" color="#d0c8e8"><FolderOpened /></el-icon>
            <span>暂无备份，点击上方按钮创建</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建用户对话框 -->
    <el-dialog v-model="createDlg.visible" title="创建用户" width="520px">
      <el-form :model="createDlg.form" :rules="createDlg.rules" ref="createFormRef" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="createDlg.form.username" placeholder="登录用" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="createDlg.form.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="createDlg.form.password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="createDlg.form.role" style="width:100%" @change="onCreateRoleChange">
            <el-option label="管理员（全部权限）" value="admin" />
            <el-option label="普通用户（自定义权限）" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createDlg.form.role === 'user'" label="模块权限">
          <el-checkbox-group v-model="createDlg.form.permissions" class="perm-checkbox-group">
            <el-checkbox v-for="p in allPerms" :key="p.key" :value="p.key" :label="p.label" />
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="doCreateUser" :loading="createDlg.loading">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑用户对话框 -->
    <el-dialog v-model="editDlg.visible" title="编辑用户" width="520px">
      <el-form :model="editDlg.form" ref="editFormRef" label-width="80px">
        <el-form-item label="用户名">
          <el-input :model-value="editDlg.form.username" disabled />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="editDlg.form.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editDlg.form.role" style="width:100%" @change="onEditRoleChange">
            <el-option label="管理员（全部权限）" value="admin" />
            <el-option label="普通用户（自定义权限）" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editDlg.form.role === 'user'" label="模块权限">
          <el-checkbox-group v-model="editDlg.form.permissions" class="perm-checkbox-group">
            <el-checkbox v-for="p in allPerms" :key="p.key" :value="p.key" :label="p.label" />
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="doEditUser" :loading="editDlg.loading">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog v-model="resetDlg.visible" title="重置密码" width="400px">
      <p style="margin-bottom:12px;color:#606266">用户：<b>{{ resetDlg.username }}</b></p>
      <el-form :model="resetDlg" :rules="resetDlg.rules" ref="resetFormRef" label-width="80px">
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="resetDlg.newPassword" type="password" show-password placeholder="至少6位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="doResetPwd" :loading="resetDlg.loading">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Lock, WarningFilled, Avatar, Connection, Monitor, Download, FolderOpened } from '@element-plus/icons-vue'
import {
  changePassword, getSessions, kickSession as kickSessionApi,
  getSecuritySettings, updateSecuritySettings,
  getUsers, createUser, updateUser, deleteUser, getPermissions,
  getSystemInfo, createBackup, getBackups, deleteBackup, restoreBackup,
} from '../api/index.js'

const activeTab = ref('config')
const tabs = [
  { key: 'config',  label: '安全配置', sub: '密码与登录', icon: Lock,       iconBg: '#ede9fe', iconColor: '#7c3aed' },
  { key: 'users',   label: '用户管理', sub: '账号与权限', icon: Avatar,     iconBg: '#fce7f3', iconColor: '#db2777' },
  { key: 'sessions',label: '会话管理', sub: '在线状态',   icon: Connection, iconBg: '#fef3c7', iconColor: '#d97706' },
  { key: 'maintain',label: '系统维护', sub: '备份与概览', icon: Monitor,    iconBg: '#e8f5e9', iconColor: '#2e7d32' },
]
const tabBadges = computed(() => ({
  users: users.value.length || 0,
  sessions: sessions.value.length || 0,
}))
const currentUsername = ref('')

// ---- 修改密码 ----
const pwdFormRef = ref(null)
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdLoading = ref(false)

const validateConfirm = (rule, value, cb) => {
  if (value !== pwdForm.newPassword) cb(new Error('两次密码不一致'))
  else cb()
}

const pwdRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '至少6位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
}

async function changePwd() {
  const valid = await pwdFormRef.value.validate().catch(() => false)
  if (!valid) return
  pwdLoading.value = true
  try {
    const res = await changePassword(pwdForm.oldPassword, pwdForm.newPassword)
    if (res.code === 200) {
      ElMessage.success('密码修改成功，其他会话已下线')
      pwdForm.oldPassword = ''
      pwdForm.newPassword = ''
      pwdForm.confirmPassword = ''
      pwdFormRef.value.resetFields()
      loadSessions()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('修改失败')
  } finally {
    pwdLoading.value = false
  }
}

// ---- 用户管理 ----
const users = ref([])
const userLoading = ref(false)

async function loadUsers() {
  userLoading.value = true
  try {
    const res = await getUsers()
    if (res.code === 200) users.value = res.data || []
  } catch { users.value = [] }
  finally { userLoading.value = false }
}

const allPerms = ref([])

const createFormRef = ref(null)
const createDlg = reactive({
  visible: false, loading: false,
  form: { username: '', name: '', password: '', role: 'user', permissions: [] },
  rules: {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    password: [
      { required: true, message: '请输入密码', trigger: 'blur' },
      { min: 6, message: '至少6位', trigger: 'blur' },
    ],
  },
})

function openCreateUser() {
  createDlg.form = { username: '', name: '', password: '', role: 'user', permissions: [] }
  createDlg.visible = true
}

function onCreateRoleChange(role) {
  if (role === 'admin') {
    createDlg.form.permissions = allPerms.value.map(p => p.key)
  }
}

async function doCreateUser() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createDlg.loading = true
  try {
    const { username, name, password, role, permissions } = createDlg.form
    const res = await createUser({ username, name, password, role, permissions })
    if (res.code === 200) {
      ElMessage.success('用户创建成功')
      createDlg.visible = false
      loadUsers()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('创建失败')
  } finally {
    createDlg.loading = false
  }
}

const editFormRef = ref(null)
const editDlg = reactive({
  visible: false, loading: false,
  form: { id: '', username: '', name: '', role: 'user', permissions: [] },
})

function openEditUser(row) {
  editDlg.form = {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    permissions: row.permissions || [],
  }
  editDlg.visible = true
}

function onEditRoleChange(role) {
  if (role === 'admin') {
    editDlg.form.permissions = allPerms.value.map(p => p.key)
  }
}

async function doEditUser() {
  editDlg.loading = true
  try {
    const { id, name, role, permissions } = editDlg.form
    const res = await updateUser(id, { name, role, permissions })
    if (res.code === 200) {
      ElMessage.success('用户已更新')
      editDlg.visible = false
      loadUsers()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('编辑失败')
  } finally {
    editDlg.loading = false
  }
}

async function doDeleteUser(id) {
  try {
    const res = await deleteUser(id)
    if (res.code === 200) {
      ElMessage.success('用户已删除')
      loadUsers()
      loadSessions()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('删除失败')
  }
}

const resetFormRef = ref(null)
const resetDlg = reactive({
  visible: false, loading: false, userId: '', username: '', newPassword: '',
  rules: {
    newPassword: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      { min: 6, message: '至少6位', trigger: 'blur' },
    ],
  },
})

function openResetPwd(row) {
  resetDlg.userId = row.id
  resetDlg.username = row.username
  resetDlg.newPassword = ''
  resetDlg.visible = true
}

async function doResetPwd() {
  const valid = await resetFormRef.value.validate().catch(() => false)
  if (!valid) return
  resetDlg.loading = true
  try {
    const res = await updateUser(resetDlg.userId, { password: resetDlg.newPassword })
    if (res.code === 200) {
      ElMessage.success('密码已重置，用户需重新登录')
      resetDlg.visible = false
      loadSessions()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('操作失败')
  } finally {
    resetDlg.loading = false
  }
}

// ---- 登录安全 ----
const secForm = reactive({ login_max_attempts: 5, login_lockout_minutes: 15 })
const secLoading = ref(false)

async function loadSettings() {
  try {
    const res = await getSecuritySettings()
    if (res.code === 200) {
      secForm.login_max_attempts = parseInt(res.data.login_max_attempts) || 5
      secForm.login_lockout_minutes = parseInt(res.data.login_lockout_minutes) || 15
    }
  } catch { /* ignore */ }
}

async function saveSettings() {
  secLoading.value = true
  try {
    const res = await updateSecuritySettings(secForm)
    if (res.code === 200) ElMessage.success('保存成功')
    else ElMessage.error(res.message)
  } catch {
    ElMessage.error('保存失败')
  } finally {
    secLoading.value = false
  }
}

// ---- 活跃会话 ----
const sessions = ref([])
const sessLoading = ref(false)

async function loadSessions() {
  sessLoading.value = true
  try {
    const res = await getSessions()
    if (res.code === 200) sessions.value = res.data || []
  } catch { sessions.value = [] }
  finally { sessLoading.value = false }
}

async function kickSession(token) {
  try {
    const res = await kickSessionApi(token)
    if (res.code === 200) {
      ElMessage.success('已强制下线')
      loadSessions()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('操作失败')
  }
}

// ---- 系统维护 ----
const sysInfo = ref({})
const backups = ref([])
const backupLoading = ref(false)

async function loadSystemInfo() {
  try {
    const res = await getSystemInfo()
    if (res.code === 200) sysInfo.value = res.data
  } catch { /* ignore */ }
}

async function loadBackups() {
  try {
    const res = await getBackups()
    if (res.code === 200) backups.value = res.data || []
  } catch { backups.value = [] }
}

async function doCreateBackup() {
  backupLoading.value = true
  try {
    const res = await createBackup()
    if (res.code === 200) {
      ElMessage.success(`备份创建成功 (${res.data.size})`)
      loadBackups()
      loadSystemInfo()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('备份失败')
  } finally {
    backupLoading.value = false
  }
}

async function downloadBackup(row) {
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/security/backups/' + encodeURIComponent(row.filename) + '/download', {
      headers: { Authorization: 'Bearer ' + token }
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: '下载失败' }))
      ElMessage.error(err.message || '下载失败')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = row.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('下载失败')
  }
}

async function doRestoreBackup(filename) {
  try {
    const res = await restoreBackup(filename)
    if (res.code === 200) {
      ElMessage.success('恢复成功，服务即将重启，请稍后刷新页面')
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.success('恢复指令已发送，服务重启中，请等待约10秒后刷新页面')
  }
}

async function doDeleteBackup(filename) {
  try {
    const res = await deleteBackup(filename)
    if (res.code === 200) {
      ElMessage.success('备份已删除')
      loadBackups()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('删除失败')
  }
}

async function loadPermissions() {
  try {
    const res = await getPermissions()
    if (res.code === 200) allPerms.value = res.data || []
  } catch { allPerms.value = [] }
}

onMounted(() => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  currentUsername.value = user.name || ''
  loadSettings()
  loadUsers()
  loadSessions()
  loadPermissions()
  loadSystemInfo()
  loadBackups()
})
</script>

<style scoped>
/* 横向导航卡片行 */
.sec-nav-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.sec-nav-card {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f0ecf8;
  cursor: pointer;
  transition: all .2s;
  position: relative;
}
.sec-nav-card:hover {
  border-color: #c4b5fd;
  box-shadow: 0 2px 8px rgba(124,58,237,.06);
}
.sec-nav-card.active {
  border-color: #7c3aed;
  background: #f5f3ff;
  box-shadow: 0 2px 12px rgba(124,58,237,.10);
}
.sec-nav-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background .2s;
}
.sec-nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sec-nav-label {
  font-size: 14px;
  font-weight: 600;
  color: #4a3f5e;
  white-space: nowrap;
}
.sec-nav-card.active .sec-nav-label {
  color: #7c3aed;
}
.sec-nav-sub {
  font-size: 12px;
  color: #b8aad0;
  white-space: nowrap;
}
.sec-nav-badge {
  position: absolute;
  top: -6px;
  right: -6px;
}


.card-row {
  display: grid;
  gap: 20px;
}
.card-row.cols-2 {
  grid-template-columns: 1fr 1fr;
}

.section-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  border: 1px solid #f0ecf8;
  border-left: 3px solid transparent;
  transition: box-shadow .2s;
}
.section-card:hover {
  box-shadow: 0 4px 16px rgba(124,58,237,.08);
}
.section-card:last-child {
  margin-bottom: 0;
}

.card-accent-pwd   { border-left-color: #7c3aed; }
.card-accent-sec   { border-left-color: #0284c7; }
.card-accent-user  { border-left-color: #db2777; }
.card-accent-sess  { border-left-color: #d97706; }
.card-accent-sys   { border-left-color: #2e7d32; }
.card-accent-backup { border-left-color: #e65100; }

.section-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0ecf8;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #4a3f5e;
}

.title-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-hd-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-badge {
  font-size: 13px;
  color: #909399;
  background: #f5f3ff;
  padding: 2px 10px;
  border-radius: 12px;
}

.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 13px;
}

.sys-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.sys-stat-item {
  flex: 1;
  min-width: 120px;
  padding: 12px 16px;
  background: #f8f9fc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sys-stat-label {
  font-size: 12px;
  color: #909399;
}
.sys-stat-val {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.perm-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}
.perm-checkbox-group :deep(.el-checkbox) {
  width: 50%;
  margin-right: 0;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: #909399;
  font-size: 13px;
}

@media (max-width: 860px) {
  .card-row.cols-2 { grid-template-columns: 1fr; }
}
</style>
