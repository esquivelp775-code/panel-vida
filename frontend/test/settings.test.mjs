import test from "node:test";
import assert from "node:assert/strict";
import { NAV_GROUPS, groupHasPath } from "../components/nav.ts";
import { DEFAULT_REMINDERS, addReminder, parseReminders, removeReminder } from "../lib/reminders.ts";
import { KIND_ES, obligationTargets, settleAccounts } from "../lib/obligations.ts";

const group = (id) => NAV_GROUPS.find((g) => g.id === id);

test("Otros incluye Configuración antes de Cerrar sesión", () => {
  assert.deepEqual(group("otros").items.map((i) => i.label), ["Configuración", "Cerrar sesión"]);
  assert.equal(group("otros").items[0].href, "/configuracion/");
});

test("groupHasPath detecta el grupo de la página actual, con o sin ?tab", () => {
  assert.equal(groupHasPath(group("vida"), "/vida/"), true);
  assert.equal(groupHasPath(group("vida"), "/vida"), true);
  assert.equal(groupHasPath(group("ryventis"), "/ryventis/"), true);
  assert.equal(groupHasPath(group("vida"), "/ryventis/"), false);
  assert.equal(groupHasPath(group("otros"), "/configuracion/"), true);
});

test("el enlace de cerrar sesión no cuenta como página del grupo", () => {
  assert.equal(groupHasPath(group("otros"), "#logout"), false);
});

test("parseReminders usa los valores por defecto sin datos o con datos corruptos", () => {
  assert.deepEqual(parseReminders(null), DEFAULT_REMINDERS);
  assert.deepEqual(parseReminders(""), DEFAULT_REMINDERS);
  assert.deepEqual(parseReminders("{no es json"), DEFAULT_REMINDERS);
  assert.deepEqual(parseReminders('{"a":1}'), DEFAULT_REMINDERS);
});

test("parseReminders respeta una lista vacía y descarta lo que no es texto", () => {
  assert.deepEqual(parseReminders("[]"), []);
  assert.deepEqual(parseReminders('["Agua", 3, null, "  ", " Leer "]'), ["Agua", "Leer"]);
});

test("addReminder limpia el texto y evita duplicados sin importar mayúsculas", () => {
  assert.deepEqual(addReminder(["Agua"], "  Leer  "), ["Agua", "Leer"]);
  assert.deepEqual(addReminder(["Agua"], "agua"), ["Agua"]);
  assert.deepEqual(addReminder(["Agua"], "   "), ["Agua"]);
});

test("addReminder respeta el tope de 12 recordatorios y 60 caracteres", () => {
  const full = Array.from({ length: 12 }, (_, i) => `R${i}`);
  assert.equal(addReminder(full, "Otro").length, 12);
  assert.equal(addReminder([], "x".repeat(80))[0].length, 60);
});

test("removeReminder quita sólo el indicado", () => {
  assert.deepEqual(removeReminder(["Agua", "Leer"], "Agua"), ["Leer"]);
});

const accounts = [
  { id: 1, name: "Reserva", subtype: "checking", account_class: "asset" },
  { id: 2, name: "Tanda aportada", subtype: "investment", account_class: "asset" },
  { id: 3, name: "BBVA", subtype: "credit_card", account_class: "liability" },
  { id: 4, name: "Crédito", subtype: "loan", account_class: "liability" },
  { id: 5, name: "Tanda recibida", subtype: "other_liability", account_class: "liability" },
  { id: 6, name: "Renta", subtype: "expense", account_class: "expense" },
];
const ids = (l) => l.map((a) => a.id);

test("cada tipo de obligación tiene nombre, incluidas las aportaciones", () => {
  for (const k of ["bill", "loan_installment", "card_payment", "income_expected", "other", "savings"]) assert.ok(KIND_ES[k], k);
});

test("obligationTargets ofrece el destino correcto por tipo", () => {
  assert.deepEqual(ids(obligationTargets("card_payment", accounts)), [3]);
  assert.deepEqual(ids(obligationTargets("loan_installment", accounts)), [4, 5]);
  assert.deepEqual(ids(obligationTargets("savings", accounts)), [1, 2]);
  assert.deepEqual(ids(obligationTargets("bill", accounts)), []);
});

test("settleAccounts permite pagar recibos con tarjeta pero no pagar una tarjeta con otra", () => {
  // Primero el dinero de uso diario y la tarjeta; la inversión (tandas aportadas, cuenta puente) al final.
  assert.deepEqual(ids(settleAccounts("bill", accounts)), [1, 3, 2]);
  assert.deepEqual(ids(settleAccounts("other", accounts)), [1, 3, 2]);
  assert.deepEqual(ids(settleAccounts("card_payment", accounts)), [1, 2]);
  assert.deepEqual(ids(settleAccounts("loan_installment", accounts)), [1, 2]);
  assert.deepEqual(ids(settleAccounts("savings", accounts)), [1, 2]);
  assert.deepEqual(ids(settleAccounts("income_expected", accounts)), [1, 2]);
});
