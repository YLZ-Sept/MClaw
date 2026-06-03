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
  crawl: (platform, keyword, limit) => POST('/hot-extract/crawl', { platform, keyword, limit }),
  rewrite: (d) => POST('/hot-extract/rewrite', d),
}

export const hotQuickReplyApi = {
  send: (d) => POST('/hot-quick-reply', d),
}

export const hotLeadsApi = {
  list: () => GET('/hot-leads'),
}

export const hotChanjingApi = {
  digitalPersons: (page, size, tagIds) => GET('/hot-chanjing/digital-persons', { params: { page, size, tag_ids: tagIds?.join(',') || '' } }),
  voices: (page, size) => GET('/hot-chanjing/voices', { params: { page, size } }),
  fonts: () => GET('/hot-chanjing/fonts'),
  tags: (businessType) => GET('/hot-chanjing/tags', { params: businessType ? { business_type: businessType } : {} }),
  // TTS
  createTTS: (d) => POST('/hot-chanjing/tts', d),
  getTTSStatus: (taskId) => GET(`/hot-chanjing/tts/${taskId}`),
  // 视频合成
  createVideo: (d) => POST('/hot-chanjing/create-video', d),
  getVideo: (id) => GET(`/hot-chanjing/video/${id}`),
  listVideos: (page, size) => GET('/hot-chanjing/videos', { params: { page, size } }),
  deleteVideo: (id) => DEL(`/hot-chanjing/videos/${id}`),
  downloadVideo: (id) => GET(`/hot-chanjing/videos/${id}/download`),
  // 对口型
  createLipSync: (d) => POST('/hot-chanjing/lip-sync', d),
  getLipSync: (id) => GET(`/hot-chanjing/lip-sync/${id}`),
  listLipSync: (page, size) => GET('/hot-chanjing/lip-sync', { params: { page, size } }),
  // 定制数字人
  listCustomPersons: (page, size) => GET('/hot-chanjing/custom-persons', { params: { page, size } }),
  getCustomPerson: (id) => GET(`/hot-chanjing/custom-persons/${id}`),
  createCustomPerson: (d) => POST('/hot-chanjing/custom-persons', d),
  deleteCustomPerson: (id) => DEL(`/hot-chanjing/custom-persons/${id}`),
  // 定制声音
  listCustomAudio: (page, size) => GET('/hot-chanjing/custom-audio', { params: { page, size } }),
  getCustomAudio: (id) => GET(`/hot-chanjing/custom-audio/${id}`),
  createCustomAudio: (d) => POST('/hot-chanjing/custom-audio', d),
  deleteCustomAudio: (id) => DEL(`/hot-chanjing/custom-audio/${id}`),
  // 文件管理
  getUploadUrl: (service, name) => GET('/hot-chanjing/upload-url', { params: { service, name } }),
  listFiles: (page, size) => GET('/hot-chanjing/files', { params: { page, size } }),
  deleteFile: (id) => DEL(`/hot-chanjing/files/${id}`),
  // 用户信息
  getUserInfo: () => GET('/hot-chanjing/user/info'),
  getUserDuration: () => GET('/hot-chanjing/user/duration'),
}

export const publishApi = {
  health: () => GET('/publish/health'),
  accountStatus: (name, platform = 'douyin') => GET(`/publish/account/${name || 'default'}/status`, { params: { platform } }),
  login: (name, platform = 'douyin') => POST(`/publish/account/${name || 'default'}/login`, { platform }),
  publish: (contentId, d) => POST(`/publish/contents/${contentId}/publish`, d),
}
