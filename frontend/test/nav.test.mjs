import test from "node:test";
import assert from "node:assert/strict";
import { NAV_GROUPS, isNavItemActive } from "../components/nav.ts";

const group = (id) => NAV_GROUPS.find((g) => g.id === id).items;
// Etiquetas resaltadas en un grupo para una URL dada; debe haber exactamente una.
const activeLabels = (id, path, tab) => group(id).filter((i) => isNavItemActive(path, tab, i.href)).map((i) => i.label);

test("Ryventis: cada ?tab= resalta sólo su elemento, no Resumen", () => {
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", "clientes"), ["Clientes"]);
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", "proyectos"), ["Proyectos"]);
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", "cobros"), ["Cobros"]);
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", "pendientes"), ["Pendientes"]);
});

test("Ryventis: Resumen se resalta sin tab o con la pestaña por defecto", () => {
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", null), ["Resumen"]);
  assert.deepEqual(activeLabels("ryventis", "/ryventis/", "resumen"), ["Resumen"]);
});

test("Vida: Hábitos con ?tab=habitos y Pendientes sin tab o con la pestaña por defecto", () => {
  assert.deepEqual(activeLabels("vida", "/vida/", "habitos"), ["Hábitos"]);
  assert.deepEqual(activeLabels("vida", "/vida/", null), ["Pendientes"]);
  assert.deepEqual(activeLabels("vida", "/vida/", "tasks"), ["Pendientes"]);
});

test("la barra final de la ruta no cambia el resultado", () => {
  assert.deepEqual(activeLabels("ryventis", "/ryventis", "cobros"), ["Cobros"]);
  assert.deepEqual(activeLabels("ryventis", "/ryventis", null), ["Resumen"]);
});

test("otra ruta no activa elementos con el mismo tab", () => {
  assert.deepEqual(activeLabels("ryventis", "/vida/", "pendientes"), []);
  assert.deepEqual(activeLabels("vida", "/ryventis/", "habitos"), []);
});

test("las páginas sin pestañas ignoran un parámetro tab", () => {
  assert.equal(isNavItemActive("/finanzas/", "algo", "/finanzas/"), true);
  assert.equal(isNavItemActive("/finanzas/", null, "/finanzas/"), true);
});

test("Hoy (/) sólo se activa en la raíz", () => {
  assert.equal(isNavItemActive("/", null, "/"), true);
  assert.equal(isNavItemActive("/finanzas/", null, "/"), false);
});
