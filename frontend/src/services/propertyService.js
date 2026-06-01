import api from './api';

export const getProperties = () => api.get('/properties').then((r) => r.data);
export const createProperty = (data) => api.post('/properties', data).then((r) => r.data);
export const updateProperty = (id, data) => api.put(`/properties/${id}`, data).then((r) => r.data);
export const deleteProperty = (id) => api.delete(`/properties/${id}`).then((r) => r.data);

export const createUnit = (propertyId, data) => api.post(`/properties/${propertyId}/units`, data).then((r) => r.data);
export const updateUnit = (propertyId, unitId, data) => api.put(`/properties/${propertyId}/units/${unitId}`, data).then((r) => r.data);
export const deleteUnit = (propertyId, unitId) => api.delete(`/properties/${propertyId}/units/${unitId}`).then((r) => r.data);
