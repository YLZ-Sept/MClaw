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
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="row.role === 'superadmin' ? 'danger' : row.role === 'admin' ? 'warning' : row.role_id ? 'success' : 'info'" size="small" effect="dark" round>
                  {{ row.role === 'superadmin' ? '超级管理员' : row.role_name || (row.role === 'admin' ? '管理员' : '自定义') }}
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

      <!-- 角色管理 -->
      <div v-show="activeTab === 'roles'">
        <div class="section-card card-accent-role">
          <div class="section-hd">
            <div class="section-title">角色管理</div>
            <div class="section-hd-right">
              <el-button type="primary" size="small" @click="openCreateRole">创建角色</el-button>
            </div>
          </div>
          <el-table :data="roles" stripe border style="width:100%" v-loading="roleLoading">
            <el-table-column prop="name" label="角色名称" width="180" />
            <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
            <el-table-column label="权限" min-width="220">
              <template #default="{ row }">
                <el-tag v-for="p in row.permissions" :key="p" size="small" effect="plain" round style="margin:2px">
                  {{ permLabelMap[p] || p }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="userCount" label="用户数" width="80" align="center" />
            <el-table-column prop="created_at" label="创建时间" width="180" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="openEditRole(row)">编辑</el-button>
                <el-popconfirm
                  title="确定删除该角色？"
                  confirm-button-text="确定"
                  @confirm="doDeleteRole(row.id)"
                >
                  <template #reference>
                    <el-button size="small" type="danger" link>删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 权限管理 -->
      <div v-show="activeTab === 'permissions'">
        <div class="section-card card-accent-perm">
          <div class="section-hd">
            <div class="section-title">权限清单</div>
            <span class="count-badge">{{ permTotal }} 项权限</span>
          </div>
          <div v-for="group in permGroups" :key="group.key" class="perm-group">
            <div class="perm-group-title">{{ group.label }}</div>
            <div class="perm-items">
              <div v-for="item in group.items" :key="item.key" class="perm-item">
                <span class="perm-item-dot" />
                <div class="perm-item-info">
                  <span class="perm-item-label">{{ item.label }}</span>
                  <span class="perm-item-desc">{{ item.desc }}</span>
                </div>
                <code class="perm-item-key">{{ item.key }}</code>
              </div>
            </div>
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
          <el-select v-model="createDlg.form.role_id" style="width:100%" @change="onCreateRoleChange">
            <el-option label="管理员（全部权限）" value="admin" />
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
            <el-option label="自定义权限" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createDlg.form.role_id === 'custom'" label="模块权限">
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
          <el-select v-model="editDlg.form.role_id" style="width:100%" @change="onEditRoleChange">
            <el-option label="管理员（全部权限）" value="admin" />
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
            <el-option label="自定义权限" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editDlg.form.role_id === 'custom'" label="模块权限">
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

    <!-- 角色创建/编辑对话框 -->
    <el-dialog v-model="roleDlg.visible" :title="roleDlg.isEdit ? '编辑角色' : '创建角色'" width="560px">
      <el-form :model="roleDlg.form" :rules="roleDlg.rules" ref="roleFormRef" label-width="80px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="roleDlg.form.name" placeholder="如：内容编辑员" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="roleDlg.form.description" placeholder="角色职责说明" />
        </el-form-item>
        <el-form-item label="权限">
          <div v-for="group in permGroups" :key="group.key" class="role-perm-group">
            <div class="role-perm-group-label">{{ group.label }}</div>
            <el-checkbox-group v-model="roleDlg.form.permissions">
              <el-checkbox v-for="item in group.items" :key="item.key" :value="item.key" :label="item.label" />
            </el-checkbox-group>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="doSaveRole" :loading="roleDlg.loading">保存</el-button>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Avatar, Collection, List } from '@element-plus/icons-vue'
import {
  getUsers, createUser, updateUser, deleteUser, getPermissions,
  getRoles, createRole, updateRole, deleteRole, getPermissionGroups, getUserRoles,
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
  { key: 'users',      label: '用户管理', sub: '账号与权限', icon: Avatar,     iconBg: '#fce7f3', iconColor: '#db2777' },
  { key: 'roles',      label: '角色管理', sub: '角色定义',   icon: Collection, iconBg: '#e0f2fe', iconColor: '#0284c7' },
  { key: 'permissions',label: '权限管理', sub: '权限清单',   icon: List,       iconBg: '#ecfeff', iconColor: '#0891b2' },
]
const tabs = computed(() => allTabDefs.filter(t => canAccessTab(t.key)))
const activeTab = ref('users')
watch(tabs, (val) => {
  if (!val.find(t => t.key === activeTab.value) && val.length) {
    activeTab.value = val[0].key
  }
}, { immediate: true })
const tabBadges = computed(() => ({
  users: users.value.length || 0,
}))
const currentUsername = ref('')

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
  form: { username: '', name: '', password: '', role_id: 'custom', permissions: [] },
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
  createDlg.form = { username: '', name: '', password: '', role_id: 'custom', permissions: [] }
  createDlg.visible = true
}

function onCreateRoleChange(val) {
  if (val === 'admin') {
    createDlg.form.permissions = allPerms.value.map(p => p.key)
  } else if (val && val !== 'custom') {
    const role = roles.value.find(r => r.id === val)
    createDlg.form.permissions = role?.permissions ? [...role.permissions] : []
  } else {
    createDlg.form.permissions = []
  }
}

