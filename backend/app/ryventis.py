"""Ryventis: CRM (clientes, interacciones) + ERP (proyectos, cobros). Los cobros escriben en el libro mayor
SÓLO a través de `ledger.record` (ingreso); anular ese ingreso devuelve el cobro a 'por cobrar'."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ledger
from . import schemas as s
from .dates import month_start
from .models import Account, RvClient, RvInteraction, RvProject, RvReceivable, Task, Transaction, User

STAGES = ("nuevo", "charla", "propuesta", "cliente", "perdido")
INCOME_CATEGORY = "Ingresos Ryventis"


def _own(db: Session, user: User, model, obj_id: int | None, what: str):
    if obj_id is None:
        return None
    o = db.get(model, obj_id)
    if o is None or o.user_id != user.id:
        raise ledger.NotFound(f"{what} no encontrado")
    return o


# ------------------------------------------------------------------ clientes
def client_view(db: Session, c: RvClient, today: date, full: bool = False) -> dict:
    projects = list(db.scalars(select(RvProject).where(RvProject.client_id == c.id).order_by(RvProject.id)))
    receivable = int(db.scalar(select(func.coalesce(func.sum(RvReceivable.amount_cents), 0)).where(
        RvReceivable.client_id == c.id, RvReceivable.status == "por_cobrar")))
    out = {
        "id": c.id, "name": c.name, "company": c.company, "phone": c.phone, "email": c.email, "stage": c.stage,
        "source": c.source, "notes": c.notes, "next_step": c.next_step, "next_step_date": c.next_step_date,
        "created_at": c.created_at, "projects_count": len(projects),
        "open_value_cents": sum(p.amount_cents for p in projects if p.status in ("pendiente", "en_marcha")),
        "receivable_cents": receivable,
        "followup_overdue": bool(c.next_step_date and c.next_step_date < today),
    }
    if full:
        out["interactions"] = [
            {"id": i.id, "client_id": c.id, "kind": i.kind, "summary": i.summary, "happened_on": i.happened_on}
            for i in db.scalars(select(RvInteraction).where(RvInteraction.client_id == c.id)
                                .order_by(RvInteraction.happened_on.desc(), RvInteraction.id.desc()))]
        out["projects"] = [project_view(db, p, today) for p in projects]
    return out


def list_clients(db: Session, user: User, stage: str | None, today: date) -> list[dict]:
    q = select(RvClient).where(RvClient.user_id == user.id)
    if stage:
        q = q.where(RvClient.stage == stage)
    clients = list(db.scalars(q))
    clients.sort(key=lambda c: (c.next_step_date or date.max, STAGES.index(c.stage), c.name.lower()))
    return [client_view(db, c, today) for c in clients]


def create_client(db: Session, user: User, p: s.ClientIn) -> RvClient:
    c = RvClient(user_id=user.id, **p.model_dump())
    db.add(c)
    db.flush()
    return c


def update_client(db: Session, user: User, cid: int, p: s.ClientPatch) -> RvClient:
    c = _own(db, user, RvClient, cid, "Cliente")
    for k, v in p.model_dump(exclude_unset=True).items():
        if k in ("name", "stage") and v is None:
            continue
        setattr(c, k, v)
    db.flush()
    return c


def delete_client(db: Session, user: User, cid: int) -> None:
    c = _own(db, user, RvClient, cid, "Cliente")
    if db.scalar(select(RvProject.id).where(RvProject.client_id == c.id).limit(1)) or db.scalar(
            select(RvReceivable.id).where(RvReceivable.client_id == c.id).limit(1)):
        raise ledger.LedgerError("El cliente tiene proyectos o cobros; cámbialo a 'perdido' en lugar de borrarlo")
    db.delete(c)
    db.flush()


def add_interaction(db: Session, user: User, cid: int, p: s.InteractionIn, today: date) -> dict:
    c = _own(db, user, RvClient, cid, "Cliente")
    i = RvInteraction(client_id=c.id, kind=p.kind, summary=p.summary, happened_on=p.happened_on or today)
    db.add(i)
    db.flush()
    return {"id": i.id, "client_id": c.id, "kind": i.kind, "summary": i.summary, "happened_on": i.happened_on}


# ------------------------------------------------------------------ proyectos
def project_view(db: Session, p: RvProject, today: date) -> dict:
    tasks = list(db.execute(select(Task.status).where(Task.project_id == p.id)).scalars())
    rec = dict(db.execute(select(RvReceivable.status, func.coalesce(func.sum(RvReceivable.amount_cents), 0))
                          .where(RvReceivable.project_id == p.id).group_by(RvReceivable.status)).all())
    client = db.get(RvClient, p.client_id) if p.client_id else None
    return {"id": p.id, "client_id": p.client_id, "client_name": client.name if client else None, "name": p.name,
            "amount_cents": p.amount_cents, "status": p.status, "due_date": p.due_date, "notes": p.notes,
            "created_at": p.created_at, "tasks_total": len(tasks), "tasks_done": sum(t == "done" for t in tasks),
            "collected_cents": int(rec.get("cobrado", 0)), "receivable_cents": int(rec.get("por_cobrar", 0)),
            "overdue": bool(p.due_date and p.due_date < today and p.status in ("pendiente", "en_marcha"))}


def list_projects(db: Session, user: User, status: str | None, today: date) -> list[dict]:
    q = select(RvProject).where(RvProject.user_id == user.id)
    if status:
        q = q.where(RvProject.status == status)
    ps = list(db.scalars(q))
    ps.sort(key=lambda p: (p.due_date or date.max, p.id))
    return [project_view(db, p, today) for p in ps]


def create_project(db: Session, user: User, p: s.ProjectIn) -> RvProject:
    _own(db, user, RvClient, p.client_id, "Cliente")
    pr = RvProject(user_id=user.id, **p.model_dump())
    db.add(pr)
    db.flush()
    return pr


def update_project(db: Session, user: User, pid: int, p: s.ProjectPatch) -> RvProject:
    pr = _own(db, user, RvProject, pid, "Proyecto")
    data = p.model_dump(exclude_unset=True)
    if "client_id" in data:
        _own(db, user, RvClient, data["client_id"], "Cliente")
    for k, v in data.items():
        if k in ("name", "status", "amount_cents") and v is None:
            continue
        setattr(pr, k, v)
    db.flush()
    return pr


def delete_project(db: Session, user: User, pid: int) -> None:
    pr = _own(db, user, RvProject, pid, "Proyecto")
    if db.scalar(select(RvReceivable.id).where(RvReceivable.project_id == pr.id).limit(1)):
        raise ledger.LedgerError("El proyecto tiene cobros; márcalo como cancelado en lugar de borrarlo")
    db.delete(pr)
    db.flush()


# ------------------------------------------------------------------ cobros
def receivable_view(db: Session, r: RvReceivable, today: date) -> dict:
    pr = db.get(RvProject, r.project_id) if r.project_id else None
    cl = db.get(RvClient, r.client_id) if r.client_id else None
    tx = db.get(Transaction, r.collected_transaction_id) if r.collected_transaction_id else None
    return {"id": r.id, "project_id": r.project_id, "project_name": pr.name if pr else None,
            "client_id": r.client_id, "client_name": cl.name if cl else None, "description": r.description,
            "amount_cents": r.amount_cents, "due_date": r.due_date, "status": r.status,
            "collected_transaction_id": r.collected_transaction_id, "collected_on": tx.occurred_on if tx else None,
            "overdue": bool(r.status == "por_cobrar" and r.due_date and r.due_date < today)}


def list_receivables(db: Session, user: User, status: str | None, today: date) -> list[dict]:
    q = select(RvReceivable).where(RvReceivable.user_id == user.id)
    if status:
        q = q.where(RvReceivable.status == status)
    rs = list(db.scalars(q))
    rs.sort(key=lambda r: (r.status != "por_cobrar", r.due_date or date.max, r.id))
    return [receivable_view(db, r, today) for r in rs]


def create_receivable(db: Session, user: User, p: s.ReceivableIn) -> RvReceivable:
    pr = _own(db, user, RvProject, p.project_id, "Proyecto")
    _own(db, user, RvClient, p.client_id, "Cliente")
    client_id = p.client_id or (pr.client_id if pr else None)
    r = RvReceivable(user_id=user.id, status="por_cobrar", **{**p.model_dump(), "client_id": client_id})
    db.add(r)
    db.flush()
    return r


def _open_receivable(db: Session, user: User, rid: int) -> RvReceivable:
    r = db.scalar(select(RvReceivable).where(RvReceivable.id == rid).with_for_update())
    if r is None or r.user_id != user.id:
        raise ledger.NotFound("Cobro no encontrado")
    return r


def update_receivable(db: Session, user: User, rid: int, p: s.ReceivablePatch) -> RvReceivable:
    r = _open_receivable(db, user, rid)
    if r.status != "por_cobrar":
        raise ledger.LedgerError("Un cobro ya cobrado no se edita; anula el ingreso si fue un error")
    data = p.model_dump(exclude_unset=True)
    _own(db, user, RvProject, data.get("project_id"), "Proyecto")
    _own(db, user, RvClient, data.get("client_id"), "Cliente")
    for k, v in data.items():
        if k in ("description", "amount_cents") and v is None:
            continue
        setattr(r, k, v)
    db.flush()
    return r


def delete_receivable(db: Session, user: User, rid: int) -> None:
    r = _open_receivable(db, user, rid)
    if r.status != "por_cobrar":
        raise ledger.LedgerError("Un cobro ya cobrado no se borra; anula el ingreso si fue un error")
    db.delete(r)
    db.flush()


def collect(db: Session, user: User, rid: int, p: s.CollectIn, today: date) -> RvReceivable:
    r = _open_receivable(db, user, rid)
    if r.status != "por_cobrar":
        raise ledger.Conflict("Este cobro ya está cobrado")
    if p.category_id:
        cat_id = p.category_id
    else:
        cat = db.scalar(select(Account).where(Account.user_id == user.id, Account.account_class == "income",
                                              func.lower(Account.name) == INCOME_CATEGORY.lower()))
        cat_id = (cat or ledger.create_account(db, user, s.AccountCreate(name=INCOME_CATEGORY, subtype="income"))).id
    who = " · ".join(x for x in [r.description, db.get(RvClient, r.client_id).name if r.client_id else None] if x)
    tx, _ = ledger.record(db, user, s.IncomeIn(kind="income", account_id=p.account_id, category_id=cat_id,
                                                amount_cents=r.amount_cents, occurred_on=p.occurred_on or today,
                                                description=f"Cobro: {who}"[:500], notes="Ryventis"))
    r.status, r.collected_transaction_id = "cobrado", tx.id
    ledger.audit(db, user, "rv_receivable", r.id, "collect", {"transaction_id": tx.id})
    db.flush()
    return r


# ------------------------------------------------------------------ resumen
def summary(db: Session, user: User, today: date) -> dict:
    clients = list(db.scalars(select(RvClient).where(RvClient.user_id == user.id)))
    projects = list(db.scalars(select(RvProject).where(RvProject.user_id == user.id)))
    recs = list(db.scalars(select(RvReceivable).where(RvReceivable.user_id == user.id)))
    collected = [(r, db.get(Transaction, r.collected_transaction_id)) for r in recs if r.status == "cobrado"]
    tasks = list(db.scalars(select(Task.status).where(Task.user_id == user.id, Task.area == "ryventis")))
    pipeline = {st: sum(c.stage == st for c in clients) for st in STAGES}
    open_by_client: dict[int, int] = {}
    for p in projects:
        if p.client_id and p.status in ("pendiente", "en_marcha"):
            open_by_client[p.client_id] = open_by_client.get(p.client_id, 0) + p.amount_cents
    horizon = today + timedelta(days=7)
    m0 = month_start(today)
    return {
        "pipeline": pipeline,
        "pipeline_value_cents": sum(v for cid, v in open_by_client.items()
                                    if any(c.id == cid and c.stage in ("charla", "propuesta") for c in clients)),
        "projects": {st: sum(p.status == st for p in projects) for st in ("pendiente", "en_marcha", "terminado")},
        "active_value_cents": sum(p.amount_cents for p in projects if p.status in ("pendiente", "en_marcha")),
        "receivable_cents": sum(r.amount_cents for r in recs if r.status == "por_cobrar"),
        "overdue_receivable_cents": sum(r.amount_cents for r in recs
                                        if r.status == "por_cobrar" and r.due_date and r.due_date < today),
        "collected_month_cents": sum(r.amount_cents for r, t in collected if t and t.occurred_on >= m0),
        "collected_year_cents": sum(r.amount_cents for r, t in collected if t and t.occurred_on.year == today.year),
        "tasks": {st: sum(t == st for t in tasks) for st in ("pending", "doing", "done")},
        "followups": sorted(
            [{"client_id": c.id, "name": c.name, "next_step": c.next_step, "next_step_date": c.next_step_date,
              "overdue": c.next_step_date < today}
             for c in clients if c.next_step_date and c.next_step_date <= horizon and c.stage != "perdido"],
            key=lambda f: f["next_step_date"]),
        "upcoming_deliveries": sorted(
            [{"project_id": p.id, "name": p.name, "due_date": p.due_date,
              "client_name": next((c.name for c in clients if c.id == p.client_id), None)}
             for p in projects if p.due_date and p.due_date <= horizon and p.status in ("pendiente", "en_marcha")],
            key=lambda x: x["due_date"]),
    }
