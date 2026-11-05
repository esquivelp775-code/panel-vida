import calendar
from datetime import date


def clamp(y: int, m: int, d: int) -> date:
    """Fecha con el día ajustado al último día del mes si no existe (31 feb → 28/29 feb)."""
    return date(y, m, min(d, calendar.monthrange(y, m)[1]))


def add_months(d: date, n: int, day: int | None = None) -> date:
    idx = d.year * 12 + d.month - 1 + n
    return clamp(idx // 12, idx % 12 + 1, day or d.day)


def month_start(d: date) -> date:
    return d.replace(day=1)
