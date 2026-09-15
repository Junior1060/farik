-- AlterTable
-- Optional category a landlord picks while creating a property during onboarding
-- ("Single-family home", "Duplex", ...). Nullable, no backfill: existing rows are untouched.
ALTER TABLE "properties" ADD COLUMN "propertyType" TEXT;

-- AlterTable
-- Tenant accounts that a landlord creates ahead of time (Add tenant / import) get a
-- random placeholder password. invitePending marks them so the tenant's own first
-- sign-up with the same email claims the account instead of being refused as a
-- duplicate. Existing rows default to false, so nothing already registered becomes
-- claimable.
ALTER TABLE "users" ADD COLUMN "invitePending" BOOLEAN NOT NULL DEFAULT false;
