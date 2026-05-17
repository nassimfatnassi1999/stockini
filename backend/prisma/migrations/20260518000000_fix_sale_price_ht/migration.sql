-- Migration: fix_sale_price_ht
-- salePrice était stocké TTC (purchaseHT × (1+TVA%) × 1.4).
-- Correction : salePrice = purchaseHT × 1.4 (HT uniquement, TVA non incluse).
UPDATE "Product"
SET "salePrice" = ROUND(CAST("purchasePrice" AS NUMERIC) * 1.4, 3)
WHERE "purchasePrice" > 0;
