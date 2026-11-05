# Progreso — Panel de Vida

Última actualización: 2026-11-05 (sesión 1, despliegue).

## Fase actual
Fases 0–7 implementadas y verificadas; CI verde en GitHub (backend, frontend y stack completo con
Docker). Fase 8: despliegue preparado y probado en CI, **no desplegado** en un servidor real.

## Auditoría y Configuración (2026-11-05)
* Corregido: fecha "hoy" según `PANEL_TIMEZONE` (por defecto America/Mexico_City; antes UTC cambiaba el día a las
  6 p. m.); vencimientos de tarjeta ocultos cuando el saldo se cargó tras el corte; plan de deudas ignoraba pagos
  únicos (tandas); límite de inicio de sesión evadible con X-Forwarded-For (`PANEL_FORWARDED_ALLOW_IPS="*"`), ahora
  hay tope por correo; respaldo JSON sin MSI, pendientes, hábitos ni Ryventis; calendario sin vencidos de meses
  pasados; carga inicial revivía pendientes terminados.
* UI: aportaciones (`savings`) y tandas en Deudas, interés al pagar cuotas, recibos pagables con tarjeta, MSI ya no se
  hereda a la siguiente compra, Inicio muestra errores de carga, tasa editable en tarjetas.
* Nuevo: `/configuracion/` (perfil, contraseña, cerrar otras sesiones, recordatorios, verificar el libro). Migración 0010.
* Pendiente de decidir: `connect-src https:` del CSP en `netlify.toml` sigue sin fijar el dominio real de la API.

## Pedidos del propietario para la siguiente sesión (2026-11-05)
1. **Ryventis completo** (grupo propio en el menú ya creado): clientes/CRM (etapas, seguimientos),
   proyectos en curso con monto y entregas, y **cuentas por cobrar** — muy desglosado (referencias:
   gestor de proyectos freelance y CRM personal que compartió).
2. **Vida → Alimentación y ejercicio** (nueva sección).
3. ~~Recordatorios configurables~~ (hecho en Configuración; se guardan por dispositivo).
4. Registrar MSI vigentes (Mercado Pago, Banamex, BBVA) y confirmar saldos con Conciliar.

## Carga inicial y diseño v3 (2026-11-05, cierre)
* `POST /setup/bulk` (dry_run, idempotente) + pantalla `/carga-inicial/`; obligación `savings` (tandas =
  ahorro, no gasto). Diseño v3 en grises con foco de luz al cursor y menú lateral agrupado.
* Se preparó para el propietario un JSON de carga con sus datos reales (fuera del repositorio): 11 cuentas,
  8 categorías, 40 pagos programados (fijos, tandas, tarjetas). Supuestos a confirmar por él: montos pagados a
  INVEX/BBVA/Mercado Pago en el último periodo y si se pagó el Crédito Santander de octubre.
* Siguiente: confirmar la carga en la app, registrar MSI vigentes (Mercado Pago, Banamex, BBVA) como planes,
  CRM de Ryventis, notificaciones.

## Rediseño v2, Ryventis y plan de deudas (2026-11-05, cierre de sesión 1)
* API: tablero Ryventis (área `ryventis`, estado `doing`) y `/reports/debt-plan` (meta: libre de deudas
  en mayo–junio 2027; pago mensual necesario por deuda, ritmo actual, viabilidad, proyección).
* UI v2 (liquid glass, fondo animado, tipografías Bricolage Grotesque + Inter + Instrument Serif),
  Inicio por segmentos (Hoy · Esta semana · Ryventis · Finanzas), hub /finanzas con plan de deudas.
* **Siguiente sesión, en orden:** (1) cargar estados de cuenta reales (el propietario los compartirá;
  convertirlos a CSV de importación, nunca guardarlos en el repo); (2) CRM personal para Ryventis
  (contactos, etapas Nuevo→Charla→Propuesta→Cliente, próximos seguimientos) según la referencia del
  propietario; (3) proyectos Ryventis con monto y entregas; (4) notificaciones push.

## Vida y dashboard interactivo (2026-11-05)
* API (migración 0006): pendientes (`/tasks`), hábitos con racha (`/habits`), calendario mensual (`/calendar`).
* UI: navegación Inicio · Movimientos · Calendario · Vida · Más; dashboard con animaciones y gráficas
  (dona por categoría, ingresos vs gastos, sparkline), próximos 7 días, hábitos de hoy; calendario con hoja
  del día; Vida con pendientes agrupados y hábitos (7 días, racha, anillo semanal).
