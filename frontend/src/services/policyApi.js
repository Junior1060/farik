import api from './api';

export const getOrgPolicies = () => api.get('/policies').then((r) => r.data.policies);
export const updateOrgPolicy = (domain, data) => api.put(`/policies/${domain}`, data).then((r) => r.data.policy);

export const getPropertyPolicies = (propertyId) =>
  api.get(`/policies/properties/${propertyId}`).then((r) => r.data.policies);
export const updatePropertyPolicy = (propertyId, domain, data) =>
  api.put(`/policies/properties/${propertyId}/${domain}`, data).then((r) => r.data.policy);
export const deletePropertyPolicy = (propertyId, domain) =>
  api.delete(`/policies/properties/${propertyId}/${domain}`).then((r) => r.data);
