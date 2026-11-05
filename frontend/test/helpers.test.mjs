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

import { normalizeDesc, descKey, buildCommitRows, applyCategoryBulk, initialState } from "../lib/importer.ts";

test("importar: normalización de descripción", () => {
  assert.equal(normalizeDesc("  CAFÉ  Ñandú #123 "), "cafe nandu 123");
  assert.equal(descKey("***"), null);
  assert.equal(descKey("Oxxo"), "imp_desc_oxxo");
});

test("importar: filas de commit y relleno masivo", () => {
  const mk = (row, direction, status = "new") => ({ row, occurred_on: "2026-01-0" + row, description: "d" + row, amount_cents: 100 * row, direction, fingerprint: "import:" + row, status, duplicate_of: null });
  const rows = [mk(1, "outflow"), mk(2, "inflow"), mk(3, "outflow", "duplicate"), mk(4, "outflow", "imported")];
  let st = Object.fromEntries(rows.map((r) => [r.row, initialState(r)]));
  assert.equal(st[3].selected, false);
  assert.equal(st[4].selected, false);
  assert.match(buildCommitRows(rows, st).error, /fila 1/);
  st = applyCategoryBulk(rows, st, "outflow", "7");
  assert.equal(st[2].categoryId, "");
  assert.equal(st[3].categoryId, ""); // no seleccionada: no se toca
  st[2] = { ...st[2], mode: "transfer", counterId: "9" };
  const r = buildCommitRows(rows, st);
  assert.equal(r.error, null);
  assert.deepEqual(r.rows.map((x) => [x.row, x.category_id, x.counter_account_id]), [[1, 7, undefined], [2, undefined, 9]]);
  assert.equal(initialState(rows[0], "12").categoryId, "12");
});

import { initials, stageIndex, pct, dueLabel } from "../lib/ryventis.ts";
test("ryventis: iniciales, etapa, porcentaje y entrega", () => {
  assert.equal(initials("Ana López Ruiz"), "AL");
  assert.equal(initials("  zeta "), "ZE");
  assert.equal(initials(""), "?");
  assert.equal(stageIndex("nuevo"), 0);
  assert.equal(stageIndex("cliente"), 3);
  assert.equal(stageIndex("perdido"), -1);
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(5, 3), 100);
  assert.equal(pct(1, 0), 0);
  assert.equal(dueLabel("2026-11-05", "2026-11-05", (x) => x), "Entrega hoy");
  assert.equal(dueLabel("2026-11-04", "2026-11-05", (x) => x), "Vencida · 2026-11-04");
  assert.equal(dueLabel("2026-11-28", "2026-11-05", () => "28 nov"), "28 nov");
});
