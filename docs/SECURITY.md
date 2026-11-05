# Seguridad — Panel de Vida

## Implementado y probado
| Control | Dónde | Prueba |
|---|---|---|
| Todas las rutas (salvo health/login) exigen Bearer JWT HS256 con expiración | `app/security.py` | `test_requires_token` |
| Contraseñas con scrypt (n=2¹⁴, r=8, p=1, sal aleatoria), comparación en tiempo constante | `app/security.py` | login en fixtures |
| Límite de intentos de login (5 / 5 min por email) → 429 | `LoginRateLimiter` | `test_wrong_password_and_rate_limit` |
| Aislamiento por usuario en cada consulta y en el trigger de balance | routers, `ledger.get_account`, trigger | `test_user_isolation` |
| Campos desconocidos rechazados (`extra=forbid`): no se puede inyectar `user_id` | `schemas.py` | `test_unknown_fields_rejected` |
| CSV con neutralización de fórmulas (`=`, `+`, `-`, `@`) | `routers/reports.py` | `test_csv_formula_injection_neutralized` |
| Errores de integridad sin SQL expuesto | `main.py` | – |
| Producción exige `PANEL_SECRET_KEY` ≥32 caracteres y CORS sin `*`; desactiva `/docs` | `config.py` | verificado manualmente |
| Cabeceras `nosniff`, `no-store`, `no-referrer` en la API; `X-Frame-Options DENY` en el frontend | `main.py`, `netlify.toml`, nginx | – |
| Contenedor de la API sin root, con HEALTHCHECK | `backend/Dockerfile` | construido y ejecutado en CI (`stack`) |
| Sin secretos en el repositorio (`.env` ignorado, `.env.example` con marcadores) | `.gitignore` | – |
| Exportación JSON sin `password_hash` | `export_full` | `test_exports` |

| Fail-closed: fuera de development/test se rechaza el secreto por defecto; la imagen fija `PANEL_ENV=production` | `config.py`, Dockerfile | verificado manualmente |
| JWT exige `exp`, `iat`, `sub` | `security.py` | `test_s5_token_without_exp_rejected` |
| Rate limit por email+IP (no bloquea al dueño desde otra IP), tope de memoria, hash ficticio contra enumeración por tiempo | `security.py`, `routers/auth.py` | `test_wrong_password_and_rate_limit` |
| nginx: `server_tokens off`, `limit_req` en login y API, CSP; Netlify: CSP y HSTS | `deploy/nginx.conf`, `netlify.toml` | no ejecutado (sin Docker/Netlify) |

## Auditoría 2026-11-04 (security-auditor, Sonnet)
Sin acceso cruzado entre usuarios (sondeo con dos usuarios sobre todos los endpoints). Hallazgos
corregidos: S1 campo `direction` del frontend rechazado (422), S2 500 al liquidar con interés sin
categoría, S3 secreto por defecto no fail-closed, S4 bloqueo del dueño por rate-limit, S5 JWT sin `exp`,
S7 `offset` enorme → 500. S8 HEALTHCHECK añadido. Pendientes: S6 TLS (requiere infraestructura), hashes de pip.

## Riesgos conocidos / pendientes
1. **Token en `localStorage`**: vulnerable a XSS. Mitigado parcialmente con CSP (`script-src` requiere
   `'unsafe-inline'` por el export de Next.js); a medio plazo cookie httpOnly + SameSite o CSP con nonces.
2. **Rate limit en memoria**: se reinicia con el proceso y no se comparte entre réplicas (aceptable con 1
   proceso; usar tabla en BD si se escala).
3. **Sin revocación de tokens** antes de su expiración (12 h). Cambiar `PANEL_SECRET_KEY` invalida todos.
4. **HTTPS**: obligatorio en producción. Netlify lo da en el frontend; el backend debe ir detrás de un
   proxy TLS (Caddy/nginx + Let's Encrypt) o túnel. No exponer el puerto 8000 directamente.
5. `npm audit` reportó vulnerabilidades en dependencias de desarrollo del frontend: no revisadas aún.
6. Respaldos: `pg_dump` cifrado y fuera del servidor (ver DEPLOYMENT.md). No automatizado todavía.

## Datos
* Sólo datos ficticios en pruebas, seeds y documentación (`seed-demo` marca todo como "(demo)").
* Nunca registrar cuerpos de petición con montos en logs de producción (uvicorn sólo registra la ruta).
