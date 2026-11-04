from datetime import date

from fastapi import APIRouter, Body, Depends, Header, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import ledger
from .. import schemas as s
from ..db import get_db
from ..models import Entry, Transaction, User
from ..security import get_current_user
from ..serializers import transaction_out

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", response_model=s.TransactionOut, status_code=201)
def create(
    response: Response,
    body: s.TransactionIn = Body(...),
    idempotency_key: str | None = Header(default=None, max_length=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        tx, created = ledger.record(db, user, body, idempotency_key)
        db.commit()
    except IntegrityError:
        # Carrera entre dos peticiones con la misma clave: la otra ganó.
        db.rollback()
        if not idempotency_key:
            raise
        tx = ledger.find_idempotent(db, user, idempotency_key, ledger.request_hash(body))
        if tx is None:
            raise
        created = False
    if not created:
        response.status_code = 200
    return transaction_out(db, tx)


@router.get("", response_model=s.TransactionPage)
def list_transactions(
    account_id: int | None = None,
    kind: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(default=None, max_length=100),
    include_voided: bool = True,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    if account_id is not None:
        stmt = stmt.where(Transaction.id.in_(select(Entry.transaction_id).where(Entry.account_id == account_id)))
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if date_from:
        stmt = stmt.where(Transaction.occurred_on >= date_from)
    if date_to:
        stmt = stmt.where(Transaction.occurred_on <= date_to)
    if q:
        like = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
        stmt = stmt.where(or_(Transaction.description.ilike(like), Transaction.notes.ilike(like)))
    if not include_voided:
        stmt = stmt.where(Transaction.voided_at.is_(None), Transaction.kind != "reversal")
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = list(db.scalars(stmt.order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
                            .limit(limit).offset(offset)))
    ids = [t.id for t in items]
    reversed_by = dict(db.execute(select(Transaction.reverses_id, Transaction.id)
                                  .where(Transaction.reverses_id.in_(ids))).all()) if ids else {}
    return s.TransactionPage(items=[transaction_out(db, t, reversed_by) for t in items], total=total)


@router.get("/{tx_id}", response_model=s.TransactionOut)
def get(tx_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.user_id != user.id:
        raise ledger.NotFound(f"Operación {tx_id} no encontrada")
    return transaction_out(db, tx)


@router.post("/{tx_id}/void", response_model=s.TransactionOut)
def void(tx_id: int, body: s.VoidIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rev = ledger.void(db, user, tx_id, body.reason)
    db.commit()
    return transaction_out(db, rev)
