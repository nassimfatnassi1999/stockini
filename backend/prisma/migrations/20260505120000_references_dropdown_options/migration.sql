-- Automatic references and dynamic dropdown options.

CREATE TABLE "ReferenceCounter" (
  "id" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferenceCounter_prefix_year_key" ON "ReferenceCounter"("prefix", "year");
CREATE INDEX "ReferenceCounter_prefix_year_idx" ON "ReferenceCounter"("prefix", "year");

CREATE TABLE "DropdownOption" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DropdownOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DropdownOption_category_value_key" ON "DropdownOption"("category", "value");
CREATE INDEX "DropdownOption_category_active_sortOrder_idx" ON "DropdownOption"("category", "active", "sortOrder");

ALTER TABLE "Product" ADD COLUMN "reference" TEXT;
ALTER TABLE "Customer" ADD COLUMN "reference" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "reference" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reference" TEXT;

WITH ranked AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS year_value, row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", "id") AS seq
  FROM "Product"
)
UPDATE "Product" p
SET "reference" = 'PRD-' || ranked.year_value || '-' || lpad(ranked.seq::text, 6, '0')
FROM ranked
WHERE p."id" = ranked."id";

WITH ranked AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS year_value, row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", "id") AS seq
  FROM "Customer"
)
UPDATE "Customer" c
SET "reference" = 'CLI-' || ranked.year_value || '-' || lpad(ranked.seq::text, 6, '0')
FROM ranked
WHERE c."id" = ranked."id";

WITH ranked AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS year_value, row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", "id") AS seq
  FROM "Supplier"
)
UPDATE "Supplier" s
SET "reference" = 'FOU-' || ranked.year_value || '-' || lpad(ranked.seq::text, 6, '0')
FROM ranked
WHERE s."id" = ranked."id";

WITH ranked AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS year_value, row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", "id") AS seq
  FROM "Payment"
)
UPDATE "Payment" p
SET "reference" = 'PAY-' || ranked.year_value || '-' || lpad(ranked.seq::text, 6, '0')
FROM ranked
WHERE p."id" = ranked."id";

WITH ranked AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS year_value, row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", "id") AS seq
  FROM "StockMovement"
)
UPDATE "StockMovement" s
SET "reference" = 'STK-' || ranked.year_value || '-' || lpad(ranked.seq::text, 6, '0')
FROM ranked
WHERE s."id" = ranked."id";

ALTER TABLE "Product" ALTER COLUMN "reference" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "reference" SET NOT NULL;
ALTER TABLE "Supplier" ALTER COLUMN "reference" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "reference" SET NOT NULL;

CREATE UNIQUE INDEX "Product_reference_key" ON "Product"("reference");
CREATE INDEX "Product_reference_idx" ON "Product"("reference");
CREATE UNIQUE INDEX "Customer_reference_key" ON "Customer"("reference");
CREATE INDEX "Customer_reference_idx" ON "Customer"("reference");
CREATE UNIQUE INDEX "Supplier_reference_key" ON "Supplier"("reference");
CREATE INDEX "Supplier_reference_idx" ON "Supplier"("reference");
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");
CREATE UNIQUE INDEX "StockMovement_reference_key" ON "StockMovement"("reference");

