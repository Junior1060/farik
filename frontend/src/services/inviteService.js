import api from './api';

/**
 * Who a tenant invitation link is for: { email, firstName, lastName, expiresAt }.
 * Rejects with a 404 when the link is invalid, expired, or already used.
 */
export const getInvite = (token) => api.get(`/auth/invite/${encodeURIComponent(token)}`).then((r) => r.data);
