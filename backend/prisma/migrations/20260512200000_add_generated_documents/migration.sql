-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEVIS', 'BON_COMMANDE', 'BON_LIVRAISON', 'FACTURE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "minioBucket" TEXT NOT NULL,
    "minioObjectKey" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_documentNumber_key" ON "GeneratedDocument"("documentNumber");

-- CreateIndex
CREATE INDEX "GeneratedDocument_invoiceId_idx" ON "GeneratedDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_clientId_idx" ON "GeneratedDocument"("clientId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_generatedAt_idx" ON "GeneratedDocument"("generatedAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_emailStatus_idx" ON "GeneratedDocument"("emailStatus");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
