import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import dates
from .. import reports as r
from ..db import get_db
from ..models import (
    Account,
    AuditLog,
    Budget,
    Entry,
    Habit,
    HabitLog,
    InstallmentPlan,
    Obligation,
    RvClient,
    RvInteraction,
    RvProject,
    RvReceivable,
    Task,
    Transaction,
    User,
)
from ..security import get_current_user
from ..serializers import account_out

router = APIRouter(tags=["reports"])


def _range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = dates.today()
    return date_from or r.add_months(r.month_start(today), -5, 1), date_to or today


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = r.dashboard(db, user, dates.today())
    d["accounts"] = [account_out(a, b) for a, b in d["accounts"]]
    return d


@router.get("/reports/cashflow")
def cashflow(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return r.cashflow(db, user, *_range(date_from, date_to))


@router.get("/reports/by-category")
def by_category(date_from: date | None = None, date_to: date | None = None,
                account_class: str = Query(default="expense", pattern="^(income|expense)$"),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f, t = date_from or r.month_start(dates.today()), date_to or dates.today()
    return r.by_category(db, user, f, t, account_class)


@router.get("/reports/projection")
def projection(days: int = Query(default=90, ge=1, le=366), db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    return r.projection(db, user, dates.today(), days)


@router.get("/reports/debt-plan")
def debt_plan(target: str = Query(default="2027-06", pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = date(int(target[:4]), int(target[5:7]), 1)
    if t < r.month_start(dates.today()):
        from ..ledger import LedgerError

        raise LedgerError("El mes objetivo debe ser este mes o posterior")
    return r.debt_plan(db, user, dates.today(), t)


@router.get("/reports/integrity")
def integrity(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return r.integrity(db, user)


def _csv_safe(v: str) -> str:
    # Evita inyección de fórmulas al abrir el CSV en una hoja de cálculo.
    return "'" + v if v and v[0] in "=+-@\t\r" else v


@router.get("/export/transactions.csv")
def export_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    f, t = date_from or date(1900, 1, 1), date_to or dates.today() + timedelta(days=3650)
    q = (
        select(Transaction, Entry, Account)
        .join(Entry, Entry.transaction_id == Transaction.id)
        .join(Account, Account.id == Entry.account_id)
        .where(Transaction.user_id == user.id, Transaction.occurred_on.between(f, t))
        .order_by(Transaction.occurred_on, Transaction.id, Entry.id)
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["transaction_id", "fecha", "tipo", "descripcion", "cuenta", "clase", "monto_centavos", "monto",
                "anulada", "revierte_a"])
    for tx, e, a in db.execute(q):
        sign = "-" if e.amount_cents < 0 else ""
        w.writerow([tx.id, tx.occurred_on.isoformat(), tx.kind, _csv_safe(tx.description), _csv_safe(a.name),
                    a.account_class, e.amount_cents, f"{sign}{abs(e.amount_cents) // 100}.{abs(e.amount_cents) % 100:02d}",
                    "si" if tx.voided_at else "no", tx.reverses_id or ""])
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="panel-vida-movimientos.csv"'},
    )


def _rows(db, model, *where):
    cols = [c.name for c in model.__table__.columns]
    order = list(model.__table__.primary_key.columns)
    return [{c: getattr(o, c) for c in cols} for o in db.scalars(select(model).where(*where).order_by(*order))]


@router.get("/export/full.json")
def export_full(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx_ids = select(Transaction.id).where(Transaction.user_id == user.id)
    habit_ids = select(Habit.id).where(Habit.user_id == user.id)
    client_ids = select(RvClient.id).where(RvClient.user_id == user.id)
    return {
        "format": "panel-vida-backup", "version": 2, "exported_on": dates.today(),
        "user": {"email": user.email, "currency": user.currency},
        "accounts": _rows(db, Account, Account.user_id == user.id),
        "transactions": _rows(db, Transaction, Transaction.user_id == user.id),
        "entries": _rows(db, Entry, Entry.transaction_id.in_(tx_ids)),
        "obligations": _rows(db, Obligation, Obligation.user_id == user.id),
        "budgets": _rows(db, Budget, Budget.user_id == user.id),
        "installment_plans": _rows(db, InstallmentPlan, InstallmentPlan.user_id == user.id),
        "tasks": _rows(db, Task, Task.user_id == user.id),
        "habits": _rows(db, Habit, Habit.user_id == user.id),
        "habit_logs": _rows(db, HabitLog, HabitLog.habit_id.in_(habit_ids)),
        "rv_clients": _rows(db, RvClient, RvClient.user_id == user.id),
        "rv_interactions": _rows(db, RvInteraction, RvInteraction.client_id.in_(client_ids)),
        "rv_projects": _rows(db, RvProject, RvProject.user_id == user.id),
        "rv_receivables": _rows(db, RvReceivable, RvReceivable.user_id == user.id),
        "audit_log": _rows(db, AuditLog, AuditLog.user_id == user.id),
    }