* Verificado en Chromium contra la API real; 101 pruebas backend, 16 frontend.
* Pendiente sugerido: CRM/proyectos (módulos "de vida" restantes de la misión original), notificaciones
  push de vencimientos y pendientes, metas de ahorro.

## Despliegue (2026-11-05) — EN LÍNEA
* **Desplegado y verificado por el propietario**: frontend en Netlify, API en Render (Blueprint `render.yaml`,
  plan gratuito), base de datos PostgreSQL 16 en Neon. Inicio de sesión real correcto.
* Incidencias resueltas: Render/Netlify apuntaban a `main` (sólo commit inicial) → rama de trabajo;
  `PANEL_CORS_ORIGINS` con "/" final → la API ahora la tolera.
* Pendiente del propietario: borrar `PANEL_BOOTSTRAP_PASSWORD` en Render; exportar respaldo semanal.
* Plan: usar este alojamiento 1–2 meses y mudar a Debian (GUIA_SENCILLA.md → "la mudanza").

## Tercera ronda (2026-11-05)
* Moneda base **MXN confirmada** por el propietario.
* Tarjetas: pago mínimo estimado (Banxico), vencido persistente (F12), ciclos explícitos para vencimientos y
  proyección (incluye MSI futuros con tope de lo adeudado).
* Importación de estados de cuenta CSV (API + UI): vista previa, duplicados, mensualidades MSI marcadas,
  clasificación en bloque, alta atómica, reimportación idempotente.
* Respaldo diario cifrado (`deploy/backup.sh`, `restore.sh`, timer systemd), túnel opcional
  (`docker-compose.tunnel.yml`), guía "Esta noche" en DEPLOYMENT.md (Tailscale recomendado).
* Migraciones 0004 (F15) y 0005 (F13).
* 2.ª revisión financiera (Opus): 1 alto, 7 medios, 5 bajos — corregidos todos salvo B12 (ver tabla).
* Verificado en navegador: importar y reimportar, MSI, Corregir, Omitir; E2E del CI incluye importación.

## Segunda ronda (2026-11-05)
* Push desbloqueado; **CI verde** en las 4 ejecuciones: pytest contra PostgreSQL, lint/test/build del
  frontend y el trabajo `stack`: `docker compose up --build`, usuario + datos ficticios, E2E en Chromium a
  través de nginx, `pg_dump`/`pg_restore` con comparación de entradas.
* Meses sin intereses (MSI): API, migración 0003, estado de tarjeta con lo diferido, UI de alta y de planes.
* F7 (vencimiento de tarjeta no se cuenta doble), F14 (omitir una repetición), S8 (HEALTHCHECK).
* UI: Corregir movimiento (crear + anular), editar cuentas y obligaciones, omitir este mes.
* Verificado en navegador contra la API real: compra a 3 MSI, Corregir 300→250 conservando MSI, Omitir.

## Objetivos completados (con evidencia)
| Objetivo | Evidencia |
|---|---|
| Arquitectura documentada y contrato API v1 | `docs/ARCHITECTURE.md`, ADRs en `docs/DECISIONS.md` |
| Modelo financiero de doble partida, centavos, inmutable | migraciones 0001/0002; `tests/test_db_integrity.py` (los triggers rechazan UPDATE/DELETE y asientos descuadrados) |
| API funcional con pruebas | **93 pruebas pytest en verde** contra PostgreSQL 16 real, local y en CI |
| Ingresos, gastos, transferencias, devoluciones | `tests/test_financial_rules.py`, `test_f9_partial_refund_reduces_expense` |
| Tarjetas (corte, pago, disponible) y deudas (capital/interés) | `tests/test_planning.py`, `test_f6`, `test_f11` |
| Obligaciones recurrentes, vencimientos, proyección, presupuestos | `tests/test_planning.py`, `test_f1`, `test_f8` |
| Exportación CSV/JSON y conciliación | `test_exports`, `test_r10_reconcile` |
| Frontend conectado al backend | build + lint + 4 pruebas de `parseToCents` en verde; recorrido en Chromium a 360 px: login → dashboard (cifras comprobadas a mano contra los datos ficticios) → registrar gasto (123.45 → 12 345 centavos) → registrar devolución → integridad `ok` |
| Revisión financiera independiente | 16 hallazgos; corregidos F1–F6, F8–F11, F13 con prueba de regresión |
| Auditoría de seguridad independiente | sin acceso cruzado; corregidos S1–S5, S7 |
| Portabilidad | Dockerfile, docker-compose (PostgreSQL + API + nginx) **construidos y probados en CI**, respaldo/restauración verificados |
| CI | `.github/workflows/ci.yml`: 3 trabajos, verdes |
| MSI | `tests/test_installments.py` + E2E manual |
| Importación CSV | `tests/test_import.py`, `tests/test_review2_regressions.py`, E2E en CI |
| Respaldo cifrado | probado local y en CI (`stack`) |

