import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const productApi = {
  list: () => GET('/products'),
  create: (d) => POST('/products', d),
  update: (id, d) => PUT(`/products/${id}`, d),
  remove: (id) => DEL(`/products/${id}`),
  stockIn: (d) => POST('/inventory/stock-in', d),
  stockOut: (d) => POST('/inventory/stock-out', d),
  stockQuery: () => GET('/inventory/stock-query'),
  transactions: (product_id) => GET('/inventory/transactions', { params: { product_id } })
}

export const supplierApi = {
  list: () => GET('/suppliers'),
  create: (d) => POST('/suppliers', d),
  update: (id, d) => PUT(`/suppliers/${id}`, d),
  remove: (id) => DEL(`/suppliers/${id}`)
}

export const purchaseOrderApi = {
  list: () => GET('/purchase-orders'),
  create: (d) => POST('/purchase-orders', d),
  update: (id, d) => PUT(`/purchase-orders/${id}`, d),
  remove: (id) => DEL(`/purchase-orders/${id}`),
  items: (id) => GET(`/purchase-orders/${id}/items`),
  addItem: (id, d) => POST(`/purchase-orders/${id}/items`, d),
  removeItem: (id, itemId) => DEL(`/purchase-orders/${id}/items/${itemId}`)
}

export const warehouseApi = {
  list: () => GET('/warehouses'),
  create: (d) => POST('/warehouses', d),
  update: (id, d) => PUT(`/warehouses/${id}`, d),
  remove: (id) => DEL(`/warehouses/${id}`)
}

export const salesOrderApi = {
  list: () => GET('/sales-orders'),
  create: (d) => POST('/sales-orders', d),
  update: (id, d) => PUT(`/sales-orders/${id}`, d),
  remove: (id) => DEL(`/sales-orders/${id}`),
  items: (id) => GET(`/sales-orders/${id}/items`),
  addItem: (id, d) => POST(`/sales-orders/${id}/items`, d),
  removeItem: (id, itemId) => DEL(`/sales-orders/${id}/items/${itemId}`)
}

export const returnApi = {
  list: () => GET('/returns'),
  create: (d) => POST('/returns', d),
  update: (id, d) => PUT(`/returns/${id}`, d),
  remove: (id) => DEL(`/returns/${id}`)
}

export const assetLedgerApi = {
  list: () => GET('/asset-ledger'),
  create: (d) => POST('/asset-ledger', d),
  update: (id, d) => PUT(`/asset-ledger/${id}`, d),
  remove: (id) => DEL(`/asset-ledger/${id}`)
}
