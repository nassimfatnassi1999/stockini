-- Rename customer type label: Particulier → Passager
-- The enum value INDIVIDUAL is unchanged; only the display label in DropdownOption changes.
UPDATE "DropdownOption"
SET "label" = 'Passager', "updatedAt" = NOW()
WHERE "category" = 'customer_types' AND "value" = 'INDIVIDUAL';
