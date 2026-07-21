import request from './index'

export const llmHealthApi = {
  get: () => request.get('/llm/health')
}

export const channelHealthApi = {
  get: () => request.get('/channels/health')
}
