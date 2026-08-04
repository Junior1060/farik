const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { buildSeedData } = require('./seedData');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const data = buildSeedData();

  // Clean existing data (children first).
  await prisma.activityLog.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.tenantProfile.deleteMany();
  await prisma.landlordProfile.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash(data.landlord.password, 10);

  // --- Landlord ---
  const landlordUser = await prisma.user.create({
    data: {
      email: data.landlord.email,
      password: hashedPassword,
      role: 'LANDLORD',
      landlordProfile: {
        create: {
          firstName: data.landlord.firstName,
          lastName: data.landlord.lastName,
          phone: data.landlord.phone,
          companyName: data.landlord.companyName,
        },
      },
    },
    include: { landlordProfile: true },
  });
  const landlord = landlordUser.landlordProfile;

  // --- Tenants ---
  const tenantIds = {};   // key -> TenantProfile.id
  const tenantUserIds = {}; // key -> User.id
  for (const t of data.tenants) {
    const user = await prisma.user.create({
      data: {
        email: t.email,
        password: hashedPassword,
        role: 'TENANT',
        tenantProfile: { create: { firstName: t.firstName, lastName: t.lastName, phone: t.phone } },
      },
      include: { tenantProfile: true },
    });
    tenantIds[t.key] = user.tenantProfile.id;
    tenantUserIds[t.key] = user.id;
  }

  // --- Properties ---
  const propertyIds = {};
  for (const p of data.properties) {
    const created = await prisma.property.create({
      data: {
        landlordId: landlord.id,
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        description: p.description,
      },
    });
    propertyIds[p.key] = created.id;
  }

  // --- Units ---
  const unitIds = {};
  for (const u of data.units) {
    const created = await prisma.unit.create({
      data: {
        propertyId: propertyIds[u.propertyKey],
        name: u.name,
        floor: u.floor,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        sqft: u.sqft,
        rentAmount: u.rentAmount,
        isOccupied: u.isOccupied,
      },
    });
    unitIds[u.key] = created.id;
  }

  // --- Leases ---
  const leaseIds = {};
  for (const l of data.leases) {
    const created = await prisma.lease.create({
      data: {
        tenantId: tenantIds[l.tenantKey],
        unitId: unitIds[l.unitKey],
        startDate: l.startDate,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent,
        deposit: l.deposit,
        status: l.status,
      },
    });
    leaseIds[l.key] = created.id;
  }

  // --- Payments ---
  for (const p of data.payments) {
    await prisma.payment.create({
      data: {
        leaseId: leaseIds[p.leaseKey],
        tenantId: tenantIds[p.tenantKey],
        amount: p.amount,
        dueDate: p.dueDate,
        paidDate: p.paidDate,
        status: p.status,
      },
    });
  }

  // --- Conversations & messages ---
  const conversationIds = {};
  for (const c of data.conversations) {
    const created = await prisma.conversation.create({
      data: { subject: c.subject, participants: { create: { tenantId: tenantIds[c.tenantKey] } } },
    });
    conversationIds[c.key] = created.id;
  }

  const tenantByConversation = Object.fromEntries(data.conversations.map((c) => [c.key, c.tenantKey]));
  await prisma.message.createMany({
    data: data.messages.map((m) => ({
      conversationId: conversationIds[m.conversationKey],
      senderId: m.from === 'landlord' ? landlordUser.id : tenantUserIds[tenantByConversation[m.conversationKey]],
      body: m.body,
      createdAt: m.createdAt,
    })),
  });

  // --- Maintenance ---
  await prisma.maintenanceRequest.createMany({
    data: data.maintenance.map((m) => ({
      tenantId: tenantIds[m.tenantKey],
      unitId: unitIds[m.unitKey],
      title: m.title,
      description: m.description,
      status: m.status,
      priority: m.priority,
      createdAt: m.createdAt,
      ...(m.resolvedAt ? { resolvedAt: m.resolvedAt } : {}),
    })),
  });

  // --- Notices ---
  await prisma.notice.createMany({
    data: data.notices.map((n) => ({
      landlordId: landlord.id,
      tenantId: tenantIds[n.tenantKey],
      leaseId: leaseIds[n.leaseKey],
      title: n.title,
      body: n.body,
      status: n.status,
      createdAt: n.createdAt,
      sentAt: n.sentAt,
    })),
  });

  // --- Activity log ---
  await prisma.activityLog.createMany({
    data: data.activity.map((a) => ({
      landlordId: landlord.id,
      type: a.type,
      title: a.title,
      description: a.description,
      entityId: tenantIds[a.tenantKey],
      createdAt: a.createdAt,
    })),
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log(`  Landlord: ${data.landlord.email} / ${data.landlord.password}`);
  console.log('  Tenant:   alice.morgan@email.com / password123');
  console.log('  Tenant:   sophia.chen@email.com / password123 (has overdue rent)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
