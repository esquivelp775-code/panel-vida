from datetime import date

from app import reports as r
from app.db import SessionLocal
from app.models import User


def test_debt_plan_math(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000, opening_date="2026-08-01")
    loan = api.account("Auto", "loan", opening_balance_cents=1_000_000, opening_date="2026-08-01")
    card = api.account("Tarjeta", "credit_card", statement_day=5, due_day=25, opening_balance_cents=100_001,
                       opening_date="2026-08-01")
    api.c.post("/api/v1/obligations", json={"name": "Mensualidad auto", "kind": "loan_installment",
                                            "amount_cents": 200_000, "due_date": "2026-11-20", "recurrence": "monthly",
                                            "pay_from_account_id": debit["id"], "target_account_id": loan["id"]})
    with SessionLocal() as db:
        p = r.debt_plan(db, db.query(User).first(), date(2026, 11, 5), date(2027, 6, 1))
    assert p["months_left"] == 8  # nov 2026 … jun 2027
    by = {d["name"]: d for d in p["debts"]}
    assert by["Auto"]["monthly_needed_cents"] == 125_000 and by["Auto"]["scheduled_monthly_cents"] == 200_000
    assert by["Auto"]["projected_payoff_month"] == "2027-03" and by["Auto"]["on_track"] is True
    assert by["Tarjeta"]["monthly_needed_cents"] == 12_501  # 100 001 / 8 hacia arriba
    assert by["Tarjeta"]["projected_payoff_month"] is None and by["Tarjeta"]["on_track"] is False
    assert p["total_owed_cents"] == 1_100_001
    assert p["projection"][-1] == {"month": "2027-06", "remaining_cents": 0}
    assert len(p["projection"]) == 8


def test_debt_plan_endpoint(api):
    assert api.c.get("/api/v1/reports/debt-plan").json()["target_month"] == "2027-06"
    assert api.c.get("/api/v1/reports/debt-plan?target=2020-01").status_code == 422


def test_ryventis_board_flow(api):
    c = api.c
    t = c.post("/api/v1/tasks", json={"title": "Propuesta cliente (demo)", "area": "ryventis"}).json()
    c.post("/api/v1/tasks", json={"title": "Personal"})
    assert [x["title"] for x in c.get("/api/v1/tasks?area=ryventis").json()] == ["Propuesta cliente (demo)"]
    s = c.post(f"/api/v1/tasks/{t['id']}/start").json()
    assert s["status"] == "doing" and s["completed_at"] is None
    d = c.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"}).json()
    assert d["status"] == "done" and d["completed_at"]
    back = c.patch(f"/api/v1/tasks/{t['id']}", json={"status": "pending"}).json()
    assert back["status"] == "pending" and back["completed_at"] is None
    assert c.get("/api/v1/tasks?status=doing").json() == []
