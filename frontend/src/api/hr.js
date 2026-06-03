import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const orgChartApi = {
  list: () => GET('/org-charts'),
  upload: (formData) => POST('/org-charts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  remove: (id) => DEL(`/org-charts/${id}`),
  previewUrl: (id) => `/api/org-charts/preview/${id}`,
  downloadUrl: (id) => `/api/org-charts/download/${id}`,
  importDepartments: (formData) => POST('/org-charts/import-departments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const employeeApi = {
  list: () => GET('/employees'),
  create: (d) => POST('/employees', d),
  update: (id, d) => PUT(`/employees/${id}`, d),
  remove: (id) => DEL(`/employees/${id}`)
}

export const departmentApi = {
  list: () => GET('/departments'),
  create: (d) => POST('/departments', d),
  update: (id, d) => PUT(`/departments/${id}`, d),
  remove: (id) => DEL(`/departments/${id}`)
}

export const attendanceApi = {
  reports: (params) => GET('/attendance/reports', { params }),
  importReports: (formData) => POST('/attendance/reports/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateReport: (id, data) => PUT(`/attendance/reports/${id}`, data),
  deleteReport: (id) => DEL(`/attendance/reports/${id}`),
  monthlyReport: (params) => GET('/attendance/report/monthly', { params }),
  exportUrl: (month) => `/api/attendance/export?month=${month}`
}

export const performanceApi = {
  reports: (params) => GET('/performance/reports', { params }),
  importPreview: (formData) => POST('/performance/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  batchInsert: (d) => POST('/performance/batch', d),
  aggregate: (month) => POST('/performance/aggregate', { month }),
  updateReport: (id, d) => PUT(`/performance/reports/${id}`, d),
  deleteReport: (id) => DEL(`/performance/reports/${id}`),
  exportUrl: (month, category) => `/api/performance/export?month=${month}&category=${category || 'monthly'}`
}

export const recruitmentApi = {
  list: (params) => GET('/recruitment', { params }),
  create: (d) => POST('/recruitment', d),
  update: (id, d) => PUT(`/recruitment/${id}`, d),
  remove: (id) => DEL(`/recruitment/${id}`),
  candidates: (id) => GET(`/recruitment/${id}/candidates`),
  addCandidate: (id, d) => POST(`/recruitment/${id}/candidates`, d),
  updateCandidate: (id, d) => PUT(`/candidates/${id}`, d),
}
