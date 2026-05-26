import request from './index'

export const purchaseOrderApi = {
  list: (keyword) => request.get('/purchase-orders', { params: keyword ? { keyword } : {} }),
  create: (d) => request.post('/purchase-orders', d),
  update: (id, d) => request.put(`/purchase-orders/${id}`, d),
  remove: (id) => request.delete(`/purchase-orders/${id}`)
}

export const salesOrderApi = {
  list: (keyword) => request.get('/sales-orders', { params: keyword ? { keyword } : {} }),
  create: (d) => request.post('/sales-orders', d),
  update: (id, d) => request.put(`/sales-orders/${id}`, d),
  remove: (id) => request.delete(`/sales-orders/${id}`)
}

export const assetLedgerApi = {
  list: (keyword) => request.get('/asset-ledger', { params: keyword ? { keyword } : {} }),
  create: (d) => request.post('/asset-ledger', d),
  update: (id, d) => request.put(`/asset-ledger/${id}`, d),
  remove: (id) => request.delete(`/asset-ledger/${id}`)
}

export const returnApi = {
  list: () => request.get('/returns'),
  create: (d) => request.post('/returns', d),
  update: (id, d) => request.put(`/returns/${id}`, d),
  remove: (id) => request.delete(`/returns/${id}`)
}
