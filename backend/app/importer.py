"""Importación de estados de cuenta CSV con conciliación asistida.

Flujo: `preview` (no escribe nada) → el usuario clasifica cada fila → `commit` (una sola transacción de BD).
Cada fila lleva una huella (fingerprint) que se usa como clave de idempotencia: reimportar el mismo
archivo no duplica operaciones.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ledger
from . import schemas as s
from .models import Account, Entry, Transaction, User

MAX_ROWS = 2000
DATE_COLS = ("fecha", "date", "fecha operacion", "fecha de operacion", "fecha movimiento")
DESC_COLS = ("descripcion", "concepto", "description", "detalle", "movimiento", "referencia")
AMOUNT_COLS = ("monto", "importe", "amount", "cantidad")
OUT_COLS = ("cargo", "cargos", "retiro", "retiros", "debito", "debit")
IN_COLS = ("abono", "abonos", "deposito", "depositos", "credito", "credit")
_AMOUNT_RE = re.compile(r"^\d+(\.\d{1,2})?$")
_THOUSANDS_RE = re.compile(r"^\d{1,3}(,\d{3})+(\.\d{1,2})?$")


def _norm(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t).strip()


def parse_amount(raw: str) -> int | None:
    """'$1,234.56', '-1234.5', '(1,234.56)', '1234' → centavos con signo, sin floats. None si vacío."""
    t = (raw or "").strip().replace("$", "").replace(" ", "").replace("MXN", "")
    if not t:
        return None
    neg = False
    if t.startswith("(") and t.endswith(")"):
        neg, t = True, t[1:-1]
    if t.startswith("-"):
        neg, t = True, t[1:]
    elif t.endswith("-"):
        neg, t = True, t[:-1]
    if "," in t:
        # Sólo comas de miles en grupos de 3 ("1,234.56"); "12,34" (coma decimal) se rechaza para no
        # leerlo como 1 234 y multiplicar el monto por 100.
        if not _THOUSANDS_RE.match(t):
            raise ValueError(f"monto inválido «{raw}» (usa punto decimal: 1,234.56)")
        t = t.replace(",", "")
    if not _AMOUNT_RE.match(t):
        raise ValueError(f"monto inválido «{raw}»")
    whole, _, frac = t.partition(".")
    cents = int(whole) * 100 + int(frac.ljust(2, "0") or 0)
    return -cents if neg else cents


def parse_date(raw: str) -> date:
    t = (raw or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", t)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", t)  # formato mexicano: día/mes/año
    if m:
        y = int(m[3])
        y = y + 2000 if y < 100 else y
        return date(y, int(m[2]), int(m[1]))
    raise ValueError(f"fecha inválida «{raw}» (usa AAAA-MM-DD o DD/MM/AAAA)")


def _pick(header: list[str], names: tuple[str, ...]) -> int | None:
    normed = [_norm(h) for h in header]
    for n in names:
        if n in normed:
            return normed.index(n)
    return None


def fingerprint(account_id: int, d: date, amount: int, direction: str, desc: str, occurrence: int) -> str:
    raw = f"{account_id}|{d.isoformat()}|{amount}|{direction}|{_norm(desc)}|{occurrence}"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_csv(text: str, account: Account, positive_is_outflow: bool) -> list[dict]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if len(rows) < 2:
        raise ledger.LedgerError("El archivo no tiene filas de datos (se espera una fila de encabezados)")
    if len(rows) - 1 > MAX_ROWS:
        raise ledger.LedgerError(f"Máximo {MAX_ROWS} filas por importación")
    header = rows[0]
    di, dsc = _pick(header, DATE_COLS), _pick(header, DESC_COLS)
    ai, oi, ii = _pick(header, AMOUNT_COLS), _pick(header, OUT_COLS), _pick(header, IN_COLS)
    if di is None or dsc is None or (ai is None and oi is None and ii is None):
        raise ledger.LedgerError(
            "No se reconocieron las columnas. Se necesitan: Fecha, Descripción/Concepto y Monto "
            "(o Cargo y Abono). Encabezados encontrados: " + ", ".join(header)
        )
    out, seen = [], {}
    for n, r in enumerate(rows[1:], start=2):
        cell = lambda i: r[i] if i is not None and i < len(r) else ""  # noqa: E731
        try:
            d = parse_date(cell(di))
            if ai is not None and (cell(oi) == cell(ii) == ""):
                amt = parse_amount(cell(ai))
                if amt is None or amt == 0:
                    continue
                outflow = (amt > 0) if positive_is_outflow else (amt < 0)
            else:
                o, i_ = parse_amount(cell(oi)) or 0, parse_amount(cell(ii)) or 0
                if o and i_:
                    raise ValueError("la fila tiene cargo y abono a la vez")
                if not (o or i_):
                    continue
                amt, outflow = (o, True) if o else (i_, False)
        except ValueError as e:
            raise ledger.LedgerError(f"Fila {n}: {e}") from None
        cents = abs(amt)
        if cents > s.MAX_CENTS:
            raise ledger.LedgerError(f"Fila {n}: monto fuera de rango")
        desc = cell(dsc).strip()[:500] or "Importado"
        direction = "outflow" if outflow else "inflow"
        key = (d, cents, direction, _norm(desc))
        seen[key] = seen.get(key, 0) + 1
        out.append({"row": n, "occurred_on": d, "description": desc, "amount_cents": cents, "direction": direction,
                    "fingerprint": fingerprint(account.id, d, cents, direction, desc, seen[key])})
    return out


def preview(db: Session, user: User, p: s.ImportPreviewIn) -> dict:
    acc = ledger.get_account(db, user, p.account_id)
    if acc.account_class not in ("asset", "liability") or acc.is_system:
        raise ledger.LedgerError("Sólo se importan estados de cuentas, tarjetas o préstamos")
    positive_is_outflow = p.positive_is_outflow if p.positive_is_outflow is not None else acc.subtype == "credit_card"
    rows = parse_csv(p.csv_text, acc, positive_is_outflow)
    if not rows:
        return {"account_id": acc.id, "rows": [], "summary": {"total": 0, "new": 0, "duplicates": 0, "imported": 0}}
    keys = {f"import:{r['fingerprint']}" for r in rows}
    imported = set(db.scalars(select(Transaction.idempotency_key).where(
        Transaction.user_id == user.id, Transaction.idempotency_key.in_(keys))))
    # Candidatos a duplicado: movimientos existentes de la cuenta, mismo sentido y monto, ±3 días.
    lo = min(r["occurred_on"] for r in rows) - timedelta(days=3)
    hi = max(r["occurred_on"] for r in rows) + timedelta(days=3)
    existing = db.execute(
        select(Transaction.id, Transaction.occurred_on, Entry.amount_cents)
        .join(Entry, Entry.transaction_id == Transaction.id)
        .where(Entry.account_id == acc.id, Transaction.voided_at.is_(None), Transaction.kind != "reversal",
               Transaction.occurred_on.between(lo, hi), ~Transaction.idempotency_key.startswith("import:")
               | Transaction.idempotency_key.is_(None))
    ).all()
    used: set[int] = set()
    out = []
    for r in rows:
        # Débito positivo: una entrada (depósito, pago a la tarjeta) es + tanto en activos como en pasivos.
        raw = r["amount_cents"] if r["direction"] == "inflow" else -r["amount_cents"]
        dup = next((tid for tid, d, amt in existing if tid not in used and amt == raw
                    and abs((d - r["occurred_on"]).days) <= 3), None)
        if dup:
            used.add(dup)
        status = "imported" if f"import:{r['fingerprint']}" in imported else ("duplicate" if dup else "new")
        out.append({**r, "status": status, "duplicate_of": dup})
    summary = {"total": len(out), **{k: sum(1 for r in out if r["status"] == k)
                                     for k in ("new", "duplicate", "imported")}}
    summary["duplicates"] = summary.pop("duplicate")
    return {"account_id": acc.id, "positive_is_outflow": positive_is_outflow, "rows": out, "summary": summary}


def _row_payload(acc: Account, r: s.ImportRowIn) -> s.BaseModel:
    base = {"occurred_on": r.occurred_on, "description": r.description, "notes": "Importado de estado de cuenta"}
    card = acc.subtype == "credit_card"
    if r.counter_account_id:
        if r.direction == "outflow":  # en tarjeta: disposición de efectivo / traspaso a otra cuenta
            return s.TransferIn(kind="transfer", from_account_id=acc.id, to_account_id=r.counter_account_id,
                                amount_cents=r.amount_cents, **base)
        return s.TransferIn(kind="transfer", from_account_id=r.counter_account_id, to_account_id=acc.id,
                            amount_cents=r.amount_cents, **base)
    if not r.category_id:
        raise ledger.LedgerError("Cada fila necesita una categoría o una cuenta contraparte")
    if r.direction == "outflow":
        return s.ExpenseIn(kind="expense", account_id=acc.id, category_id=r.category_id,
                           amount_cents=r.amount_cents, **base)
    if card:  # abono en tarjeta con categoría de gasto = devolución
        return s.RefundIn(kind="refund", account_id=acc.id, category_id=r.category_id,
                          amount_cents=r.amount_cents, **base)
    return s.IncomeIn(kind="income", account_id=acc.id, category_id=r.category_id, amount_cents=r.amount_cents,
                      **base)


def commit(db: Session, user: User, p: s.ImportCommitIn) -> dict:
    acc = ledger.get_account(db, user, p.account_id)
    created, skipped = [], 0
    for r in p.rows:
        key = f"import:{r.fingerprint}"
        if db.scalar(select(Transaction.id).where(Transaction.user_id == user.id,
                                                  Transaction.idempotency_key == key)):
            skipped += 1
            continue
        try:
            tx, _ = ledger.record(db, user, _row_payload(acc, r), idempotency_key=key)
        except ledger.LedgerError as e:
            raise type(e)(f"Fila {r.row}: {e.message}") from None
        created.append(tx.id)
    ledger.audit(db, user, "import", acc.id, "commit", {"created": len(created), "skipped": skipped})
    return {"created": len(created), "skipped_existing": skipped, "transaction_ids": created}
