"""Regresiones de la 2.ª revisión financiera (escenarios P1–P8 del revisor; datos ficticios)."""
from datetime import date, timedelta

import pytest

from app import reports as r
from app.db import SessionLocal
from app.models import Account, User


def status(card_id, today):
    with SessionLocal() as db:
        return r.card_status(db, db.get(Account, card_id), today)


def upcoming(today, days):
    with SessionLocal() as db:
        return r.upcoming(db, db.query(User).first(), today, days)


def cols(row):
    return {k: row[k] for k in ("row", "fingerprint", "occurred_on", "description", "amount_cents", "direction")}


@pytest.fixture
def b(api):
    return {"debit": api.account("Débito", "checking", opening_balance_cents=100_000),
            "card": api.account("Tarjeta", "credit_card", credit_limit_cents=50_000, statement_day=15, due_day=5),
            "food": api.account("Comida", "expense")}


def test_r2_1_card_payment_imported_from_both_statements_is_flagged(api, b):
    """HIGH: el pago importado desde el estado de débito debe marcar como duplicado la línea del estado de tarjeta."""
    deb = api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"],
                     "csv_text": "Fecha,Concepto,Monto\n2026-10-30,PAGO TARJETA,-3000.00\n"}).json()["rows"]
    api.c.post("/api/v1/imports/commit", json={"account_id": b["debit"]["id"],
               "rows": [cols(deb[0]) | {"counter_account_id": b["card"]["id"]}]})
    card = api.c.post("/api/v1/imports/preview", json={"account_id": b["card"]["id"],
                      "csv_text": "Fecha,Concepto,Monto\n2026-11-01,SU PAGO GRACIAS,-3000.00\n"}).json()
    assert card["rows"][0]["status"] == "duplicate"


def test_r2_2_card_obligation_targets_its_own_cycle(api, b):
    """P1: estado cubierto por pago directo → la obligación de ese ciclo no cuenta y el ciclo siguiente sí."""
    card, food, debit = b["card"]["id"], b["food"]["id"], b["debit"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=4_000, occurred_on="2026-10-10")
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=2_500, occurred_on="2026-10-20")
    api.c.post("/api/v1/obligations", json={"name": "Pago tarjeta", "kind": "card_payment", "amount_cents": 4_000,
                                            "due_date": "2026-11-05", "pay_from_account_id": debit,
                                            "target_account_id": card})
    api.tx(kind="card_payment", from_account_id=debit, card_account_id=card, amount_cents=4_000,
           occurred_on="2026-11-01")
    items = upcoming(date(2026, 11, 3), 45)
    assert [(i["source"], str(i["due_date"]), i["amount_cents"]) for i in items] == [("card", "2026-12-05", 2_500)]


def test_r2_3_purchases_since_cut_are_projected_while_statement_unpaid(api, b):
    """P2: el siguiente ciclo incluye lo comprado después del corte, pagado o no el estado actual."""
    card, food = b["card"]["id"], b["food"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=4_000, occurred_on="2026-10-10")
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=8_000, occurred_on="2026-10-20")
    items = upcoming(date(2026, 11, 3), 45)
    assert [(str(i["due_date"]), i["amount_cents"]) for i in items] == [("2026-11-05", 4_000), ("2026-12-05", 8_000)]


def test_r2_4_future_msi_capped_by_what_is_owed(api, b):
    """P3/P8: no se proyectan mensualidades MSI si la deuda ya se pagó."""
    card, food, debit = b["card"]["id"], b["food"]["id"], b["debit"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=12_000, installments=12,
           occurred_on="2026-09-01")
    api.tx(kind="card_payment", from_account_id=debit, card_account_id=card, amount_cents=12_000,
           occurred_on="2026-09-10")
    assert upcoming(date(2026, 11, 3), 120) == []
    st = status(card, date(2026, 11, 3))
    assert sum(c["amount_cents"] for c in st["cycles"]) == 0


def test_r2_4b_partial_refund_caps_msi_projection(api, b):
    card, food = b["card"]["id"], b["food"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=12_000, installments=12,
           occurred_on="2026-09-01")
    api.tx(kind="refund", account_id=card, category_id=food, amount_cents=6_000, occurred_on="2026-09-20")
    st = status(card, date(2026, 11, 3))
    assert sum(c["amount_cents"] for c in st["cycles"]) <= st["owed_cents"] == 6_000


