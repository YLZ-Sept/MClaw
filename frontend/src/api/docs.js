import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const documentApi = {
  list: () => GET('/documents'),
  upload: (formData) => POST('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  save: (d) => POST('/documents', d),
  detail: (id) => GET(`/documents/${id}`),
  update: (id, d) => PUT(`/documents/${id}`, d),
  remove: (id) => DEL(`/documents/${id}`),
  search: (q) => GET('/documents/search', { params: { q } }),
  downloadUrl: (id) => `/api/documents/download/${id}`
}

export const folderApi = {
  list: () => GET('/doc-folders'),
  create: (d) => POST('/doc-folders', d),
  remove: (id) => DEL(`/doc-folders/${id}`)
}
