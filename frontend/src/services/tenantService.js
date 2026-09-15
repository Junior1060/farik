import api from './api';

export const getTenants = () => api.get('/tenants').then((r) => r.data);
export const lookupTenantByEmail = (email) => api.get(`/tenants/lookup?email=${encodeURIComponent(email)}`).then((r) => r.data);
export const getTenant = (id) => api.get(`/tenants/${id}`).then((r) => r.data);
export const updateTenant = (id, data) => api.put(`/tenants/${id}`, data).then((r) => r.data);
export const deleteTenant = (id) => api.delete(`/tenants/${id}`).then((r) => r.data);

/**
 * Landlord confirming they have this tenant's permission to text them. Grant-only —
 * the API refuses to override a tenant who replied STOP.
 */
export const attestTenantSmsConsent = (id) => api.put(`/tenants/${id}/sms-consent`).then((r) => r.data.tenant);
