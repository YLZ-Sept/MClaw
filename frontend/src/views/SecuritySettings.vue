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

        <div class="section-card card-accent-update">>
          <div class="section-hd">
            <div class="section-title">离线升级</div>
            <div class="section-hd-right">
              <span style="font-size:12px;color:#909399;margin-right:8px">上传最新版本 ZIP，自动构建并重启</span>
              <input
                ref="offlineFileInput"
                type="file"
                accept=".zip"
                style="display:none"
                @change="onOfflineFileChange"
              />
              <el-button type="warning" size="small" @click="$refs.offlineFileInput.click()" :loading="updateOfflineLoading" :icon="Upload">
                上传升级包
              </el-button>
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

      <!-- 日志查看 -->
      <div v-show="activeTab === 'logs'">
        <div class="section-card card-accent-logs">
          <div class="section-hd">
            <div class="section-title">运行日志</div>
            <div class="section-hd-right">
              <el-select v-model="logFilter" size="small" style="width:120px" @change="loadLogs">
                <el-option label="全部" value="" />
                <el-option label="成功" value="success" />
                <el-option label="信息" value="info" />
                <el-option label="警告" value="warning" />
                <el-option label="危险" value="danger" />
              </el-select>
              <span class="count-badge" v-if="logTotal">共 {{ logTotal }} 条</span>
            </div>
          </div>
          <el-timeline v-loading="logLoading">
            <el-timeline-item
              v-for="log in logs"
              :key="log.id"
              :timestamp="log.created_at"
              :type="log.type"
            >
              {{ log.detail }}
              <span v-if="log.username" style="color:#909399;font-size:12px;margin-left:8px">— {{ log.username }}</span>
            </el-timeline-item>
          </el-timeline>
          <div v-if="!logLoading && logs.length === 0" class="empty-hint">
            <span>暂无日志</span>
          </div>
          <div v-if="logTotal > logs.length" style="text-align:center;margin-top:12px">
            <el-button size="small" @click="loadMoreLogs" :loading="logLoading">加载更多</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Connection, Monitor, Download, FolderOpened, Document, Upload } from '@element-plus/icons-vue'
import {
  changePassword, getSessions, kickSession as kickSessionApi,
  getSecuritySettings, updateSecuritySettings,
  getSystemInfo, createBackup, getBackups, deleteBackup, restoreBackup,
  getLogs, updateSystemOffline,
} from '../api/index.js'

const userPerms = (() => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').permissions || [] }
  catch { return [] }
})()
const userRole = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).role : ''
function canAccessTab(key) {
  if (userRole === 'superadmin') return true
  return userPerms.includes(`security_${key}`)
}
const allTabDefs = [
  { key: 'config',   label: '安全配置', sub: '密码与登录', icon: Lock,       iconBg: '#ede9fe', iconColor: '#7c3aed' },
  { key: 'sessions', label: '会话管理', sub: '在线状态',   icon: Connection, iconBg: '#fef3c7', iconColor: '#d97706' },
  { key: 'maintain', label: '系统维护', sub: '备份与概览', icon: Monitor,    iconBg: '#e8f5e9', iconColor: '#2e7d32' },
  { key: 'logs',     label: '日志查看', sub: '运行日志',   icon: Document,  iconBg: '#fef3c7', iconColor: '#d97706' },
]
const tabs = computed(() => allTabDefs.filter(t => canAccessTab(t.key)))
const activeTab = ref('config')
watch(tabs, (val) => {
  if (!val.find(t => t.key === activeTab.value) && val.length) {
    activeTab.value = val[0].key
  }
}, { immediate: true })
const tabBadges = computed(() => ({
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
const updateOfflineLoading = ref(false)
const offlineFileInput = ref(null)

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

async function onOfflineFileChange(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.error('仅支持 .zip 文件')
    return
  }

  try {
    await ElMessageBox.confirm(
      '将使用上传的 ZIP 包覆盖本地文件，数据库和上传文件不会被影响。更新完成后服务会自动重启，确认继续？',
      '离线升级',
      { confirmButtonText: '确认升级', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  updateOfflineLoading.value = true
  try {
    const res = await updateSystemOffline(file)
    if (res.code === 200) {
      ElMessage.success('离线升级完成，服务即将重启，请稍后刷新页面')
    } else {
      ElMessage.error(res.message)
      updateOfflineLoading.value = false
    }
  } catch {
    ElMessage.error('离线升级请求失败')
    updateOfflineLoading.value = false
  }
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

// ---- 日志查看 ----
const logs = ref([])
const logFilter = ref('')
const logTotal = ref(0)
const logPage = ref(1)
const logLoading = ref(false)

async function loadLogs() {
  logPage.value = 1
  logs.value = []
  await loadMoreLogs()
}

async function loadMoreLogs() {
  logLoading.value = true
  try {
    const res = await getLogs({ page: logPage.value, limit: 30, type: logFilter.value || undefined })
    if (res.code === 200) {
      logs.value.push(...(res.data.logs || []))
      logTotal.value = res.data.total
      logPage.value++
    }
  } catch { /* ignore */ }
  finally { logLoading.value = false }
}

onMounted(() => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  currentUsername.value = user.name || ''
  loadSettings()
  loadSessions()
  loadSystemInfo()
  loadBackups()
  loadLogs()
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
.card-accent-sess  { border-left-color: #d97706; }
.card-accent-sys   { border-left-color: #2e7d32; }
.card-accent-backup { border-left-color: #e65100; }
.card-accent-update { border-left-color: #06b6d4; }
.card-accent-logs   { border-left-color: #6366f1; }

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
