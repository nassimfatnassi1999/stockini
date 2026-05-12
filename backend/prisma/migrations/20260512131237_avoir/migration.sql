-- DropForeignKey
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_invoiceId_fkey";

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
