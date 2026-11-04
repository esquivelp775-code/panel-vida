# Registro de decisiones (ADR)

Formato: contexto → decisión → consecuencias. Las decisiones son reversibles salvo que se indique.

## ADR-001 Libro mayor de doble partida (2026-11-04)
**Contexto:** el sistema debe distinguir ingresos, gastos, transferencias, compras y pagos de tarjeta y
préstamos sin inconsistencias. **Decisión:** transacciones con ≥2 entradas que suman 0; categorías como
cuentas nominales; saldos calculados con `SUM`, nunca almacenados. **Consecuencias:** las reglas R2–R4 se
cumplen por construcción; cualquier reporte se deriva del mismo dato; el volumen de un usuario hace que
la suma en línea sea barata (si creciera, añadir instantáneas de saldo verificables).

## ADR-002 Centavos enteros en toda la cadena
`BIGINT` en BD, `StrictInt` en la API (se rechazan floats y strings), parseo por cadenas en el frontend.

## ADR-003 Integridad en la base de datos, no sólo en Python
Triggers diferidos de balance, moneda única y dueño; triggers de inmutabilidad. Un bug en la API o un
`psql` manual no pueden dejar el libro descuadrado ni borrar historia.

## ADR-004 Anulación por reversión con la misma fecha
La reversión se fecha igual que el original para que los reportes del periodo queden netos (el gasto
anulado "desaparece" de su mes). `created_at` y `audit_log` conservan cuándo se anuló realmente.

## ADR-005 Clasificación en el servidor
"Gasto con tarjeta" → `card_purchase`; "transferencia a tarjeta" → `card_payment`; "transferencia a
préstamo" → `loan_payment` sin interés. El cliente no puede romper la semántica contable.

## ADR-006 Autenticación propia mínima
Un usuario; sin registro público (alta por CLI). scrypt (stdlib) + JWT HS256 con expiración. Token en
`localStorage` del frontend (riesgo XSS aceptado y mitigado con CSP pendiente; ver SECURITY.md).
**Revisar** si se añaden usuarios: cookies httpOnly + refresh tokens.

## ADR-007 Frontend como export estático
Next.js `output: "export"`: idéntico en Netlify y en nginx/Debian, sin servidor Node en producción.
Sin rutas dinámicas: los detalles usan query string (`/cuentas/detalle/?id=`).

## ADR-008 Monomoneda en el MVP
Moneda base por usuario (MXN por defecto). El trigger impide mezclar monedas en una transacción.
Multimoneda requerirá cuentas de cambio y tipo de cambio por transacción.

## ADR-009 Agentes del proyecto
Definidos en `.claude/agents/`. Claude Code los registra al iniciar la sesión; en la sesión que los
creó se invocaron como `general-purpose` con `model` explícito y su archivo de rol (verificado).
