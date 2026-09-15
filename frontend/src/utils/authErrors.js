/**
 * Turns an axios error from /api/auth/* (or any form submit) into one sentence a
 * person can act on. Raw backend messages are never shown for server failures.
 */

const FIELD_MESSAGES = {
  email: 'Enter a valid email address.',
  password: 'Password must be at least 8 characters.',
  fullName: 'Enter your name.',
};

export const NETWORK_ERROR = "We couldn't reach Farik. Check your connection and try again.";
export const SERVER_ERROR = 'Something went wrong on our end. Please try again in a moment.';

/**
 * @param {unknown} err axios error
 * @param {'signup'|'login'|'form'} context which flow raised it
 * @returns {string}
 */
export function describeAuthError(err, context = 'form') {
  const response = err?.response;
  if (!response) return NETWORK_ERROR;

  const { status, data } = response;

  if (status === 409) {
    return context === 'signup'
      ? 'An account with this email already exists. Try logging in instead.'
      : data?.error || 'That already exists.';
  }
  if (status === 401) return 'Incorrect email or password.';
  if (status === 403) return data?.error || "You don't have access to do that.";
  if (status === 404) return data?.error || "We couldn't find that.";
  if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';

  if (status === 400) {
    const field = data?.details?.[0]?.field;
    if (field && FIELD_MESSAGES[field]) return FIELD_MESSAGES[field];
    const message = data?.details?.[0]?.message || data?.error;
    // Only surface backend 400 text when it was written for people (it ends with
    // punctuation and isn't a generic validator label).
    if (message && message !== 'Validation error' && /[.!?]$/.test(message)) return message;
    return 'Please check your details and try again.';
  }

  if (status >= 500) return SERVER_ERROR;
  return data?.error && /[.!?]$/.test(data.error) ? data.error : 'Something went wrong. Please try again.';
}
