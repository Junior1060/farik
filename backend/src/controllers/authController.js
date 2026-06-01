const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  role: z.enum(['LANDLORD', 'TENANT']).default('LANDLORD'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(data.password, 10);

    const profileCreate = data.role === 'LANDLORD'
      ? { landlordProfile: { create: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, companyName: data.companyName } } }
      : { tenantProfile: { create: { firstName: data.firstName, lastName: data.lastName, phone: data.phone } } };

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        role: data.role,
        ...profileCreate,
      },
      include: { landlordProfile: true, tenantProfile: true },
    });

    const token = generateToken(user.id);
    const profile = data.role === 'LANDLORD' ? user.landlordProfile : user.tenantProfile;
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { landlordProfile: true, tenantProfile: true },
    });

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateToken(user.id);
    const profile = user.role === 'LANDLORD' ? user.landlordProfile : user.tenantProfile;

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res) => {
  const { password, ...safeUser } = req.user;
  const profile = req.user.role === 'LANDLORD' ? req.user.landlordProfile : req.user.tenantProfile;
  res.json({
    user: {
      id: safeUser.id,
      email: safeUser.email,
      role: safeUser.role,
      profile,
    },
  });
};

module.exports = { register, login, me };
