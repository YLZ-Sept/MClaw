import request from './index'

export function createSearch(d) {
  return request.post('/social-acquisition/search', d)
}

export function getTasks() {
  return request.get('/social-acquisition/tasks')
}

export function getTask(id) {
  return request.get(`/social-acquisition/tasks/${id}`)
}

export function getComments(taskId, params) {
  return request.get(`/social-acquisition/tasks/${taskId}/comments`, { params })
}

export function deleteComment(id) {
  return request.delete(`/social-acquisition/comments/${id}`)
}

export function getWordcloud(taskId) {
  return request.get(`/social-acquisition/tasks/${taskId}/wordcloud`)
}

export function deleteTask(id) {
  return request.delete(`/social-acquisition/tasks/${id}`)
}

export function generateReplies(d) {
  return request.post('/social-acquisition/replies/generate', d)
}

export function updateReply(id, d) {
  return request.put(`/social-acquisition/replies/${id}`, d)
}

export function deleteReply(id) {
  return request.delete(`/social-acquisition/replies/${id}`)
}

export function sendReply(id) {
  return request.post(`/social-acquisition/replies/${id}/send`)
}

export function getReplies(params) {
  return request.get('/social-acquisition/replies', { params })
}

export function switchAccount(platform) {
  return request.post('/social-acquisition/switch-account', { platform })
}

export function getAccountStatus() {
  return request.get('/social-acquisition/account-status')
}

// 自动回复监控
export function addMonitor(d) { return request.post('/social-acquisition/monitors', d) }
export function getMonitors() { return request.get('/social-acquisition/monitors') }
export function updateMonitor(id, d) { return request.put(`/social-acquisition/monitors/${id}`, d) }
export function deleteMonitor(id) { return request.delete(`/social-acquisition/monitors/${id}`) }
export function checkMonitor(id) { return request.post(`/social-acquisition/monitors/${id}/check`) }
export function checkAllMonitors() { return request.post('/social-acquisition/monitors/check-all') }
