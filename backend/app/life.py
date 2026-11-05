"""Vida: pendientes, hábitos y calendario. Los pendientes/hábitos no son financieros; el calendario sólo LEE
el libro mayor (no escribe nada financiero)."""
from __future__ import annotations

import calendar as cal
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from . import ledger
from . import reports as r
from . import schemas as s
from .models import Account, Entry, Habit, HabitLog, Obligation, Task, Transaction, User

PRIORITY_ORDER = {"high": 0, "normal": 1, "low": 2}


# ------------------------------------------------------------------ pendientes
def get_task(db: Session, user: User, task_id: int) -> Task:
    t = db.get(Task, task_id)
    if t is None or t.user_id != user.id:
        raise ledger.NotFound("Pendiente no encontrado")
    return t


def list_tasks(db: Session, user: User, status: str | None, today: date, area: str | None = None) -> list[Task]:
    q = select(Task).where(Task.user_id == user.id)
    if status:
        q = q.where(Task.status == status)
    if area:
        q = q.where(Task.area == area)
    tasks = list(db.scalars(q))
    far = date.max
    tasks.sort(key=lambda t: (t.status == "done", t.due_date or far, PRIORITY_ORDER.get(t.priority, 1), t.id))
    return tasks


def _check_project(db: Session, user: User, pid: int | None) -> None:
    if pid is not None:
        from .models import RvProject

        pr = db.get(RvProject, pid)
        if pr is None or pr.user_id != user.id:
            raise ledger.NotFound("Proyecto no encontrado")


def create_task(db: Session, user: User, p: s.TaskCreate) -> Task:
    _check_project(db, user, p.project_id)
    t = Task(user_id=user.id, status="pending", **p.model_dump())
    db.add(t)
    db.flush()
    return t


def update_task(db: Session, user: User, task_id: int, p: s.TaskUpdate) -> Task:
    t = get_task(db, user, task_id)
    data = p.model_dump(exclude_unset=True)
    if "project_id" in data:
        _check_project(db, user, data["project_id"])
    status = data.pop("status", None)
    for k, v in data.items():
        if k in ("title", "priority", "area") and v is None:
            continue  # no se pueden dejar vacíos
        setattr(t, k, v)
    if status:
        set_status(t, status)
    db.flush()
    return t


def set_status(t: Task, status: str) -> None:
    if status == "done":
        if t.status != "done":
            t.status, t.completed_at = "done", datetime.now(UTC)
    else:
        t.status, t.completed_at = status, None


def set_task_done(db: Session, user: User, task_id: int, done: bool) -> Task:
    t = get_task(db, user, task_id)
    set_status(t, "done" if done else "pending")
    db.flush()
    return t


def start_task(db: Session, user: User, task_id: int) -> Task:
    t = get_task(db, user, task_id)
    set_status(t, "doing")
    db.flush()
    return t


# ------------------------------------------------------------------ hábitos
def get_habit(db: Session, user: User, habit_id: int) -> Habit:
    h = db.get(Habit, habit_id)
    if h is None or h.user_id != user.id or h.archived_at is not None:
        raise ledger.NotFound("Hábito no encontrado")
    return h


def habit_view(h: Habit, days: set[date], today: date) -> dict:
    """Racha: días consecutivos hechos terminando hoy (o ayer, si hoy todavía no se marca)."""
    start = today if today in days else today - timedelta(days=1)
    streak, d = 0, start
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    monday = today - timedelta(days=today.weekday())
    return {
        "id": h.id, "name": h.name, "emoji": h.emoji, "target_per_week": h.target_per_week,
        "streak_days": streak, "done_today": today in days,
        "week_count": sum(1 for i in range(7) if monday + timedelta(days=i) in days),
        "last_7": [{"date": today - timedelta(days=6 - i), "done": (today - timedelta(days=6 - i)) in days}
                   for i in range(7)],
    }


def _days_for(db: Session, habit_ids: list[int]) -> dict[int, set[date]]:
    out: dict[int, set[date]] = {i: set() for i in habit_ids}
    if habit_ids:
        for hid, d in db.execute(select(HabitLog.habit_id, HabitLog.day).where(HabitLog.habit_id.in_(habit_ids))):
            out[hid].add(d)
    return out


