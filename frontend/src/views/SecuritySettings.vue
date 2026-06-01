<template>
  <div class="page-container">
    <div class="page-hd">
      <span class="page-title">安全设置</span>
    </div>

    <!-- 第一行：修改密码 + 登录安全 -->
    <div class="card-row cols-2">
      <!-- 修改密码 -->
      <div class="section-card card-accent-pwd">
        <div class="section-hd">
          <div class="section-title">
            <span class="title-icon" style="background:#ede9fe"><el-icon color="#7c3aed"><Lock /></el-icon></span>
            修改密码
          </div>
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

      <!-- 登录安全 -->
      <div class="section-card card-accent-sec">
        <div class="section-hd">
          <div class="section-title">
            <span class="title-icon" style="background:#e0f2fe"><el-icon color="#0284c7"><WarningFilled /></el-icon></span>
            登录安全
          </div>
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

    <!-- 第二行：用户管理 -->
    <div class="section-card card-accent-user">
      <div class="section-hd">
        <div class="section-title">
          <span class="title-icon" style="background:#fce7f3"><el-icon color="#db2777"><Avatar /></el-icon></span>
          用户管理
        </div>
        <div class="section-hd-right">
          <span class="count-badge">{{ users.length }} 个用户</span>
          <el-button type="primary" size="small" @click="openCreateUser">创建用户</el-button>
        </div>
      </div>
      <el-table :data="users" stripe border style="width:100%" v-loading="userLoading">
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'success' : 'info'" size="small" effect="dark" round>
              {{ row.role === 'admin' ? '管理员' : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" min-width="200">
          <template #default="{ row }">
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
        </el-table-column>
      </el-table>
    </div>

    <!-- 第三行：活跃会话 -->
    <div class="section-card card-accent-sess">
      <div class="section-hd">
        <div class="section-title">
          <span class="title-icon" style="background:#fef3c7"><el-icon color="#d97706"><Connection /></el-icon></span>
          活跃会话
        </div>
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

    <!-- 创建用户对话框 -->
    <el-dialog v-model="createDlg.visible" title="创建用户" width="440px">
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
          <el-select v-model="createDlg.form.role" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="doCreateUser" :loading="createDlg.loading">创建</el-button>
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Lock, WarningFilled, Avatar, Connection } from '@element-plus/icons-vue'
import {
  changePassword, getSessions, kickSession as kickSessionApi,
  getSecuritySettings, updateSecuritySettings,
  getUsers, createUser, deleteUser, resetUserPassword,
} from '../api/index.js'

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

const createFormRef = ref(null)
const createDlg = reactive({
  visible: false, loading: false,
  form: { username: '', name: '', password: '', role: 'user' },
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
  createDlg.form = { username: '', name: '', password: '', role: 'user' }
  createDlg.visible = true
}

async function doCreateUser() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createDlg.loading = true
  try {
    const res = await createUser(createDlg.form)
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
    const res = await resetUserPassword(resetDlg.userId, resetDlg.newPassword)
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

onMounted(() => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  currentUsername.value = user.name || ''
  loadSettings()
  loadUsers()
  loadSessions()
})
</script>

<style scoped>
.page-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-row { display: grid; gap: 20px; margin-bottom: 20px; }
.card-row.cols-2 { grid-template-columns: 1fr 1fr; }

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

/* 左侧颜色装饰条 */
.card-accent-pwd  { border-left-color: #7c3aed; }
.card-accent-sec  { border-left-color: #0284c7; }
.card-accent-user { border-left-color: #db2777; }
.card-accent-sess { border-left-color: #d97706; }

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

@media (max-width: 860px) {
  .card-row.cols-2 { grid-template-columns: 1fr; }
}
</style>
