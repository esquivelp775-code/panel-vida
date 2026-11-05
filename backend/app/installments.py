"""Meses sin intereses (MSI).

Modelo: la compra completa es gasto y deuda en su fecha (R2). Lo que cambia es cuánto se exige en cada
estado de cuenta: sólo las mensualidades cuyo corte ya ocurrió. Lo "diferido" a una fecha es la parte de
la compra que todavía no se ha facturado; se resta del saldo al corte para obtener el pago del estado.
"""
from datetime import date

from .dates import add_months, clamp


def schedule(total_cents: int, months: int) -> list[int]:
    """Mensualidades exactas en centavos; el residuo se reparte, un centavo, en las primeras."""
    base, rem = divmod(total_cents, months)
    return [base + (1 if i < rem else 0) for i in range(months)]


def first_closing(purchase_on: date, statement_day: int) -> date:
    """Primer corte que incluye la compra (una compra el día de corte entra en ese corte)."""
    c = clamp(purchase_on.year, purchase_on.month, statement_day)
    return c if c >= purchase_on else add_months(c, 1, statement_day)


def billed_count(first: date, months: int, statement_day: int, as_of: date) -> int:
    n = 0
    while n < months and add_months(first, n, statement_day) <= as_of:
        n += 1
    return n


def deferred_at(total_cents: int, months: int, first: date, statement_day: int, purchase_on: date,
                as_of: date) -> int:
    """Parte de la compra aún no facturada al cierre de `as_of` (0 si la compra es posterior)."""
    if as_of < purchase_on:
        return 0
    k = billed_count(first, months, statement_day, as_of)
    return total_cents - sum(schedule(total_cents, months)[:k])


def billed_at(total_cents: int, months: int, first: date, statement_day: int, closing: date) -> int:
    """Mensualidad que se factura exactamente en el corte `closing` (0 si ese corte no le toca)."""
    sched = schedule(total_cents, months)
    for k in range(months):
        c = add_months(first, k, statement_day)
        if c == closing:
            return sched[k]
        if c > closing:
            break
    return 0


def pct_ceil(cents: int, basis_points: int) -> int:
    """Porcentaje en puntos base redondeado hacia arriba al centavo, sin floats."""
    return -(-cents * basis_points // 10_000) if cents > 0 else 0
