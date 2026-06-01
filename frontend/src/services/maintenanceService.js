import api from './api';

export const getMaintenanceRequests = (params) => api.get('/maintenance', { params }).then((r) => r.data);
export const createMaintenanceRequest = (data) => api.post('/maintenance', data).then((r) => r.data);
export const updateMaintenanceRequest = (id, data) => api.put(`/maintenance/${id}`, data).then((r) => r.data);
