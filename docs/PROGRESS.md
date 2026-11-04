# Progreso — Panel de Vida

Última actualización: 2026-11-04 (sesión 1).

## Fase actual
Fases 0–6 implementadas con pruebas; fase 7 (auditoría) con la primera ronda hecha y corregida;
fase 8 preparada pero **no desplegada**.

## Objetivos completados (con evidencia)
| Objetivo | Evidencia |
|---|---|
| Arquitectura documentada y contrato API v1 | `docs/ARCHITECTURE.md`, ADRs en `docs/DECISIONS.md` |
| Modelo financiero de doble partida, centavos, inmutable | migraciones 0001/0002; `tests/test_db_integrity.py` (los triggers rechazan UPDATE/DELETE y asientos descuadrados) |
| API funcional con pruebas | **59 pruebas pytest en verde** contra PostgreSQL 16 real (`python -m pytest -q`) |
| Ingresos, gastos, transferencias, devoluciones | `tests/test_financial_rules.py`, `test_f9_partial_refund_reduces_expense` |
| Tarjetas (corte, pago, disponible) y deudas (capital/interés) | `tests/test_planning.py`, `test_f6`, `test_f11` |
| Obligaciones recurrentes, vencimientos, proyección, presupuestos | `tests/test_planning.py`, `test_f1`, `test_f8` |
| Exportación CSV/JSON y conciliación | `test_exports`, `test_r10_reconcile` |
| Frontend conectado al backend | build + lint + 4 pruebas de `parseToCents` en verde; recorrido en Chromium a 360 px: login → dashboard (cifras comprobadas a mano contra los datos ficticios) → registrar gasto (123.45 → 12 345 centavos) → registrar devolución → integridad `ok` |
| Revisión financiera independiente | 16 hallazgos; corregidos F1–F6, F8–F11, F13 con prueba de regresión |
| Auditoría de seguridad independiente | sin acceso cruzado; corregidos S1–S5, S7 |
| Portabilidad | Dockerfile, docker-compose (PostgreSQL + API + nginx), guía Debian; `docker compose config` válido |
| CI | `.github/workflows/ci.yml` (no ejecutado: el push está bloqueado) |

## Agentes y modelos utilizados
| Agente | Modelo | Tarea | Resultado |
|---|---|---|---|
| orquestador (sesión principal) | Opus | arquitectura, núcleo financiero, backend, integración, correcciones | — |
| documentation-specialist | Haiku | prueba de invocación | OK (vía `general-purpose`, ver nota) |
| frontend-engineer | Sonnet | frontend Next.js PWA completo | build/lint/tests OK; 1 bug de contrato detectado después por seguridad (corregido) |
| financial-domain-expert | Opus | revisión del libro mayor | 1 alto, 8 medios, 7 bajos |
| security-auditor | Sonnet | auditoría con sondeo de dos usuarios | 0 críticos, 3 medios, varios bajos |

Nota: los agentes de `.claude/agents/` se registran al iniciar Claude Code. En esta sesión (que los creó)
`subagent_type: documentation-specialist` devolvió "not found"; se invocaron como `general-purpose` con
`model` explícito y su archivo de rol. En la próxima sesión deberían estar disponibles por nombre.

No se usaron: systems-architect, backend-engineer, database-engineer, qa-engineer, ux-reviewer (el
orquestador cubrió esas tareas directamente para no duplicar contexto).

## Pruebas
* Backend: 59 passed (2 ejecuciones consecutivas; incluye downgrade/upgrade de migraciones por sesión).
* Frontend: lint 0 errores; `node --test` 4/4; `next build` OK (14 páginas estáticas).
* E2E manual con Playwright (scripts fuera del repo): OK, sin errores de consola.
* **No ejecutado:** `docker build`/`compose up` (sin daemon Docker), CI de GitHub, `npm audit`.

## Hallazgos pendientes (documentados, no corregidos)
| Id | Descripción | Motivo |
|---|---|---|
| F7 | Obligación de pago de tarjeta pendiente sigue contando si se paga la tarjeta directamente por `/transactions` | requiere decidir UX (¿vincular pagos manuales a obligaciones?) |
| F12 | Estado vencido sin pagar pierde la marca "vencido" al pasar el siguiente corte | bajo; requiere historial de ciclos |
| F14 | Cancelar una obligación recurrente termina la serie (no hay "saltar esta") | mejora de UX |
| F15 | La BD no impide anular una reversión (sólo Python); integridad no verifica espejo exacto | bajo |
| F16 | Anular en noviembre una operación de octubre cambia octubre | por diseño (ADR-004); usar `refund` para devoluciones reales |
| S6 | TLS/HSTS en el servidor Debian | requiere dominio/infraestructura |
| S8 | HEALTHCHECK en Dockerfile, hashes de pip | menor |
| UX | Edición de cuentas/obligaciones desde la UI, MSI, pago mínimo | siguiente iteración |

## Bloqueos que requieren al propietario
1. **Push a GitHub rechazado (403):** la app de GitHub de Claude no tiene permiso de escritura en
   `esquivelp775-code/panel-vida`. Instalar/reconectar en https://github.com/apps/claude/installations/select_target
   o https://claude.ai/connect-github. Los commits están en la rama local
   `claude/panel-vida-autonomous-mission-zb4856` (se entregó además un `git bundle`).
2. **Despliegue:** faltan cuenta/sitio de Netlify, host para el backend con HTTPS y dominio.
3. **Decisión de negocio (no bloqueante):** moneda base asumida MXN; confirmar.

## Consumo
No hubo visibilidad de `/usage` ni del saldo del crédito desde esta sesión remota; no se registran cifras.
Actividades de mayor consumo: construcción del frontend (Sonnet), revisión financiera (Opus), núcleo
backend (Opus).

## Próxima acción
1. Resolver el push y dejar que CI corra en GitHub; corregir lo que falle.
2. Construir imágenes Docker en una máquina con Docker y probar `docker compose up` + respaldo/restauración.
3. Pruebas E2E con Playwright en CI.
4. F7 y edición desde la UI; luego MSI.
