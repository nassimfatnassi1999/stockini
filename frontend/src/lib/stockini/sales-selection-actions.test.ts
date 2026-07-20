import assert from "node:assert/strict";
import test from "node:test";
import type { Sale } from "./types";
import { getSalesSelectionActions } from "./sales-selection-actions";

const sale = (overrides: Partial<Sale> = {}): Sale =>
  ({
    id: "sale-1",
    invoiceNumber: "BL-1",
    total: 100,
    stampDuty: 0,
    totalFinal: 100,
    paidAmount: 0,
    remainingAmount: 100,
    totalRefunded: 0,
    paymentStatus: null,
    status: "COMPLETED",
    documentType: "BON_LIVRAISON",
    stockImpactDone: true,
    reserveStock: false,
    createdAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  }) as Sale;

test("a grouped delivery note keeps generation and deconsolidation actions", () => {
  const actions = getSalesSelectionActions([
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE" }),
  ]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer le BL");
  assert.equal(actions.consolidatedDocumentType, "BON_LIVRAISON");
  assert.equal(actions.showDeconsolidate, true);
});

test("a grouped invoice has the invoice-specific generation action", () => {
  const actions = getSalesSelectionActions([
    sale({
      documentType: "FACTURE",
      isConsolidated: true,
      consolidationStatus: "ACTIVE",
    }),
  ]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer la facture");
  assert.equal(actions.consolidatedDocumentType, "FACTURE");
  assert.equal(actions.showDeconsolidate, true);
});

test("a mixed multi-selection containing a consolidation is ambiguous", () => {
  const actions = getSalesSelectionActions([
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE" }),
    sale({ id: "sale-2" }),
  ]);

  assert.equal(actions.hasAmbiguousConsolidatedSelection, true);
  assert.equal(actions.showGenerate, false);
  assert.equal(actions.showDeconsolidate, false);
});

test("normal selections retain the existing generation behavior", () => {
  const actions = getSalesSelectionActions([sale(), sale({ id: "sale-2" })]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.hasAmbiguousConsolidatedSelection, false);
});
