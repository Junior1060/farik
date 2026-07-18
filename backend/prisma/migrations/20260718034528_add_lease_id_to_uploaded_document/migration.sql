-- AlterTable
ALTER TABLE "uploaded_documents" ADD COLUMN     "leaseId" TEXT;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
