import api from './api';

export const getDashboardSummary = () => api.get('/dashboard/summary').then((r) => r.data);
export const getDashboardActivity = () => api.get('/dashboard/activity').then((r) => r.data);
