import api from './api';

export const getAgentConfig = () => api.get('/agent/config').then((r) => r.data.config);
export const updateAgentConfig = (data) => api.put('/agent/config', data).then((r) => r.data.config);

export const getAgentLogs = (params) => api.get('/agent/logs', { params }).then((r) => r.data);
export const approveLog = (id) => api.post(`/agent/logs/${id}/approve`).then((r) => r.data.log);
export const rejectLog = (id) => api.post(`/agent/logs/${id}/reject`).then((r) => r.data.log);
export const undoLog = (id) => api.post(`/agent/logs/${id}/undo`).then((r) => r.data.log);

export const getVendors = () => api.get('/agent/vendors').then((r) => r.data.vendors);
export const createVendor = (data) => api.post('/agent/vendors', data).then((r) => r.data.vendor);
export const updateVendor = (id, data) => api.put(`/agent/vendors/${id}`, data).then((r) => r.data.vendor);
export const deleteVendor = (id) => api.delete(`/agent/vendors/${id}`);

export const triggerAgentRun = () => api.post('/agent/trigger').then((r) => r.data);

export const getTimeline = () => api.get('/agent/timeline').then((r) => r.data.entries);
export const cancelScheduled = (data) => api.post('/agent/timeline/cancel', data).then((r) => r.data.log);

export const getEscalations = () => api.get('/agent/escalations').then((r) => r.data.escalations);
export const dismissLog = (id) => api.post(`/agent/logs/${id}/dismiss`).then((r) => r.data.log);

export const getNotifications = () => api.get('/agent/notifications').then((r) => r.data);
export const markNotificationsRead = () => api.post('/agent/notifications/read-all');
