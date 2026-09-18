// Phone numbers are typed by hand in the app ("306-209-3660", "(306) 209 3660") but
// Twilio speaks strict E.164 in both directions: it delivers `From` as "+13062093660",
// and it rejects a `to` that isn't E.164 with error 21211. These two helpers are the
// only place that gap is bridged.
//
// The two forms are deliberately not interchangeable:
//   normalizePhone() -> a comparison key, never dialled.
//   toE164()         -> a dialling address, never compared.

const NANP_LENGTH = 10;

/**
 * Comparison key: digits only, with a leading North American country code dropped so a
 * number stored as "3062093660" matches the "+13062093660" Twilio delivers. Returns ''
 * for anything with no digits, which callers treat as "no number on file".
 */
function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === NANP_LENGTH + 1 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/**
 * Dialling form. Returns null when the input can't be turned into something Twilio will
 * accept — a bare 7-digit number has no area code and a 12-digit one has no country we
 * can assume — so callers skip the send instead of eating a 21211 from the API.
 *
 * A leading "+" is trusted as already-international and only stripped of formatting;
 * guessing a country code for such a number would be worse than passing it through.
 */
function toE164(phone) {
  const raw = (phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === NANP_LENGTH) return `+1${digits}`;
  if (digits.length === NANP_LENGTH + 1 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

module.exports = { normalizePhone, toE164 };
