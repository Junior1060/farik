-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('AI', 'LANDLORD', 'TENANT', 'VENDOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('MAINTENANCE', 'RENT', 'LEASE');

-- CreateEnum
CREATE TYPE "MaintenanceWorkflowState" AS ENUM ('INTAKE_RECEIVED', 'DIAGNOSTIC_QUESTIONS_SENT', 'DIAGNOSTIC_RESPONSE_RECEIVED', 'TRIAGED', 'EMERGENCY_ESCALATED', 'AWAITING_LANDLORD_APPROVAL', 'APPROVED', 'VENDOR_SELECTION', 'VENDOR_CONTACT_ATTEMPTED', 'VENDOR_CONTACT_FAILED', 'VENDOR_CONFIRMED', 'VENDOR_DECLINED', 'APPOINTMENT_PROPOSED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED_PENDING_INVOICE', 'INVOICE_RECEIVED', 'INVOICE_EXTRACTED', 'INVOICE_APPROVED', 'INVOICE_DISPUTED', 'RESOLVED', 'CANCELLED', 'ESCALATED_MANUAL');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "VendorContactStatus" AS ENUM ('SENT', 'DELIVERED', 'NO_RESPONSE', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InvoiceApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- AlterTable
ALTER TABLE "agent_logs" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "policyDomain" "PolicyDomain",
ADD COLUMN     "trustLevelApplied" "TrustLevel";

-- AlterTable
ALTER TABLE "tenant_profiles" ADD COLUMN     "smsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsConsentAt" TIMESTAMP(3),
ADD COLUMN     "smsOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "avgResponseMinutes" INTEGER,
ADD COLUMN     "contactPreference" TEXT NOT NULL DEFAULT 'SMS',
ADD COLUMN     "isPreferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rating" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "maintenance_workflows" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "state" "MaintenanceWorkflowState" NOT NULL DEFAULT 'INTAKE_RECEIVED',
    "category" TEXT,
    "urgency" TEXT,
    "diagnosticAnswers" JSONB,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "workflowType" "WorkflowType" NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contact_attempts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "maintenanceWorkflowId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'SMS',
    "status" "VendorContactStatus" NOT NULL DEFAULT 'SENT',
    "attemptNumber" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_contact_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "proposedTimes" JSONB,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_invoices" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "vendorId" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "extracted" JSONB,
    "extractedAmount" DOUBLE PRECISION,
    "approvalStatus" "InvoiceApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "relatedWorkflowType" "WorkflowType",
    "relatedWorkflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_workflows_maintenanceRequestId_key" ON "maintenance_workflows"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "workflow_events_workflowType_workflowId_idx" ON "workflow_events"("workflowType", "workflowId");

-- CreateIndex
CREATE INDEX "vendor_contact_attempts_maintenanceWorkflowId_idx" ON "vendor_contact_attempts"("maintenanceWorkflowId");

-- CreateIndex
CREATE INDEX "sms_messages_phoneNumber_idx" ON "sms_messages"("phoneNumber");

-- AddForeignKey
ALTER TABLE "maintenance_workflows" ADD CONSTRAINT "maintenance_workflows_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contact_attempts" ADD CONSTRAINT "vendor_contact_attempts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_invoices" ADD CONSTRAINT "maintenance_invoices_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_invoices" ADD CONSTRAINT "maintenance_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