INSERT INTO "ReferenceCounter" ("id", "prefix", "year", "sequence", "updatedAt")
SELECT 'ref_' || prefix || '_' || year_value, prefix, year_value, max(seq), CURRENT_TIMESTAMP
FROM (
  SELECT 'INV' AS prefix, split_part("invoiceNumber", '-', 2)::int AS year_value, split_part("invoiceNumber", '-', 3)::int AS seq FROM "Sale" WHERE "invoiceNumber" ~ '^INV-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'ACH', split_part("orderNumber", '-', 2)::int, split_part("orderNumber", '-', 3)::int FROM "Purchase" WHERE "orderNumber" ~ '^ACH-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'PRD', split_part("reference", '-', 2)::int, split_part("reference", '-', 3)::int FROM "Product" WHERE "reference" ~ '^PRD-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'CLI', split_part("reference", '-', 2)::int, split_part("reference", '-', 3)::int FROM "Customer" WHERE "reference" ~ '^CLI-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'FOU', split_part("reference", '-', 2)::int, split_part("reference", '-', 3)::int FROM "Supplier" WHERE "reference" ~ '^FOU-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'PAY', split_part("reference", '-', 2)::int, split_part("reference", '-', 3)::int FROM "Payment" WHERE "reference" ~ '^PAY-[0-9]{4}-[0-9]{6}$'
  UNION ALL
  SELECT 'STK', split_part("reference", '-', 2)::int, split_part("reference", '-', 3)::int FROM "StockMovement" WHERE "reference" ~ '^STK-[0-9]{4}-[0-9]{6}$'
) refs
GROUP BY prefix, year_value
ON CONFLICT ("prefix", "year") DO UPDATE SET "sequence" = EXCLUDED."sequence", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DropdownOption" ("id", "category", "label", "value", "active", "sortOrder", "updatedAt")
VALUES
  ('opt_customer_types_individual', 'customer_types', 'Particulier', 'INDIVIDUAL', true, 1, CURRENT_TIMESTAMP),
  ('opt_customer_types_company', 'customer_types', 'Entreprise', 'COMPANY', true, 2, CURRENT_TIMESTAMP),
  ('opt_customer_types_garage', 'customer_types', 'Garage', 'GARAGE', true, 3, CURRENT_TIMESTAMP),
  ('opt_payment_methods_cash', 'payment_methods', 'Espèces', 'CASH', true, 1, CURRENT_TIMESTAMP),
  ('opt_payment_methods_card', 'payment_methods', 'Carte bancaire', 'CARD', true, 2, CURRENT_TIMESTAMP),
  ('opt_payment_methods_bank_transfer', 'payment_methods', 'Virement', 'BANK_TRANSFER', true, 3, CURRENT_TIMESTAMP),
  ('opt_payment_methods_check', 'payment_methods', 'Chèque', 'CHECK', true, 4, CURRENT_TIMESTAMP),
  ('opt_payment_methods_credit', 'payment_methods', 'Crédit', 'CREDIT', true, 5, CURRENT_TIMESTAMP),
  ('opt_payment_types_customer', 'payment_types', 'Paiement client', 'CUSTOMER_PAYMENT', true, 1, CURRENT_TIMESTAMP),
  ('opt_payment_types_supplier', 'payment_types', 'Paiement fournisseur', 'SUPPLIER_PAYMENT', true, 2, CURRENT_TIMESTAMP),
  ('opt_stock_operations_entry', 'stock_operation_types', 'Entrée', 'ENTRY', true, 1, CURRENT_TIMESTAMP),
  ('opt_stock_operations_exit', 'stock_operation_types', 'Sortie', 'EXIT', true, 2, CURRENT_TIMESTAMP),
  ('opt_stock_operations_adjustment', 'stock_operation_types', 'Correction inventaire', 'ADJUSTMENT', true, 3, CURRENT_TIMESTAMP),
  ('opt_stock_reason_entry', 'stock_movement_reasons', 'entry', 'entry', true, 1, CURRENT_TIMESTAMP),
  ('opt_stock_reason_sale', 'stock_movement_reasons', 'sale', 'sale', true, 2, CURRENT_TIMESTAMP),
  ('opt_stock_reason_correction', 'stock_movement_reasons', 'correction', 'correction', true, 3, CURRENT_TIMESTAMP),
  ('opt_stock_reason_return', 'stock_movement_reasons', 'retour', 'retour', true, 4, CURRENT_TIMESTAMP),
  ('opt_sale_status_draft', 'sale_statuses', 'Brouillon', 'DRAFT', true, 1, CURRENT_TIMESTAMP),
  ('opt_sale_status_completed', 'sale_statuses', 'Terminée', 'COMPLETED', true, 2, CURRENT_TIMESTAMP),
  ('opt_sale_status_cancelled', 'sale_statuses', 'Annulée', 'CANCELLED', true, 3, CURRENT_TIMESTAMP),
  ('opt_sale_status_returned', 'sale_statuses', 'Retournée', 'RETURNED', true, 4, CURRENT_TIMESTAMP),
  ('opt_purchase_status_draft', 'purchase_statuses', 'Brouillon', 'DRAFT', true, 1, CURRENT_TIMESTAMP),
  ('opt_purchase_status_ordered', 'purchase_statuses', 'Commandée', 'ORDERED', true, 2, CURRENT_TIMESTAMP),
  ('opt_purchase_status_partially_received', 'purchase_statuses', 'Partiellement reçue', 'PARTIALLY_RECEIVED', true, 3, CURRENT_TIMESTAMP),
  ('opt_purchase_status_received', 'purchase_statuses', 'Reçue', 'RECEIVED', true, 4, CURRENT_TIMESTAMP),
  ('opt_purchase_status_cancelled', 'purchase_statuses', 'Annulée', 'CANCELLED', true, 5, CURRENT_TIMESTAMP),
  ('opt_payment_status_unpaid', 'payment_statuses', 'Non payé', 'UNPAID', true, 1, CURRENT_TIMESTAMP),
  ('opt_payment_status_partial', 'payment_statuses', 'Partiel', 'PARTIAL', true, 2, CURRENT_TIMESTAMP),
  ('opt_payment_status_paid', 'payment_statuses', 'Payé', 'PAID', true, 3, CURRENT_TIMESTAMP),
  ('opt_report_dashboard', 'report_types', 'Tableau de bord', 'dashboard', true, 1, CURRENT_TIMESTAMP),
  ('opt_report_stock', 'report_types', 'Stock', 'stock', true, 2, CURRENT_TIMESTAMP),
  ('opt_report_sales', 'report_types', 'Ventes', 'sales', true, 3, CURRENT_TIMESTAMP),
  ('opt_report_purchases', 'report_types', 'Achats', 'purchases', true, 4, CURRENT_TIMESTAMP),
  ('opt_alert_low_stock', 'alert_types', 'Stock faible', 'LOW_STOCK', true, 1, CURRENT_TIMESTAMP),
  ('opt_alert_out_of_stock', 'alert_types', 'Rupture de stock', 'OUT_OF_STOCK', true, 2, CURRENT_TIMESTAMP),
  ('opt_alert_unpaid_invoice', 'alert_types', 'Facture impayée', 'UNPAID_INVOICE', true, 3, CURRENT_TIMESTAMP),
  ('opt_alert_purchase_delay', 'alert_types', 'Retard achat', 'PURCHASE_DELAY', true, 4, CURRENT_TIMESTAMP),
  ('opt_alert_system', 'alert_types', 'Système', 'SYSTEM', true, 5, CURRENT_TIMESTAMP),
  ('opt_unit_piece', 'units', 'Pièce', 'piece', true, 1, CURRENT_TIMESTAMP),
  ('opt_unit_lot', 'units', 'Lot', 'lot', true, 2, CURRENT_TIMESTAMP),
  ('opt_location_a101', 'stock_locations', 'A1-01', 'A1-01', true, 1, CURRENT_TIMESTAMP),
  ('opt_location_b101', 'stock_locations', 'B1-01', 'B1-01', true, 2, CURRENT_TIMESTAMP),
  ('opt_location_b204', 'stock_locations', 'B2-04', 'B2-04', true, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("category", "value") DO UPDATE SET
  "label" = EXCLUDED."label",
  "active" = EXCLUDED."active",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
