import axios from 'axios'

const request = axios.create({
  baseURL: '/api'
})

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

export default request
