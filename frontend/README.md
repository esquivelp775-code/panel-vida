# Panel de Vida — Frontend

Next.js (App Router) + TypeScript + Tailwind CSS 4, exportado como sitio estático (`output: "export"`).
Se despliega igual en Netlify o en nginx (Debian): sólo se sirve la carpeta `out/`.

## Comandos

```bash
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                     # desarrollo en :3000
npm run build                   # export estático en out/
npm run lint
npm test                        # parseToCents, con node --test (sin dependencias)
```

`NEXT_PUBLIC_API_URL` se incrusta **en tiempo de build**: cámbiala y vuelve a compilar al cambiar de servidor.
El backend debe permitir el origen del frontend en CORS.

## Estructura

- `app/login`, `app/(app)/…`: pantallas (Inicio, Movimientos, Registrar, Cuentas, Deudas, Presupuestos, Flujo, Exportar, Más).
- Al ser export estático no hay rutas dinámicas: los detalles usan query string
  (`/movimientos/detalle/?id=3`, `/cuentas/detalle/?id=3`).
- `lib/api.ts`: cliente tipado de la API v1. `lib/money.ts`: dinero.
- `public/`: manifest, íconos generados (SVG/PNG) y `sw.js`.

## Dinero

Todo importe es **entero en centavos**. `parseToCents` interpreta el texto del usuario ("1,234.56") separando
por el punto decimal, **sin aritmética de punto flotante**; rechaza negativos, cero, más de 2 decimales y
valores sobre el tope del servidor. `formatCents` sólo divide entre 100 para mostrar (`Intl.NumberFormat("es-MX")`).

## Idempotencia

Cada intento de registrar genera un `Idempotency-Key` (UUID). Si falla (red, 5xx) y se reintenta con el mismo
contenido se reutiliza la misma clave, así que el servidor no duplica la operación. Si el usuario cambia
el contenido se genera una clave nueva. El botón se deshabilita mientras se envía.

## Seguridad: token en localStorage (riesgo documentado)

El token JWT se guarda en `localStorage` (`pv_token`) y se envía como `Authorization: Bearer`.
Riesgo: cualquier XSS podría leerlo. Mitigaciones: sin HTML inyectado (React escapa), cabeceras
`X-Frame-Options`, `nosniff` y `Referrer-Policy` en `netlify.toml`, dependencias mínimas, sin scripts de terceros.
Recomendado además: CSP estricta en el servidor, tokens de corta duración y HTTPS siempre. Al recibir 401 se
borra el token y se redirige al login. Las preferencias recordadas (última cuenta/categoría) también viven
en localStorage (`pv_*`) y no contienen montos.

## PWA y uso sin conexión

`public/manifest.webmanifest` (standalone, tema verde) + `public/sw.js`, registrado **sólo en producción**.

Funciona sin conexión:
- Abrir la app instalada: el shell (HTML, JS, CSS e íconos del mismo origen) se carga desde caché
  para las páginas ya visitadas y la página de inicio.

NO funciona sin conexión:
- Ver datos (saldos, movimientos, reportes): **nunca** se cachean respuestas de la API; sin red verás un error de conexión.
- Registrar o modificar algo: **no hay cola de escrituras offline**. Si no hay red, el registro falla y debes reintentar
  (la clave de idempotencia evita duplicados al reintentar).

El service worker ignora peticiones a otros orígenes (la API), a rutas `/api`, a cualquier método distinto de GET y
a peticiones con `Authorization`. Para invalidar caché, sube la versión `CACHE` en `sw.js`.

## Despliegue

- **Netlify**: `netlify.toml` en la raíz del repo (base `frontend`, publish `out`, cabeceras de seguridad). Define
  `NEXT_PUBLIC_API_URL` en las variables de entorno del sitio.
- **nginx**: servir `frontend/out` con `try_files $uri $uri/ =404;` y `error_page 404 /404.html;`.
