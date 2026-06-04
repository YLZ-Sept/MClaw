import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const channelAccountsApi = {
  list: () => GET('/channel-accounts'),
  get: (id) => GET(`/channel-accounts/${id}`),
  create: (d) => POST('/channel-accounts', d),
  update: (id, d) => PUT(`/channel-accounts/${id}`, d),
  remove: (id) => DEL(`/channel-accounts/${id}`)
}

export const channelConversationsApi = {
  list: (params) => GET('/channel-conversations', { params }),
  get: (id) => GET(`/channel-conversations/${id}`),
  messages: (id, params) => GET(`/channel-conversations/${id}/messages`, { params }),
  setMode: (id, reply_mode) => PUT(`/channel-conversations/${id}/mode`, { reply_mode }),
  reply: (id, content, reply_mode) => POST(`/channel-conversations/${id}/reply`, { content, reply_mode }),
  suggest: (id) => POST(`/channel-conversations/${id}/suggest`),
  remove: (id) => DEL(`/channel-conversations/${id}`)
}

export const agentAppsApi = {
  list: () => GET('/agent-apps')
}

export const digitalEmployeesApi = {
  list: () => GET('/digital-employees')
}
