const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
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

  const hashedPassword = await bcrypt.hash('password123', 10);

  // --- Landlord ---
  const landlordUser = await prisma.user.create({
    data: {
      email: 'landlord@rentora.com',
      password: hashedPassword,
      role: 'LANDLORD',
      landlordProfile: {
        create: {
          firstName: 'Marcus',
          lastName: 'Reynolds',
          phone: '(555) 200-1000',
          companyName: 'Reynolds Property Group',
        },
      },
    },
    include: { landlordProfile: true },
  });
  const landlord = landlordUser.landlordProfile;

  // --- Tenant Users ---
  const tenantData = [
    { email: 'alice.morgan@email.com', firstName: 'Alice', lastName: 'Morgan', phone: '(555) 301-2100' },
    { email: 'james.park@email.com', firstName: 'James', lastName: 'Park', phone: '(555) 302-3200' },
    { email: 'sophia.chen@email.com', firstName: 'Sophia', lastName: 'Chen', phone: '(555) 303-4300' },
    { email: 'derek.hill@email.com', firstName: 'Derek', lastName: 'Hill', phone: '(555) 304-5400' },
    { email: 'priya.patel@email.com', firstName: 'Priya', lastName: 'Patel', phone: '(555) 305-6500' },
    { email: 'liam.nguyen@email.com', firstName: 'Liam', lastName: 'Nguyen', phone: '(555) 306-7600' },
    { email: 'mia.foster@email.com', firstName: 'Mia', lastName: 'Foster', phone: '(555) 307-8700' },
  ];

  const tenants = [];
  for (const t of tenantData) {
    const user = await prisma.user.create({
      data: {
        email: t.email,
        password: hashedPassword,
        role: 'TENANT',
        tenantProfile: {
          create: {
            firstName: t.firstName,
            lastName: t.lastName,
            phone: t.phone,
          },
        },
      },
      include: { tenantProfile: true },
    });
    tenants.push(user.tenantProfile);
  }

  // --- Properties ---
  const property1 = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'Maple Court Apartments',
      address: '142 Maple Street',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      description: 'Modern 3-story apartment building in downtown Austin.',
    },
  });

  const property2 = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'Sunset Ridge Complex',
      address: '890 Sunset Blvd',
      city: 'Austin',
      state: 'TX',
      zip: '78745',
      description: 'Quiet suburban complex with ample parking.',
    },
  });

  // --- Units ---
  const units = await Promise.all([
    prisma.unit.create({ data: { propertyId: property1.id, name: 'Apt 1A', floor: 1, bedrooms: 1, bathrooms: 1, sqft: 650, rentAmount: 1200, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property1.id, name: 'Apt 2B', floor: 2, bedrooms: 2, bathrooms: 1, sqft: 900, rentAmount: 1450, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property1.id, name: 'Apt 3C', floor: 3, bedrooms: 2, bathrooms: 2, sqft: 1050, rentAmount: 1700, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property1.id, name: 'Apt 1D', floor: 1, bedrooms: 1, bathrooms: 1, sqft: 600, rentAmount: 1150, isOccupied: false } }),
    prisma.unit.create({ data: { propertyId: property2.id, name: 'Unit 5', floor: 1, bedrooms: 3, bathrooms: 2, sqft: 1300, rentAmount: 1800, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property2.id, name: 'Unit 6', floor: 1, bedrooms: 2, bathrooms: 1, sqft: 950, rentAmount: 1500, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property2.id, name: 'Suite 12', floor: 2, bedrooms: 2, bathrooms: 2, sqft: 1100, rentAmount: 1650, isOccupied: true } }),
    prisma.unit.create({ data: { propertyId: property2.id, name: 'Suite 14', floor: 2, bedrooms: 1, bathrooms: 1, sqft: 700, rentAmount: 1250, isOccupied: false } }),
  ]);

  const now = new Date();
  const monthsAgo = (n) => new Date(now.getFullYear(), now.getMonth() - n, 1);
  const monthsFromNow = (n) => new Date(now.getFullYear(), now.getMonth() + n, 1);

  // --- Leases ---
  const leases = await Promise.all([
    prisma.lease.create({ data: { tenantId: tenants[0].id, unitId: units[0].id, startDate: monthsAgo(8), endDate: monthsFromNow(4), monthlyRent: 1200, deposit: 2400, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[1].id, unitId: units[1].id, startDate: monthsAgo(6), endDate: monthsFromNow(6), monthlyRent: 1450, deposit: 2900, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[2].id, unitId: units[2].id, startDate: monthsAgo(12), endDate: monthsFromNow(0), monthlyRent: 1700, deposit: 3400, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[3].id, unitId: units[4].id, startDate: monthsAgo(4), endDate: monthsFromNow(8), monthlyRent: 1800, deposit: 3600, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[4].id, unitId: units[5].id, startDate: monthsAgo(10), endDate: monthsFromNow(2), monthlyRent: 1500, deposit: 3000, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[5].id, unitId: units[6].id, startDate: monthsAgo(3), endDate: monthsFromNow(9), monthlyRent: 1650, deposit: 3300, status: 'ACTIVE' } }),
    prisma.lease.create({ data: { tenantId: tenants[6].id, unitId: units[6].id, startDate: monthsAgo(18), endDate: monthsAgo(2), monthlyRent: 1600, deposit: 3200, status: 'EXPIRED' } }),
  ]);

  // --- Payments ---
  const paymentData = [
    // Alice - all paid
    { leaseId: leases[0].id, tenantId: tenants[0].id, amount: 1200, dueDate: monthsAgo(2), paidDate: monthsAgo(2), status: 'PAID' },
    { leaseId: leases[0].id, tenantId: tenants[0].id, amount: 1200, dueDate: monthsAgo(1), paidDate: monthsAgo(1), status: 'PAID' },
    { leaseId: leases[0].id, tenantId: tenants[0].id, amount: 1200, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: null, status: 'PENDING' },
    // James - paid last month, pending this month
    { leaseId: leases[1].id, tenantId: tenants[1].id, amount: 1450, dueDate: monthsAgo(2), paidDate: monthsAgo(2), status: 'PAID' },
    { leaseId: leases[1].id, tenantId: tenants[1].id, amount: 1450, dueDate: monthsAgo(1), paidDate: monthsAgo(1), status: 'PAID' },
    { leaseId: leases[1].id, tenantId: tenants[1].id, amount: 1450, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: null, status: 'PENDING' },
    // Sophia - overdue
    { leaseId: leases[2].id, tenantId: tenants[2].id, amount: 1700, dueDate: monthsAgo(2), paidDate: monthsAgo(2), status: 'PAID' },
    { leaseId: leases[2].id, tenantId: tenants[2].id, amount: 1700, dueDate: monthsAgo(1), paidDate: null, status: 'OVERDUE' },
    { leaseId: leases[2].id, tenantId: tenants[2].id, amount: 1700, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: null, status: 'OVERDUE' },
    // Derek - paid
    { leaseId: leases[3].id, tenantId: tenants[3].id, amount: 1800, dueDate: monthsAgo(2), paidDate: monthsAgo(2), status: 'PAID' },
    { leaseId: leases[3].id, tenantId: tenants[3].id, amount: 1800, dueDate: monthsAgo(1), paidDate: monthsAgo(1), status: 'PAID' },
    { leaseId: leases[3].id, tenantId: tenants[3].id, amount: 1800, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: new Date(), status: 'PAID' },
    // Priya - partial
    { leaseId: leases[4].id, tenantId: tenants[4].id, amount: 1500, dueDate: monthsAgo(1), paidDate: monthsAgo(1), status: 'PAID' },
    { leaseId: leases[4].id, tenantId: tenants[4].id, amount: 750, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: new Date(), status: 'PARTIAL' },
    // Liam - overdue
    { leaseId: leases[5].id, tenantId: tenants[5].id, amount: 1650, dueDate: monthsAgo(1), paidDate: null, status: 'OVERDUE' },
    { leaseId: leases[5].id, tenantId: tenants[5].id, amount: 1650, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), paidDate: null, status: 'OVERDUE' },
  ];

  for (const p of paymentData) {
    await prisma.payment.create({ data: p });
  }

  // --- Conversations & Messages ---
  const conv1 = await prisma.conversation.create({
    data: {
      subject: 'Rent payment question',
      participants: { create: { tenantId: tenants[0].id } },
    },
  });

  const conv2 = await prisma.conversation.create({
    data: {
      subject: 'Heating issue follow-up',
      participants: { create: { tenantId: tenants[2].id } },
    },
  });

  const conv3 = await prisma.conversation.create({
    data: {
      subject: 'Lease renewal inquiry',
      participants: { create: { tenantId: tenants[4].id } },
    },
  });

  const daysAgo = (n) => new Date(Date.now() - n * 86400000);

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, senderId: tenants[0].userId, body: 'Hi, I wanted to confirm my rent payment for this month was received.', createdAt: daysAgo(5) },
      { conversationId: conv1.id, senderId: landlordUser.id, body: 'Hi Alice! Yes, I can see your payment was processed. Thank you for being prompt!', createdAt: daysAgo(5) },
      { conversationId: conv1.id, senderId: tenants[0].userId, body: 'Great, thank you for confirming!', createdAt: daysAgo(4) },

      { conversationId: conv2.id, senderId: tenants[2].userId, body: 'The heater in my unit stopped working last night. It\'s getting quite cold.', createdAt: daysAgo(3) },
      { conversationId: conv2.id, senderId: landlordUser.id, body: 'I\'m sorry to hear that, Sophia. I\'ll send a technician over tomorrow morning. Does 9am work?', createdAt: daysAgo(3) },
      { conversationId: conv2.id, senderId: tenants[2].userId, body: '9am works perfectly, thank you!', createdAt: daysAgo(2) },
      { conversationId: conv2.id, senderId: landlordUser.id, body: 'The technician confirmed it\'s a faulty thermostat. They\'ll have the part by Thursday.', createdAt: daysAgo(1) },

      { conversationId: conv3.id, senderId: tenants[4].userId, body: 'My lease ends in 2 months. I\'d like to discuss renewing for another year.', createdAt: daysAgo(2) },
      { conversationId: conv3.id, senderId: landlordUser.id, body: 'Hi Priya! Great to hear you\'d like to renew. I can offer a new lease at $1,550/month. Let me know if that works for you.', createdAt: daysAgo(1) },
    ],
  });

  // --- Maintenance Requests ---
  await prisma.maintenanceRequest.createMany({
    data: [
      { tenantId: tenants[2].id, unitId: units[2].id, title: 'Broken heater not producing heat', description: 'The heating unit in the living room stopped working entirely. Temperature is dropping below comfortable levels.', status: 'IN_PROGRESS', priority: 'HIGH', createdAt: daysAgo(3) },
      { tenantId: tenants[0].id, unitId: units[0].id, title: 'Leaking faucet in kitchen', description: 'The kitchen sink faucet has been dripping steadily for about a week. It\'s wasting water and becoming annoying.', status: 'OPEN', priority: 'MEDIUM', createdAt: daysAgo(7) },
      { tenantId: tenants[1].id, unitId: units[1].id, title: 'Flickering bathroom lights', description: 'The lights in the bathroom flicker intermittently. Might need new bulbs or wiring check.', status: 'OPEN', priority: 'LOW', createdAt: daysAgo(10) },
      { tenantId: tenants[3].id, unitId: units[4].id, title: 'Broken window latch in bedroom', description: 'The latch on the master bedroom window is broken and the window won\'t close properly.', status: 'RESOLVED', priority: 'MEDIUM', createdAt: daysAgo(14), resolvedAt: daysAgo(5) },
      { tenantId: tenants[4].id, unitId: units[5].id, title: 'Pest issue in kitchen', description: 'Noticed some small insects near the kitchen cabinet. Requesting pest control inspection.', status: 'OPEN', priority: 'HIGH', createdAt: daysAgo(2) },
      { tenantId: tenants[5].id, unitId: units[6].id, title: 'Clogged bathroom drain', description: 'The shower drain is draining very slowly. Seems to be clogged.', status: 'IN_PROGRESS', priority: 'MEDIUM', createdAt: daysAgo(5) },
    ],
  });

  // --- Notices ---
  await prisma.notice.createMany({
    data: [
      {
        landlordId: landlord.id,
        tenantId: tenants[2].id,
        leaseId: leases[2].id,
        title: 'Late Rent Notice – April 2025',
        body: `Dear Sophia Chen,\n\nThis notice is to inform you that your rent payment of $1,700.00 for the month of April 2025 was due on April 1, 2025 and remains unpaid as of today.\n\nPlease remit payment immediately to avoid further action. If you have already sent payment, please disregard this notice.\n\nSincerely,\nMarcus Reynolds\nReynolds Property Group`,
        status: 'SENT',
        sentAt: daysAgo(10),
      },
      {
        landlordId: landlord.id,
        tenantId: tenants[5].id,
        leaseId: leases[5].id,
        title: 'Late Rent Notice – March & April 2025',
        body: `Dear Liam Nguyen,\n\nThis notice is to inform you that your rent payments for March and April 2025, totaling $3,300.00, remain outstanding.\n\nPlease contact us immediately to discuss a payment arrangement or to submit payment. Continued non-payment may result in formal proceedings.\n\nSincerely,\nMarcus Reynolds\nReynolds Property Group`,
        status: 'SENT',
        sentAt: daysAgo(3),
      },
      {
        landlordId: landlord.id,
        tenantId: tenants[1].id,
        leaseId: leases[1].id,
        title: 'Lease Renewal Reminder – James Park',
        body: `Dear James Park,\n\nThis is a friendly reminder that your current lease for Apt 2B expires in 6 months. We would love to have you continue as a tenant.\n\nPlease let us know if you wish to renew and we will prepare the renewal paperwork.\n\nBest regards,\nMarcus Reynolds`,
        status: 'DRAFT',
        sentAt: null,
      },
    ],
  });

  // --- Activity Log ---
  await prisma.activityLog.createMany({
    data: [
      { landlordId: landlord.id, type: 'PAYMENT', title: 'Payment received', description: 'Derek Hill paid $1,800 for Unit 5', entityId: tenants[3].id, createdAt: daysAgo(0) },
      { landlordId: landlord.id, type: 'MAINTENANCE', title: 'New maintenance request', description: 'Priya Patel submitted a pest issue request', entityId: tenants[4].id, createdAt: daysAgo(2) },
      { landlordId: landlord.id, type: 'NOTICE', title: 'Late notice sent', description: 'Notice sent to Liam Nguyen for overdue rent', entityId: tenants[5].id, createdAt: daysAgo(3) },
      { landlordId: landlord.id, type: 'MESSAGE', title: 'New message received', description: 'Priya Patel inquired about lease renewal', entityId: tenants[4].id, createdAt: daysAgo(2) },
      { landlordId: landlord.id, type: 'MAINTENANCE', title: 'Maintenance resolved', description: 'Broken window latch fixed in Unit 5', entityId: tenants[3].id, createdAt: daysAgo(5) },
      { landlordId: landlord.id, type: 'PAYMENT', title: 'Payment received', description: 'Priya Patel submitted partial payment of $750', entityId: tenants[4].id, createdAt: daysAgo(1) },
      { landlordId: landlord.id, type: 'LEASE', title: 'Lease expiring soon', description: 'Sophia Chen\'s lease expires this month', entityId: tenants[2].id, createdAt: daysAgo(0) },
    ],
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Landlord: landlord@rentora.com / password123');
  console.log('  Tenant:   alice.morgan@email.com / password123');
  console.log('  Tenant:   sophia.chen@email.com / password123 (has overdue rent)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
