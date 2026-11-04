from datetime import date, timedelta

from app import reports as r
from app.db import SessionLocal
from app.models import Account


def test_card_cycle_statement_due(api):
    card = api.account("Tarjeta", "credit_card", credit_limit_cents=100_000, statement_day=5, due_day=25)
    food = api.account("Comida", "expense")
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    # Compras: 3 de marzo (entra al corte del 5 de marzo) y 10 de marzo (siguiente corte).
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=10_000,
           occurred_on="2026-03-03")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=7_000,
           occurred_on="2026-03-10")
    api.tx(kind="card_payment", from_account_id=debit["id"], card_account_id=card["id"], amount_cents=4_000,
           occurred_on="2026-03-12")
    with SessionLocal() as db:
        acc = db.get(Account, card["id"])
        st = r.card_status(db, acc, date(2026, 3, 15))
        assert st["owed_cents"] == 13_000
        assert st["next_due_date"] == date(2026, 3, 25)
        assert st["statement_due_cents"] == 6_000  # 10 000 al corte − 4 000 pagados después
        # Tras la fecha límite con el estado ya pagado → siguiente ciclo, estimado con el saldo actual.
        api.tx(kind="card_payment", from_account_id=debit["id"], card_account_id=card["id"], amount_cents=6_000,
               occurred_on="2026-03-20")
        st = r.card_status(db, acc, date(2026, 3, 30))
        assert st["next_due_date"] == date(2026, 4, 25) and st["statement_due_cents"] == 7_000
        assert st["overdue"] is False


def test_card_overdue_flag(api):
    card = api.account("Tarjeta", "credit_card", statement_day=5, due_day=25)
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=10_000,
           occurred_on="2026-03-01")
    with SessionLocal() as db:
        st = r.card_status(db, db.get(Account, card["id"]), date(2026, 3, 28))
        assert st["overdue"] is True and st["statement_due_cents"] == 10_000


def test_month_end_clamping():
    assert r.clamp(2026, 2, 31) == date(2026, 2, 28)
    assert r.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert r.add_months(date(2026, 12, 15), 1) == date(2027, 1, 15)


def test_obligation_settle_recur_and_void_reopens(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    services = api.account("Servicios", "expense")
    due = (date.today() + timedelta(days=5)).isoformat()
    ob = api.c.post("/api/v1/obligations", json={
        "name": "Luz", "kind": "bill", "amount_cents": 45_000, "due_date": due, "recurrence": "monthly",
        "pay_from_account_id": debit["id"], "category_id": services["id"]}).json()
    up = api.c.get("/api/v1/upcoming").json()
    assert [(i["source"], i["amount_cents"]) for i in up] == [("obligation", 45_000)]
    proj = api.c.get("/api/v1/reports/projection").json()
    assert proj["starting_available_cents"] == 100_000 and proj["min_balance_cents"] == 55_000
    paid = api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={}).json()
    assert paid["status"] == "paid"
    assert api.balance(debit) == 55_000 and api.balance(services) == 45_000
    pending = api.c.get("/api/v1/obligations").json()
    assert len(pending) == 1 and pending[0]["due_date"] > due  # se generó el siguiente mes
    assert api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={}).status_code == 409
    api.c.post(f"/api/v1/transactions/{paid['settled_transaction_id']}/void", json={"reason": "error"})
    assert api.c.get("/api/v1/obligations?status=pending").json()[0]["id"] == ob["id"]
    assert api.balance(debit) == 100_000


def test_card_payment_obligation_hides_computed_card_item(api):
    card = api.account("Tarjeta", "credit_card", statement_day=1, due_day=28)
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    food = api.account("Comida", "expense")
    api.tx(kind="card_purchase", card_account_id=card["id"], category_id=food["id"], amount_cents=5_000,
           occurred_on=(date.today() - timedelta(days=40)).isoformat())
    assert any(i["source"] == "card" for i in api.c.get("/api/v1/upcoming?days=60").json())
    api.c.post("/api/v1/obligations", json={"name": "Pago tarjeta", "kind": "card_payment", "amount_cents": 5_000,
                                            "due_date": date.today().isoformat(), "pay_from_account_id": debit["id"],
                                            "target_account_id": card["id"]})
    up = api.c.get("/api/v1/upcoming?days=60").json()
    assert [i["source"] for i in up] == ["obligation"]  # sin doble conteo


def test_loan_installment_settle_with_interest(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    loan = api.account("Préstamo", "loan", opening_balance_cents=50_000)
    interest = api.account("Intereses", "expense")
    ob = api.c.post("/api/v1/obligations", json={"name": "Mensualidad", "kind": "loan_installment",
                                                 "amount_cents": 10_000, "due_date": date.today().isoformat(),
                                                 "pay_from_account_id": debit["id"], "target_account_id": loan["id"],
                                                 "category_id": interest["id"]}).json()
    r_ = api.c.post(f"/api/v1/obligations/{ob['id']}/settle", json={"interest_cents": 1_500})
    assert r_.status_code == 200, r_.text
    assert api.balance(loan) == 41_500 and api.balance(interest) == 1_500 and api.balance(debit) == 90_000


def test_budgets(api):
    debit = api.account("Débito", "checking", opening_balance_cents=100_000)
    food = api.account("Comida", "expense")
    month = date.today().strftime("%Y-%m")
    assert api.c.put("/api/v1/budgets", json={"category_id": food["id"], "month": month,
                                              "amount_cents": 20_000}).status_code == 200
    api.tx(kind="expense", account_id=debit["id"], category_id=food["id"], amount_cents=5_000)
    b = api.c.put("/api/v1/budgets", json={"category_id": food["id"], "month": month, "amount_cents": 30_000}).json()
    assert b["spent_cents"] == 5_000 and b["remaining_cents"] == 25_000
    assert len(api.c.get(f"/api/v1/budgets?month={month}").json()) == 1
    assert api.c.put("/api/v1/budgets", json={"category_id": debit["id"], "month": month,
                                              "amount_cents": 1}).status_code == 422
    assert api.c.delete(f"/api/v1/budgets/{b['id']}").status_code == 204


def test_exports(api):
    debit = api.account("Débito", "checking", opening_balance_cents=12_345)
    csv_body = api.c.get("/api/v1/export/transactions.csv").text
    assert "opening_balance" in csv_body and "123.45" in csv_body
    full = api.c.get("/api/v1/export/full.json").json()
    assert full["format"] == "panel-vida-backup"
    assert sum(e["amount_cents"] for e in full["entries"]) == 0
    assert any(a["id"] == debit["id"] for a in full["accounts"])
    assert "password_hash" not in str(full)
