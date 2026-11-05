
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from .. import dates
from .. import ryventis as rv
from .. import schemas as s
from ..db import get_db
from ..models import RvClient, User
from ..security import get_current_user

router = APIRouter(prefix="/ryventis", tags=["ryventis"])
Db = Depends(get_db)
Me = Depends(get_current_user)


@router.get("/summary")
def summary(db: Session = Db, user: User = Me):
    return rv.summary(db, user, dates.today())


# ---------------- clientes
@router.get("/clients")
def clients(stage: str | None = Query(default=None, pattern="^(nuevo|charla|propuesta|cliente|perdido)$"),
            db: Session = Db, user: User = Me):
    return rv.list_clients(db, user, stage, dates.today())


@router.post("/clients", status_code=201)
def create_client(body: s.ClientIn, db: Session = Db, user: User = Me):
    c = rv.create_client(db, user, body)
    db.commit()
    return rv.client_view(db, c, dates.today(), full=True)


@router.get("/clients/{cid}")
def get_client(cid: int, db: Session = Db, user: User = Me):
    return rv.client_view(db, rv._own(db, user, RvClient, cid, "Cliente"), dates.today(), full=True)


@router.patch("/clients/{cid}")
def update_client(cid: int, body: s.ClientPatch, db: Session = Db, user: User = Me):
    c = rv.update_client(db, user, cid, body)
    db.commit()
    return rv.client_view(db, c, dates.today(), full=True)


@router.delete("/clients/{cid}", status_code=204)
def delete_client(cid: int, db: Session = Db, user: User = Me):
    rv.delete_client(db, user, cid)
    db.commit()
    return Response(status_code=204)


@router.post("/clients/{cid}/interactions", status_code=201)
def add_interaction(cid: int, body: s.InteractionIn, db: Session = Db, user: User = Me):
    out = rv.add_interaction(db, user, cid, body, dates.today())
    db.commit()
    return out


# ---------------- proyectos
@router.get("/projects")
def projects(status: str | None = Query(default=None, pattern="^(pendiente|en_marcha|terminado|cancelado)$"),
             db: Session = Db, user: User = Me):
    return rv.list_projects(db, user, status, dates.today())


@router.post("/projects", status_code=201)
def create_project(body: s.ProjectIn, db: Session = Db, user: User = Me):
    p = rv.create_project(db, user, body)
    db.commit()
    return rv.project_view(db, p, dates.today())


@router.patch("/projects/{pid}")
def update_project(pid: int, body: s.ProjectPatch, db: Session = Db, user: User = Me):
    p = rv.update_project(db, user, pid, body)
    db.commit()
    return rv.project_view(db, p, dates.today())


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int, db: Session = Db, user: User = Me):
    rv.delete_project(db, user, pid)
    db.commit()
    return Response(status_code=204)


# ---------------- cobros
@router.get("/receivables")
def receivables(status: str | None = Query(default=None, pattern="^(por_cobrar|cobrado)$"),
                db: Session = Db, user: User = Me):
    return rv.list_receivables(db, user, status, dates.today())


@router.post("/receivables", status_code=201)
def create_receivable(body: s.ReceivableIn, db: Session = Db, user: User = Me):
    r = rv.create_receivable(db, user, body)
    db.commit()
    return rv.receivable_view(db, r, dates.today())


@router.patch("/receivables/{rid}")
def update_receivable(rid: int, body: s.ReceivablePatch, db: Session = Db, user: User = Me):
    r = rv.update_receivable(db, user, rid, body)
    db.commit()
    return rv.receivable_view(db, r, dates.today())


@router.delete("/receivables/{rid}", status_code=204)
def delete_receivable(rid: int, db: Session = Db, user: User = Me):
    rv.delete_receivable(db, user, rid)
    db.commit()
    return Response(status_code=204)


@router.post("/receivables/{rid}/collect")
def collect(rid: int, body: s.CollectIn, db: Session = Db, user: User = Me):
    r = rv.collect(db, user, rid, body, dates.today())
    db.commit()
    return rv.receivable_view(db, r, dates.today())
