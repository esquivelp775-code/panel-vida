import test from "node:test";
import assert from "node:assert/strict";
import { parseToCents, parseToCentsAllowZero, formatCents, centsToInput } from "../lib/money.ts";

test("parsea entradas válidas", () => {
  assert.equal(parseToCents("1,234.56"), 123456);
  assert.equal(parseToCents("1234.5"), 123450);
  assert.equal(parseToCents("1234"), 123400);
  assert.equal(parseToCents("0.07"), 7);
  assert.equal(parseToCents(".5"), 50);
  assert.equal(parseToCents("$ 99.99"), 9999);
  assert.equal(parseToCents("19.99"), 1999); // el caso clásico de float: 19.99*100
  assert.equal(parseToCents("1.15"), 115);
  assert.equal(parseToCents("5."), 500);
});

test("rechaza entradas inválidas", () => {
  for (const bad of ["", " ", "abc", "-5", "1.234", "1..2", "1.2.3", "12,34", "1,2345.00", "0", "0.00", "1e5", "1,000,000,000,000.01", "--1", "."]) {
    assert.equal(parseToCents(bad), null, `debería rechazar "${bad}"`);
  }
});

test("allowZero", () => {
  assert.equal(parseToCentsAllowZero("0"), 0);
  assert.equal(parseToCentsAllowZero("0.00"), 0);
  assert.equal(parseToCentsAllowZero("5"), 500);
  assert.equal(parseToCentsAllowZero(""), null);
  assert.equal(parseToCentsAllowZero("-1"), null);
});

test("formato y roundtrip", () => {
  assert.match(formatCents(123456), /1,234\.56/);
  assert.equal(centsToInput(123450), "1234.50");
  assert.equal(centsToInput(5), "0.05");
});
