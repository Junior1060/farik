const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized – no token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        landlordProfile: true,
        tenantProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized – user not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized – invalid token' });
  }
};

const requireLandlord = (req, res, next) => {
  if (req.user?.role !== 'LANDLORD') {
    return res.status(403).json({ error: 'Forbidden – landlord access required' });
  }
  next();
};

const requireTenant = (req, res, next) => {
  if (req.user?.role !== 'TENANT') {
    return res.status(403).json({ error: 'Forbidden – tenant access required' });
  }
  next();
};

// Farik staff access, on top of `authenticate`. There is no admin role in the
// schema, so membership is an explicit ADMIN_EMAILS allowlist matched against
// the authenticated user's own email. Empty allowlist = nobody gets in, so the
// admin surface fails closed on a deployment that never configured it.
const requireAdmin = (req, res, next) => {
  const { isAdminEmail } = require('../config/pilot');
  if (!req.user?.email || !isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'Forbidden – administrator access required' });
  }
  next();
};

module.exports = { authenticate, requireLandlord, requireTenant, requireAdmin };
