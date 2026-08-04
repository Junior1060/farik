import axios from 'axios';

/**
 * The pilot application is a PUBLIC marketing endpoint, so it deliberately does
 * NOT use services/api.js — that client attaches the stored JWT to every
 * request, and a landing-page form has no business sending anyone's token.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

const publicClient = axios.create({ baseURL: BASE, timeout: 20000 });

/** Submit a pilot application. Resolves with { ok, application, bookingUrl }. */
export const submitPilotApplication = (payload) =>
  publicClient.post('/pilot-applications', payload).then((r) => r.data);

/**
 * Booking availability, resolved server-side so there is one source of truth.
 * Returns { bookingUrl: string | null }.
 */
export const getPilotConfig = () =>
  publicClient.get('/pilot-applications/config').then((r) => r.data);
