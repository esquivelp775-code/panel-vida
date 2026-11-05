"""Vida: pendientes, hábitos (racha) y calendario."""
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.life import habit_view
from app.main import app
from app.models import Habit

from .conftest import PASSWORD, make_user

T = date.today()


def test_tasks_crud_and_order(api):
    c = api.c
    a = c.post("/api/v1/tasks", json={"title": "Pagar predial", "due_date": (T - timedelta(days=1)).isoformat(),
                                      "area": "finanzas", "priority": "high"}).json()
    b = c.post("/api/v1/tasks", json={"title": "Sin fecha"}).json()
    d = c.post("/api/v1/tasks", json={"title": "Mañana", "due_date": (T + timedelta(days=1)).isoformat()}).json()
    assert [t["title"] for t in c.get("/api/v1/tasks?status=pending").json()] == ["Pagar predial", "Mañana", "Sin fecha"]
    done = c.post(f"/api/v1/tasks/{a['id']}/complete").json()
    assert done["status"] == "done" and done["completed_at"]
    assert c.post(f"/api/v1/tasks/{a['id']}/complete").json()["status"] == "done"  # idempotente
    assert c.post(f"/api/v1/tasks/{a['id']}/reopen").json()["completed_at"] is None
    e = c.patch(f"/api/v1/tasks/{d['id']}", json={"due_date": None, "title": "Ya sin fecha"}).json()
    assert e["due_date"] is None and e["title"] == "Ya sin fecha"
    assert c.delete(f"/api/v1/tasks/{b['id']}").status_code == 204
    assert c.post("/api/v1/tasks", json={"title": "   "}).status_code == 422
    assert c.post("/api/v1/tasks", json={"title": "x", "area": "inventada"}).status_code == 422


def test_habit_streak_logic():
    h = Habit(id=1, name="Leer", emoji="📚", target_per_week=5)
    days = {T - timedelta(days=i) for i in (1, 2, 3)}
    v = habit_view(h, days, T)
    assert v["streak_days"] == 3 and v["done_today"] is False  # racha viva aunque hoy falte
    v = habit_view(h, days | {T}, T)
    assert v["streak_days"] == 4 and v["last_7"][-1]["done"] is True
    assert habit_view(h, {T - timedelta(days=2)}, T)["streak_days"] == 0


def test_habits_toggle_and_rules(api):
    c = api.c
    h = c.post("/api/v1/habits", json={"name": "Ejercicio", "emoji": "🏃", "target_per_week": 4}).json()
    assert h["streak_days"] == 0 and len(h["last_7"]) == 7
    v = c.post(f"/api/v1/habits/{h['id']}/toggle").json()
    assert v["done_today"] is True and v["streak_days"] == 1 and v["week_count"] == 1
    v = c.post(f"/api/v1/habits/{h['id']}/toggle", json={"day": (T - timedelta(days=1)).isoformat()}).json()
    assert v["streak_days"] == 2
    v = c.post(f"/api/v1/habits/{h['id']}/toggle").json()  # desmarcar hoy
    assert v["done_today"] is False and v["streak_days"] == 1
    future = (T + timedelta(days=1)).isoformat()
    assert c.post(f"/api/v1/habits/{h['id']}/toggle", json={"day": future}).status_code == 422
    assert c.patch(f"/api/v1/habits/{h['id']}", json={"target_per_week": 3}).json()["target_per_week"] == 3
    assert c.delete(f"/api/v1/habits/{h['id']}").status_code == 204
    assert c.get("/api/v1/habits").json() == []


def test_calendar_month(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    food = api.account("Comida", "expense")
    salary = api.account("Salario", "income")
    month = T.strftime("%Y-%m")
    api.tx(kind="expense", account_id=debit["id"], category_id=food["id"], amount_cents=1_500)
    api.tx(kind="income", account_id=debit["id"], category_id=salary["id"], amount_cents=9_000)
    t = api.tx(kind="expense", account_id=debit["id"], category_id=food["id"], amount_cents=700)
    api.c.post(f"/api/v1/transactions/{t['id']}/void", json={"reason": "error"})  # anulada: no cuenta
    api.c.post("/api/v1/tasks", json={"title": "Revisar estado de cuenta", "due_date": T.isoformat()})
    h = api.c.post("/api/v1/habits", json={"name": "Agua"}).json()
    api.c.post(f"/api/v1/habits/{h['id']}/toggle")
    cal = api.c.get(f"/api/v1/calendar?month={month}").json()
    import calendar as pycal
    assert len(cal["days"]) == pycal.monthrange(T.year, T.month)[1]
    today = next(d for d in cal["days"] if d["date"] == T.isoformat())
    assert (today["income_cents"], today["expense_cents"], today["habits_done"]) == (9_000, 1_500, 1)
    assert today["tx_count"] == 3  # saldo inicial + gasto + ingreso (la anulada y su reversión no cuentan)
    assert any(e["kind"] == "task" and e["status"] == "pending" for e in today["events"])
    assert cal["totals"]["expense_cents"] == 1_500
    assert api.c.get("/api/v1/calendar?month=2026-13").status_code == 422


def test_life_isolation(api):
    t = api.c.post("/api/v1/tasks", json={"title": "Privado"}).json()
    h = api.c.post("/api/v1/habits", json={"name": "Privado"}).json()
    make_user("otro@example.com")
    o = TestClient(app)
    tok = o.post("/api/v1/auth/login", json={"email": "otro@example.com", "password": PASSWORD}).json()["access_token"]
    o.headers["Authorization"] = f"Bearer {tok}"
    assert o.get("/api/v1/tasks").json() == [] and o.get("/api/v1/habits").json() == []
    assert o.post(f"/api/v1/tasks/{t['id']}/complete").status_code == 404
    assert o.delete(f"/api/v1/tasks/{t['id']}").status_code == 404
    assert o.post(f"/api/v1/habits/{h['id']}/toggle").status_code == 404
