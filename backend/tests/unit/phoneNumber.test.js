const { normalizePhone, toE164 } = require('../../src/services/sms/phoneNumber');

describe('normalizePhone', () => {
  // The bug this exists to prevent: a tenant saved from the Add Tenant form as
  // "3062093660" never matched the "+13062093660" Twilio delivers, so every text from
  // a real tenant got the "we could not match this number" reply.
  it('matches a stored 10-digit number against the E.164 form Twilio sends', () => {
    expect(normalizePhone('3062093660')).toBe(normalizePhone('+13062093660'));
  });

  it('ignores formatting differences', () => {
    const forms = ['3062093660', '306-209-3660', '(306) 209-3660', '306.209.3660', ' 306 209 3660 '];
    for (const form of forms) expect(normalizePhone(form)).toBe('3062093660');
  });

  it('strips a leading North American country code but not a leading digit that is part of the number', () => {
    expect(normalizePhone('+13062093660')).toBe('3062093660');
    // 1306209366 is only 10 digits — the leading 1 is an area code here, not a country code.
    expect(normalizePhone('1306209366')).toBe('1306209366');
  });

  it('returns an empty key for missing or digitless input, which callers read as no number on file', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('n/a')).toBe('');
  });
});

describe('toE164', () => {
  it('adds the North American country code to a bare 10-digit number', () => {
    expect(toE164('3062093660')).toBe('+13062093660');
    expect(toE164('(306) 209-3660')).toBe('+13062093660');
  });

  it('leaves an already-E.164 number alone apart from formatting', () => {
    expect(toE164('+13062093660')).toBe('+13062093660');
    expect(toE164('+1 306-209-3660')).toBe('+13062093660');
  });

  it('passes through a non-North-American number rather than guessing a country code', () => {
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('promotes an 11-digit number that already starts with the country code', () => {
    expect(toE164('13062093660')).toBe('+13062093660');
  });

  it('returns null for anything undialable so the caller skips the send', () => {
    expect(toE164('555-9999')).toBeNull(); // no area code
    expect(toE164('123456789012')).toBeNull(); // 12 digits, no country we can assume
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('n/a')).toBeNull();
  });
});
