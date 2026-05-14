-- Last real sale metadata on Product
ALTER TABLE "Product" ADD COLUMN "lastSaleDate" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "lastSaleDocumentId" TEXT;
ALTER TABLE "Product" ADD COLUMN "lastSaleDocumentReference" TEXT;
ALTER TABLE "Product" ADD COLUMN "lastSaleCustomerId" TEXT;

-- Guard to ensure a completed delivery note / invoice impacts last sale price once.
ALTER TABLE "Sale" ADD COLUMN "last_sale_price_impact_done" BOOLEAN NOT NULL DEFAULT false;

-- Store the effective sale-line price used for future price history.
ALTER TABLE "SaleItem" ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN "finalUnitPrice" DECIMAL(12,3);

-- History of prices actually sold from validated delivery notes and invoices.
CREATE TABLE "product_price_history" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "document_type" "DocumentType" NOT NULL,
  "document_reference" TEXT NOT NULL,
  "client_id" TEXT,
  "prix_vente" DECIMAL(12,3) NOT NULL,
  "date_vente" TIMESTAMP(3) NOT NULL,
  "user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_price_history_product_id_document_id_key"
  ON "product_price_history"("product_id", "document_id");
CREATE INDEX "product_price_history_product_id_date_vente_idx"
  ON "product_price_history"("product_id", "date_vente");
CREATE INDEX "product_price_history_document_id_idx"
  ON "product_price_history"("document_id");
CREATE INDEX "product_price_history_client_id_idx"
  ON "product_price_history"("client_id");
CREATE INDEX "product_price_history_user_id_idx"
  ON "product_price_history"("user_id");
CREATE INDEX "Product_lastSaleCustomerId_idx"
  ON "Product"("lastSaleCustomerId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_lastSaleCustomerId_fkey"
  FOREIGN KEY ("lastSaleCustomerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "Sale"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
