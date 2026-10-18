const jwt = require('jsonwebtoken');
const { createInviteToken, readInviteToken, inviteUrl } = require('../../src/services/tenantInviteService');

describe('tenantInviteService', () => {
  it('round-trips a user id and expires about 14 days out', () => {
    const invite = readInviteToken(createInviteToken('user-7'));
    expect(invite.userId).toBe('user-7');
    const days = (invite.expiresAt.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('never resolves a session token as an invitation, even though both share the secret', () => {
    expect(readInviteToken(jwt.sign({ userId: 'user-7' }, process.env.JWT_SECRET))).toBeNull();
  });

  it('rejects a tampered, foreign-signed, expired or missing token', () => {
    const good = createInviteToken('user-7');
    expect(readInviteToken(`${good}x`)).toBeNull();
    expect(readInviteToken(jwt.sign({ purpose: 'tenant-invite', inviteUserId: 'user-7' }, 'other-secret'))).toBeNull();
    expect(readInviteToken(jwt.sign({ purpose: 'tenant-invite', inviteUserId: 'user-7' }, process.env.JWT_SECRET, { expiresIn: -5 }))).toBeNull();
    expect(readInviteToken(undefined)).toBeNull();
    expect(readInviteToken('')).toBeNull();
  });

  it('does not carry the session claim, so middleware/auth.js can never mistake it for a login', () => {
    const decoded = jwt.decode(createInviteToken('user-7'));
    expect(decoded.userId).toBeUndefined();
    expect(decoded.purpose).toBe('tenant-invite');
  });

  it('builds the activation URL on the configured frontend, trailing slash or not, with the token encoded', () => {
    const prev = process.env.FRONTEND_URL;
    try {
      process.env.FRONTEND_URL = 'https://app.farik.test/';
      const url = new URL(inviteUrl('a.b+c/d'));
      expect(url.origin).toBe('https://app.farik.test');
      expect(url.pathname).toBe('/signup/tenant');
      expect(url.searchParams.get('invite')).toBe('a.b+c/d');
    } finally {
      if (prev === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = prev;
    }
  });
});
