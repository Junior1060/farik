import api from './api';

export const downloadTemplate = () => {
  const token = localStorage.getItem('rentora_token');
  const a = document.createElement('a');
  a.href = `/api/import/template`;
  // Use fetch with auth header to trigger download
  fetch('/api/import/template', { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'farik-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    });
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
