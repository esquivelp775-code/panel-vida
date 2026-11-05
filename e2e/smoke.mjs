// Prueba de humo de punta a punta: navegador real (360 px) → frontend estático → API → PostgreSQL.
// Uso: BASE_URL=http://localhost:8080 API_URL=http://localhost:8080 E2E_EMAIL=... E2E_PASSWORD=... node smoke.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API = (process.env.API_URL ?? "http://localhost:8000") + "/api/v1";
const EMAIL = process.env.E2E_EMAIL ?? "demo@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "demo-password-123";

const login = await fetch(`${API}/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
assert.equal(login.status, 200, "login API");
const { access_token } = await login.json();
const api = async (path) => {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${access_token}` } });
  assert.equal(r.status, 200, path);
  return r.json();
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/login/`);
await page.fill("input[type=email]", EMAIL);
await page.fill("input[type=password]", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 15000 });
await page.getByText("Dinero disponible").waitFor({ timeout: 15000 });
const dash = await api("/dashboard");
const shown = await page.textContent("body");
const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(dash.available_cents / 100);
assert.ok(shown.includes(fmt), `el dashboard muestra el disponible del API (${fmt})`);

await page.goto(`${BASE}/registrar/`);
const amount = page.locator("input[inputmode=decimal]").first();
await amount.waitFor();
await amount.fill("42.07");
// Esperar la respuesta real del POST (no sondear: el sondeo podía leer antes de que terminara el alta).
const [created] = await Promise.all([
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/transactions"),
    { timeout: 15000 }),
  page.click("button[type=submit]"),
]);
assert.equal(created.status(), 201, "el alta responde 201");
const createdTx = await created.json();
const last = await api(`/transactions/${createdTx.id}`);
assert.equal(last.amount_cents, 4207, "42.07 se guarda como 4207 centavos exactos");
// Importación de estado de cuenta: vista previa, clasificación en bloque, alta atómica y reimportación.
const debit = (await api("/accounts")).find((a) => a.subtype === "checking");
const balBefore = debit.balance_cents;
const csv = 'Fecha,Concepto,Cargo,Abono\n01/11/2026,SUPER (e2e),"1,250.40",\n02/11/2026,FARMACIA (e2e),89.90,\n03/11/2026,DEPOSITO (e2e),,"3,000.00"\n';
async function openImport() {
  await page.goto(`${BASE}/importar/`);
  const acc = page.locator("select").first();
  await acc.waitFor();
  await acc.selectOption({ label: debit.name });
  await page.setInputFiles("input[type=file]", { name: "estado.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByText("Revisar archivo").click();
}
await openImport();
const bulks = page.locator("select", { has: page.locator("option", { hasText: "Categoría…" }) });
await bulks.first().waitFor({ timeout: 15000 });
await bulks.nth(0).selectOption({ label: "Comida" });
await page.getByText(/Aplicar a 2 sin clasificar/).click();
await bulks.nth(1).selectOption({ label: "Salario" });
await page.getByText(/Aplicar a 1 sin clasificar/).click();
const [imp] = await Promise.all([
  page.waitForResponse((r) => r.url().endsWith("/imports/commit"), { timeout: 15000 }),
  page.getByText("Importar 3 movimientos").click(),
]);
assert.equal(imp.status(), 200, "commit de importación");
assert.equal((await imp.json()).created, 3);
const balAfter = (await api(`/accounts/${debit.id}`)).balance_cents;
assert.equal(balAfter - balBefore, -125040 - 8990 + 300000, "saldo exacto tras importar");
await openImport();
await page.getByText("Importar 0 movimientos").waitFor({ timeout: 15000 }); // reimportar no duplica
const integrity = await api("/reports/integrity");
assert.equal(integrity.ok, true, "integridad del libro");
assert.deepEqual(errors, [], "sin errores de JavaScript");
await page.screenshot({ path: "smoke-dashboard.png" });
await browser.close();
console.log(`E2E OK: disponible ${fmt}, gasto #${last.id} 4207, importación 3 filas sin duplicar, integridad ok`);