async function doCreateUser() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createDlg.loading = true
  try {
    const { username, name, password, role_id, permissions } = createDlg.form
    const body = { username, name, password, permissions }
    if (role_id === 'admin') {
      body.role = 'admin'
    } else if (role_id === 'custom') {
      body.role = 'user'
    } else {
      body.role_id = role_id
    }
    const res = await createUser(body)
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
  form: { id: '', username: '', name: '', role_id: 'custom', permissions: [] },
})

function openEditUser(row) {
  let roleId = row.role_id || ''
  if (!roleId) {
    roleId = row.role === 'admin' ? 'admin' : 'custom'
  }
  editDlg.form = {
    id: row.id,
    username: row.username,
    name: row.name,
    role_id: roleId,
    permissions: row.permissions || [],
  }
  editDlg.visible = true
}

function onEditRoleChange(val) {
  if (val === 'admin') {
    editDlg.form.permissions = allPerms.value.map(p => p.key)
  } else if (val && val !== 'custom') {
    const role = roles.value.find(r => r.id === val)
    editDlg.form.permissions = role?.permissions ? [...role.permissions] : []
  } else {
    editDlg.form.permissions = []
  }
}

async function doEditUser() {
  editDlg.loading = true
  try {
    const { id, name, role_id, permissions } = editDlg.form
    const body = { name, permissions }
    if (role_id === 'admin') {
      body.role = 'admin'
    } else if (role_id === 'custom') {
      body.role = 'user'
    } else {
      body.role_id = role_id
    }
    const res = await updateUser(id, body)
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
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('操作失败')
  } finally {
    resetDlg.loading = false
  }
}

// ---- 角色管理 ----
const roles = ref([])
const roleOptions = ref([])
const roleLoading = ref(false)
const permGroups = ref([])
const permTotal = computed(() => {
  let n = 0
  for (const g of permGroups.value) n += (g.items || []).length
  return n
})
const permLabelMap = computed(() => {
  const m = {}
  for (const p of allPerms.value) m[p.key] = p.label
  return m
})

async function loadRoles() {
  roleLoading.value = true
  try {
    const res = await getRoles()
    if (res.code === 200) roles.value = res.data || []
  } catch { roles.value = [] }
  finally { roleLoading.value = false }
}

async function loadRoleOptions() {
  try {
    const res = await getUserRoles()
    if (res.code === 200) roleOptions.value = res.data || []
  } catch { roleOptions.value = [] }
}

async function loadPermGroups() {
  try {
    const res = await getPermissionGroups()
    if (res.code === 200 && res.data?.groups) permGroups.value = res.data.groups
  } catch { permGroups.value = [] }
}

const roleFormRef = ref(null)
const roleDlg = reactive({
  visible: false, loading: false, isEdit: false,
  form: { id: '', name: '', description: '', permissions: [] },
  rules: {
    name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  },
})

function openCreateRole() {
  roleDlg.isEdit = false
  roleDlg.form = { id: '', name: '', description: '', permissions: [] }
  roleDlg.visible = true
}

function openEditRole(row) {
  roleDlg.isEdit = true
  roleDlg.form = { id: row.id, name: row.name, description: row.description, permissions: [...(row.permissions || [])] }
  roleDlg.visible = true
}

async function doSaveRole() {
  const valid = await roleFormRef.value.validate().catch(() => false)
  if (!valid) return
  roleDlg.loading = true
  try {
    const { id, name, description, permissions } = roleDlg.form
    const body = { name, description, permissions }
    let res
    if (roleDlg.isEdit) {
      res = await updateRole(id, body)
    } else {
      res = await createRole(body)
    }
    if (res.code === 200) {
      ElMessage.success(roleDlg.isEdit ? '角色已更新' : '角色已创建')
      roleDlg.visible = false
      loadRoles()
      loadUsers()
    } else {
      ElMessage.error(res.message)
    }
  } catch {
    ElMessage.error('操作失败')
  } finally {
    roleDlg.loading = false
  }
}

async function doDeleteRole(id) {
  try {
    const res = await deleteRole(id)
    if (res.code === 200) {
      ElMessage.success('角色已删除')
      loadRoles()
      loadUsers()
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
  loadUsers()
  loadPermissions()
  loadRoles()
  loadRoleOptions()
  loadPermGroups()
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

.card-accent-user  { border-left-color: #db2777; }
.card-accent-role  { border-left-color: #0284c7; }
.card-accent-perm  { border-left-color: #0891b2; }

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

.perm-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}
.perm-checkbox-group :deep(.el-checkbox) {
  width: 50%;
  margin-right: 0;
}

/* 权限清单（只读） */
.perm-group {
  margin-bottom: 20px;
}
.perm-group:last-child {
  margin-bottom: 0;
}
.perm-group-title {
  font-size: 13px;
  font-weight: 600;
  color: #6d5b98;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0ecf8;
}
.perm-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.perm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 260px;
  min-width: 240px;
  padding: 8px 12px;
  background: #faf9fe;
  border-radius: 8px;
  border: 1px solid #f0ecf8;
}
.perm-item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a78bfa;
  flex-shrink: 0;
}
.perm-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.perm-item-label {
  font-size: 13px;
  font-weight: 500;
  color: #4a3f5e;
}
.perm-item-desc {
  font-size: 12px;
  color: #909399;
}
.perm-item-key {
  font-size: 11px;
  color: #b8aad0;
  flex-shrink: 0;
}

/* 角色对话框权限分组 */
.role-perm-group {
  margin-bottom: 8px;
}
.role-perm-group-label {
  font-size: 12px;
  font-weight: 600;
  color: #0284c7;
  margin-bottom: 4px;
}
</style>
