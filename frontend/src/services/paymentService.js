import api from './api';

export const getPayments = (params) => api.get('/payments', { params }).then((r) => r.data);
export const createPayment = (data) => api.post('/payments', data).then((r) => r.data);
export const updatePayment = (id, data) => api.put(`/payments/${id}`, data).then((r) => r.data);
export const getMyPayments = () => api.get('/payments/my').then((r) => r.data);
