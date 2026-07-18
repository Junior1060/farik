import api from './api';

export const downloadTemplate = async () => {
  // Route through the shared api client (respects VITE_API_URL) instead of a raw
  // relative fetch — on Vercel/Render split deployments a relative path hits the
  // frontend's own SPA catch-all instead of the backend.
  const res = await api.get('/import/template', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'farik-import-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
};

export const uploadSpreadsheet = async (formData) => {
  const res = await api.post('/import/spreadsheet', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const previewRows = async (rows) => {
  const res = await api.post('/import/preview', { rows });
  return res.data;
};

// Universal AI ingest — accepts a file (FormData) or pasted text ({ text }).
export const aiImport = async (payload) => {
  if (payload instanceof FormData) {
    const res = await api.post('/import/ai', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }
  const res = await api.post('/import/ai', payload);
  return res.data;
};

export const uploadDocuments = async (formData) => {
  const res = await api.post('/import/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const confirmImport = async (rows) => {
  const res = await api.post('/import/confirm', { rows });
  return res.data;
};