def test_r2_5_minimum_reduced_by_payments_since_cut(api, b):
    """P4: tras pagar el mínimo, el mínimo pendiente es 0."""
    card, food, debit = b["card"]["id"], b["food"]["id"], b["debit"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=10_000, occurred_on="2026-10-10")
    st = status(card, date(2026, 10, 16))
    assert (st["statement_due_cents"], st["minimum_due_cents"]) == (10_000, 625)  # 1.25 % de 50 000
    api.tx(kind="card_payment", from_account_id=debit, card_account_id=card, amount_cents=625,
           occurred_on="2026-10-20")
    st = status(card, date(2026, 10, 21))
    assert (st["statement_due_cents"], st["minimum_due_cents"]) == (9_375, 0)


def test_r2_6_statement_day_locked_while_msi_open(api, b):
    """P6: cambiar el día de corte con MSI vigentes facturaría dos mensualidades."""
    api.tx(kind="card_purchase", card_account_id=b["card"]["id"], category_id=b["food"]["id"], amount_cents=12_000,
           installments=12)
    r_ = api.c.patch(f"/api/v1/accounts/{b['card']['id']}", json={"statement_day": 10})
    assert r_.status_code == 422 and "meses sin intereses" in r_.json()["detail"]
    assert api.c.patch(f"/api/v1/accounts/{b['card']['id']}", json={"due_day": 6}).status_code == 200


def test_r2_7_msi_installment_line_not_preselected(api, b):
    card, food = b["card"]["id"], b["food"]["id"]
    api.tx(kind="card_purchase", card_account_id=card, category_id=food, amount_cents=12_000, installments=12,
           occurred_on=(date.today() - timedelta(days=20)).isoformat())
    text = (f"Fecha,Concepto,Monto\n{date.today().isoformat()},LIVERPOOL 03/12,1000.00\n"
            f"{date.today().isoformat()},GASOLINA,750.00\n")
    rows = api.c.post("/api/v1/imports/preview", json={"account_id": card, "csv_text": text}).json()["rows"]
    assert [x["status"] for x in rows] == ["installment", "new"]


def test_r2_8_voided_import_can_be_reimported(api, b):
    text = "Fecha,Concepto,Monto\n2026-10-30,CAFE,-50.00\n"
    rows = api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"], "csv_text": text}).json()["rows"]
    body = {"account_id": b["debit"]["id"], "rows": [cols(rows[0]) | {"category_id": b["food"]["id"]}]}
    tid = api.c.post("/api/v1/imports/commit", json=body).json()["transaction_ids"][0]
    api.c.post(f"/api/v1/transactions/{tid}/void", json={"reason": "categoría equivocada"})
    again = api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"], "csv_text": text}).json()
    assert again["rows"][0]["status"] == "new"
    out = api.c.post("/api/v1/imports/commit", json=body).json()
    assert out["created"] == 1
    assert api.balance(b["debit"]) == 100_000 - 5_000


def test_r2_9_date_order_inferred_per_file(api, b):
    us = "Fecha,Concepto,Monto\n11/05/2026,A,-1.00\n11/25/2026,B,-1.00\n"
    p = api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"], "csv_text": us}).json()
    assert p["date_order"] == "mdy" and p["rows"][0]["occurred_on"] == "2026-11-05"
    mx = "Fecha,Concepto,Monto\n05/11/2026,A,-1.00\n25/11/2026,B,-1.00\n"
    p = api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"], "csv_text": mx}).json()
    assert p["date_order"] == "dmy" and p["rows"][0]["occurred_on"] == "2026-11-05"
    mixed = "Fecha,Concepto,Monto\n25/11/2026,A,-1.00\n11/25/2026,B,-1.00\n"
    assert api.c.post("/api/v1/imports/preview", json={"account_id": b["debit"]["id"],
                                                       "csv_text": mixed}).status_code == 422


def test_r2_11_overdue_is_required_in_full_in_minimum():
    assert r.minimum_due(110_000, 0, None, overdue=100_000) == 100_000 + 150  # 1.5 % de 10 000 + vencido
