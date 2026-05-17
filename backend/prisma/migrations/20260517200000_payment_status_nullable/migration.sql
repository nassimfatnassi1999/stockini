-- Make paymentStatus nullable on Sale (non-payable document types don't have payment semantics)
ALTER TABLE "Sale" ALTER COLUMN "paymentStatus" DROP NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "paymentStatus" DROP DEFAULT;

-- Nullify paymentStatus for all non-payable document types
UPDATE "Sale"
SET "paymentStatus" = NULL
WHERE "documentType" IN ('DEVIS', 'BON_COMMANDE', 'BON_LIVRAISON', 'AVOIR');
