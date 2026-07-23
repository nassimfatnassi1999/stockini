import assert from "node:assert/strict";
import test from "node:test";
import type { Sale } from "./types";
import {
  calculateSalesSelectionTotal,
  getSalesSelectionActions,
  validateSalesConsolidationSelection,
} from "./sales-selection-actions";

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
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.consolidatedDocumentType, "BON_LIVRAISON");
  assert.equal(actions.showDeconsolidate, true);
});

test("runtime BL aliases remain generatable for a consolidated row", () => {
  const actions = getSalesSelectionActions([
    {
      type: "BL",
      isConsolidated: true,
      consolidationStatus: "ACTIVE",
    },
  ]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.consolidatedDocumentType, "BON_LIVRAISON");
  assert.equal(actions.showDeconsolidate, true);
});

test("a grouped invoice has the generic generation action", () => {
  const actions = getSalesSelectionActions([
    sale({
      documentType: "FACTURE",
      isConsolidated: true,
      consolidationStatus: "ACTIVE",
    }),
  ]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.consolidatedDocumentType, "FACTURE");
  assert.equal(actions.showDeconsolidate, true);
});

test("a consolidation and a compatible normal sale can be reconsolidated", () => {
  const actions = getSalesSelectionActions([
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE", customer: { id: "c1" } as Sale["customer"] }),
    sale({ id: "sale-2", customer: { id: "c1" } as Sale["customer"] }),
  ]);

  assert.equal(actions.hasAmbiguousConsolidatedSelection, false);
  assert.equal(actions.showGenerate, false);
  assert.equal(actions.showDeconsolidate, false);
  assert.equal(actions.showConsolidate, true);
});

for (const [name, documents] of [
  ["BL + BL", [sale(), sale({ id: "sale-2" })]],
  ["BL + Facture", [sale(), sale({ id: "sale-2", documentType: "FACTURE" })]],
  ["BLG + BL", [
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE" }),
    sale({ id: "sale-2" }),
  ]],
  ["BLG + Facture", [
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE" }),
    sale({ id: "sale-2", documentType: "FACTURE" }),
  ]],
  ["BLG + FACG", [
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE" }),
    sale({
      id: "sale-2",
      documentType: "FACTURE",
      isConsolidated: true,
      consolidationStatus: "ACTIVE",
    }),
  ]],
] as const) {
  test(`${name} is a valid shared consolidation selection`, () => {
    const withCustomer = documents.map((document) => ({
      ...document,
      customer: { id: "c1" } as Sale["customer"],
    }));
    assert.equal(validateSalesConsolidationSelection(withCustomer).valid, true);
    assert.equal(getSalesSelectionActions(withCustomer).showConsolidate, true);
  });
}

test("several mixed normal and consolidated documents are valid", () => {
  const documents = [
    sale({ customer: { id: "c1" } as Sale["customer"] }),
    sale({ id: "sale-2", documentType: "FACTURE", customer: { id: "c1" } as Sale["customer"] }),
    sale({
      id: "sale-3",
      isConsolidated: true,
      consolidationStatus: "ACTIVE",
      customer: { id: "c1" } as Sale["customer"],
    }),
  ];
  assert.deepEqual(validateSalesConsolidationSelection(documents), {
    valid: true,
    error: null,
  });
});

test("selection total replaces source stamps with one consolidated stamp", () => {
  const documents = [
    sale({ total: 100, stampDuty: 1, totalFinal: 101 }),
    sale({ id: "sale-2", total: 200, stampDuty: 1, totalFinal: 201 }),
  ];
  assert.equal(calculateSalesSelectionTotal(documents), 301);
});

test("multi-selections do not expose an ambiguous generation action", () => {
  const actions = getSalesSelectionActions([sale(), sale({ id: "sale-2" })]);

  assert.equal(actions.showGenerate, false);
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.hasAmbiguousConsolidatedSelection, false);
});

test("a single normal quote retains the existing generation action", () => {
  const actions = getSalesSelectionActions([
    sale({ documentType: "DEVIS", isConsolidated: false }),
  ]);

  assert.equal(actions.showGenerate, true);
  assert.equal(actions.generateLabel, "Générer");
  assert.equal(actions.showDeconsolidate, false);
});

test("a consolidation and a sale from another customer are incompatible", () => {
  const actions = getSalesSelectionActions([
    sale({ isConsolidated: true, consolidationStatus: "ACTIVE", customer: { id: "c1" } as Sale["customer"] }),
    sale({ id: "sale-2", customer: { id: "c2" } as Sale["customer"] }),
  ]);
  assert.equal(actions.showConsolidate, false);
  assert.match(actions.consolidationError ?? "", /même client/);
});

test("an inactive consolidation is rejected", () => {
  const validation = validateSalesConsolidationSelection([
    sale({
      isConsolidated: true,
      consolidationStatus: "REPLACED",
      customer: { id: "c1" } as Sale["customer"],
    }),
    sale({ id: "sale-2", customer: { id: "c1" } as Sale["customer"] }),
  ]);
  assert.equal(validation.valid, false);
  assert.match(validation.error ?? "", /inactive/);
});
