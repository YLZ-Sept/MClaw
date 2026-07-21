import request from './index'

export const memoryApi = {
  stats: (agentId) => request.get(`/memory/${agentId}`),
  content: (agentId, file = 'MEMORY.md') => request.get(`/memory/${agentId}/content`, { params: { file } }),
  save: (agentId, file, content) => request.put(`/memory/${agentId}`, { file, content }),
  clear: (agentId) => request.delete(`/memory/${agentId}`)
}