def list_habits(db: Session, user: User, today: date) -> list[dict]:
    habits = list(db.scalars(select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None))
                             .order_by(Habit.id)))
    days = _days_for(db, [h.id for h in habits])
    return [habit_view(h, days[h.id], today) for h in habits]


def toggle_habit(db: Session, user: User, habit_id: int, day: date | None, today: date) -> dict:
    h = get_habit(db, user, habit_id)
    day = day or today
    if day > today:
        raise ledger.LedgerError("No se puede marcar un hábito en un día futuro")
    log = db.get(HabitLog, (h.id, day))
    if log:
        db.delete(log)
    else:
        db.add(HabitLog(habit_id=h.id, day=day))
    db.flush()
    return habit_view(h, _days_for(db, [h.id])[h.id], today)


# ------------------------------------------------------------------ calendario
def month_calendar(db: Session, user: User, month: date, today: date) -> dict:
    first = month.replace(day=1)
    last = first.replace(day=cal.monthrange(first.year, first.month)[1])
    days = {first + timedelta(days=i): {"income_cents": 0, "expense_cents": 0, "tx_count": 0, "habits_done": 0,
                                         "events": []} for i in range((last - first).days + 1)}
    # Ingresos y gastos por día (devengado; las anulaciones se netean porque la reversión lleva la misma fecha).
    q = (
        select(Transaction.occurred_on,
               func.sum(case((Account.account_class == "income", -Entry.amount_cents), else_=0)),
               func.sum(case((Account.account_class == "expense", Entry.amount_cents), else_=0)))
        .select_from(Entry).join(Transaction).join(Account)
        .where(Transaction.user_id == user.id, Transaction.occurred_on.between(first, last))
        .group_by(Transaction.occurred_on)
    )
    for d, inc, exp in db.execute(q):
        days[d]["income_cents"], days[d]["expense_cents"] = int(inc or 0), int(exp or 0)
    for d, n in db.execute(
        select(Transaction.occurred_on, func.count(Transaction.id))
        .where(Transaction.user_id == user.id, Transaction.occurred_on.between(first, last),
               Transaction.voided_at.is_(None), Transaction.kind != "reversal")
        .group_by(Transaction.occurred_on)
    ):
        days[d]["tx_count"] = int(n)
    for d, n in db.execute(
        select(HabitLog.day, func.count()).join(Habit, Habit.id == HabitLog.habit_id)
        .where(Habit.user_id == user.id, Habit.archived_at.is_(None), HabitLog.day.between(first, last))
        .group_by(HabitLog.day)
    ):
        days[d]["habits_done"] = int(n)

    def add(d: date, ev: dict) -> None:
        if d in days:
            days[d]["events"].append(ev)

    if last >= today:  # vencimientos y tarjetas (sólo desde hoy; lo vencido se muestra en su fecha)
        for it in r.upcoming(db, user, today, (last - today).days):
            add(it["due_date"], {"kind": "card" if it["source"] == "card" else "obligation", "ref_id": it["ref_id"],
                                 "title": it["name"], "amount_cents": it["amount_cents"], "direction": it["direction"],
                                 "status": "overdue" if it["overdue"] else "pending", "priority": None})
    for o in db.scalars(select(Obligation).where(Obligation.user_id == user.id, Obligation.status == "paid",
                                                 Obligation.due_date.between(first, last))):
        add(o.due_date, {"kind": "obligation", "ref_id": o.id, "title": o.name, "amount_cents": o.amount_cents,
                         "direction": o.direction, "status": "paid", "priority": None})
    for t in db.scalars(select(Task).where(Task.user_id == user.id, Task.due_date.between(first, last))):
        st = "done" if t.status == "done" else ("overdue" if t.due_date < today else "pending")
        add(t.due_date, {"kind": "task", "ref_id": t.id, "title": t.title, "amount_cents": None, "direction": None,
                         "status": st, "priority": t.priority})
    out_days = [{"date": d, **v} for d, v in sorted(days.items())]
    return {"month": first.strftime("%Y-%m"), "today": today,
            "totals": {"income_cents": sum(x["income_cents"] for x in out_days),
                       "expense_cents": sum(x["expense_cents"] for x in out_days)},
            "days": out_days}
