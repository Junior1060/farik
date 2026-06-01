import api from './api';

export const getNotices = () => api.get('/notices').then((r) => r.data);
export const createNotice = (data) => api.post('/notices', data).then((r) => r.data);
export const updateNotice = (id, data) => api.put(`/notices/${id}`, data).then((r) => r.data);
