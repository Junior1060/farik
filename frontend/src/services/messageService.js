import api from './api';

export const getConversations = () => api.get('/messages').then((r) => r.data);
export const getThread = (conversationId) => api.get(`/messages/${conversationId}`).then((r) => r.data);
export const sendMessage = (conversationId, data) => api.post(`/messages/${conversationId}`, data).then((r) => r.data);
