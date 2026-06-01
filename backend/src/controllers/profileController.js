const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');

const landlordUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
});

const tenantUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const getProfile = async (req, res, next) => {
  try {
    const profile = req.user.role === 'LANDLORD' ? req.user.landlordProfile : req.user.tenantProfile;
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    let profile;

    if (req.user.role === 'LANDLORD') {
      const data = landlordUpdateSchema.parse(req.body);
      profile = await prisma.landlordProfile.update({
        where: { userId: req.user.id },
        data,
      });
    } else {
      const data = tenantUpdateSchema.parse(req.body);
      profile = await prisma.tenantProfile.update({
        where: { userId: req.user.id },
        data,
      });
    }

    res.json({ profile });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);

    const valid = await bcrypt.compare(currentPassword, req.user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProfile, updateProfile, changePassword };
