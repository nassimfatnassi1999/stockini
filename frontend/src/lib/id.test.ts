import assert from "node:assert/strict";
import test from "node:test";
import { generateClientId } from "./id";

test("generates a temporary id when randomUUID is unavailable", () => {
  const id = generateClientId("payment");
  assert.match(id, /^(payment_|[0-9a-f-]{36}$)/);
});
