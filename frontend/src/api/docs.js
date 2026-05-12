import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const DEL = (url) => request.delete(url)

export const documentApi = {
  list: () => GET('/documents'),
  upload: (formData) => request.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  remove: (id) => DEL(`/documents/${id}`),
  search: (q) => GET('/documents/search', { params: { q } })
}

export const folderApi = {
  list: () => GET('/doc-folders'),
  create: (d) => POST('/doc-folders', d),
  remove: (id) => DEL(`/doc-folders/${id}`)
}
