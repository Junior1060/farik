const prisma = require('../lib/prisma');

const getSummary = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;

    // Get all units for this landlord
    const properties = await prisma.property.findMany({
      where: { landlordId },
      include: { units: true },
    });

    const allUnits = properties.flatMap((p) => p.units);
    const unitIds = allUnits.map((u) => u.id);
    const totalUnits = allUnits.length;
    const occupiedUnits = allUnits.filter((u) => u.isOccupied).length;

    // Payments this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const payments = await prisma.payment.findMany({
      where: {
        lease: { unit: { propertyId: { in: properties.map((p) => p.id) } } },
        dueDate: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    const totalCollected = payments.filter((p) => p.status === 'PAID' || p.status === 'PARTIAL').reduce((sum, p) => sum + p.amount, 0);
    const totalPending = payments.filter((p) => p.status === 'PENDING').reduce((sum, p) => sum + p.amount, 0);
    const totalOverdue = payments.filter((p) => p.status === 'OVERDUE').reduce((sum, p) => sum + p.amount, 0);

    // Monthly rent totals
    const activeLeases = await prisma.lease.findMany({
      where: { unit: { propertyId: { in: properties.map((p) => p.id) } }, status: 'ACTIVE' },
    });
    const monthlyRentTotal = activeLeases.reduce((sum, l) => sum + l.monthlyRent, 0);

    const maintenanceOpen = await prisma.maintenanceRequest.count({
      where: { unitId: { in: unitIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });

    // Rent collection breakdown for chart
    const paid = payments.filter((p) => p.status === 'PAID').length;
    const pending = payments.filter((p) => p.status === 'PENDING').length;
    const overdue = payments.filter((p) => p.status === 'OVERDUE').length;
    const partial = payments.filter((p) => p.status === 'PARTIAL').length;

    // Recent maintenance
    const recentMaintenance = await prisma.maintenanceRequest.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
    });

    // Leases expiring soon
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000);
    const expiringLeases = await prisma.lease.findMany({
      where: {
        unit: { propertyId: { in: properties.map((p) => p.id) } },
        status: 'ACTIVE',
        endDate: { lte: thirtyDaysFromNow },
      },
      include: { tenant: true, unit: true },
      take: 5,
    });

    res.json({
      stats: {
        totalCollected,
        totalPending,
        totalOverdue,
        monthlyRentTotal,
        totalUnits,
        occupiedUnits,
        vacantUnits: totalUnits - occupiedUnits,
        occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
        maintenanceOpen,
        activeLeases: activeLeases.length,
      },
      rentBreakdown: { paid, pending, overdue, partial },
      recentMaintenance,
      expiringLeases,
    });
  } catch (err) {
    next(err);
  }
};

const getActivity = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const activity = await prisma.activityLog.findMany({
      where: { landlordId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ activity });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSummary, getActivity };
