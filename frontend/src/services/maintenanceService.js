import api from './api';

export const getMaintenanceRequests = (params) => api.get('/maintenance', { params }).then((r) => r.data);
export const createMaintenanceRequest = (data, photos = []) => {
  if (!photos.length) {
    return api.post('/maintenance', data).then((r) => r.data);
  }
  const form = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, value);
  });
  photos.forEach((file) => form.append('photos', file));
  return api
    .post('/maintenance', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};
export const updateMaintenanceRequest = (id, data) => api.put(`/maintenance/${id}`, data).then((r) => r.data);
export const getMaintenanceRequestDetail = (id) => api.get(`/maintenance/${id}`).then((r) => r.data);
export const approveMaintenanceWorkflow = (id) => api.post(`/maintenance/${id}/approve-workflow`).then((r) => r.data.workflow);
export const cancelMaintenanceWorkflow = (id, reason) => api.post(`/maintenance/${id}/cancel-workflow`, { reason }).then((r) => r.data.workflow);
