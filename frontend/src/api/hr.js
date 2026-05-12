import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const employeeApi = {
  list: () => GET('/employees'),
  create: (d) => POST('/employees', d),
  update: (id, d) => PUT(`/employees/${id}`, d),
  remove: (id) => DEL(`/employees/${id}`),
  leaveList: () => GET('/employees/leave-requests'),
  applyLeave: (d) => POST('/employees/leave-requests', d),
  approveLeave: (id, d) => PUT(`/employees/leave-requests/${id}/approve`, d)
}

export const departmentApi = {
  list: () => GET('/departments'),
  create: (d) => POST('/departments', d),
  update: (id, d) => PUT(`/departments/${id}`, d),
  remove: (id) => DEL(`/departments/${id}`)
}

export const recruitmentApi = {
  list: () => GET('/recruitment'),
  create: (d) => POST('/recruitment', d),
  update: (id, d) => PUT(`/recruitment/${id}`, d),
  remove: (id) => DEL(`/recruitment/${id}`),
  candidates: (id) => GET(`/recruitment/${id}/candidates`),
  addCandidate: (id, d) => POST(`/recruitment/${id}/candidates`, d),
  updateCandidate: (id, d) => PUT(`/recruitment/candidates/${id}`, d)
}

export const attendanceApi = {
  rules: () => GET('/attendance/rules'),
  createRule: (d) => POST('/attendance/rules', d),
  updateRule: (id, d) => PUT(`/attendance/rules/${id}`, d),
  deleteRule: (id) => DEL(`/attendance/rules/${id}`),
  clockIn: (d) => POST('/attendance/clock-in', d),
  clockOut: (d) => POST('/attendance/clock-out', d),
  records: (params) => GET('/attendance/records', { params }),
  monthlyReport: (params) => GET('/attendance/report/monthly', { params })
}

export const personnelChangeApi = {
  list: () => GET('/personnel-changes'),
  create: (d) => POST('/personnel-changes', d),
  update: (id, d) => PUT(`/personnel-changes/${id}`, d),
  remove: (id) => DEL(`/personnel-changes/${id}`)
}

export const performanceApi = {
  schemes: () => GET('/performance/schemes'),
  createScheme: (d) => POST('/performance/schemes', d),
  deleteScheme: (id) => DEL(`/performance/schemes/${id}`),
  items: (schemeId) => GET(`/performance/schemes/${schemeId}/items`),
  addItem: (schemeId, d) => POST(`/performance/schemes/${schemeId}/items`, d),
  updateItem: (id, d) => PUT(`/performance/items/${id}`, d),
  deleteItem: (id) => DEL(`/performance/items/${id}`),
  report: (schemeId) => GET('/performance/report', { params: { scheme_id: schemeId } })
}
