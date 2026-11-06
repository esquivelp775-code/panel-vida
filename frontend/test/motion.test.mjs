import test from "node:test";
import assert from "node:assert/strict";
import { indexDirection, routeDirection, sectionOf } from "../lib/motion.ts";

test("sectionOf ubica cada ruta en su pestaña de la barra inferior", () => {
  assert.equal(sectionOf("/"), 0);
  assert.equal(sectionOf("/finanzas/"), 1);
  assert.equal(sectionOf("/movimientos/detalle/"), 1);
  assert.equal(sectionOf("/cuentas"), 1);
  assert.equal(sectionOf("/calendario/"), 2);
  assert.equal(sectionOf("/vida/"), 3);
  assert.equal(sectionOf("/ryventis/"), 4);
  assert.equal(sectionOf("/configuracion/"), 4);
  assert.equal(sectionOf("/mas/"), 4);
});

test("ir a una pestaña a la derecha avanza; a la izquierda retrocede", () => {
  assert.equal(routeDirection("/", "/finanzas/"), "forward");
  assert.equal(routeDirection("/vida/", "/calendario/"), "back");
  assert.equal(routeDirection("/mas/", "/"), "back");
});

test("dentro de una sección, entrar al detalle avanza y volver retrocede", () => {
  assert.equal(routeDirection("/movimientos/", "/movimientos/detalle/"), "forward");
  assert.equal(routeDirection("/cuentas/detalle/", "/cuentas/"), "back");
  assert.equal(routeDirection("/finanzas/", "/movimientos/"), "forward");
  assert.equal(routeDirection("/deudas/", "/finanzas/"), "back");
});

test("la misma ruta o hermanas al mismo nivel no se desplazan", () => {
  assert.equal(routeDirection("/finanzas/", "/finanzas"), "none");
  assert.equal(routeDirection("/cuentas/", "/deudas/"), "none");
});

test("registrar abre hacia adelante desde cualquier lugar y cerrar regresa", () => {
  assert.equal(routeDirection("/vida/", "/registrar/"), "forward");
  assert.equal(routeDirection("/registrar/", "/"), "back");
});

test("indexDirection compara posiciones de pestañas internas", () => {
  assert.equal(indexDirection(0, 2), "forward");
  assert.equal(indexDirection(3, 1), "back");
  assert.equal(indexDirection(1, 1), "none");
  assert.equal(indexDirection(-1, 2), "none");
});
