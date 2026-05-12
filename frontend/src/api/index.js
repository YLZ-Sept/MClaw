import axios from 'axios'

const request = axios.create({
  baseURL: '/api'
})

export function getInfo() {
  return request.get('/info')
}

export function getChatHistory() {
  return request.get('/chat/history')
}

export function sendMessage(content, agent) {
  return request.post('/chat/send', { content, agent })
}

export function getStatus() {
  return request.get('/status')
}
