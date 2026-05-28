import request from './index'
const GET = (...args) => request.get(...args)
const POST = (...args) => request.post(...args)
const PUT = (...args) => request.put(...args)
const DEL = (url) => request.delete(url)

export const hotProductApi = {
  list: () => GET('/hot-products'),
  get: (id) => GET(`/hot-products/${id}`),
  create: (d) => POST('/hot-products', d),
  update: (id, d) => PUT(`/hot-products/${id}`, d),
}

export const hotContentApi = {
  list: () => GET('/hot-contents'),
  get: (id) => GET(`/hot-contents/${id}`),
  create: (d) => POST('/hot-contents', d),
  update: (id, d) => PUT(`/hot-contents/${id}`, d),
  remove: (id) => DEL(`/hot-contents/${id}`),
  generate: (d) => POST('/hot-contents/generate', d),
  uploadAssets: (id, fd) => POST(`/hot-contents/${id}/assets`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  review: (id, d) => POST(`/hot-contents/${id}/review`, d),
  publish: (id, d) => POST(`/hot-contents/${id}/publish`, d),
  generateVideo: (id, params) => POST(`/hot-contents/${id}/generate-video`, null, { params }),
  videoUrl: (id, orientation = 'portrait') => `/api/hot-contents/${id}/video?orientation=${orientation}`,
  deleteVideo: (id, orientation) => DEL(`/hot-contents/${id}/video?orientation=${orientation}`),
}

export const hotExtractApi = {
  extract: (url) => POST('/hot-extract/content', { url }),
  rewrite: (d) => POST('/hot-extract/rewrite', d),
}

export const hotQuickReplyApi = {
  send: (d) => POST('/hot-quick-reply', d),
}

export const hotLeadsApi = {
  list: () => GET('/hot-leads'),
}

export const hotChanjingApi = {
  digitalPersons: (page, size) => GET('/hot-chanjing/digital-persons', { params: { page, size } }),
  voices: (page, size) => GET('/hot-chanjing/voices', { params: { page, size } }),
  fonts: () => GET('/hot-chanjing/fonts'),
  createVideo: (d) => POST('/hot-chanjing/create-video', d),
  getVideo: (id) => GET(`/hot-chanjing/video/${id}`),
}
