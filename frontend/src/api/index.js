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
  return request.get('/security/users').then(res => res.data)
}

export function createUser(data) {
  return request.post('/security/users', data).then(res => res.data)
}

export function deleteUser(id) {
  return request.delete('/security/users/' + id).then(res => res.data)
}

export function resetUserPassword(id, newPassword) {
  return request.post('/security/users/' + id + '/reset-password', { newPassword }).then(res => res.data)
}

export default request
