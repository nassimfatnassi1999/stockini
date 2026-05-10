-- Add idProduct column (nullable initially to allow data copy)
ALTER TABLE "Product" ADD COLUMN "idProduct" TEXT;

-- Copy existing auto-generated reference values into idProduct
UPDATE "Product" SET "idProduct" = "reference";

-- Make idProduct NOT NULL
ALTER TABLE "Product" ALTER COLUMN "idProduct" SET NOT NULL;

-- Add unique constraint on idProduct
CREATE UNIQUE INDEX "Product_idProduct_key" ON "Product"("idProduct");

-- Add index on idProduct
CREATE INDEX "Product_idProduct_idx" ON "Product"("idProduct");
