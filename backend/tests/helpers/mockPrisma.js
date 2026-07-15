// Builds a fresh jest.fn()-based mock of every Prisma method used by agentService.js.
function createMockPrisma() {
  return {
    agentConfig: { findUnique: jest.fn(), create: jest.fn() },
    agentLog: { create: jest.fn(), findFirst: jest.fn() },
    unit: { findUnique: jest.fn() },
    vendor: { findFirst: jest.fn() },
    maintenanceRequest: { update: jest.fn(), findUnique: jest.fn() },
    conversation: { findUnique: jest.fn(), update: jest.fn() },
    message: { create: jest.fn() },
    payment: { findFirst: jest.fn(), update: jest.fn() },
    notice: { findFirst: jest.fn(), create: jest.fn() },
    lease: { findMany: jest.fn() },
    landlordProfile: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
    agentPolicyOverride: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    agentPolicyDefault: { findUnique: jest.fn(), upsert: jest.fn() },
  };
}

module.exports = { createMockPrisma };
