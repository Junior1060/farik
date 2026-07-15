import api from './api';

export const getAppointmentsForRequest = (maintenanceRequestId) =>
  api.get(`/appointments/maintenance-request/${maintenanceRequestId}`).then((r) => r.data.appointments);
export const confirmAppointment = (id, data) => api.post(`/appointments/${id}/confirm`, data).then((r) => r.data.appointment);
export const completeAppointment = (id) => api.post(`/appointments/${id}/complete`).then((r) => r.data);
export const markAppointmentNoShow = (id) => api.post(`/appointments/${id}/no-show`).then((r) => r.data);
