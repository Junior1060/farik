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

/**
 * Landlord adds a tenant and their first lease in one call. If nobody has
 * registered with that email yet, an INVITED account is reserved for them.
 * Resolves with { tenant, lease, inviteUrl } — inviteUrl is null when the
 * tenant already had an active account.
 */
export const createTenant = (data) => api.post('/tenants', data).then((r) => r.data);

/**
 * A fresh activation link for a tenant who has not set a password yet. The only way
 * an invited tenant can get in — there is no activation by email alone.
 * Resolves with { url, expiresAt, email }; 409 once the account is active.
 */
export const getTenantInviteLink = (id) => api.get(`/tenants/${id}/invite`).then((r) => r.data);
