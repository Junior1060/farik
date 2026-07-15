-- CreateEnum
CREATE TYPE "PolicyDomain" AS ENUM ('MAINTENANCE', 'RENT', 'LEASE', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('OBSERVE', 'DRAFT', 'EXECUTE_WITH_APPROVAL', 'OPERATE_WITHIN_POLICY', 'EMERGENCY_ESCALATION');

-- CreateTable
CREATE TABLE "agent_policy_defaults" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "domain" "PolicyDomain" NOT NULL,
    "trustLevel" "TrustLevel" NOT NULL DEFAULT 'OBSERVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_policy_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_policy_overrides" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "domain" "PolicyDomain" NOT NULL,
    "trustLevel" "TrustLevel" NOT NULL DEFAULT 'OBSERVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_policy_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_policy_defaults_landlordId_domain_key" ON "agent_policy_defaults"("landlordId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "agent_policy_overrides_landlordId_propertyId_domain_key" ON "agent_policy_overrides"("landlordId", "propertyId", "domain");

-- AddForeignKey
ALTER TABLE "agent_policy_defaults" ADD CONSTRAINT "agent_policy_defaults_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlord_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_policy_overrides" ADD CONSTRAINT "agent_policy_overrides_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlord_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_policy_overrides" ADD CONSTRAINT "agent_policy_overrides_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
