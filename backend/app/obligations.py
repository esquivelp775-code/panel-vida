"""Obligaciones futuras: crear, editar, liquidar (genera la operación vía ledger) y cancelar."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ledger
from . import schemas as s
from .models import Obligation, User
from .dates import add_months

DIRECTION = {"income_expected": "inflow"}


def _validate_refs(db: Session, user: User, ob: Obligation) -> None:
    for attr in ("pay_from_account_id", "target_account_id", "category_id"):
        if getattr(ob, attr) is not None:
            ledger.get_account(db, user, getattr(ob, attr))


def get(db: Session, user: User, ob_id: int, *, lock: bool = False) -> Obligation:
    q = select(Obligation).where(Obligation.id == ob_id)
    if lock:
        q = q.with_for_update()
    ob = db.scalar(q)
    if ob is None or ob.user_id != user.id:
        raise ledger.NotFound(f"Obligación {ob_id} no encontrada")
    return ob


def create(db: Session, user: User, p: s.ObligationCreate) -> Obligation:
    ob = Obligation(user_id=user.id, direction=DIRECTION.get(p.kind, "outflow"), status="pending",
                    anchor_day=p.due_date.day, **p.model_dump())
    _validate_refs(db, user, ob)
    db.add(ob)
    db.flush()
    ledger.audit(db, user, "obligation", ob.id, "create", p.model_dump(mode="json"))
    return ob


def update(db: Session, user: User, ob_id: int, p: s.ObligationUpdate) -> Obligation:
    ob = get(db, user, ob_id, lock=True)
    if ob.status != "pending":
        raise ledger.LedgerError("Sólo se pueden editar obligaciones pendientes")
    for k, v in p.model_dump(exclude_unset=True).items():
        setattr(ob, k, v)
    if p.due_date is not None:
        ob.anchor_day = p.due_date.day
    _validate_refs(db, user, ob)
    ledger.audit(db, user, "obligation", ob.id, "update", p.model_dump(mode="json", exclude_unset=True))
    db.flush()
    return ob


def cancel(db: Session, user: User, ob_id: int) -> Obligation:
    ob = get(db, user, ob_id, lock=True)
    if ob.status != "pending":
        raise ledger.LedgerError("Sólo se pueden cancelar obligaciones pendientes")
    ob.status = "cancelled"
    ledger.audit(db, user, "obligation", ob.id, "cancel")
    db.flush()
    return ob


def _payload(ob: Obligation, p: s.ObligationSettle, when: date) -> s.BaseModel:
    account = p.account_id or ob.pay_from_account_id
    amount = p.amount_cents or ob.amount_cents
    base = {"occurred_on": when, "description": ob.name}
    need = lambda v, msg: v if v is not None else (_ for _ in ()).throw(ledger.LedgerError(msg))  # noqa: E731
    if ob.kind == "card_payment":
        return s.CardPaymentIn(kind="card_payment", from_account_id=need(account, "Indica la cuenta de pago"),
                               card_account_id=need(ob.target_account_id, "La obligación no tiene tarjeta destino"),
                               amount_cents=amount, **base)
    if ob.kind == "loan_installment":
        principal = amount - p.interest_cents
        if principal < 0:
            raise ledger.LedgerError("El interés no puede superar el monto del pago")
        if p.interest_cents > 0 and not (p.interest_category_id or ob.category_id):
            raise ledger.LedgerError("Indica la categoría de gasto para los intereses")
        return s.LoanPaymentIn(kind="loan_payment", from_account_id=need(account, "Indica la cuenta de pago"),
                               loan_account_id=need(ob.target_account_id, "La obligación no tiene préstamo destino"),
                               principal_cents=principal, interest_cents=p.interest_cents,
                               interest_category_id=p.interest_category_id or ob.category_id, **base)
    if ob.kind == "income_expected":
        return s.IncomeIn(kind="income", account_id=need(account, "Indica la cuenta que recibe"),
                          category_id=need(ob.category_id, "Indica la categoría de ingreso"), amount_cents=amount,
                          **base)
    return s.ExpenseIn(kind="expense", account_id=need(account, "Indica la cuenta o tarjeta de pago"),
                       category_id=need(ob.category_id, "Indica la categoría de gasto"), amount_cents=amount, **base)


def settle(db: Session, user: User, ob_id: int, p: s.ObligationSettle) -> tuple[Obligation, Obligation | None]:
    ob = get(db, user, ob_id, lock=True)
    if ob.status != "pending":
        raise ledger.Conflict("La obligación no está pendiente")
    tx, _ = ledger.record(db, user, _payload(ob, p, p.occurred_on or date.today()))
    ob.status, ob.settled_transaction_id = "paid", tx.id
    nxt = _spawn_next(db, user, ob)
    ledger.audit(db, user, "obligation", ob.id, "settle", {"transaction_id": tx.id})
    db.flush()
    return ob, nxt


def _spawn_next(db: Session, user: User, ob: Obligation) -> Obligation | None:
    """Crea la siguiente repetición. Si ya existe (p. ej. se anuló el pago y se vuelve a liquidar), no la duplica."""
    nxt = db.scalar(select(Obligation).where(Obligation.generated_from_id == ob.id))
    if ob.recurrence != "none" and nxt is None:
        months = 1 if ob.recurrence == "monthly" else 12
        nxt = Obligation(
            user_id=user.id, name=ob.name, kind=ob.kind, direction=ob.direction, amount_cents=ob.amount_cents,
            due_date=add_months(ob.due_date, months, ob.anchor_day), recurrence=ob.recurrence, status="pending",
            pay_from_account_id=ob.pay_from_account_id, target_account_id=ob.target_account_id,
            category_id=ob.category_id, anchor_day=ob.anchor_day or ob.due_date.day, generated_from_id=ob.id,
        )
        db.add(nxt)
    return nxt


def skip(db: Session, user: User, ob_id: int) -> tuple[Obligation, Obligation]:
    """F14: omite sólo esta repetición (queda cancelada) y conserva la serie generando la siguiente."""
    ob = get(db, user, ob_id, lock=True)
    if ob.status != "pending":
        raise ledger.LedgerError("Sólo se pueden omitir obligaciones pendientes")
    if ob.recurrence == "none":
        raise ledger.LedgerError("Sólo se omiten repeticiones de obligaciones recurrentes; usa cancelar")
    ob.status = "cancelled"
    nxt = _spawn_next(db, user, ob)
    ledger.audit(db, user, "obligation", ob.id, "skip")
    db.flush()
    return ob, nxt
