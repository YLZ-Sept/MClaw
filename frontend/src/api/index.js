import axios from 'axios'

const request = axios.create({
  baseURL: '/api'
})

// 自动携带 token
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 自动跳转登录
request.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 || err.response?.data?.code === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export function getInfo() {
  return request.get('/info')
}

export function getChatHistory(agent) {
  return request.get('/chat/history', { params: { agent } })
}

export function sendMessage(content, agent) {
  return request.post('/chat/send', { content, agent })
}

export function clearChat(agent) {
  return request.post('/chat/clear', { agent })
}

export function getStatus() {
  return request.get('/status')
}

export function login(username, password) {
  return request.post('/auth/login', { username, password }).then(res => res.data)
}

export function logout() {
  const token = localStorage.getItem('token')
  return request.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.data)
}

// 安全设置
export function changePassword(oldPassword, newPassword) {
  return request.post('/security/change-password', { oldPassword, newPassword }).then(res => res.data)
}

export function getSessions() {
  return request.get('/security/sessions').then(res => res.data)
}

export function kickSession(token) {
  return request.delete('/security/sessions/' + token).then(res => res.data)
}

export function getSecuritySettings() {
  return request.get('/security/settings').then(res => res.data)
}

export function updateSecuritySettings(settings) {
  return request.put('/security/settings', settings).then(res => res.data)
}

// 用户管理
export function getUsers() {
  return request.get('/users').then(res => res.data)
}

export function createUser(data) {
  return request.post('/users', data).then(res => res.data)
}

export function updateUser(id, data) {
  return request.put('/users/' + id, data).then(res => res.data)
}

export function deleteUser(id) {
  return request.delete('/users/' + id).then(res => res.data)
}

export function getPermissions() {
  return request.get('/users/permissions').then(res => res.data)
}
export function getUserRoles() {
  return request.get('/users/roles').then(res => res.data)
}

// 角色管理
export function getRoles() {
  return request.get('/roles').then(res => res.data)
}
export function createRole(data) {
  return request.post('/roles', data).then(res => res.data)
}
export function updateRole(id, data) {
  return request.put('/roles/' + id, data).then(res => res.data)
}
export function deleteRole(id) {
  return request.delete('/roles/' + id).then(res => res.data)
}
export function getPermissionGroups() {
  return request.get('/roles/permissions/list').then(res => res.data)
}

export function getLogs(params) {
  return request.get('/logs', { params }).then(res => res.data)
}

// 系统维护
export function getSystemInfo() {
  return request.get('/security/system-info').then(res => res.data)
}

export function createBackup() {
  return request.post('/security/backup').then(res => res.data)
}

export function updateSystem() {
  return request.post('/security/update').then(res => res.data)
}

export function updateSystemOffline(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/security/update-offline', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data)
}

export function getBackups() {
  return request.get('/security/backups').then(res => res.data)
}

export function deleteBackup(filename) {
  return request.delete('/security/backups/' + encodeURIComponent(filename)).then(res => res.data)
}

export function restoreBackup(filename) {
  return request.post('/security/backups/' + encodeURIComponent(filename) + '/restore').then(res => res.data)
}

export function getBackupDownloadUrl(filename) {
  const token = localStorage.getItem('token')
  return '/api/security/backups/' + encodeURIComponent(filename) + '/download?token=' + encodeURIComponent(token)
}

export default request
