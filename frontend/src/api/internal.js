import request from './index'

function req(method, url, data) {
  const config = { method, url }
  if (method === 'GET') {
    config.params = data
  } else {
    config.data = data
  }
  return request(config)
}

export const customerApi = {
  list: () => req('GET', '/customers'),
  get: (id) => req('GET', `/customers/${id}`),
  create: (d) => req('POST', '/customers', d),
  update: (id, d) => req('PUT', `/customers/${id}`, d),
  remove: (id) => req('DELETE', `/customers/${id}`),
  followUps: (id) => req('GET', `/customers/${id}/follow-ups`),
  addFollowUp: (id, d) => req('POST', `/customers/${id}/follow-ups`, d)
}

export const productApi = {
  list: () => req('GET', '/products'),
  create: (d) => req('POST', '/products', d),
  update: (id, d) => req('PUT', `/products/${id}`, d),
  remove: (id) => req('DELETE', `/products/${id}`),
  stockIn: (d) => req('POST', '/inventory/stock-in', d),
  stockOut: (d) => req('POST', '/inventory/stock-out', d),
  stockQuery: () => req('GET', '/inventory/stock-query'),
  transactions: (product_id) => req('GET', '/inventory/transactions', { product_id })
}

export const employeeApi = {
  list: () => req('GET', '/employees'),
  create: (d) => req('POST', '/employees', d),
  update: (id, d) => req('PUT', `/employees/${id}`, d),
  remove: (id) => req('DELETE', `/employees/${id}`),
  leaveList: () => req('GET', '/employees/leave-requests'),
  applyLeave: (d) => req('POST', '/employees/leave-requests', d),
  approveLeave: (id, d) => req('PUT', `/employees/leave-requests/${id}/approve`, d)
}

export const documentApi = {
  list: () => req('GET', '/documents'),
  upload: (formData) => request.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  remove: (id) => req('DELETE', `/documents/${id}`),
  search: (q) => req('GET', '/documents/search', { q })
}
