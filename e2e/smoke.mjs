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
const before = await api("/transactions?limit=1");

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
await page.click("button[type=submit]");
await page.waitForFunction(
  async ([api, token, prevTotal]) => {
    const r = await fetch(`${api}/transactions?limit=1`, { headers: { authorization: `Bearer ${token}` } });
    return (await r.json()).total > prevTotal;
  },
  [API, access_token, before.total],
  { timeout: 15000 },
);
const last = (await api("/transactions?limit=1")).items[0];
assert.equal(last.amount_cents, 4207, "42.07 se guarda como 4207 centavos exactos");
const integrity = await api("/reports/integrity");
assert.equal(integrity.ok, true, "integridad del libro");
assert.deepEqual(errors, [], "sin errores de JavaScript");
await page.screenshot({ path: "smoke-dashboard.png" });
await browser.close();
console.log(`E2E OK: disponible ${fmt}, gasto #${last.id} ${last.kind} 4207, integridad ok`);
