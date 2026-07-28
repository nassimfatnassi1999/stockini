CREATE TYPE "SettlementMode" AS ENUM ('NORMAL', 'ACCEPTED_DIFFERENCE');

ALTER TABLE "Payment"
ADD COLUMN "acceptedDifference" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN "settlementMode" "SettlementMode" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "acceptanceReason" TEXT,
ADD COLUMN "acceptedById" TEXT,
ADD COLUMN "acceptedAt" TIMESTAMP(3);

CREATE INDEX "Payment_settlementMode_idx" ON "Payment"("settlementMode");
CREATE INDEX "Payment_acceptedById_idx" ON "Payment"("acceptedById");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
