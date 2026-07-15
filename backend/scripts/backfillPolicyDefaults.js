// One-time backfill: converts each landlord's legacy AgentConfig booleans into
// AgentPolicyDefault rows, so the new policy engine reproduces today's behavior
// exactly until a landlord edits a policy. Safe to re-run (upsert, idempotent).
const prisma = require('../src/lib/prisma');

async function run() {
  const configs = await prisma.agentConfig.findMany();
  let created = 0;

  for (const config of configs) {
    const domainToLevel = {
      MAINTENANCE: config.autoMaintenance ? 'OPERATE_WITHIN_POLICY' : 'OBSERVE',
      RENT: config.autoRentReminders ? 'OPERATE_WITHIN_POLICY' : 'OBSERVE',
      LEASE: config.autoLeaseRenewal ? 'DRAFT' : 'OBSERVE', // lease renewal was never fully autonomous pre-policy-engine
      COMMUNICATION: config.autoMessages ? 'OPERATE_WITHIN_POLICY' : 'OBSERVE',
    };

    for (const [domain, trustLevel] of Object.entries(domainToLevel)) {
      await prisma.agentPolicyDefault.upsert({
        where: { landlordId_domain: { landlordId: config.landlordId, domain } },
        update: {}, // never overwrite a landlord who already configured a policy explicitly
        create: { landlordId: config.landlordId, domain, trustLevel, settings: {} },
      });
      created += 1;
    }
  }

  console.log(`[Backfill] Processed ${configs.length} landlord configs -> ${created} policy default rows ensured.`);
}

run()
  .catch((err) => {
    console.error('[Backfill] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