## Agentes y modelos utilizados
| Agente | Modelo | Tarea | Resultado |
|---|---|---|---|
| orquestador (sesión principal) | Opus | arquitectura, núcleo financiero, backend, integración, correcciones | — |
| documentation-specialist | Haiku | prueba de invocación | OK (vía `general-purpose`, ver nota) |
| frontend-engineer | Sonnet | frontend Next.js PWA completo | build/lint/tests OK; 1 bug de contrato detectado después por seguridad (corregido) |
| financial-domain-expert | Opus | revisión del libro mayor | 1 alto, 8 medios, 7 bajos |
| security-auditor | Sonnet | auditoría con sondeo de dos usuarios | 0 críticos, 3 medios, varios bajos |
| frontend-engineer (por nombre, 2.ª ronda) | Sonnet | UI de MSI, omitir, edición, Corregir | lint/9 tests/build OK; verificado por el orquestador en navegador |
| frontend-engineer (3.ª ronda) | Sonnet | UI de importación y pago mínimo | lint/11 tests/build OK; verificado en navegador |
| financial-domain-expert (2.ª revisión) | Opus | MSI, importador, ciclos de tarjeta | 1 alto, 7 medios, 5 bajos; corregidos |

Nota: los agentes de `.claude/agents/` se registran al iniciar Claude Code. En esta sesión (que los creó)
`subagent_type: documentation-specialist` devolvió "not found"; se invocaron como `general-purpose` con
`model` explícito y su archivo de rol. En la próxima sesión deberían estar disponibles por nombre.

No se usaron: systems-architect, backend-engineer, database-engineer, qa-engineer, ux-reviewer (el
orquestador cubrió esas tareas directamente para no duplicar contexto).

## Pruebas
* Backend: 93 passed (local y CI; incluye downgrade/upgrade de las 5 migraciones).
* Frontend: lint 0 errores; `node --test` 11/11; `next build` OK; `npm audit --omit=dev` 0 vulnerabilidades.
* E2E: `e2e/smoke.mjs` en CI sobre el stack Docker; pruebas manuales de MSI/Corregir/Omitir OK.
* **No ejecutado:** despliegue real (Netlify/Tailscale/Cloudflare requieren cuentas del propietario).

## Hallazgos pendientes (documentados, no corregidos)
| Id | Descripción | Motivo |
|---|---|---|
| B12 | El commit de importación confía en la huella enviada por el cliente | bajo: sólo afecta la deduplicación del propio usuario |
| F16 | Anular en noviembre una operación de octubre cambia octubre | por diseño (ADR-004); usar `refund` para devoluciones reales |
| S6 | TLS/HSTS en el servidor Debian | requiere dominio/infraestructura |
| S8 | hashes de pip (`--require-hashes`) | menor |
| MSI | adelantar mensualidades; proyección sólo incluye el próximo pago de cada tarjeta | siguiente iteración |
| UX | "Corregir" reescribe las preferencias de cuenta recordadas; no hay campo de notas en Registrar | menor |

## Bloqueos que requieren al propietario
Ninguno bloqueante. Pendientes: borrar `PANEL_BOOTSTRAP_PASSWORD` en Render; preparar el servidor Debian
(estimado 1–1.5 semanas) para la mudanza.

## Consumo
Desde la sesión remota no hay visibilidad de `/usage`. El propietario informó ~11 USD al cierre de la
primera ronda y ~8 USD más tras la segunda.
Actividades de mayor consumo: construcción del frontend (Sonnet), revisión financiera (Opus), núcleo
backend (Opus).

## Próxima acción
1. Cargar datos reales (GUIA_SENCILLA.md → "¿Cómo cargo mis estados de cuenta…?").
2. Metas de ahorro y presupuesto en el dashboard; notificaciones push (vencimientos, pendientes, hábitos).
3. Módulos de vida restantes: proyectos y CRM personal (contactos/seguimientos), en ese orden.
4. Mudanza a Debian cuando el servidor esté listo (GUIA_SENCILLA.md → "la mudanza").

Para retomar: en claude.ai/code abrir sesión con `panel-vida` y pedir "lee CLAUDE.md y docs/PROGRESS.md y continúa".
