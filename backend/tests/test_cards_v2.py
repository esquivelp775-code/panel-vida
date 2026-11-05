"""Pago mínimo estimado, F12 (vencido persistente) y MSI de ciclos futuros en vencimientos."""
from datetime import date, timedelta

from app import installments as msi
from app import reports as r
from app.db import SessionLocal
from app.models import Account


def status(card_id, today):
    with SessionLocal() as db:
        return r.card_status(db, db.get(Account, card_id), today)


def test_pct_ceil_integer():
    assert msi.pct_ceil(10_000, 150) == 150
    assert msi.pct_ceil(10_001, 150) == 151  # 150.015 → 151 (hacia arriba)
    assert msi.pct_ceil(0, 150) == 0


def test_minimum_due_rules():
    assert r.minimum_due(100_000, 0, 2_000_000) == 25_000  # 1.25 % del límite > 1.5 % del saldo
    assert r.minimum_due(100_000, 0, None) == 1_500
    assert r.minimum_due(10_000, 0, 2_000_000) == 10_000  # nunca mayor que el estado
    assert r.minimum_due(14_000, 4_000, None) == 4_150  # 1.5 % de 10 000 + mensualidad MSI
    assert r.minimum_due(0, 0, 1_000) == 0


def test_card_status_includes_minimum(api):
    card = api.account("Tarjeta", "credit_card", credit_limit_cents=1_000_000, statement_day=5, due_day=25)
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=200_000,
           occurred_on="2026-03-01")
    st = status(card["id"], date(2026, 3, 10))
    assert st["statement_due_cents"] == 200_000
    assert st["minimum_due_cents"] == 12_500  # 1.25 % de 1 000 000 > 1.5 % de 200 000 (3 000)
    assert st["statement_closing"] == date(2026, 3, 5)


def test_f12_overdue_persists_after_next_closing(api):
    card = api.account("Tarjeta", "credit_card", statement_day=5, due_day=25)
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=10_000,
           occurred_on="2026-03-01")
    st = status(card["id"], date(2026, 4, 6))  # pasó el corte del 5 abr; el estado de marzo nunca se pagó
    assert st["overdue"] is True
    api.tx(kind="card_payment", from_account_id=debit["id"], card_account_id=card["id"], amount_cents=10_000,
           occurred_on="2026-04-06")
    assert status(card["id"], date(2026, 4, 7))["overdue"] is False  # pagado tarde: ya no está vencido


def test_upcoming_projects_future_msi_installments(api):
    card = api.account("Tarjeta", "credit_card", statement_day=5, due_day=25)
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=12_000,
           installments=3, occurred_on=(date.today() - timedelta(days=1)).isoformat())
    up = [i for i in api.c.get("/api/v1/upcoming?days=120").json() if i["source"] == "card"]
    assert [i["amount_cents"] for i in up] == [4_000, 4_000, 4_000]
    assert sum(i["amount_cents"] for i in up) == 12_000
    assert len({i["due_date"] for i in up}) == 3
