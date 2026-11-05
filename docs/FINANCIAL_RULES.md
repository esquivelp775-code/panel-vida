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
| Devolución (refund) | activo/tarjeta `+X`, gasto `−X` | no | **reduce** el gasto en la fecha de la devolución | −X si fue a tarjeta |
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

* **Anular vs. devolver:** anular corrige un *error de captura* y se fecha igual que el original (el
  periodo original queda neto). Una devolución real del comercio se registra como `refund` en su propia
  fecha, sin reescribir meses cerrados.
* No se puede anular una operación que afecte una cuenta archivada (la cuenta quedaría con saldo oculto).

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
* Días 29–31 se ajustan al último día del mes. Si el día de pago es mayor que el de corte, vence el mismo
  mes; si el mes es corto y ambos colapsan, vence al día siguiente del corte.
* Si el estado ya está cubierto se muestra el **siguiente** ciclo con el saldo actual como estimación.
* Saldos, adeudado y disponible se calculan **hasta hoy**: operaciones con fecha futura no cuentan
  hasta su fecha.

### 4a. Pago mínimo (estimado)
* Mayor entre 1.5 % del saldo revolvente del estado y 1.25 % del límite de crédito (criterio Banxico),
  más las mensualidades MSI del periodo; nunca mayor que el pago del estado. Redondeo hacia arriba al
  centavo con aritmética entera. **No incluye intereses ni IVA**: es una estimación; el estado del banco manda.
* Una tarjeta sigue "vencida" mientras quede saldo sin cubrir de un estado cuya fecha límite ya pasó
  (los pagos se aplican a la deuda más antigua).

### 4b. Meses sin intereses (MSI)
* La compra a meses es **gasto completo y deuda completa en su fecha** (R2 no cambia): el patrimonio y el
  gasto del mes reflejan la compra entera.
* Lo que cambia es el **pago del estado**: cada corte factura una mensualidad. Mensualidades exactas en
  centavos (`total // meses`, el residuo se reparte un centavo en las primeras).
* Primer corte = el primero en o después de la fecha de compra (una compra el día de corte entra en ese corte).
* Pago del estado = saldo al corte − parte MSI aún no facturada al corte − créditos posteriores al corte.
* El plan es inmutable (trigger). Si la compra se anula, el plan deja de contar.
* Fuera de alcance: adelantar mensualidades, MSI con devolución parcial (se registra como `refund` normal).

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

Parte del dinero disponible de hoy y aplica, en orden de fecha, las obligaciones pendientes **con sus
repeticiones mensuales/anuales dentro del horizonte** (`outflow` resta, `inflow` suma; mismo día: entradas
primero), el próximo pago estimado de cada tarjeta y, en ciclos posteriores, **sólo las mensualidades MSI
ya comprometidas** (no se inventa consumo futuro).

## 7a. Importación
* Montos de CSV a centavos sin floats; coma decimal ambigua se rechaza.
* Cada fila importada es una operación normal del libro (mismas reglas R1–R10), con clave de idempotencia
  derivada de la fila; la importación completa es atómica. Reporta el
saldo mínimo proyectado y su fecha. Es una estimación: no crea transacciones.

## 7b. Obligaciones recurrentes
* Al liquidar se crea la siguiente con el **día ancla** original (31 ene → 28 feb → 31 mar).
* Si se anula el pago, la obligación vuelve a pendiente; al volver a liquidarla **no** se duplica la
  siguiente (enlace `generated_from_id`).
* **Omitir** (`skip`) cancela sólo esa repetición y genera la siguiente; **cancelar** termina la serie.
* Un vencimiento de pago de tarjeta pendiente cuenta como máximo lo que el estado de la tarjeta todavía
  exige: si la tarjeta ya se pagó directamente, no se descuenta dos veces en la proyección.

## 8. Fuera de alcance del MVP (documentado)

* Multimoneda y tipos de cambio.
* Pagos mínimos de tarjeta y cálculo real de intereses de la tarjeta.
* Importación automática de estados de cuenta bancarios.
