const jwt = require('jsonwebtoken');

// A tenant never self-registers. Their landlord (or the import wizard) creates the
// account as INVITED, and only the holder of a link minted here can set its password.
// Without this, anyone who knew a tenant's email address could claim the account —
// and with it the lease, rent history, address, messages and the ability to pay rent
// or file repairs as that person.
//
// The link is a signed, expiring token bound to one user id. It is stateless on
// purpose: no table, no migration, and it dies the moment the account is ACTIVE
// because activation checks the account status, not the token. Minting a second link
// does not revoke the first; both stop working together on activation.
const INVITE_PURPOSE = 'tenant-invite';
const INVITE_TTL = '14d';

function createInviteToken(userId) {
  // Deliberately NOT the session claim name (userId): even if middleware/auth.js
  // forgot to check `purpose`, this token would never resolve to a signed-in user.
  return jwt.sign({ purpose: INVITE_PURPOSE, inviteUserId: userId }, process.env.JWT_SECRET, { expiresIn: INVITE_TTL });
}

/**
 * The user id an invitation token was issued for, plus its expiry — or null for
 * anything that is not a live invitation (expired, tampered, or a different kind of
 * token such as a session).
 */
function readInviteToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== INVITE_PURPOSE || !decoded.inviteUserId) return null;
    return { userId: decoded.inviteUserId, expiresAt: new Date(decoded.exp * 1000) };
  } catch {
    return null;
  }
}

/** The page a tenant opens to activate: /signup/tenant on the configured frontend. */
function inviteUrl(token) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/signup/tenant?invite=${encodeURIComponent(token)}`;
}

module.exports = { createInviteToken, readInviteToken, inviteUrl, INVITE_TTL };
