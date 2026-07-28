import assert from "node:assert/strict";
import test from "node:test";
import { calculateCustomerPayment } from "./customer-payment";

test("calcule exactement 330,000 - 329,549", () => {
  const result = calculateCustomerPayment("329.549", "330.000");
  assert.equal(result.amountApplied.toFixed(3), "329.549");
  assert.equal(result.changeDue.toFixed(3), "0.451");
  assert.equal(result.remainingAfter.toFixed(3), "0.000");
});

test("conserve une dette positive pour un paiement partiel", () => {
  const result = calculateCustomerPayment("329.549", "200.000");
  assert.equal(result.amountApplied.toFixed(3), "200.000");
  assert.equal(result.remainingAfter.toFixed(3), "129.549");
});

test("sépare l'encaissement réel de l'écart accepté", () => {
  const result = calculateCustomerPayment("134.106", "130.000", true);
  assert.equal(result.amountApplied.toFixed(3), "130.000");
  assert.equal(result.acceptedDifference.toFixed(3), "4.106");
  assert.equal(result.remainingAfter.toFixed(3), "0.000");
  assert.equal(result.settlementMode, "ACCEPTED_DIFFERENCE");
});
