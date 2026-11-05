"""Carga inicial en bloque (cuentas, categorías y pagos programados) en UNA transacción de BD.
Idempotente por nombre: lo que ya existe se omite. dry_run valida y revierte."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ledger
from . import obligations as obs
from . import schemas as s
from .models import SUBTYPE_CLASS, Account, Obligation, User


def _find(db: Session, user: User, name: str, cls: tuple[str, ...]) -> Account | None:
    return db.scalar(select(Account).where(Account.user_id == user.id, Account.account_class.in_(cls),
                                           func.lower(func.btrim(Account.name)) == name.strip().lower()))


def bulk(db: Session, user: User, p: s.SetupBulkIn) -> dict:
    created = {"accounts": 0, "categories": 0, "obligations": 0}
    skipped: list[str] = []
    for a in p.accounts:
        if _find(db, user, a.name, (SUBTYPE_CLASS[a.subtype],)):
            skipped.append(f"Cuenta «{a.name}» ya existe")
            continue
        ledger.create_account(db, user, s.AccountCreate(**a.model_dump()))
        created["accounts"] += 1
    for c in p.categories:
        if _find(db, user, c.name, (c.subtype,)):
            skipped.append(f"Categoría «{c.name}» ya existe")
            continue
        ledger.create_account(db, user, s.AccountCreate(name=c.name, subtype=c.subtype))
        created["categories"] += 1
    db.flush()
    for i, o in enumerate(p.obligations, start=1):
        ref = lambda n, cls, what: (  # noqa: E731
            None if n is None else (_find(db, user, n, cls) or _missing(i, what, n)))
        pay = ref(o.pay_from, ("asset", "liability"), "cuenta de pago")
        tgt = ref(o.target, ("asset", "liability"), "cuenta destino")
        cat = ref(o.category, ("income", "expense"), "categoría")
        dup = db.scalar(select(Obligation.id).where(Obligation.user_id == user.id, Obligation.name == o.name,
                                                    Obligation.due_date == o.due_date,
                                                    Obligation.amount_cents == o.amount_cents))
        if dup:
            skipped.append(f"Pago «{o.name}» del {o.due_date} ya existe")
            continue
        obs.create(db, user, s.ObligationCreate(
            name=o.name, kind=o.kind, amount_cents=o.amount_cents, due_date=o.due_date, recurrence=o.recurrence,
            pay_from_account_id=pay.id if pay else None, target_account_id=tgt.id if tgt else None,
            category_id=cat.id if cat else None))
        created["obligations"] += 1
    ledger.audit(db, user, "setup", None, "dry_run" if p.dry_run else "bulk", created)
    return {"dry_run": p.dry_run, "created": created, "skipped": skipped, "warnings": []}


def _missing(i: int, what: str, name: str):
    raise ledger.LedgerError(f"Pago #{i}: no existe la {what} «{name}» (créala en la sección Cuentas del archivo)")
