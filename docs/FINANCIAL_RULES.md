# Reglas financieras — Panel de Vida

Estas reglas son **no negociables**. Cada regla tiene una prueba automatizada asociada en
`backend/tests/` (columna *Prueba*). Una regla sin prueba no se considera implementada.

## 1. Modelo contable: doble partida

* Toda operación es una **transacción** compuesta por **entradas** (`entries`).
* Cada entrada afecta a una cuenta con un importe con signo, en centavos (`BIGINT`).
* **Invariante central:** la suma de las entradas de una transacción es exactamente `0` y hay
  al menos 2 entradas. Lo garantiza un *constraint trigger* diferido en PostgreSQL, no sólo el
  código Python.
* Convención de signo (débito positivo):
  * Activo: `+` aumenta lo que tienes.
  * Pasivo: `−` aumenta lo que debes. Lo adeudado = `−SUM(entries)`.
  * Gasto: `+` registra gasto. Ingreso: `−` registra ingreso. Capital: `−` aumenta capital.
* La API expone saldos en **perspectiva natural** (positivos para "lo que tengo", "lo que debo",
  "lo que gasté", "lo que gané").

## 2. Tipos de operación y su efecto

| Operación | Entradas | ¿Ingreso? | ¿Gasto? | Efecto en deuda |
|---|---|---|---|---|
| Ingreso | activo `+X`, ingreso `−X` | sí | no | – |
| Gasto (efectivo/débito) | activo `−X`, gasto `+X` | no | sí | – |
| Compra con tarjeta | tarjeta `−X`, gasto `+X` | no | **sí (en la fecha de compra)** | **+X obligación** |
| Pago de tarjeta | activo `−X`, tarjeta `+X` | no | **no** | −X |
| Transferencia propia | origen `−X`, destino `+X` | **no** | **no** | – |
| Pago de préstamo | activo `−(P+I)`, préstamo `+P`, gasto intereses `+I` | no | sólo `I` | −P |
| Disposición de préstamo | préstamo `−X`, activo `+X` | no | no | +X |
| Ajuste de saldo | cuenta `±X`, capital "Ajustes" `∓X` | no | no | según cuenta |
| Saldo inicial | cuenta `±X`, capital "Saldos iniciales" `∓X` | no | no | según cuenta |
| Reversión | espejo exacto de la original | – | – | anula |

Consecuencias explícitas:

* **R1** Montos en centavos enteros. Nunca `float`. Pydantic rechaza decimales.
* **R2** Compra con tarjeta = gasto + obligación (el saldo adeudado de la tarjeta).
* **R3** Pago de tarjeta reduce el pasivo y **no** vuelve a generar gasto.
* **R4** Transferencia entre cuentas propias no es ingreso ni gasto.
* **R5** Trazabilidad: cada transacción guarda tipo, fecha, descripción, `created_at`, y si fue
  anulada, quién la revirtió (`reverses_id`). El `audit_log` registra creación/anulación/cambios.
* **R6** No se borra información financiera: triggers bloquean `UPDATE`/`DELETE` en `entries` y
  `DELETE` en `transactions`. En `transactions` sólo se permite fijar `voided_at`/`void_reason` una
  vez. Las cuentas se archivan, no se borran (y sólo con saldo 0).
* **R7** Idempotencia: `Idempotency-Key` + hash del cuerpo. Misma clave y mismo cuerpo → misma
  transacción (200). Misma clave, cuerpo distinto → 409.
* **R8** Cada operación se ejecuta en una única transacción de BD; si algo falla no queda nada
  a medias.
* **R9** Saldos derivados de las entradas (no almacenados) → imposible que cuenta y saldo
  diverjan. `GET /reports/integrity` verifica el libro completo.
* **R10** Conciliación: `POST /accounts/{id}/reconcile` compara saldo del libro con el del estado
  de cuenta y, opcionalmente, crea un ajuste trazable por la diferencia.

## 3. Validaciones del servidor

* `amount_cents` entero, `> 0`, `≤ 1 000 000 000 000` (10 mil millones en unidades).
* Las cuentas deben pertenecer al usuario y no estar archivadas.
* Clase correcta según operación (p. ej. `category_id` de un gasto debe ser cuenta `expense`).
* Origen ≠ destino en transferencias.
* Todas las cuentas de una transacción deben tener la misma moneda (MVP monomoneda; se valida
  también en el trigger).
* Las cuentas de sistema (capital) no aceptan operaciones directas del usuario.
* Una transacción sólo se puede anular una vez; una reversión no se puede anular (se registra una
  nueva operación en su lugar).

## 4. Tarjetas de crédito

* Configuración: `credit_limit_cents`, `statement_day` (día de corte), `due_day` (día límite de pago).
* **Saldo adeudado** = `−SUM(entries)` de la tarjeta.
* **Crédito disponible** = límite − adeudado (puede ser negativo: sobregiro, se informa, no se
  bloquea — la realidad manda).
* **Pago para no generar intereses (estimado)**: saldo adeudado al último corte menos pagos
  registrados después del corte, mínimo 0. Fecha: primer `due_day` posterior al corte. Si esa
  fecha ya pasó, se muestra el siguiente ciclo con el saldo actual como estimación.
* Días 29–31 se ajustan al último día del mes.

## 5. Préstamos

* Cuenta `loan` (pasivo). La disposición o el saldo inicial crean la deuda.
* El pago separa **capital** (reduce deuda) e **interés** (gasto en la categoría indicada).

## 6. Flujo de efectivo

* `income_cents` / `expense_cents` por mes: criterio de devengo por categoría (las compras con
  tarjeta cuentan en la fecha de compra).
* `liquid_change_cents`: variación real del dinero disponible (efectivo + cheques + ahorro). Aquí
  sí aparece el pago de tarjeta y no la compra. Ambas vistas son necesarias y se muestran juntas.
* Dinero disponible = suma de cuentas `cash`, `checking`, `savings`. `investment` cuenta en
  patrimonio pero no como disponible.

## 7. Proyección

Parte del dinero disponible de hoy y aplica, en orden de fecha, las obligaciones pendientes
(`outflow` resta, `inflow` suma) y los pagos estimados de tarjeta dentro del horizonte. Reporta el
saldo mínimo proyectado y su fecha. Es una estimación: no crea transacciones.

## 8. Fuera de alcance del MVP (documentado)

* Multimoneda y tipos de cambio.
* Pagos mínimos de tarjeta y cálculo real de intereses de la tarjeta.
* Meses sin intereses (MSI) — candidato prioritario de la siguiente iteración.
* Importación automática de estados de cuenta bancarios.
