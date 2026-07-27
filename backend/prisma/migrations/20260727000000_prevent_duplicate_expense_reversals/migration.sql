-- A cancelled expense must never credit its source of payment more than once.
-- The partial unique index preserves the original debit and allows exactly one reversal.
CREATE UNIQUE INDEX "CaisseMovement_expense_reversal_key"
ON "CaisseMovement" ("expenseId")
WHERE "expenseId" IS NOT NULL AND "type" = 'ANNULATION_DEPENSE';
