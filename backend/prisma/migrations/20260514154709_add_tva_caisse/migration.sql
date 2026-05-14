-- CreateEnum
CREATE TYPE "CaisseMovementType" AS ENUM ('ENCAISSEMENT_VENTE', 'DECAISSEMENT_ACHAT', 'DEPOT_MANUEL', 'RETRAIT_MANUEL', 'ANNULATION_VENTE', 'ANNULATION_ACHAT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "tva" DECIMAL(5,2) NOT NULL DEFAULT 19;

-- CreateTable
CREATE TABLE "CaisseMovement" (
    "id" TEXT NOT NULL,
    "type" "CaisseMovementType" NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,
    "ancienSolde" DECIMAL(12,3) NOT NULL,
    "nouveauSolde" DECIMAL(12,3) NOT NULL,
    "motif" TEXT,
    "referenceDoc" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaisseMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaisseConfig" (
    "id" TEXT NOT NULL,
    "solde" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaisseConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaisseMovement_type_idx" ON "CaisseMovement"("type");

-- CreateIndex
CREATE INDEX "CaisseMovement_createdAt_idx" ON "CaisseMovement"("createdAt");

-- CreateIndex
CREATE INDEX "CaisseMovement_userId_idx" ON "CaisseMovement"("userId");

-- AddForeignKey
ALTER TABLE "CaisseMovement" ADD CONSTRAINT "CaisseMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
