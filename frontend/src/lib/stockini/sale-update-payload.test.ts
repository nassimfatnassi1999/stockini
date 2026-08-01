import assert from "node:assert/strict";
import test from "node:test";
import { buildSalePaymentPayload } from "./sale-update-payload";

test("omits payment-only fields when no new payment applies", () => {
  assert.deepEqual(buildSalePaymentPayload({ paymentAmount: "" }), {});
  assert.deepEqual(buildSalePaymentPayload({ paymentAmount: "0.000" }), {});
});

test("emits a real boolean when a new payment applies", () => {
  assert.deepEqual(
    buildSalePaymentPayload({
      paymentAmount: "60,000",
      paymentMethod: "CASH",
      acceptAsFullyPaid: true,
    }),
    { paymentAmount: 60, paymentMethod: "CASH", acceptAsFullyPaid: true },
  );
});

test("rejects NaN and a cumulative amount below existing payments", () => {
  assert.throws(() => buildSalePaymentPayload({ paymentAmount: Number.NaN }));
  assert.throws(() => buildSalePaymentPayload({ paymentAmount: -1 }));
});
