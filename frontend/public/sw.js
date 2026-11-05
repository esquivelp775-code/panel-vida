/* Service worker mínimo de Panel de Vida.
 * Cachea SOLO el shell estático (HTML/JS/CSS/íconos del mismo origen).
 * Nunca toca /api ni peticiones a otros orígenes (la API), nunca cachea
 * respuestas con datos y nunca encola escrituras sin conexión. */
const CACHE = "panel-vida-shell-v2";
const PRECACHE = ["/", "/login/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // escrituras: siempre red, sin cola
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API u otros orígenes: no se tocan
  if (url.pathname.startsWith("/api")) return; // por si la API se sirve en el mismo origen
  if (req.headers.has("authorization")) return;

  const isAsset = url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|ico|webmanifest)$/.test(url.pathname);
  if (isAsset) {
    // Archivos con hash: cache primero.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  if (req.mode === "navigate") {
    // Páginas del shell: red primero, caché si no hay conexión.
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});
