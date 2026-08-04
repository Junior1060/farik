/**
 * Demo portfolio fixture.
 *
 * Pure data — no Prisma, no env, no I/O — so it can be unit-tested without a
 * database and so every date derives from the injected `now` instead of being
 * frozen into the file. `prisma/seed.js` is the only thing that turns this into
 * rows; it resolves the string keys below (tenantKey/unitKey/leaseKey) into ids.
 *
 * @typedef {Object} SeedData
 * @property {{email:string, password:string, firstName:string, lastName:string, phone:string, companyName:string}} landlord
 * @property {Array<{key:string, email:string, firstName:string, lastName:string, phone:string}>} tenants
 * @property {Array<{key:string, name:string, address:string, city:string, state:string, zip:string, description:string}>} properties
 * @property {Array<{key:string, propertyKey:string, name:string, floor:number, bedrooms:number, bathrooms:number, sqft:number, rentAmount:number, isOccupied:boolean}>} units
 * @property {Array<{key:string, tenantKey:string, unitKey:string, startDate:Date, endDate:Date, monthlyRent:number, deposit:number, status:string}>} leases
 * @property {Array<{leaseKey:string, tenantKey:string, amount:number, dueDate:Date, paidDate:Date|null, status:string}>} payments
 * @property {Array<{key:string, tenantKey:string, subject:string}>} conversations
 * @property {Array<{conversationKey:string, from:'tenant'|'landlord', body:string, createdAt:Date}>} messages
 * @property {Array<{tenantKey:string, unitKey:string, title:string, description:string, status:string, priority:string, createdAt:Date, resolvedAt?:Date}>} maintenance
 * @property {Array<{tenantKey:string, leaseKey:string, title:string, body:string, status:string, createdAt:Date, sentAt:Date|null}>} notices
 * @property {Array<{type:string, title:string, description:string, tenantKey:string, createdAt:Date}>} activity
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const monthLabel = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const money = (n) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Build the whole demo portfolio relative to `now`, so the dataset never goes
 * stale and no year is ever hardcoded into a title or body.
 *
 * @param {Date} [now]
 * @returns {SeedData}
 */
