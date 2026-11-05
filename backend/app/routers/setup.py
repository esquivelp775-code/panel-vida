from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas as s
from .. import setup
from ..db import get_db
from ..models import User
from ..security import get_current_user

router = APIRouter(tags=["setup"])


@router.post("/setup/bulk")
def bulk(body: s.SetupBulkIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Carga inicial todo-o-nada. Con dry_run=true valida y no guarda nada."""
    out = setup.bulk(db, user, body)
    if body.dry_run:
        db.rollback()
    else:
        db.commit()
    return out
