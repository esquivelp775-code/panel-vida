import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthGrid, addDays, greeting } from "../lib/calendar.ts";
import { groupTasks } from "../lib/tasks.ts";

test("cuadrícula: noviembre 2026 empieza en domingo -> 6 días previos (lunes inicio)", () => {
  const g = buildMonthGrid("2026-11");
  assert.equal(g[0][0].date, "2026-10-26");
  assert.equal(g[0][6].date, "2026-11-01");
  assert.equal(g[0][6].inMonth, true);
  assert.equal(g[0][5].inMonth, false);
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g.flat().filter((c) => c.inMonth).length, 30);
});
test("cuadrícula: febrero 2027 cabe en 4 semanas", () => {
  const g = buildMonthGrid("2027-02");
  assert.equal(g.length, 4);
  assert.equal(g[0][0].date, "2027-02-01");
});
test("addDays cruza mes y año", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
test("saludo por hora", () => {
  assert.equal(greeting(8), "Buenos días");
  assert.equal(greeting(15), "Buenas tardes");
  assert.equal(greeting(22), "Buenas noches");
});
test("groupTasks agrupa y ordena", () => {
  const mk = (id, due, status = "pending", priority = "normal") => ({ id, due_date: due, status, priority });
  const g = groupTasks([mk(1, "2026-11-10"), mk(2, "2026-11-01"), mk(3, "2026-11-05"), mk(4, null), mk(5, "2026-11-06", "done"), mk(6, "2026-11-05", "pending", "high")], "2026-11-05");
  assert.deepEqual(g.overdue.map((t) => t.id), [2]);
  assert.deepEqual(g.today.map((t) => t.id), [6, 3]);
  assert.deepEqual(g.upcoming.map((t) => t.id), [1]);
  assert.deepEqual(g.nodate.map((t) => t.id), [4]);
  assert.deepEqual(g.done.map((t) => t.id), [5]);
});
