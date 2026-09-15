import api from './api';

/** Admin-only. Requires an authenticated user on the server's ADMIN_EMAILS allowlist. */
export const getPilotApplications = (params) =>
  api.get('/pilot-applications', { params }).then((r) => r.data.applications);

export const updatePilotApplication = (id, data) =>
  api.patch(`/pilot-applications/${id}`, data).then((r) => r.data.application);
