const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');

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
  })
  .refine((d) => d.fullName || d.firstName, {
    message: 'Please enter your name.',
    path: ['fullName'],
  });

const loginSchema = z.object({
  email: z.string().trim().min(1).max(200).transform(normalizeEmail),
  password: z.string().min(1),
});

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

    const existing = await findUserByEmail(data.email);

    if (existing) {
      // A landlord (or an import) may have created this tenant's record before the
      // tenant ever signed up. That account is INVITED with a placeholder password;
      // the tenant's own sign-up activates it instead of being refused.
      const activating = data.role === 'TENANT' && existing.role === 'TENANT' && existing.accountStatus === 'INVITED';
      if (!activating) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const hashed = await bcrypt.hash(data.password, 10);
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashed,
          accountStatus: 'ACTIVE',
          tenantProfile: existing.tenantProfile
            ? { update: { firstName, lastName, phone: data.phone ?? existing.tenantProfile.phone } }
            : { create: { firstName, lastName, phone: data.phone } },
        },
        include: USER_INCLUDE,
      });
      return res.status(201).json({ token: generateToken(user.id), user: publicUser(user) });
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const profileCreate = data.role === 'LANDLORD'
      ? { landlordProfile: { create: { firstName, lastName, phone: data.phone, companyName: data.companyName || null } } }
      : { tenantProfile: { create: { firstName, lastName, phone: data.phone } } };

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        role: data.role,
        accountStatus: 'ACTIVE',
        ...profileCreate,
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

module.exports = { register, login, me, PASSWORD_MIN_LENGTH, normalizeEmail };
