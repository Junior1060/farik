-- The Founding Landlord Pilot intake is retired: Farik is self-serve now and the
-- public application form, admin inbox, and this table have all been removed.
--
-- DESTRUCTIVE: this drops any stored pilot applications. If you still want those
-- leads, export the table before deploying this migration:
--   psql "$DATABASE_URL" -c '\copy pilot_applications to pilot_applications.csv csv header'

-- DropTable
DROP TABLE IF EXISTS "pilot_applications";

-- DropEnum
DROP TYPE IF EXISTS "PilotApplicationStatus";

-- DropEnum
DROP TYPE IF EXISTS "PreferredContactMethod";
