/**
 * Turns an axios error from a form submit into one sentence a person can act on.
 * Raw backend messages are never shown for server failures; they go to the
 * console in development so the detail is not lost.
 */

const FIELD_MESSAGES = {
  email: 'Enter a valid email address.',
  password: 'Password must be at least 8 characters.',
  fullName: 'Enter your name.',
};

export const NETWORK_ERROR = "We couldn't connect to Farik. Check your connection and try again.";
export const SERVER_ERROR = 'Something went wrong. Please try again.';
export const DUPLICATE_ACCOUNT = 'An account with this email already exists. Try logging in instead.';
export const BAD_CREDENTIALS = 'Email or password is incorrect.';

const endsLikeASentence = (s) => typeof s === 'string' && /[.!?]$/.test(s.trim());

/**
 * @param {unknown} err axios error
 * @param {'signup'|'login'|'form'} context which flow raised it
 * @returns {string}
 */
export function describeAuthError(err, context = 'form') {
  const response = err?.response;

  if (import.meta.env?.DEV && err) {
    // Keep the diagnostic detail for developers without surfacing it to people.
    console.debug('[farik] request failed', { status: response?.status, data: response?.data, message: err?.message });
  }

  if (!response) return NETWORK_ERROR;

  const { status, data } = response;

  if (status === 409) {
    return context === 'signup' ? DUPLICATE_ACCOUNT : (endsLikeASentence(data?.error) ? data.error : 'That already exists.');
  }
  if (status === 401) return BAD_CREDENTIALS;
  if (status === 403) return endsLikeASentence(data?.error) ? data.error : "You don't have access to do that.";
  if (status === 404) return endsLikeASentence(data?.error) ? data.error : "We couldn't find that.";
  if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';

  if (status === 400) {
    const field = data?.details?.[0]?.field;
    if (field && FIELD_MESSAGES[field]) return FIELD_MESSAGES[field];
    // Backend 400 text is shown only when it was written for people, not a
    // generic validator label.
    const message = data?.details?.[0]?.message || data?.error;
    if (message && message !== 'Validation error' && endsLikeASentence(message)) return message;
    return 'Please check your details and try again.';
  }

  return SERVER_ERROR;
}
