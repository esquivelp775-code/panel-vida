"""Obligaciones, vencimientos y presupuestos."""
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ledger
from .. import obligations as obs
from .. import reports as r
from .. import schemas as s
from ..db import get_db
from ..models import Budget, Obligation, User
from ..security import get_current_user

router = APIRouter(tags=["planning"])


def _ob(o: Obligation) -> s.ObligationOut:
    return s.ObligationOut.model_validate(o, from_attributes=True)


@router.get("/obligations", response_model=list[s.ObligationOut])
def list_obligations(status: str | None = "pending", db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    q = select(Obligation).where(Obligation.user_id == user.id).order_by(Obligation.due_date, Obligation.id)
    if status:
        q = q.where(Obligation.status == status)
    return [_ob(o) for o in db.scalars(q)]


@router.post("/obligations", response_model=s.ObligationOut, status_code=201)
def create_obligation(body: s.ObligationCreate, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    ob = obs.create(db, user, body)
    db.commit()
    return _ob(ob)


@router.patch("/obligations/{ob_id}", response_model=s.ObligationOut)
def update_obligation(ob_id: int, body: s.ObligationUpdate, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    ob = obs.update(db, user, ob_id, body)
    db.commit()
    return _ob(ob)


@router.post("/obligations/{ob_id}/settle", response_model=s.ObligationOut)
def settle_obligation(ob_id: int, body: s.ObligationSettle, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    ob, _ = obs.settle(db, user, ob_id, body)
    db.commit()
    return _ob(ob)


@router.post("/obligations/{ob_id}/cancel", response_model=s.ObligationOut)
def cancel_obligation(ob_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ob = obs.cancel(db, user, ob_id)
    db.commit()
    return _ob(ob)


@router.get("/upcoming", response_model=list[s.UpcomingItem])
def upcoming(days: int = Query(default=30, ge=1, le=366), db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return r.upcoming(db, user, date.today(), days)


def _month(m: str) -> date:
    return date(int(m[:4]), int(m[5:7]), 1)


@router.get("/budgets", response_model=list[s.BudgetOut])
def list_budgets(month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    return r.budget_rows(db, user, _month(month))


@router.put("/budgets", response_model=s.BudgetOut)
def upsert_budget(body: s.BudgetIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _month(body.month)
    cat = ledger.get_account(db, user, body.category_id)
    if cat.account_class != "expense":
        raise ledger.LedgerError("Los presupuestos se asignan a categorías de gasto")
    b = db.scalar(select(Budget).where(Budget.user_id == user.id, Budget.category_id == cat.id, Budget.month == m))
    if b is None:
        b = Budget(user_id=user.id, category_id=cat.id, month=m, amount_cents=body.amount_cents)
        db.add(b)
    else:
        b.amount_cents = body.amount_cents
    ledger.audit(db, user, "budget", None, "upsert", body.model_dump(mode="json"))
    db.commit()
    return next(x for x in r.budget_rows(db, user, m) if x["category_id"] == cat.id)


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.get(Budget, budget_id)
    if b is None or b.user_id != user.id:
        raise ledger.NotFound("Presupuesto no encontrado")
    ledger.audit(db, user, "budget", b.id, "delete", {"category_id": b.category_id, "month": str(b.month),
                                                      "amount_cents": b.amount_cents})
    db.delete(b)
    db.commit()
    return Response(status_code=204)
