import assert from "node:assert/strict";
import test from "node:test";
import { calculateCreditNoteTotals } from "./credit-note-calculation";

test("avoir: calcule au prorata exact avec plusieurs taux de TVA", () => {
  assert.deepEqual(
    calculateCreditNoteTotals([
      { quantity: 3, unitPriceHt: 20, tvaRate: 19 },
      { quantity: 1, unitPriceHt: 10, tvaRate: 7 },
    ]),
    { totalHt: 70, totalTva: 12.1, totalTtc: 82.1 },
  );
});

test("avoir: arrondit les montants TND à trois décimales", () => {
  assert.deepEqual(
    calculateCreditNoteTotals([
      { quantity: 1, unitPriceHt: 1.0055, tvaRate: 19 },
    ]),
    { totalHt: 1.006, totalTva: 0.191, totalTtc: 1.197 },
  );
});
