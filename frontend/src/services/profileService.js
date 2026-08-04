import api from './api';

export const getProfile = () => api.get('/profile').then((r) => r.data);
export const updateProfile = (data) => api.put('/profile', data).then((r) => r.data);
export const changePassword = (data) => api.put('/profile/password', data).then((r) => r.data);

/**
 * The messaging number tenants can text, or null when no SMS provider is
 * configured for this deployment. Never render a placeholder in its place.
 */
export const getMessagingConfig = () => api.get('/profile/messaging').then((r) => r.data);
