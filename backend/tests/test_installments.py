"""Meses sin intereses (MSI): gasto y deuda completos el día de compra; el estado exige sólo la mensualidad."""
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app import installments as msi
from app import reports as r
from app.db import SessionLocal, engine
from app.models import Account


@pytest.fixture
def book(api):
    return {
        "card": api.account("Tarjeta", "credit_card", credit_limit_cents=100_000, statement_day=5, due_day=25),
        "debit": api.account("Débito", "checking", opening_balance_cents=100_000),
        "food": api.account("Comida", "expense"),
    }


def status(card_id, today):
    with SessionLocal() as db:
        return r.card_status(db, db.get(Account, card_id), today)


def test_schedule_is_exact():
    assert msi.schedule(10_000, 3) == [3_334, 3_333, 3_333]
    assert sum(msi.schedule(999_999, 12)) == 999_999
    assert msi.first_closing(date(2026, 3, 10), 5) == date(2026, 4, 5)
    assert msi.first_closing(date(2026, 3, 5), 5) == date(2026, 3, 5)  # el día de corte entra en ese corte
    assert msi.first_closing(date(2026, 1, 30), 31) == date(2026, 1, 31)


def test_msi_full_expense_and_debt_but_partial_statement(api, book):
    card, debit, food = book["card"]["id"], book["debit"]["id"], book["food"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=12_000, installments=3,
           occurred_on="2026-03-10", description="Refrigerador (demo)")
    # R2 intacta: gasto completo en marzo y deuda completa.
    totals = api.c.get("/api/v1/reports/cashflow?date_from=2026-03-01&date_to=2026-03-31").json()["totals"]
    assert totals["expense_cents"] == 12_000
    st = status(card, date(2026, 3, 15))
    assert st["owed_cents"] == 12_000 and st["deferred_cents"] == 12_000
    assert (st["next_due_date"], st["statement_due_cents"]) == (date(2026, 4, 25), 4_000)  # estimado 1.ª mensualidad
    # Corte 5 abr: se factura la 1.ª mensualidad, más una compra normal.
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=1_000, occurred_on="2026-04-01")
    st = status(card, date(2026, 4, 10))
    assert (st["next_due_date"], st["statement_due_cents"]) == (date(2026, 4, 25), 5_000)
    assert st["deferred_cents"] == 8_000
    # Se paga el estado; el siguiente estado exige sólo la 2.ª mensualidad.
    api.tx(kind="card_payment", from_account_id=debit, card_account_id=card, amount_cents=5_000,
           occurred_on="2026-04-20")
    st = status(card, date(2026, 4, 26))
    assert st["owed_cents"] == 8_000
    assert (st["next_due_date"], st["statement_due_cents"]) == (date(2026, 5, 25), 4_000)
    with SessionLocal() as db:
        rows = r.installment_rows(db, db.get(Account, card), date(2026, 4, 26))
    assert rows[0]["billed_count"] == 1 and rows[0]["remaining_cents"] == 8_000
    assert rows[0]["next_closing"] == date(2026, 5, 5)


def test_void_msi_purchase_removes_plan_effect(api, book):
    card, food = book["card"]["id"], book["food"]["id"]
    t = api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=12_000, installments=3,
               occurred_on="2026-03-10")
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=1_000, occurred_on="2026-04-01")
    api.c.post(f"/api/v1/transactions/{t['id']}/void", json={"reason": "devuelto completo"})
    st = status(card, date(2026, 4, 10))
    assert st["statement_due_cents"] == 1_000 and st["deferred_cents"] == 0 and st["owed_cents"] == 1_000


def test_expense_with_card_accepts_installments(api, book):
    t = api.tx(kind="expense", account_id=book["card"]["id"], category_id=book["food"]["id"], amount_cents=6_000,
               installments=6)
    assert t["kind"] == "card_purchase"
    assert len(api.c.get(f"/api/v1/accounts/{book['card']['id']}/installments").json()) == 1


def test_installments_validation(api, book):
    nocut = api.account("Tarjeta sin corte", "credit_card")
    food = book["food"]["id"]
    api.tx(expect=422, kind="expense", account_id=book["debit"]["id"], category_id=food, amount_cents=1_000,
           installments=3)
    api.tx(expect=422, kind="card_purchase", card_account_id=nocut["id"], category_id=food, amount_cents=1_000,
           installments=3)
    api.tx(expect=422, kind="card_purchase", card_account_id=book["card"]["id"], category_id=food,
           amount_cents=1_000, installments=1)
    api.tx(expect=422, kind="card_purchase", card_account_id=book["card"]["id"], category_id=food,
           amount_cents=2, installments=3)


def test_installment_plans_are_immutable(api, book):
    api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
           amount_cents=3_000, installments=3)
    with pytest.raises(DBAPIError, match="immutable"):
        with engine.begin() as c:
            c.execute(text("UPDATE installment_plans SET months = 2"))
    with pytest.raises(DBAPIError, match="immutable"):
        with engine.begin() as c:
            c.execute(text("DELETE FROM installment_plans"))


def test_f7_card_paid_directly_does_not_count_obligation_twice(api, book):
    card, debit, food = book["card"]["id"], book["debit"]["id"], book["food"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=5_000,
           occurred_on=(date.today() - timedelta(days=40)).isoformat())
    api.c.post("/api/v1/obligations", json={"name": "Pago tarjeta", "kind": "card_payment", "amount_cents": 5_000,
                                            "due_date": date.today().isoformat(), "pay_from_account_id": debit,
                                            "target_account_id": card})
    api.tx(kind="card_payment", from_account_id=debit, card_account_id=card, amount_cents=5_000)
    assert api.c.get("/api/v1/upcoming?days=60").json() == []
    proj = api.c.get("/api/v1/reports/projection").json()
    assert proj["min_balance_cents"] == proj["starting_available_cents"] == 95_000


def test_f14_skip_one_occurrence_keeps_series(api, book):
    rent = api.account("Renta", "expense")
    ob = api.c.post("/api/v1/obligations", json={"name": "Renta", "kind": "bill", "amount_cents": 1_000,
                                                 "due_date": "2027-01-31", "recurrence": "monthly",
                                                 "pay_from_account_id": book["debit"]["id"],
                                                 "category_id": rent["id"]}).json()
    nxt = api.c.post(f"/api/v1/obligations/{ob['id']}/skip").json()
    assert nxt["due_date"] == "2027-02-28" and nxt["status"] == "pending"
    assert api.c.get("/api/v1/obligations?status=cancelled").json()[0]["id"] == ob["id"]
    assert api.balance(book["debit"]) == 100_000  # omitir no mueve dinero
    once = api.c.post("/api/v1/obligations", json={"name": "Única", "kind": "bill", "amount_cents": 1,
                                                   "due_date": "2027-01-01", "category_id": rent["id"]}).json()
    assert api.c.post(f"/api/v1/obligations/{once['id']}/skip").status_code == 422


def test_f13_plan_must_match_its_purchase(api, book):
    t = api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
               amount_cents=3_000)
    with pytest.raises(DBAPIError, match="does not match"):
        with engine.begin() as c:
            c.execute(text("INSERT INTO installment_plans (user_id, transaction_id, card_account_id, total_cents, "
                           "months, first_closing) VALUES (1, :t, :c, 9999, 3, current_date)"),
                      {"t": t["id"], "c": book["card"]["id"]})
