import api from './api';

export const getInvoicesForRequest = (maintenanceRequestId) =>
  api.get(`/invoices/maintenance-request/${maintenanceRequestId}`).then((r) => r.data.invoices);

export const uploadInvoice = (maintenanceRequestId, file, vendorId) => {
  const form = new FormData();
  form.append('maintenanceRequestId', maintenanceRequestId);
  if (vendorId) form.append('vendorId', vendorId);
  form.append('invoice', file);
  return api.post('/invoices', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.invoice);
};

export const approveInvoice = (id, data = {}) => api.post(`/invoices/${id}/approve`, data).then((r) => r.data.invoice);
export const rejectInvoice = (id, reason) => api.post(`/invoices/${id}/reject`, { reason }).then((r) => r.data.invoice);
