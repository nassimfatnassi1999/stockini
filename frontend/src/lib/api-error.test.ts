import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorMessage } from "./api-error";

test("uses the backend business message", () => {
  assert.equal(
    getApiErrorMessage({
      response: { status: 422, data: { message: "Montant trop élevé" } },
    }),
    "Montant trop élevé",
  );
});

test("never exposes Internal server error", () => {
  assert.equal(
    getApiErrorMessage(
      { response: { status: 500, data: { message: "Internal server error" } } },
      "Paiement impossible",
    ),
    "Paiement impossible",
  );
});
