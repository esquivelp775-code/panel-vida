import test from "node:test";
import assert from "node:assert/strict";
import { splitInstallments } from "../lib/installments.ts";
import { prefillFromEntries } from "../lib/prefill.ts";

test("MSI: reparto exacto en centavos", () => {
  assert.deepEqual(splitInstallments(10000, 3), { base: 3333, extra: 1, first: 3334, rest: 3333 });
  assert.deepEqual(splitInstallments(12000, 6), { base: 2000, extra: 0, first: 2000, rest: 2000 });
  const s = splitInstallments(100001, 12);
  assert.equal(s.first * s.extra + s.rest * (12 - s.extra), 100001); // la suma cuadra
  assert.equal(splitInstallments(0, 3), null);
  assert.equal(splitInstallments(1000, 1), null);
  assert.equal(splitInstallments(1000, 61), null);
  assert.equal(splitInstallments(1000, 2.5), null);
});

const E = (id, cls, amt) => ({ account_id: id, account_name: "x" + id, account_class: cls, amount_cents: amt });

test("prefill: gasto con tarjeta y gasto en efectivo", () => {
  assert.deepEqual(prefillFromEntries("card_purchase", [E(9, "expense", 5000), E(3, "liability", -5000)]),
    { mode: "expense", amountCents: 5000, accountId: 3, categoryId: 9 });
  assert.deepEqual(prefillFromEntries("expense", [E(9, "expense", 700), E(1, "asset", -700)]),
    { mode: "expense", amountCents: 700, accountId: 1, categoryId: 9 });
});

test("prefill: ingreso, devolucion, transferencia, pago de tarjeta", () => {
  assert.equal(prefillFromEntries("income", [E(1, "asset", 100), E(8, "income", -100)]).categoryId, 8);
  const r = prefillFromEntries("refund", [E(3, "liability", 100), E(9, "expense", -100)]);
  assert.deepEqual([r.mode, r.accountId, r.categoryId], ["refund", 3, 9]);
  const t = prefillFromEntries("transfer", [E(1, "asset", -300), E(2, "asset", 300)]);
  assert.deepEqual([t.fromId, t.toId], [1, 2]);
  const c = prefillFromEntries("card_payment", [E(1, "asset", -300), E(3, "liability", 300)]);
  assert.deepEqual([c.mode, c.fromId, c.toId], ["card_payment", 1, 3]);
});

test("prefill: pago de préstamo con y sin interés", () => {
  const p = prefillFromEntries("loan_payment", [E(1, "asset", -1200), E(5, "liability", 1000), E(9, "expense", 200)]);
  assert.deepEqual(p, { mode: "loan_payment", amountCents: 1000, fromId: 1, toId: 5, interestCents: 200, interestCategoryId: 9 });
  const q = prefillFromEntries("loan_payment", [E(1, "asset", -1000), E(5, "liability", 1000)]);
  assert.equal(q.interestCents, undefined);
});

test("prefill: tipos no corregibles o asientos raros devuelven null", () => {
  assert.equal(prefillFromEntries("adjustment", [E(1, "asset", 100), E(2, "equity", -100)]), null);
  assert.equal(prefillFromEntries("loan_disbursement", [E(1, "asset", 100), E(5, "liability", -100)]), null);
  assert.equal(prefillFromEntries("expense", [E(9, "expense", 100), E(1, "asset", -50), E(2, "asset", -50)]), null);
  assert.equal(prefillFromEntries("income", [E(1, "asset", 100), E(2, "asset", -100)]), null);
});
