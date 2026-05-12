import request from './index'
export const GET = (...args) => request.get(...args)
export const POST = (...args) => request.post(...args)
export const PUT = (...args) => request.put(...args)
export const DEL = (url) => request.delete(url)

export const customerApi = {
  list: () => GET('/customers'),
  create: (d) => POST('/customers', d),
  update: (id, d) => PUT(`/customers/${id}`, d),
  remove: (id) => DEL(`/customers/${id}`),
  followUps: (id) => GET(`/customers/${id}/follow-ups`),
  addFollowUp: (id, d) => POST(`/customers/${id}/follow-ups`, d)
}

export const contactApi = {
  list: (customer_id) => GET('/contacts', { params: { customer_id } }),
  create: (d) => POST('/contacts', d),
  update: (id, d) => PUT(`/contacts/${id}`, d),
  remove: (id) => DEL(`/contacts/${id}`)
}

export const leadApi = {
  list: () => GET('/leads'),
  create: (d) => POST('/leads', d),
  update: (id, d) => PUT(`/leads/${id}`, d),
  remove: (id) => DEL(`/leads/${id}`)
}

export const campaignApi = {
  list: () => GET('/campaigns'),
  create: (d) => POST('/campaigns', d),
  update: (id, d) => PUT(`/campaigns/${id}`, d),
  remove: (id) => DEL(`/campaigns/${id}`)
}

export const quotationApi = {
  list: () => GET('/quotations'),
  create: (d) => POST('/quotations', d),
  update: (id, d) => PUT(`/quotations/${id}`, d),
  remove: (id) => DEL(`/quotations/${id}`),
  items: (id) => GET(`/quotations/${id}/items`),
  addItem: (id, d) => POST(`/quotations/${id}/items`, d),
  removeItem: (id, itemId) => DEL(`/quotations/${id}/items/${itemId}`)
}

export const contractApi = {
  list: () => GET('/contracts'),
  create: (d) => POST('/contracts', d),
  update: (id, d) => PUT(`/contracts/${id}`, d),
  remove: (id) => DEL(`/contracts/${id}`)
}

export const ticketApi = {
  list: () => GET('/tickets'),
  create: (d) => POST('/tickets', d),
  update: (id, d) => PUT(`/tickets/${id}`, d),
  remove: (id) => DEL(`/tickets/${id}`)
}

export const feedbackApi = {
  list: () => GET('/feedback'),
  create: (d) => POST('/feedback', d),
  update: (id, d) => PUT(`/feedback/${id}`, d),
  remove: (id) => DEL(`/feedback/${id}`)
}

export const opportunityApi = {
  list: () => GET('/opportunities'),
  create: (d) => POST('/opportunities', d),
  update: (id, d) => PUT(`/opportunities/${id}`, d),
  remove: (id) => DEL(`/opportunities/${id}`)
}
