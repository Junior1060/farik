-- AlterEnum
-- A cancelled repair and a successfully resolved repair are semantically different
-- and must stay different for the whole lifecycle, so CANCELLED is its own value
-- rather than being folded into RESOLVED.
--
-- PostgreSQL 12+ permits ALTER TYPE ... ADD VALUE inside a transaction block as long
-- as the new value is not *used* in that same transaction. This migration only adds
-- the value; nothing here reads or writes it, so it is safe under `migrate deploy`.
ALTER TYPE "MaintenanceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
-- Records how SMS consent was obtained, so it can be audited later:
-- SMS_REPLY_START | SMS_DOUBLE_OPT_IN | TENANT_PORTAL | LANDLORD_ATTESTED.
-- Nullable with no default and no backfill: existing rows keep smsConsent = false
-- and are untouched. Consent is never granted by a migration.
ALTER TABLE "tenant_profiles" ADD COLUMN "smsConsentSource" TEXT;
