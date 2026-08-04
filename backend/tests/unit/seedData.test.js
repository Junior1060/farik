const { buildSeedData, monthLabel } = require('../../prisma/seedData');

const NOW = new Date(2026, 7, 4); // 4 Aug 2026
const data = buildSeedData(NOW);

const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));
const units = byKey(data.units);
const leases = byKey(data.leases);
const tenants = byKey(data.tenants);

describe('demo portfolio — units and leases agree', () => {
  it('no two active leases share a unit', () => {
    const active = data.leases.filter((l) => l.status === 'ACTIVE').map((l) => l.unitKey);
    expect(new Set(active).size).toBe(active.length);
  });

  it('a unit is marked occupied exactly when an active lease covers it', () => {
    const activeUnits = new Set(data.leases.filter((l) => l.status === 'ACTIVE').map((l) => l.unitKey));
    for (const unit of data.units) {
      expect(unit.isOccupied).toBe(activeUnits.has(unit.key));
    }
    expect(data.units.filter((u) => u.isOccupied)).toHaveLength(activeUnits.size);
  });

  it('every lease points at a real tenant and a real unit', () => {
    for (const lease of data.leases) {
      expect(tenants[lease.tenantKey]).toBeDefined();
      expect(units[lease.unitKey]).toBeDefined();
    }
  });

  it('active leases cover today', () => {
    for (const lease of data.leases.filter((l) => l.status === 'ACTIVE')) {
      expect(lease.startDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(lease.endDate.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('expired leases have already ended', () => {
    for (const lease of data.leases.filter((l) => l.status === 'EXPIRED')) {
      expect(lease.endDate.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it('lease rent matches the unit rent', () => {
    for (const lease of data.leases.filter((l) => l.status === 'ACTIVE')) {
      expect(lease.monthlyRent).toBe(units[lease.unitKey].rentAmount);
    }
  });

  it('keeps the documented sample portfolio', () => {
    const expected = [
      ['alice', 'apt1a', 1200], ['james', 'apt2b', 1450],
      ['sophia', 'apt3c', 1700], ['liam', 'suite12', 1650],
    ];
    for (const [tenantKey, unitKey, rent] of expected) {
      const lease = data.leases.find((l) => l.tenantKey === tenantKey && l.status === 'ACTIVE');
      expect(lease.unitKey).toBe(unitKey);
      expect(lease.monthlyRent).toBe(rent);
      expect(units[unitKey].rentAmount).toBe(rent);
    }
  });
});

describe('demo portfolio — payments', () => {
  it('every payment belongs to the tenant on its own lease', () => {
    for (const p of data.payments) {
      expect(leases[p.leaseKey].tenantKey).toBe(p.tenantKey);
    }
  });

  it('payment amounts equal the lease rent unless explicitly partial', () => {
    for (const p of data.payments.filter((x) => !x.isPartial)) {
      expect(p.amount).toBe(leases[p.leaseKey].monthlyRent);
    }
    const partial = data.payments.filter((p) => p.isPartial);
    expect(partial).toHaveLength(1);
    expect(partial[0].amount).toBeLessThan(leases[partial[0].leaseKey].monthlyRent);
    expect(partial[0].status).toBe('PARTIAL');
  });

  it('a paid payment has a paid date and an unpaid one does not', () => {
    for (const p of data.payments) {
      if (p.status === 'PAID' || p.status === 'PARTIAL') expect(p.paidDate).toBeInstanceOf(Date);
      else expect(p.paidDate).toBeNull();
    }
  });

  it('no payment is marked paid in the future, and overdue ones are actually past due', () => {
    for (const p of data.payments) {
      if (p.paidDate) expect(p.paidDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (p.status === 'OVERDUE') expect(p.dueDate.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it('the overdue set is exactly Sophia at $1,700 and Liam at $1,650', () => {
    const overdue = data.payments
      .filter((p) => p.status === 'OVERDUE')
      .map((p) => [p.tenantKey, p.amount])
      .sort();
    expect(overdue).toEqual([['liam', 1650], ['sophia', 1700]]);
  });
});

describe('demo portfolio — notices', () => {
  it('drafts have no sent date and recorded notices do', () => {
    for (const n of data.notices) {
      if (n.status === 'DRAFT') expect(n.sentAt).toBeNull();
      else expect(n.sentAt).toBeInstanceOf(Date);
    }
  });

  it('a notice is never sent before it was created, or after today', () => {
    for (const n of data.notices) {
      expect(n.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (n.sentAt) {
        expect(n.sentAt.getTime()).toBeGreaterThanOrEqual(n.createdAt.getTime());
        expect(n.sentAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    }
  });

  it('only DRAFT and SENT are used — no status the app cannot reach', () => {
    for (const n of data.notices) expect(['DRAFT', 'SENT']).toContain(n.status);
  });

  it('a late rent notice names the month of the payment it is about', () => {
    const sophiaOverdue = data.payments.find((p) => p.tenantKey === 'sophia' && p.status === 'OVERDUE');
    const notice = data.notices.find((n) => n.tenantKey === 'sophia');
    expect(notice.title).toContain(monthLabel(sophiaOverdue.dueDate));
    expect(notice.body).toContain(monthLabel(sophiaOverdue.dueDate));
  });

  it('notice text contains no hardcoded year — it moves with the dataset', () => {
    const later = buildSeedData(new Date(2027, 0, 15));
    const titlesNow = data.notices.map((n) => n.title);
    const titlesLater = later.notices.map((n) => n.title);
    expect(titlesLater).not.toEqual(titlesNow);
    for (const n of later.notices) {
      expect(n.title).not.toMatch(/\b20(2[0-5])\b/); // no stale year survives
    }
  });

  it('every notice points at the lease of the tenant it addresses', () => {
    for (const n of data.notices) {
      expect(leases[n.leaseKey].tenantKey).toBe(n.tenantKey);
    }
  });
});

describe('demo portfolio — identity and location', () => {
  it('is a Saskatchewan portfolio, matching the marketing copy', () => {
    for (const p of data.properties) {
      expect(p.state).toBe('SK');
      expect(['Saskatoon', 'Regina']).toContain(p.city);
      expect(p.description).not.toMatch(/austin|texas/i);
    }
  });

  it('has one landlord account and seven distinct tenants', () => {
    expect(data.landlord.email).toBe('demo@farik.ca');
    expect(data.tenants).toHaveLength(7);
    expect(new Set(data.tenants.map((t) => t.email)).size).toBe(7);
    expect(data.tenants.map((t) => t.email)).not.toContain(data.landlord.email);
  });

  it('links every maintenance request to the tenant who actually leases that unit', () => {
    for (const m of data.maintenance) {
      const lease = data.leases.find((l) => l.tenantKey === m.tenantKey && l.unitKey === m.unitKey);
      expect(lease).toBeDefined();
    }
  });

  it('resolves maintenance only after it was reported, and never in the future', () => {
    for (const m of data.maintenance) {
      expect(m.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (m.resolvedAt) expect(m.resolvedAt.getTime()).toBeGreaterThan(m.createdAt.getTime());
      if (m.status === 'RESOLVED') expect(m.resolvedAt).toBeInstanceOf(Date);
    }
  });

  it('dates every message and activity entry in the past', () => {
    for (const row of [...data.messages, ...data.activity]) {
      expect(row.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });
});
