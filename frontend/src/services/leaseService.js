import api from './api';

export const getLeases = () => api.get('/leases').then((r) => r.data);
export const getLease = (id) => api.get(`/leases/${id}`).then((r) => r.data);
export const createLease = (data) => api.post('/leases', data).then((r) => r.data);
export const updateLease = (id, data) => api.put(`/leases/${id}`, data).then((r) => r.data);
export const deleteLease = (id) => api.delete(`/leases/${id}`).then((r) => r.data);
