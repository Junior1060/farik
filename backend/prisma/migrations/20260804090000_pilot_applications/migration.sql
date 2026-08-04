-- CreateEnum
CREATE TYPE "PilotApplicationStatus" AS ENUM ('NEW', 'CONTACTED', 'CALL_BOOKED', 'PILOT_ACCEPTED', 'PILOT_DECLINED');

-- CreateEnum
CREATE TYPE "PreferredContactMethod" AS ENUM ('EMAIL', 'PHONE', 'TEXT');

-- CreateTable
CREATE TABLE "pilot_applications" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "unitsManaged" INTEGER NOT NULL,
    "companyName" TEXT,
    "currentManagementMethod" TEXT,
    "biggestProblem" TEXT NOT NULL,
    "preferredContactMethod" "PreferredContactMethod" NOT NULL,
    "additionalNotes" TEXT,
    "status" "PilotApplicationStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'website',
    "internalNotes" TEXT,
    "bookedCallAt" TIMESTAMP(3),
    "bookingReference" TEXT,
    "submitterIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pilot_applications_email_idx" ON "pilot_applications"("email");

-- CreateIndex
CREATE INDEX "pilot_applications_status_createdAt_idx" ON "pilot_applications"("status", "createdAt");
