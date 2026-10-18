const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { readInviteToken } = require('../services/tenantInviteService');

const PASSWORD_MIN_LENGTH = 8;

const normalizeEmail = (s) => String(s || '').trim().toLowerCase();

const name = z.string().trim().min(1, 'Please enter your name.').max(80);

// The self-serve signup form sends one "fullName" field; older callers may still
// send firstName/lastName. Either shape is accepted and split server-side.
const registerSchema = z
  .object({
    email: z
      .string({ required_error: 'Please enter your email address.' })
      .trim()
      .email('Please enter a valid email address.')
      .max(200)
      .transform(normalizeEmail),
    password: z
      .string({ required_error: 'Please choose a password.' })
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(128, 'Password is too long.'),
    fullName: name.max(160).optional(),
    firstName: name.optional(),
    lastName: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(40).optional(),
    companyName: z.string().trim().max(120).optional(),
    role: z.enum(['LANDLORD', 'TENANT']).default('LANDLORD'),
    // Required when role is TENANT: the signed link the landlord shared
    // (services/tenantInviteService.js). Landlords never send one.
    inviteToken: z.string().min(1).max(2000).optional(),
  })
  .refine((d) => d.fullName || d.firstName, {
    message: 'Please enter your name.',
    path: ['fullName'],
  });

const loginSchema = z.object({
  email: z.string().trim().min(1).max(200).transform(normalizeEmail),
  password: z.string().min(1),
});

const INVITE_REQUIRED = 'Tenant accounts are created by your landlord. Open the invitation link they sent you to set your password.';
const INVITE_INVALID = 'This invitation link is invalid or has expired. Ask your landlord for a new one.';
const INVITE_EMAIL_MISMATCH = 'Use the email address your landlord has on file for you. This invitation was issued for a different address.';

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

/** "Jordan Blake" → { firstName: "Jordan", lastName: "Blake" }; a single word keeps lastName empty. */
function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift();
  return { firstName, lastName: parts.join(' ') };
}

const USER_INCLUDE = { landlordProfile: true, tenantProfile: true };

/**
 * Emails are stored lower-cased from now on, but accounts registered before that
 * rule may carry capitals. Try the exact value first, then a case-insensitive
 * match so nobody is locked out and duplicates cannot differ only by case.
 */
async function findUserByEmail(email) {
  const exact = await prisma.user.findUnique({ where: { email }, include: USER_INCLUDE });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: USER_INCLUDE,
  });
}

/**
 * The INVITED tenant account an invitation token was issued for, or null. A used link
 * is dead: once the account is ACTIVE nothing can be done with the token again.
 */
async function findInvitedTenant(inviteToken) {
  const invite = readInviteToken(inviteToken);
  if (!invite) return null;
  const user = await prisma.user.findUnique({ where: { id: invite.userId }, include: USER_INCLUDE });
  if (!user || user.role !== 'TENANT' || user.accountStatus !== 'INVITED') return null;
  return user;
}

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  profile: user.role === 'LANDLORD' ? user.landlordProfile : user.tenantProfile,
});

const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const { firstName, lastName } = data.fullName
      ? splitFullName(data.fullName)
      : { firstName: data.firstName, lastName: data.lastName || '' };

    if (data.role === 'TENANT') {
      // Tenants only ever *activate* an account their landlord created, and only through
      // the invitation link. Activation by email alone would let anyone who knew a
      // tenant's address take over their lease, payments and messages.
      if (!data.inviteToken) return res.status(403).json({ error: INVITE_REQUIRED });

      const invited = await findInvitedTenant(data.inviteToken);
      if (!invited) return res.status(403).json({ error: INVITE_INVALID });
      if (normalizeEmail(invited.email) !== data.email) {
        return res.status(403).json({ error: INVITE_EMAIL_MISMATCH });
      }

      const hashed = await bcrypt.hash(data.password, 10);
      const user = await prisma.user.update({
        where: { id: invited.id },
        data: {
          password: hashed,
          accountStatus: 'ACTIVE',
          tenantProfile: invited.tenantProfile
            ? { update: { firstName, lastName, phone: data.phone ?? invited.tenantProfile.phone } }
            : { create: { firstName, lastName, phone: data.phone } },
        },
        include: USER_INCLUDE,
      });
      return res.status(201).json({ token: generateToken(user.id), user: publicUser(user) });
    }

    const existing = await findUserByEmail(data.email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        role: 'LANDLORD',
        accountStatus: 'ACTIVE',
        landlordProfile: { create: { firstName, lastName, phone: data.phone, companyName: data.companyName || null } },
      },
      include: USER_INCLUDE,
    });

    res.status(201).json({ token: generateToken(user.id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await findUserByEmail(email);
    // An INVITED account has only a random placeholder password. Refuse it with the
    // same generic message so login never reveals whether an email is known.
    if (!user || user.accountStatus === 'INVITED') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({ token: generateToken(user.id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res) => {
  res.json({ user: publicUser(req.user) });
};

/**
 * GET /api/auth/invite/:token — who an invitation link is for, so the activation page
 * can show (and lock) the email and prefill the name. 404 for anything that is not a
 * live invitation; the message is the same one activation itself would give.
 */
const getInvite = async (req, res, next) => {
  try {
    const invited = await findInvitedTenant(req.params.token);
    if (!invited) return res.status(404).json({ error: INVITE_INVALID });
    const { expiresAt } = readInviteToken(req.params.token);
    res.json({
      email: invited.email,
      firstName: invited.tenantProfile?.firstName || '',
      lastName: invited.tenantProfile?.lastName || '',
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me, getInvite, PASSWORD_MIN_LENGTH, normalizeEmail };
