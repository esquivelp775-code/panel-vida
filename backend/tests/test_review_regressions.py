"""Regresiones de la revisión financiera y de seguridad (ver docs/PROGRESS.md, hallazgos F-n / S-n)."""
from datetime import UTC, date, datetime, timedelta

import jwt
from sqlalchemy import select

from app import reports as r
from app.db import SessionLocal
from app.models import Account, Obligation


def _setup(api):
    return (api.account("Débito", "checking", opening_balance_cents=100_000), api.account("Renta", "expense"))


def test_f1_resettle_after_void_does_not_duplicate_next(api):
    debit, rent = _setup(api)
    ob = api.c.post("/api/v1/obligations", json={"name": "Renta", "kind": "bill", "amount_cents": 10_000,
                                                 "due_date": "2026-11-07", "recurrence": "monthly",
                                                 "pay_from_account_id": debit["id"], "category_id": rent["id"]}).json()
    paid = api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={}).json()
    api.c.post(f"/api/v1/transactions/{paid['settled_transaction_id']}/void", json={"reason": "error"})
    assert api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={}).status_code == 200
    pending = api.c.get("/api/v1/obligations").json()
    assert [(o["due_date"], o["amount_cents"]) for o in pending] == [("2026-12-07", 10_000)]


def test_f2_void_touching_archived_account_rejected(api):
    a = api.account("A", "checking", opening_balance_cents=1_000)
    b = api.account("B", "savings")
    t = api.tx(kind="transfer", from_account_id=a["id"], to_account_id=b["id"], amount_cents=1_000)
    assert api.c.post(f"/api/v1/accounts/{a['id']}/archive").status_code == 200
    assert api.c.post(f"/api/v1/transactions/{t['id']}/void", json={"reason": "x"}).status_code == 422
    assert api.c.get("/api/v1/reports/integrity").json()["ok"] is True


def test_f3_voided_opening_balance_is_not_liquid_change(api):
    cash = api.account("Efectivo", "cash", opening_balance_cents=50_000)
    opening = api.c.get(f"/api/v1/transactions?account_id={cash['id']}").json()["items"][0]
    api.c.post(f"/api/v1/transactions/{opening['id']}/void", json={"reason": "capturado mal"})
    assert api.c.get("/api/v1/reports/cashflow").json()["totals"]["liquid_change_cents"] == 0


def test_f4_future_dated_not_in_available(api):
    debit = api.account("Débito", "checking", opening_balance_cents=1_000)
    salary = api.account("Salario", "income")
    api.tx(kind="income", account_id=debit["id"], category_id=salary["id"], amount_cents=50_000,
           occurred_on=(date.today() + timedelta(days=20)).isoformat())
    dash = api.c.get("/api/v1/dashboard").json()
    assert dash["available_cents"] == 1_000
    assert api.c.get("/api/v1/reports/projection").json()["starting_available_cents"] == 1_000


def test_f6_paid_statement_shows_next_cycle(api):
    card = api.account("Tarjeta", "credit_card", statement_day=5, due_day=25)
    debit, food = _setup(api)
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=10_000,
           occurred_on="2026-03-01")
    api.tx(kind="card_payment", from_account_id=debit["id"], card_account_id=card["id"], amount_cents=10_000,
           occurred_on="2026-03-08")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=8_000,
           occurred_on="2026-03-09")
    with SessionLocal() as db:
        st = r.card_status(db, db.get(Account, card["id"]), date(2026, 3, 10))
    assert st["next_due_date"] == date(2026, 4, 25) and st["statement_due_cents"] == 8_000


def test_f8_monthly_recurrence_keeps_anchor_day(api):
    debit, rent = _setup(api)
    ob = api.c.post("/api/v1/obligations", json={"name": "Renta", "kind": "bill", "amount_cents": 1_000,
                                                 "due_date": "2027-01-31", "recurrence": "monthly",
                                                 "pay_from_account_id": debit["id"], "category_id": rent["id"]}).json()
    dues = []
    for _ in range(3):
        api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={})
        ob = api.c.get("/api/v1/obligations").json()[0]
        dues.append(ob["due_date"])
    assert dues == ["2027-02-28", "2027-03-31", "2027-04-30"]


def test_f9_partial_refund_reduces_expense(api):
    card = api.account("Tarjeta", "credit_card")
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=1_000)
    t = api.tx(kind="refund", account_id=card["id"], category_id=food["id"], amount_cents=300)
    assert t["kind"] == "refund"
    assert api.balance(card) == 700 and api.balance(food) == 700
    assert api.c.get("/api/v1/dashboard").json()["month"]["expense_cents"] == 700
    loan = api.account("Préstamo", "loan")
    api.tx(expect=422, kind="refund", account_id=loan["id"], category_id=food["id"], amount_cents=1)


def test_f10_settle_interest_without_category_is_422(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    loan = api.account("Préstamo", "loan", opening_balance_cents=50_000)
    ob = api.c.post("/api/v1/obligations", json={"name": "Mensualidad", "kind": "loan_installment",
                                                 "amount_cents": 10_000, "due_date": date.today().isoformat(),
                                                 "pay_from_account_id": debit["id"],
                                                 "target_account_id": loan["id"]}).json()
    assert api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={"interest_cents": 100}).status_code == 422


def test_f11_due_date_with_short_month():
    assert r.due_after_closing(date(2026, 2, 28), 28, 30) == date(2026, 3, 1)
    assert r.due_after_closing(date(2026, 1, 28), 28, 30) == date(2026, 1, 30)
    assert r.due_after_closing(date(2026, 4, 30), 30, 31) == date(2026, 5, 1)
    assert r.due_after_closing(date(2026, 3, 20), 20, 10) == date(2026, 4, 10)


def test_s5_token_without_exp_rejected(client):
    token = jwt.encode({"sub": "1", "iat": datetime.now(UTC)}, "test-secret-key-not-for-production-0123456789",
                       "HS256")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_s7_huge_offset_is_422(api):
    assert api.c.get("/api/v1/transactions?offset=99999999999999999999").status_code == 422


def test_obligation_anchor_and_link_persisted(api):
    debit, rent = _setup(api)
    ob = api.c.post("/api/v1/obligations", json={"name": "Renta", "kind": "bill", "amount_cents": 1_000,
                                                 "due_date": "2027-01-31", "recurrence": "monthly",
                                                 "pay_from_account_id": debit["id"], "category_id": rent["id"]}).json()
    api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={})
    with SessionLocal() as db:
        child = db.scalar(select(Obligation).where(Obligation.generated_from_id == ob["id"]))
        assert child is not None and child.anchor_day == 31
