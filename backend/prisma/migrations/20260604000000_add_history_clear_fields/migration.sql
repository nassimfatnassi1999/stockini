-- AddColumn Payment.clearedAt / clearedBy
ALTER TABLE "Payment" ADD COLUMN "clearedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "clearedBy" TEXT;

-- AddColumn CaisseMovement.clearedAt / clearedBy
ALTER TABLE "CaisseMovement" ADD COLUMN "clearedAt" TIMESTAMP(3);
ALTER TABLE "CaisseMovement" ADD COLUMN "clearedBy" TEXT;

-- CreateTable HistoryClearLog
CREATE TABLE "history_clear_logs" (
    "id"          TEXT NOT NULL,
    "module"      TEXT NOT NULL,
    "userId"      TEXT,
    "count"       INTEGER NOT NULL,
    "clearedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filtersJson" JSONB,
    CONSTRAINT "history_clear_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "history_clear_logs_module_idx"    ON "history_clear_logs"("module");
CREATE INDEX "history_clear_logs_clearedAt_idx" ON "history_clear_logs"("clearedAt");
CREATE INDEX "history_clear_logs_userId_idx"    ON "history_clear_logs"("userId");

-- AddForeignKey
ALTER TABLE "history_clear_logs" ADD CONSTRAINT "history_clear_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
