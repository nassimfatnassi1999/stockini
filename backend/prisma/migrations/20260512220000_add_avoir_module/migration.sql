-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('CREATED', 'REFUNDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'AVOIR';

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'CREDIT_NOTE_REFUND';

-- AlterTable: make invoiceId optional on GeneratedDocument, add creditNoteId
ALTER TABLE "GeneratedDocument" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "GeneratedDocument" ADD COLUMN "creditNoteId" TEXT;

-- AlterTable: add creditNoteId to Payment
ALTER TABLE "Payment" ADD COLUMN "creditNoteId" TEXT;

-- CreateTable: CreditNote
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT,
    "dateAvoir" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,3) NOT NULL,
    "tax" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,3) NOT NULL,
    "montantRembourse" DECIMAL(12,3) NOT NULL,
    "motif" TEXT,
    "statut" "CreditNoteStatus" NOT NULL DEFAULT 'CREATED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CreditNoteItem
CREATE TABLE "CreditNoteItem" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "saleItemId" TEXT,
    "productId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "quantiteRetournee" INTEGER NOT NULL,
    "prixUnitaireHt" DECIMAL(12,3) NOT NULL,
    "tva" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "totalHt" DECIMAL(12,3) NOT NULL,
    "totalTtc" DECIMAL(12,3) NOT NULL,
    "motifLigne" TEXT,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_numero_key" ON "CreditNote"("numero");
CREATE INDEX "CreditNote_saleId_idx" ON "CreditNote"("saleId");
CREATE INDEX "CreditNote_customerId_idx" ON "CreditNote"("customerId");
CREATE INDEX "CreditNote_createdById_idx" ON "CreditNote"("createdById");
CREATE INDEX "CreditNote_createdAt_idx" ON "CreditNote"("createdAt");
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");
CREATE INDEX "CreditNoteItem_productId_idx" ON "CreditNoteItem"("productId");
CREATE INDEX "CreditNoteItem_saleItemId_idx" ON "CreditNoteItem"("saleItemId");
CREATE INDEX "GeneratedDocument_creditNoteId_idx" ON "GeneratedDocument"("creditNoteId");
CREATE INDEX "Payment_creditNoteId_idx" ON "Payment"("creditNoteId");

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Change GeneratedDocument.invoiceId FK from RESTRICT to SET NULL (now that invoiceId is nullable)
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_invoiceId_fkey";
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
