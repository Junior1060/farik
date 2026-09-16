import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rentora_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A 401 from login/register is wrong credentials and belongs to the form. A 401
 * from /auth/me is the session probe on app load; AuthContext already clears the
 * session and React Router sends the person to /login, so no browser navigation
 * is needed. Everything else with a 401 is an expired or invalid session.
 */
export const isAuthEndpoint = (config) => /\/auth\/(login|register|me)\/?$/.test(config?.url || '');

/** Already on an auth page: clearing the token is enough; navigating would loop. */
export const onAuthPage = (pathname) => /^\/(login|signup)(\/|$)/.test(pathname || '');

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !isAuthEndpoint(err.config)) {
      localStorage.removeItem('rentora_token');
      if (!onAuthPage(window.location.pathname)) window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// Backend origin for static assets (uploads live at <origin>/uploads, outside /api).
// In dev VITE_API_URL is unset, so point at the local backend; in prod strip the /api suffix.
const API_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

// Turn a stored server path like "/uploads/maintenance/x.jpg" into a full URL.
export const assetUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default api;
