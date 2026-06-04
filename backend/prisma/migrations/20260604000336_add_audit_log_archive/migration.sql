-- CreateTable
CREATE TABLE "audit_log_archives" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_archives_createdAt_idx" ON "audit_log_archives"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_archives_action_idx" ON "audit_log_archives"("action");

-- CreateIndex
CREATE INDEX "audit_log_archives_entity_idx" ON "audit_log_archives"("entity");

-- CreateIndex
CREATE INDEX "audit_log_archives_entityId_idx" ON "audit_log_archives"("entityId");
