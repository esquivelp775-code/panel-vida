from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from .. import life
from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import get_current_user

router = APIRouter(tags=["vida"])
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"


@router.get("/tasks", response_model=list[s.TaskOut])
def list_tasks(status: str | None = Query(default=None, pattern="^(pending|done)$"),
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return life.list_tasks(db, user, status, date.today())


@router.post("/tasks", response_model=s.TaskOut, status_code=201)
def create_task(body: s.TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = life.create_task(db, user, body)
    db.commit()
    return t


@router.patch("/tasks/{task_id}", response_model=s.TaskOut)
def update_task(task_id: int, body: s.TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    t = life.update_task(db, user, task_id, body)
    db.commit()
    return t


@router.post("/tasks/{task_id}/complete", response_model=s.TaskOut)
def complete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = life.set_task_done(db, user, task_id, True)
    db.commit()
    return t


@router.post("/tasks/{task_id}/reopen", response_model=s.TaskOut)
def reopen_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = life.set_task_done(db, user, task_id, False)
    db.commit()
    return t


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(life.get_task(db, user, task_id))
    db.commit()
    return Response(status_code=204)


@router.get("/habits")
def list_habits(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return life.list_habits(db, user, date.today())


@router.post("/habits", status_code=201)
def create_habit(body: s.HabitCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    h = life.Habit(user_id=user.id, **body.model_dump())
    db.add(h)
    db.commit()
    return life.habit_view(h, set(), date.today())


@router.patch("/habits/{habit_id}")
def update_habit(habit_id: int, body: s.HabitUpdate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    h = life.get_habit(db, user, habit_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(h, k, v)
    db.commit()
    return next(x for x in life.list_habits(db, user, date.today()) if x["id"] == h.id)


@router.post("/habits/{habit_id}/toggle")
def toggle_habit(habit_id: int, body: s.HabitToggle | None = None, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    out = life.toggle_habit(db, user, habit_id, body.day if body else None, date.today())
    db.commit()
    return out


@router.delete("/habits/{habit_id}", status_code=204)
def delete_habit(habit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from datetime import UTC, datetime

    h = life.get_habit(db, user, habit_id)
    h.archived_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)


@router.get("/calendar")
def calendar(month: str = Query(pattern=MONTH), db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return life.month_calendar(db, user, date(int(month[:4]), int(month[5:7]), 1), date.today())
