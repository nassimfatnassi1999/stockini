-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('GENERATED', 'SENT', 'DELETED');

-- AlterTable: add new columns to GeneratedDocument
ALTER TABLE "GeneratedDocument"
  ADD COLUMN "status"     "DocumentStatus" NOT NULL DEFAULT 'GENERATED',
  ADD COLUMN "deletedAt"  TIMESTAMP(3),
  ADD COLUMN "clientName" TEXT,
  ADD COLUMN "totalHt"    DECIMAL(12,3),
  ADD COLUMN "totalTva"   DECIMAL(12,3),
  ADD COLUMN "totalTtc"   DECIMAL(12,3);

-- CreateIndex on new GeneratedDocument columns
CREATE INDEX "GeneratedDocument_status_idx"    ON "GeneratedDocument"("status");
CREATE INDEX "GeneratedDocument_deletedAt_idx" ON "GeneratedDocument"("deletedAt");

-- CreateTable: DocumentEmailLog
CREATE TABLE "DocumentEmailLog" (
    "id"             TEXT NOT NULL,
    "documentId"     TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "cc"             TEXT,
    "bcc"            TEXT,
    "subject"        TEXT NOT NULL,
    "message"        TEXT,
    "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentBy"         TEXT,
    "status"         "EmailStatus" NOT NULL,
    "errorMessage"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on DocumentEmailLog
CREATE INDEX "DocumentEmailLog_documentId_idx" ON "DocumentEmailLog"("documentId");
CREATE INDEX "DocumentEmailLog_sentAt_idx"     ON "DocumentEmailLog"("sentAt");

-- AddForeignKey: DocumentEmailLog → GeneratedDocument
ALTER TABLE "DocumentEmailLog" ADD CONSTRAINT "DocumentEmailLog_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: DocumentEmailLog → User
ALTER TABLE "DocumentEmailLog" ADD CONSTRAINT "DocumentEmailLog_sentBy_fkey"
  FOREIGN KEY ("sentBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
