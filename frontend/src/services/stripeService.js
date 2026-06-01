import api from './api';

// Landlord
export const getStripeConnectStatus = () => api.get('/stripe/connect/status').then((r) => r.data);
export const connectStripeAccount = () => api.post('/stripe/connect/account').then((r) => r.data);
export const getStripeDashboardLink = () => api.get('/stripe/connect/dashboard').then((r) => r.data);

// Tenant
export const createCheckoutSession = (paymentId) =>
  api.post('/stripe/checkout', { paymentId }).then((r) => r.data);
