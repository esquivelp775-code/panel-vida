from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import dates, ledger
from .. import reports as r
from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import get_current_user
from ..serializers import account_out

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _out(db, acc):
    return account_out(acc, ledger.natural(acc, ledger.raw_balance(db, acc.id)))


@router.get("", response_model=list[s.AccountOut])
def list_accounts(account_class: str | None = None, include_archived: bool = False,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [account_out(a, b) for a, b in r.accounts_with_balance(db, user, account_class, include_archived)]


@router.post("", response_model=s.AccountOut, status_code=201)
def create(body: s.AccountCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    acc = ledger.create_account(db, user, body)
    db.commit()
    return _out(db, acc)


@router.get("/{account_id}", response_model=s.AccountOut)
def get(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _out(db, ledger.get_account(db, user, account_id, allow_archived=True))


@router.patch("/{account_id}", response_model=s.AccountOut)
def update(account_id: int, body: s.AccountUpdate, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    acc = ledger.update_account(db, user, account_id, body)
    db.commit()
    return _out(db, acc)


@router.post("/{account_id}/archive", response_model=s.AccountOut)
def archive(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    acc = ledger.archive_account(db, user, account_id)
    db.commit()
    return _out(db, acc)


@router.get("/{account_id}/installments")
def installments(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Compras a meses sin intereses vigentes de una tarjeta."""
    acc = ledger.get_account(db, user, account_id, allow_archived=True)
    if acc.subtype != "credit_card" or not acc.statement_day:
        return []
    return r.installment_rows(db, acc, dates.today())


@router.post("/{account_id}/reconcile", response_model=s.ReconcileOut)
def reconcile(account_id: int, body: s.ReconcileIn, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    out = ledger.reconcile(db, user, account_id, body)
    db.commit()
    return out
