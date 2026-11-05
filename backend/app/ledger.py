"""Núcleo del libro mayor. TODA escritura financiera pasa por aquí.

Convención de signo (débito positivo): activo/gasto suben con +, pasivo/ingreso/capital suben con −.
Las funciones de este módulo NO hacen commit: el llamador confirma la transacción de BD (R8).
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import dates
from . import schemas as s
from .installments import billed_count, first_closing
from .models import SUBTYPE_CLASS, Account, AuditLog, Entry, InstallmentPlan, Obligation, Transaction, User

OPENING_EQUITY = "Saldos iniciales"
ADJUSTMENT_EQUITY = "Ajustes"
NATURAL_SIGN = {"asset": 1, "expense": 1, "liability": -1, "income": -1, "equity": -1}


class LedgerError(Exception):
    status_code = 422

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(LedgerError):
    status_code = 404


class Conflict(LedgerError):
    status_code = 409


# ------------------------------------------------------------------ helpers
def natural(account: Account, raw_cents: int) -> int:
    """Saldo en perspectiva natural (lo que tengo / debo / gasté / gané)."""
    return NATURAL_SIGN[account.account_class] * raw_cents


def raw_balance(db: Session, account_id: int, as_of: date | None = None) -> int:
    q = select(func.coalesce(func.sum(Entry.amount_cents), 0)).where(Entry.account_id == account_id)
    if as_of is not None:
        q = q.join(Transaction).where(Transaction.occurred_on <= as_of)
    return int(db.scalar(q))


def audit(db: Session, user: User, entity: str, entity_id: int | None, action: str, payload: dict | None = None):
    db.add(AuditLog(user_id=user.id, entity=entity, entity_id=entity_id, action=action, payload=payload))


def request_hash(payload: s.BaseModel) -> str:
    canonical = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def get_account(db: Session, user: User, account_id: int, *, allow_archived: bool = False) -> Account:
    acc = db.get(Account, account_id)
    if acc is None or acc.user_id != user.id:
        raise NotFound(f"Cuenta {account_id} no encontrada")
    if acc.archived_at is not None and not allow_archived:
        raise LedgerError(f"La cuenta «{acc.name}» está archivada")
    return acc


def _require(acc: Account, *, classes: tuple[str, ...] = (), subtypes: tuple[str, ...] = (), role: str) -> Account:
    if acc.is_system:
        raise LedgerError(f"La cuenta de sistema «{acc.name}» no admite operaciones directas")
    if (classes and acc.account_class not in classes) or (subtypes and acc.subtype not in subtypes):
        raise LedgerError(f"«{acc.name}» no es válida como {role}")
    return acc


def system_equity(db: Session, user: User, name: str) -> Account:
    acc = db.scalar(
        select(Account).where(Account.user_id == user.id, Account.account_class == "equity", Account.name == name)
    )
    if acc is None:
        acc = Account(
            user_id=user.id, name=name, account_class="equity", subtype="equity", currency=user.currency,
            is_system=True,
        )
        db.add(acc)
        db.flush()
    return acc


def post(
    db: Session,
    user: User,
    *,
    kind: str,
    occurred_on: date,
    description: str,
    lines: list[tuple[Account, int]],
    notes: str | None = None,
    idempotency_key: str | None = None,
    req_hash: str | None = None,
    reverses_id: int | None = None,
) -> Transaction:
    """Crea una transacción balanceada. Valida aquí y la BD vuelve a validar al COMMIT."""
    lines = [(a, amt) for a, amt in lines if amt != 0]
    if len(lines) < 2:
        raise LedgerError("Una operación requiere al menos dos movimientos")
    if sum(amt for _, amt in lines) != 0:
        raise LedgerError("La operación no está balanceada")
    if len({a.currency for a, _ in lines}) != 1:
        raise LedgerError("Todas las cuentas de una operación deben tener la misma moneda")
    if any(a.user_id != user.id for a, _ in lines):
        raise LedgerError("Cuenta ajena a este usuario")
    tx = Transaction(
        user_id=user.id, kind=kind, occurred_on=occurred_on, description=description or "",
        notes=notes, idempotency_key=idempotency_key, request_hash=req_hash, reverses_id=reverses_id,
    )
    db.add(tx)
    db.flush()
    for acc, amt in lines:
        db.add(Entry(transaction_id=tx.id, account_id=acc.id, amount_cents=amt))
    db.flush()
    db.refresh(tx)
    audit(db, user, "transaction", tx.id, "create", {"kind": kind, "lines": [[a.id, amt] for a, amt in lines]})
    return tx


# ------------------------------------------------------------------ operaciones
def build(db: Session, user: User, p: s.BaseModel) -> tuple[str, list[tuple[Account, int]]]:
    """Traduce una petición de la API a (kind, líneas). Aquí viven las reglas R2–R4."""
    acc = lambda i: get_account(db, user, i)  # noqa: E731
    cash_like = ("asset",)

    if isinstance(p, s.IncomeIn):
        a = _require(acc(p.account_id), classes=cash_like, role="cuenta de destino del ingreso")
        c = _require(acc(p.category_id), classes=("income",), role="categoría de ingreso")
        return "income", [(a, p.amount_cents), (c, -p.amount_cents)]

    if isinstance(p, s.ExpenseIn | s.CardPurchaseIn):
        src_id = p.account_id if isinstance(p, s.ExpenseIn) else p.card_account_id
        a = acc(src_id)
        if isinstance(p, s.CardPurchaseIn):
            _require(a, subtypes=("credit_card",), role="tarjeta de crédito")
        else:
            _require(a, classes=("asset", "liability"), role="medio de pago")
            if a.account_class == "liability" and a.subtype != "credit_card":
                raise LedgerError(f"«{a.name}» es un préstamo: un gasto se paga con efectivo, cuenta o tarjeta")
        c = _require(acc(p.category_id), classes=("expense",), role="categoría de gasto")
        if p.installments:
            if a.subtype != "credit_card":
                raise LedgerError("Los meses sin intereses sólo aplican a compras con tarjeta de crédito")
            if not a.statement_day:
                raise LedgerError(f"Configura el día de corte de «{a.name}» para registrar meses sin intereses")
            if p.amount_cents < p.installments:
                raise LedgerError("El monto es menor que el número de mensualidades")
        kind = "card_purchase" if a.subtype == "credit_card" else "expense"
        # R2: la compra con tarjeta registra el gasto Y aumenta lo adeudado en la tarjeta.
        return kind, [(a, -p.amount_cents), (c, p.amount_cents)]

    if isinstance(p, s.RefundIn):
        a = _require(acc(p.account_id), classes=("asset", "liability"), role="cuenta que recibe la devolución")
        if a.account_class == "liability" and a.subtype != "credit_card":
            raise LedgerError(f"«{a.name}» es un préstamo: una devolución llega a efectivo, cuenta o tarjeta")
        c = _require(acc(p.category_id), classes=("expense",), role="categoría de gasto devuelta")
        return "refund", [(a, p.amount_cents), (c, -p.amount_cents)]

    if isinstance(p, s.TransferIn):
        f = _require(acc(p.from_account_id), classes=("asset", "liability"), role="cuenta de origen")
        t = _require(acc(p.to_account_id), classes=("asset", "liability"), role="cuenta de destino")
        if f.id == t.id:
            raise LedgerError("El origen y el destino deben ser cuentas distintas")
        kind = "transfer"
        if f.account_class == "asset" and t.subtype == "credit_card":
            kind = "card_payment"
        elif f.account_class == "asset" and t.account_class == "liability":
            kind = "loan_payment"
        elif f.account_class == "liability" and f.subtype != "credit_card" and t.account_class == "asset":
            kind = "loan_disbursement"
        # R3/R4: nunca toca cuentas de ingreso/gasto.
        return kind, [(f, -p.amount_cents), (t, p.amount_cents)]

    if isinstance(p, s.CardPaymentIn):
        f = _require(acc(p.from_account_id), classes=("asset",), role="cuenta de pago")
        card = _require(acc(p.card_account_id), subtypes=("credit_card",), role="tarjeta de crédito")
        return "card_payment", [(f, -p.amount_cents), (card, p.amount_cents)]

    if isinstance(p, s.LoanPaymentIn):
        f = _require(acc(p.from_account_id), classes=("asset",), role="cuenta de pago")
        loan = _require(acc(p.loan_account_id), subtypes=("loan", "other_liability"), role="préstamo")
        lines = [(f, -(p.principal_cents + p.interest_cents))]
        if p.principal_cents:
            lines.append((loan, p.principal_cents))
        if p.interest_cents:
            ic = _require(acc(p.interest_category_id), classes=("expense",), role="categoría de intereses")
            lines.append((ic, p.interest_cents))
        return "loan_payment", lines

    if isinstance(p, s.LoanDisbursementIn):
        loan = _require(acc(p.loan_account_id), subtypes=("loan", "other_liability"), role="préstamo")
        t = _require(acc(p.to_account_id), classes=("asset",), role="cuenta de destino")
        return "loan_disbursement", [(loan, -p.amount_cents), (t, p.amount_cents)]

    if isinstance(p, s.AdjustmentIn):
        a = _require(acc(p.account_id), classes=("asset", "liability"), role="cuenta a ajustar")
        raw = NATURAL_SIGN[a.account_class] * p.delta_cents
        eq = system_equity(db, user, ADJUSTMENT_EQUITY)
        return "adjustment", [(a, raw), (eq, -raw)]

    raise LedgerError("Tipo de operación no soportado")


def find_idempotent(db: Session, user: User, key: str, req_hash: str) -> Transaction | None:
    existing = db.scalar(select(Transaction).where(Transaction.user_id == user.id, Transaction.idempotency_key == key))
    if existing is None:
        return None
    if existing.request_hash != req_hash:
        raise Conflict("La clave de idempotencia ya se usó con datos distintos")
    return existing


def record(db: Session, user: User, p: s.BaseModel, idempotency_key: str | None = None) -> tuple[Transaction, bool]:
    """Registra una operación de la API. Devuelve (transacción, creada?)."""
    h = request_hash(p)
    if idempotency_key:
        existing = find_idempotent(db, user, idempotency_key, h)
        if existing is not None:
            return existing, False
    kind, lines = build(db, user, p)
    tx = post(
        db, user, kind=kind, occurred_on=p.occurred_on, description=p.description, notes=p.notes, lines=lines,
        idempotency_key=idempotency_key, req_hash=h if idempotency_key else None,
    )
    if getattr(p, "installments", None):
        card = lines[0][0]
        plan = InstallmentPlan(
            user_id=user.id, transaction_id=tx.id, card_account_id=card.id, total_cents=p.amount_cents,
            months=p.installments, first_closing=first_closing(p.occurred_on, card.statement_day),
        )
        db.add(plan)
        db.flush()
        audit(db, user, "installment_plan", plan.id, "create", {"transaction_id": tx.id, "months": p.installments})
    return tx, True


def void(db: Session, user: User, tx_id: int, reason: str) -> Transaction:
    """R6: anula creando una reversión espejo con la MISMA fecha (los reportes del periodo quedan netos)."""
    tx = db.scalar(select(Transaction).where(Transaction.id == tx_id).with_for_update())
    if tx is None or tx.user_id != user.id:
        raise NotFound(f"Operación {tx_id} no encontrada")
    if tx.kind == "reversal":
        raise LedgerError("Una reversión no se puede anular; registra una nueva operación")
    if tx.voided_at is not None:
        raise Conflict("La operación ya estaba anulada")
    archived = [e.account.name for e in tx.entries if e.account.archived_at is not None]
    if archived:
        raise LedgerError(f"No se puede anular: afecta cuentas archivadas ({', '.join(archived)})")
    lines = [(e.account, -e.amount_cents) for e in tx.entries]
    rev = post(
        db, user, kind="reversal", occurred_on=tx.occurred_on, description=f"Anulación: {tx.description}"[:500],
        notes=reason, lines=lines, reverses_id=tx.id,
    )
    tx.voided_at = datetime.now(UTC)
    tx.void_reason = reason
    # Si la operación liquidaba una obligación, la obligación vuelve a quedar pendiente.
    for ob in db.scalars(select(Obligation).where(Obligation.settled_transaction_id == tx.id)):
        ob.status, ob.settled_transaction_id = "pending", None
    # Si la operación era el cobro de Ryventis, el cobro vuelve a "por cobrar".
    from .models import RvReceivable

    for rc in db.scalars(select(RvReceivable).where(RvReceivable.collected_transaction_id == tx.id)):
        rc.status, rc.collected_transaction_id = "por_cobrar", None
    audit(db, user, "transaction", tx.id, "void", {"reason": reason, "reversal_id": rev.id})
    db.flush()
    return rev


# ------------------------------------------------------------------ cuentas
def create_account(db: Session, user: User, p: s.AccountCreate) -> Account:
    cls = SUBTYPE_CLASS[p.subtype]
    if p.subtype != "credit_card" and any(
        v is not None for v in (p.credit_limit_cents, p.statement_day, p.due_day)
    ):
        raise LedgerError("Límite, día de corte y día de pago sólo aplican a tarjetas de crédito")
    if cls in ("income", "expense") and p.opening_balance_cents:
        raise LedgerError("Las categorías no tienen saldo inicial")
    dup = db.scalar(
        select(Account.id).where(
            Account.user_id == user.id, Account.account_class == cls,
            func.lower(func.btrim(Account.name)) == p.name.lower(),
        )
    )
    if dup:
        raise Conflict(f"Ya existe «{p.name}» en esa clase")
    acc = Account(
        user_id=user.id, name=p.name, account_class=cls, subtype=p.subtype, currency=p.currency or user.currency,
        credit_limit_cents=p.credit_limit_cents, statement_day=p.statement_day, due_day=p.due_day,
        interest_rate_bps=p.interest_rate_bps,
    )
    db.add(acc)
    db.flush()
    audit(db, user, "account", acc.id, "create", p.model_dump(mode="json"))
    if p.opening_balance_cents:
        if acc.currency != user.currency:
            raise LedgerError("El MVP sólo admite saldo inicial en la moneda base")
        raw = NATURAL_SIGN[cls] * p.opening_balance_cents
        eq = system_equity(db, user, OPENING_EQUITY)
        post(
            db, user, kind="opening_balance", occurred_on=p.opening_date or dates.today(),
            description=f"Saldo inicial {acc.name}", lines=[(acc, raw), (eq, -raw)],
        )
    return acc


def update_account(db: Session, user: User, account_id: int, p: s.AccountUpdate) -> Account:
    acc = get_account(db, user, account_id, allow_archived=True)
    if acc.is_system:
        raise LedgerError("Las cuentas de sistema no se editan")
    data = p.model_dump(exclude_unset=True)
    if acc.subtype != "credit_card" and any(k in data for k in ("credit_limit_cents", "statement_day", "due_day")):
        raise LedgerError("Límite, día de corte y día de pago sólo aplican a tarjetas de crédito")
    if "statement_day" in data and data["statement_day"] != acc.statement_day and _has_open_plans(db, acc):
        # Las mensualidades MSI se calcularon con el día de corte actual; cambiarlo facturaría de más o de menos.
        raise LedgerError("No se puede cambiar el día de corte mientras haya compras a meses sin intereses vigentes")
    for k, v in data.items():
        setattr(acc, k, v)
    audit(db, user, "account", acc.id, "update", p.model_dump(mode="json", exclude_unset=True))
    db.flush()
    return acc


def _has_open_plans(db: Session, card: Account) -> bool:
    rows = db.execute(
        select(InstallmentPlan.months, InstallmentPlan.first_closing)
        .join(Transaction, Transaction.id == InstallmentPlan.transaction_id)
        .where(InstallmentPlan.card_account_id == card.id, Transaction.voided_at.is_(None))
    ).all()
    return any(billed_count(first, months, card.statement_day, dates.today()) < months for months, first in rows)


def archive_account(db: Session, user: User, account_id: int) -> Account:
    acc = get_account(db, user, account_id, allow_archived=True)
    if acc.is_system:
        raise LedgerError("Las cuentas de sistema no se archivan")
    if acc.archived_at is not None:
        raise Conflict("La cuenta ya está archivada")
    if acc.account_class in ("asset", "liability") and raw_balance(db, acc.id) != 0:
        raise LedgerError("Sólo se puede archivar una cuenta con saldo cero (registra un ajuste o transferencia)")
    acc.archived_at = datetime.now(UTC)
    audit(db, user, "account", acc.id, "archive")
    db.flush()
    return acc


def reconcile(db: Session, user: User, account_id: int, p: s.ReconcileIn) -> dict:
    """R10: compara el libro con el estado de cuenta (saldos en perspectiva natural)."""
    acc = _require(get_account(db, user, account_id), classes=("asset", "liability"), role="cuenta a conciliar")
    ledger_nat = natural(acc, raw_balance(db, acc.id, p.as_of))
    diff = p.statement_balance_cents - ledger_nat
    adj_id = None
    if p.create_adjustment and diff != 0:
        adj = s.AdjustmentIn(
            kind="adjustment", account_id=acc.id, delta_cents=diff, occurred_on=p.as_of,
            description=f"Conciliación {acc.name} al {p.as_of.isoformat()}",
        )
        kind, lines = build(db, user, adj)
        adj_id = post(db, user, kind=kind, occurred_on=p.as_of, description=adj.description, lines=lines).id
    audit(db, user, "account", acc.id, "reconcile", {**p.model_dump(mode="json"), "difference_cents": diff})
    return {
        "account_id": acc.id, "as_of": p.as_of, "ledger_balance_cents": ledger_nat,
        "statement_balance_cents": p.statement_balance_cents, "difference_cents": diff,
        "adjustment_transaction_id": adj_id,
    }
