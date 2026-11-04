from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as s
from .models import Account, Transaction


def account_out(a: Account, balance_cents: int) -> s.AccountOut:
    return s.AccountOut(
        id=a.id, name=a.name, account_class=a.account_class, subtype=a.subtype, currency=a.currency,
        credit_limit_cents=a.credit_limit_cents, statement_day=a.statement_day, due_day=a.due_day,
        interest_rate_bps=a.interest_rate_bps, is_system=a.is_system, archived_at=a.archived_at,
        balance_cents=balance_cents, created_at=a.created_at,
    )


def transaction_out(db: Session, tx: Transaction, reversed_by: dict[int, int] | None = None) -> s.TransactionOut:
    if reversed_by is None:
        rb = db.scalar(select(Transaction.id).where(Transaction.reverses_id == tx.id))
    else:
        rb = reversed_by.get(tx.id)
    return s.TransactionOut(
        id=tx.id, kind=tx.kind, occurred_on=tx.occurred_on, description=tx.description, notes=tx.notes,
        created_at=tx.created_at, voided_at=tx.voided_at, void_reason=tx.void_reason, reverses_id=tx.reverses_id,
        reversed_by_id=rb, amount_cents=sum(e.amount_cents for e in tx.entries if e.amount_cents > 0),
        entries=[
            s.EntryOut(account_id=e.account_id, account_name=e.account.name, account_class=e.account.account_class,
                       amount_cents=e.amount_cents)
            for e in tx.entries
        ],
    )
