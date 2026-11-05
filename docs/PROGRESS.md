# Progreso — Panel de Vida

Última actualización: 2026-11-05 (sesión 1, segunda ronda).

## Fase actual
Fases 0–7 implementadas y verificadas; CI verde en GitHub (backend, frontend y stack completo con
Docker). Fase 8: despliegue preparado y probado en CI, **no desplegado** en un servidor real.

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
| API funcional con pruebas | **67 pruebas pytest en verde** contra PostgreSQL 16 real, local y en CI |
| Ingresos, gastos, transferencias, devoluciones | `tests/test_financial_rules.py`, `test_f9_partial_refund_reduces_expense` |
| Tarjetas (corte, pago, disponible) y deudas (capital/interés) | `tests/test_planning.py`, `test_f6`, `test_f11` |
| Obligaciones recurrentes, vencimientos, proyección, presupuestos | `tests/test_planning.py`, `test_f1`, `test_f8` |
| Exportación CSV/JSON y conciliación | `test_exports`, `test_r10_reconcile` |
| Frontend conectado al backend | build + lint + 4 pruebas de `parseToCents` en verde; recorrido en Chromium a 360 px: login → dashboard (cifras comprobadas a mano contra los datos ficticios) → registrar gasto (123.45 → 12 345 centavos) → registrar devolución → integridad `ok` |
| Revisión financiera independiente | 16 hallazgos; corregidos F1–F6, F8–F11, F13 con prueba de regresión |
| Auditoría de seguridad independiente | sin acceso cruzado; corregidos S1–S5, S7 |
| Portabilidad | Dockerfile, docker-compose (PostgreSQL + API + nginx) **construidos y probados en CI**, respaldo/restauración verificados |
| CI | `.github/workflows/ci.yml`: 3 trabajos, verdes |
| MSI | `tests/test_installments.py` (8 pruebas) + E2E manual |

## Agentes y modelos utilizados
| Agente | Modelo | Tarea | Resultado |
|---|---|---|---|
| orquestador (sesión principal) | Opus | arquitectura, núcleo financiero, backend, integración, correcciones | — |
| documentation-specialist | Haiku | prueba de invocación | OK (vía `general-purpose`, ver nota) |
| frontend-engineer | Sonnet | frontend Next.js PWA completo | build/lint/tests OK; 1 bug de contrato detectado después por seguridad (corregido) |
| financial-domain-expert | Opus | revisión del libro mayor | 1 alto, 8 medios, 7 bajos |
| security-auditor | Sonnet | auditoría con sondeo de dos usuarios | 0 críticos, 3 medios, varios bajos |
| frontend-engineer (por nombre, 2.ª ronda) | Sonnet | UI de MSI, omitir, edición, Corregir | lint/9 tests/build OK; verificado por el orquestador en navegador |

Nota: los agentes de `.claude/agents/` se registran al iniciar Claude Code. En esta sesión (que los creó)
`subagent_type: documentation-specialist` devolvió "not found"; se invocaron como `general-purpose` con
`model` explícito y su archivo de rol. En la próxima sesión deberían estar disponibles por nombre.

No se usaron: systems-architect, backend-engineer, database-engineer, qa-engineer, ux-reviewer (el
orquestador cubrió esas tareas directamente para no duplicar contexto).

## Pruebas
* Backend: 67 passed (local y CI; incluye downgrade/upgrade de las 3 migraciones).
* Frontend: lint 0 errores; `node --test` 9/9; `next build` OK.
* E2E: `e2e/smoke.mjs` en CI sobre el stack Docker; pruebas manuales de MSI/Corregir/Omitir OK.
* **No ejecutado:** `npm audit`.

## Hallazgos pendientes (documentados, no corregidos)
| Id | Descripción | Motivo |
|---|---|---|
| F12 | Estado vencido sin pagar pierde la marca "vencido" al pasar el siguiente corte | bajo; requiere historial de ciclos |
| F15 | La BD no impide anular una reversión (sólo Python); integridad no verifica espejo exacto | bajo |
| F16 | Anular en noviembre una operación de octubre cambia octubre | por diseño (ADR-004); usar `refund` para devoluciones reales |
| S6 | TLS/HSTS en el servidor Debian | requiere dominio/infraestructura |
| S8 | hashes de pip (`--require-hashes`) | menor |
| MSI | adelantar mensualidades; proyección sólo incluye el próximo pago de cada tarjeta | siguiente iteración |
| UX | "Corregir" reescribe las preferencias de cuenta recordadas; no hay campo de notas en Registrar | menor |

## Bloqueos que requieren al propietario
1. **Despliegue real:** faltan cuenta/sitio de Netlify, host para el backend con HTTPS y dominio
   (o servidor Debian con Docker). Todo lo demás está listo y probado en CI.
2. **Decisión de negocio (no bloqueante):** moneda base asumida MXN; confirmar.

## Consumo
Desde la sesión remota no hay visibilidad de `/usage`. El propietario informó ~11 USD consumidos al
cierre de la primera ronda.
Actividades de mayor consumo: construcción del frontend (Sonnet), revisión financiera (Opus), núcleo
backend (Opus).

## Próxima acción
1. Desplegar (Netlify + backend con HTTPS, o Debian con `docker compose`) siguiendo DEPLOYMENT.md.
2. Pago mínimo e intereses de tarjeta; proyección de varios ciclos de tarjeta (incluye MSI).
3. Importación CSV de estados de cuenta con conciliación asistida.
4. Respaldo automático cifrado (cron + `pg_dump`), notificaciones de vencimientos (PWA push).
