-- Farik is self-serve: the Founding Landlord Pilot intake (public form, admin
-- inbox, and this table) has been removed from the product. No runtime code has
-- referenced the table since 20260915000000_self_serve_onboarding.
--
-- This drops any stored pilot applications. The table was verified empty on the
-- development database before this migration was written.

-- DropTable
DROP TABLE IF EXISTS "pilot_applications";

-- DropEnum
DROP TYPE IF EXISTS "PilotApplicationStatus";

-- DropEnum
DROP TYPE IF EXISTS "PreferredContactMethod";
