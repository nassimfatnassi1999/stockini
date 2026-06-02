-- CreateEnum
CREATE TYPE "CustomerOrigin" AS ENUM ('MANUAL', 'SALE_COUNTER');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "origin" "CustomerOrigin" NOT NULL DEFAULT 'MANUAL';
