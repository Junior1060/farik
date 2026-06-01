import api from './api';

export const getProfile = () => api.get('/profile').then((r) => r.data);
export const updateProfile = (data) => api.put('/profile', data).then((r) => r.data);
export const changePassword = (data) => api.put('/profile/password', data).then((r) => r.data);
