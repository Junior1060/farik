-- Additive only. Nothing here touches existing rows or the legacy pilot table.

-- CreateEnum
-- Category a landlord picks while creating a property during onboarding.
CREATE TYPE "PropertyType" AS ENUM ('SINGLE_FAMILY', 'MULTI_FAMILY', 'CONDO', 'TOWNHOUSE', 'OTHER');

-- CreateEnum
-- Account lifecycle. INVITED = a landlord (or an import) created the record with a
-- random placeholder password; the tenant activates it by signing up with the same
-- email. ACTIVE = the person has set their own password.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INVITED');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "propertyType" "PropertyType";

-- AlterTable
-- Existing rows default to ACTIVE, so nothing already registered becomes claimable.
ALTER TABLE "users" ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