function buildSeedData(now = new Date()) {
  const monthStart = (offset) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000);

  const thisMonthDue = monthStart(0);
  const lastMonthDue = monthStart(-1);
  const twoMonthsAgoDue = monthStart(-2);

  const landlord = {
    email: 'demo@farik.ca',
    password: 'password123',
    firstName: 'Marcus',
    lastName: 'Reynolds',
    phone: '(306) 555-0100',
    companyName: 'Reynolds Property Group',
  };

  const tenants = [
    { key: 'alice',  email: 'alice.morgan@email.com',  firstName: 'Alice',  lastName: 'Morgan',  phone: '(306) 555-0121' },
    { key: 'james',  email: 'james.park@email.com',    firstName: 'James',  lastName: 'Park',    phone: '(306) 555-0132' },
    { key: 'sophia', email: 'sophia.chen@email.com',   firstName: 'Sophia', lastName: 'Chen',    phone: '(306) 555-0143' },
    { key: 'derek',  email: 'derek.hill@email.com',    firstName: 'Derek',  lastName: 'Hill',    phone: '(306) 555-0154' },
    { key: 'priya',  email: 'priya.patel@email.com',   firstName: 'Priya',  lastName: 'Patel',   phone: '(306) 555-0165' },
    { key: 'liam',   email: 'liam.nguyen@email.com',   firstName: 'Liam',   lastName: 'Nguyen',  phone: '(306) 555-0176' },
    { key: 'mia',    email: 'mia.foster@email.com',    firstName: 'Mia',    lastName: 'Foster',  phone: '(306) 555-0187' },
  ];

  const properties = [
    {
      key: 'maple',
      name: 'Maple Court Apartments',
      address: '142 Maple Street',
      city: 'Saskatoon',
      state: 'SK',
      zip: 'S7K 1J5',
      description: 'Three-storey walk-up a few blocks from the river in Saskatoon.',
    },
    {
      key: 'sunset',
      name: 'Sunset Ridge Complex',
      address: '890 Sunset Boulevard',
      city: 'Regina',
      state: 'SK',
      zip: 'S4P 3Y2',
      description: 'Quiet suburban complex in Regina with ample off-street parking.',
    },
  ];

  // Occupancy is derived from the lease list below, so the two can never drift.
  const units = [
    { key: 'apt1a',    propertyKey: 'maple',  name: 'Apt 1A',   floor: 1, bedrooms: 1, bathrooms: 1, sqft: 650,  rentAmount: 1200 },
    { key: 'apt2b',    propertyKey: 'maple',  name: 'Apt 2B',   floor: 2, bedrooms: 2, bathrooms: 1, sqft: 900,  rentAmount: 1450 },
    { key: 'apt3c',    propertyKey: 'maple',  name: 'Apt 3C',   floor: 3, bedrooms: 2, bathrooms: 2, sqft: 1050, rentAmount: 1700 },
    { key: 'apt1d',    propertyKey: 'maple',  name: 'Apt 1D',   floor: 1, bedrooms: 1, bathrooms: 1, sqft: 600,  rentAmount: 1150 },
    { key: 'unit5',    propertyKey: 'sunset', name: 'Unit 5',   floor: 1, bedrooms: 3, bathrooms: 2, sqft: 1300, rentAmount: 1800 },
    { key: 'unit6',    propertyKey: 'sunset', name: 'Unit 6',   floor: 1, bedrooms: 2, bathrooms: 1, sqft: 950,  rentAmount: 1500 },
    { key: 'suite12',  propertyKey: 'sunset', name: 'Suite 12', floor: 2, bedrooms: 2, bathrooms: 2, sqft: 1100, rentAmount: 1650 },
    { key: 'suite14',  propertyKey: 'sunset', name: 'Suite 14', floor: 2, bedrooms: 1, bathrooms: 1, sqft: 700,  rentAmount: 1250 },
    { key: 'suite16',  propertyKey: 'sunset', name: 'Suite 16', floor: 2, bedrooms: 2, bathrooms: 1, sqft: 980,  rentAmount: 1550 },
  ];

  const leases = [
    { key: 'lease-alice',  tenantKey: 'alice',  unitKey: 'apt1a',   startDate: monthStart(-8),  endDate: monthStart(4),  monthlyRent: 1200, deposit: 2400, status: 'ACTIVE' },
    { key: 'lease-james',  tenantKey: 'james',  unitKey: 'apt2b',   startDate: monthStart(-6),  endDate: monthStart(6),  monthlyRent: 1450, deposit: 2900, status: 'ACTIVE' },
    { key: 'lease-sophia', tenantKey: 'sophia', unitKey: 'apt3c',   startDate: monthStart(-12), endDate: monthStart(1),  monthlyRent: 1700, deposit: 3400, status: 'ACTIVE' },
    { key: 'lease-derek',  tenantKey: 'derek',  unitKey: 'unit5',   startDate: monthStart(-4),  endDate: monthStart(8),  monthlyRent: 1800, deposit: 3600, status: 'ACTIVE' },
    { key: 'lease-priya',  tenantKey: 'priya',  unitKey: 'unit6',   startDate: monthStart(-10), endDate: monthStart(2),  monthlyRent: 1500, deposit: 3000, status: 'ACTIVE' },
    { key: 'lease-liam',   tenantKey: 'liam',   unitKey: 'suite12', startDate: monthStart(-3),  endDate: monthStart(9),  monthlyRent: 1650, deposit: 3300, status: 'ACTIVE' },
    // Mia moved out. Her unit is Suite 14, NOT Suite 12 — Liam holds the only
    // active lease on Suite 12, and no two active leases may share a unit.
    { key: 'lease-mia',    tenantKey: 'mia',    unitKey: 'suite14', startDate: monthStart(-18), endDate: monthStart(-2), monthlyRent: 1250, deposit: 2500, status: 'EXPIRED' },
  ];

  const occupiedUnits = new Set(leases.filter((l) => l.status === 'ACTIVE').map((l) => l.unitKey));
  const unitsWithOccupancy = units.map((u) => ({ ...u, isOccupied: occupiedUnits.has(u.key) }));

  // Every payment amount matches its lease's monthlyRent, except the one row
  // explicitly modelling a partial payment.
  const payments = [
    // Alice — fully paid, next month pending
    { leaseKey: 'lease-alice', tenantKey: 'alice', amount: 1200, dueDate: lastMonthDue, paidDate: lastMonthDue, status: 'PAID' },
    { leaseKey: 'lease-alice', tenantKey: 'alice', amount: 1200, dueDate: thisMonthDue, paidDate: thisMonthDue, status: 'PAID' },
    { leaseKey: 'lease-alice', tenantKey: 'alice', amount: 1200, dueDate: monthStart(1), paidDate: null, status: 'PENDING' },
    // James — this month still outstanding but not yet late
    { leaseKey: 'lease-james', tenantKey: 'james', amount: 1450, dueDate: twoMonthsAgoDue, paidDate: twoMonthsAgoDue, status: 'PAID' },
    { leaseKey: 'lease-james', tenantKey: 'james', amount: 1450, dueDate: lastMonthDue, paidDate: lastMonthDue, status: 'PAID' },
    { leaseKey: 'lease-james', tenantKey: 'james', amount: 1450, dueDate: thisMonthDue, paidDate: null, status: 'PENDING' },
    // Sophia — one month overdue
    { leaseKey: 'lease-sophia', tenantKey: 'sophia', amount: 1700, dueDate: twoMonthsAgoDue, paidDate: twoMonthsAgoDue, status: 'PAID' },
    { leaseKey: 'lease-sophia', tenantKey: 'sophia', amount: 1700, dueDate: lastMonthDue, paidDate: null, status: 'OVERDUE' },
    // Derek — up to date
    { leaseKey: 'lease-derek', tenantKey: 'derek', amount: 1800, dueDate: twoMonthsAgoDue, paidDate: twoMonthsAgoDue, status: 'PAID' },
    { leaseKey: 'lease-derek', tenantKey: 'derek', amount: 1800, dueDate: lastMonthDue, paidDate: lastMonthDue, status: 'PAID' },
    { leaseKey: 'lease-derek', tenantKey: 'derek', amount: 1800, dueDate: thisMonthDue, paidDate: daysAgo(2), status: 'PAID' },
    // Priya — half of this month paid
    { leaseKey: 'lease-priya', tenantKey: 'priya', amount: 1500, dueDate: lastMonthDue, paidDate: lastMonthDue, status: 'PAID' },
    { leaseKey: 'lease-priya', tenantKey: 'priya', amount: 750, dueDate: thisMonthDue, paidDate: daysAgo(1), status: 'PARTIAL', isPartial: true },
    // Liam — one month overdue
    { leaseKey: 'lease-liam', tenantKey: 'liam', amount: 1650, dueDate: lastMonthDue, paidDate: null, status: 'OVERDUE' },
  ];

  const conversations = [
    { key: 'conv-alice',  tenantKey: 'alice',  subject: 'Rent payment question' },
    { key: 'conv-sophia', tenantKey: 'sophia', subject: 'Heating issue follow-up' },
    { key: 'conv-priya',  tenantKey: 'priya',  subject: 'Lease renewal inquiry' },
  ];

  const messages = [
    { conversationKey: 'conv-alice', from: 'tenant',   body: 'Hi, I wanted to confirm my rent payment for this month was received.', createdAt: daysAgo(5) },
    { conversationKey: 'conv-alice', from: 'landlord', body: 'Hi Alice! Yes, your payment came through. Thanks for being prompt.', createdAt: daysAgo(5) },
    { conversationKey: 'conv-alice', from: 'tenant',   body: 'Great, thank you for confirming!', createdAt: daysAgo(4) },

    { conversationKey: 'conv-sophia', from: 'tenant',   body: 'The heater in my unit stopped working last night. It is getting quite cold.', createdAt: daysAgo(3) },
    { conversationKey: 'conv-sophia', from: 'landlord', body: 'Sorry to hear that, Sophia. I will send a technician tomorrow morning. Does 9am work?', createdAt: daysAgo(3) },
    { conversationKey: 'conv-sophia', from: 'tenant',   body: '9am works perfectly, thank you!', createdAt: daysAgo(2) },
    { conversationKey: 'conv-sophia', from: 'landlord', body: 'The technician confirmed a faulty thermostat. The part arrives Thursday.', createdAt: daysAgo(1) },

    { conversationKey: 'conv-priya', from: 'tenant',   body: 'My lease ends in a couple of months. I would like to discuss renewing for another year.', createdAt: daysAgo(2) },
    { conversationKey: 'conv-priya', from: 'landlord', body: 'Hi Priya! Glad to hear it. I can offer a renewal at $1,550/month — let me know if that works.', createdAt: daysAgo(1) },
  ];

  const maintenance = [
    { tenantKey: 'sophia', unitKey: 'apt3c',   title: 'Heater not producing heat',        description: 'The heating unit in the living room stopped working entirely.',                 status: 'IN_PROGRESS', priority: 'HIGH',   createdAt: daysAgo(3) },
    { tenantKey: 'alice',  unitKey: 'apt1a',   title: 'Leaking kitchen faucet',           description: 'The kitchen sink faucet has been dripping steadily for about a week.',           status: 'OPEN',        priority: 'MEDIUM', createdAt: daysAgo(7) },
    { tenantKey: 'james',  unitKey: 'apt2b',   title: 'Flickering bathroom lights',       description: 'The bathroom lights flicker intermittently. May need bulbs or a wiring check.',  status: 'OPEN',        priority: 'LOW',    createdAt: daysAgo(10) },
    { tenantKey: 'derek',  unitKey: 'unit5',   title: 'Broken bedroom window latch',      description: 'The latch on the primary bedroom window is broken and will not close properly.', status: 'RESOLVED',    priority: 'MEDIUM', createdAt: daysAgo(14), resolvedAt: daysAgo(5) },
    { tenantKey: 'priya',  unitKey: 'unit6',   title: 'Pest issue in kitchen',            description: 'Small insects near the kitchen cabinet. Requesting a pest control inspection.',  status: 'OPEN',        priority: 'HIGH',   createdAt: daysAgo(2) },
    { tenantKey: 'liam',   unitKey: 'suite12', title: 'Slow-draining shower',             description: 'The shower drain is draining very slowly and seems to be clogged.',              status: 'IN_PROGRESS', priority: 'MEDIUM', createdAt: daysAgo(5) },
  ];

  // Titles and bodies derive from the payment they reference, so a notice can
  // never claim a month that does not match its own dates.
  const sophiaOverdue = payments.find((p) => p.tenantKey === 'sophia' && p.status === 'OVERDUE');
  const liamOverdue = payments.find((p) => p.tenantKey === 'liam' && p.status === 'OVERDUE');
  const jamesLease = leases.find((l) => l.key === 'lease-james');

  const notices = [
    {
      tenantKey: 'sophia',
      leaseKey: 'lease-sophia',
      title: `Late rent notice — ${monthLabel(sophiaOverdue.dueDate)}`,
      body: `Dear Sophia Chen,\n\nOur records show that rent of ${money(sophiaOverdue.amount)} for ${monthLabel(sophiaOverdue.dueDate)}, due on ${sophiaOverdue.dueDate.toDateString()}, remains unpaid.\n\nPlease arrange payment or contact us to discuss an arrangement. If you have already paid, please disregard this notice and send us confirmation.\n\nSincerely,\nMarcus Reynolds\nReynolds Property Group`,
      status: 'SENT',
      createdAt: daysAgo(11),
      sentAt: daysAgo(10),
    },
    {
      tenantKey: 'liam',
      leaseKey: 'lease-liam',
      title: `Late rent notice — ${monthLabel(liamOverdue.dueDate)}`,
      body: `Dear Liam Nguyen,\n\nOur records show an outstanding balance of ${money(liamOverdue.amount)} for ${monthLabel(liamOverdue.dueDate)}.\n\nPlease contact us to arrange payment or to discuss a payment plan.\n\nSincerely,\nMarcus Reynolds\nReynolds Property Group`,
      status: 'SENT',
      createdAt: daysAgo(4),
      sentAt: daysAgo(3),
    },
    {
      tenantKey: 'james',
      leaseKey: 'lease-james',
      title: `Lease renewal notice — ${monthLabel(jamesLease.endDate)}`,
      body: `Dear James Park,\n\nYour lease for Apt 2B ends on ${jamesLease.endDate.toDateString()}. We would be glad to have you stay.\n\nLet us know whether you would like to renew and we will prepare the paperwork.\n\nBest regards,\nMarcus Reynolds`,
      status: 'DRAFT',
      createdAt: daysAgo(2),
      sentAt: null,
    },
  ];

  const activity = [
    { type: 'PAYMENT',     title: 'Payment received',        description: 'Derek Hill paid $1,800 for Unit 5',                    tenantKey: 'derek',  createdAt: daysAgo(2) },
    { type: 'PAYMENT',     title: 'Partial payment received', description: 'Priya Patel submitted a partial payment of $750',      tenantKey: 'priya',  createdAt: daysAgo(1) },
    { type: 'MAINTENANCE', title: 'New maintenance request', description: 'Priya Patel reported a pest issue',                     tenantKey: 'priya',  createdAt: daysAgo(2) },
    { type: 'MAINTENANCE', title: 'Maintenance resolved',    description: 'Broken window latch fixed in Unit 5',                   tenantKey: 'derek',  createdAt: daysAgo(5) },
    { type: 'NOTICE',      title: 'Late notice recorded',    description: 'Late rent notice recorded for Liam Nguyen',             tenantKey: 'liam',   createdAt: daysAgo(3) },
    { type: 'MESSAGE',     title: 'New message received',    description: 'Priya Patel asked about renewing her lease',            tenantKey: 'priya',  createdAt: daysAgo(2) },
    { type: 'LEASE',       title: 'Lease expiring soon',     description: "Sophia Chen's lease ends next month",                   tenantKey: 'sophia', createdAt: daysAgo(1) },
  ];

  return {
    now,
    landlord,
    tenants,
    properties,
    units: unitsWithOccupancy,
    leases,
    payments,
    conversations,
    messages,
    maintenance,
    notices,
    activity,
  };
}

module.exports = { buildSeedData, monthLabel };
