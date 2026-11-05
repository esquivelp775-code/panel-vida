from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import importer
from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import get_current_user

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/preview")
def preview(body: s.ImportPreviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Analiza el CSV sin escribir nada: filas nuevas, posibles duplicados y ya importadas."""
    return importer.preview(db, user, body)


@router.post("/commit")
def commit(body: s.ImportCommitIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Crea las operaciones de las filas elegidas en UNA transacción de BD (todo o nada)."""
    out = importer.commit(db, user, body)
    db.commit()
    return out
