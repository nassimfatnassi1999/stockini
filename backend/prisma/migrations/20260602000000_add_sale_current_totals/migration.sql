-- AlterTable: add current-total tracking fields to Sale
-- totalInitialTtc: snapshot of sale.total at the moment the first avoir is applied (never overwritten)
-- totalCurrentTtc: sale.total minus all non-cancelled credit note totals; NULL means no avoir yet
ALTER TABLE "Sale"
  ADD COLUMN "totalInitialTtc" DECIMAL(12,3),
  ADD COLUMN "totalCurrentTtc" DECIMAL(12,3);
