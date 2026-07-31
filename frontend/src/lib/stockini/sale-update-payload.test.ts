import assert from "node:assert/strict";
import test from "node:test";
import { buildSalePaymentPayload } from "./sale-update-payload";

test("omits payment-only fields when no new payment applies", () => {
  assert.deepEqual(buildSalePaymentPayload({ paidAmount: 40, existingPaidAmount: 40 }), { paidAmount: 40 });
});

test("emits a real boolean when a new payment applies", () => {
  assert.deepEqual(
    buildSalePaymentPayload({
      paidAmount: 100,
      existingPaidAmount: 40,
      paymentMethod: "CASH",
      acceptAsFullyPaid: true,
    }),
    { paidAmount: 100, paymentMethod: "CASH", acceptAsFullyPaid: true },
  );
});

test("rejects NaN and a cumulative amount below existing payments", () => {
  assert.throws(() => buildSalePaymentPayload({ paidAmount: Number.NaN }));
  assert.throws(() => buildSalePaymentPayload({ paidAmount: 39, existingPaidAmount: 40 }));
});
