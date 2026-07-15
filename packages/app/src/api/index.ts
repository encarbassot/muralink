import { api } from './client.ts'
import type { YCalendarEvent } from '@muralink/module-calendar/types'
import type { YContact } from '@muralink/module-contacts/types'
import type { YAppointment, YService, YAvailableSlot } from '@muralink/module-appointments/types'
import type { YStockItem } from '@muralink/module-stock/types'

// Calendar
export const calendarApi = {
  getEvents: (from: string, to: string) =>
    api.get<YCalendarEvent[]>('/calendar/events', { params: { from, to } }).then(r => r.data),
  createEvent: (body: unknown) =>
    api.post<YCalendarEvent>('/calendar/events', body).then(r => r.data),
  updateEvent: (id: string, patch: unknown) =>
    api.patch<YCalendarEvent>(`/calendar/events/${id}`, patch).then(r => r.data),
  deleteEvent: (id: string) => api.delete(`/calendar/events/${id}`),
}

// Contacts
export const contactsApi = {
  getContacts: (search?: string) =>
    api.get<YContact[]>('/contacts/contacts', { params: search ? { search } : {} }).then(r => r.data),
  getContact: (id: string) =>
    api.get<YContact>(`/contacts/contacts/${id}`).then(r => r.data),
  createContact: (body: unknown) =>
    api.post<YContact>('/contacts/contacts', body).then(r => r.data),
  updateContact: (id: string, patch: unknown) =>
    api.patch<YContact>(`/contacts/contacts/${id}`, patch).then(r => r.data),
  deleteContact: (id: string) => api.delete(`/contacts/contacts/${id}`),
}

// Appointments
export const appointmentsApi = {
  getAppointments: (from?: string, to?: string) =>
    api.get<YAppointment[]>('/appointments/appointments', { params: { from, to } }).then(r => r.data),
  getAppointment: (id: string) =>
    api.get<YAppointment>(`/appointments/appointments/${id}`).then(r => r.data),
  getContactAppointments: (contactId: string) =>
    api.get<YAppointment[]>(`/appointments/contacts/${contactId}/appointments`).then(r => r.data),
  createAppointment: (body: unknown) =>
    api.post<YAppointment>('/appointments/appointments', body).then(r => r.data),
  updateAppointment: (id: string, patch: unknown) =>
    api.patch<YAppointment>(`/appointments/appointments/${id}`, patch).then(r => r.data),
  deleteAppointment: (id: string) => api.delete(`/appointments/appointments/${id}`),
  getServices: () =>
    api.get<YService[]>('/appointments/services').then(r => r.data),
  getSlots: (serviceId: string, date: string) =>
    api.get<YAvailableSlot[]>('/appointments/slots', { params: { serviceId, date } }).then(r => r.data),
  bookPublic: (body: unknown) =>
    api.post<YAppointment>('/appointments/appointments/public', body).then(r => r.data),
}

// Stock / inventory
export const stockApi = {
  getItems: () =>
    api.get<YStockItem[]>('/stock/stock').then(r => r.data),
  getLowStock: () =>
    api.get<YStockItem[]>('/stock/stock/low').then(r => r.data),
  getItem: (id: string) =>
    api.get<YStockItem>(`/stock/stock/${id}`).then(r => r.data),
  createItem: (body: unknown) =>
    api.post<YStockItem>('/stock/stock', body).then(r => r.data),
  updateItem: (id: string, patch: unknown) =>
    api.patch<YStockItem>(`/stock/stock/${id}`, patch).then(r => r.data),
  adjust: (id: string, delta: number) =>
    api.post<YStockItem>(`/stock/stock/${id}/adjust`, { delta }).then(r => r.data),
  deleteItem: (id: string) => api.delete(`/stock/stock/${id}`),
}
