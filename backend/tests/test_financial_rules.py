"""Cada prueba referencia la regla de docs/FINANCIAL_RULES.md que verifica."""
from datetime import date, timedelta

import pytest


@pytest.fixture
def book(api):
    return {
        "debit": api.account("Débito", "checking", opening_balance_cents=100_000),
        "cash": api.account("Efectivo", "cash"),
        "savings": api.account("Ahorro", "savings"),
        "card": api.account("Tarjeta", "credit_card", credit_limit_cents=500_000, statement_day=5, due_day=25),
        "loan": api.account("Préstamo", "loan", opening_balance_cents=1_000_000),
        "salary": api.account("Salario", "income"),
        "food": api.account("Comida", "expense"),
        "interest": api.account("Intereses", "expense"),
    }


def month_totals(api):
    return api.c.get("/api/v1/dashboard").json()["month"]


def test_r1_amounts_must_be_positive_integers(api, book):
    for bad in (100.5, "100", 0, -5, 10**13):
        api.tx(expect=422, kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"],
               amount_cents=bad)


def test_opening_balances_natural_perspective(api, book):
    assert api.balance(book["debit"]) == 100_000
    assert api.balance(book["loan"]) == 1_000_000  # lo que debo, positivo
    dash = api.c.get("/api/v1/dashboard").json()
    assert dash["available_cents"] == 100_000
    assert dash["total_debt_cents"] == 1_000_000
    assert dash["net_worth_cents"] == -900_000
    assert dash["month"]["income_cents"] == 0  # el saldo inicial no es ingreso


def test_income_and_expense(api, book):
    api.tx(kind="income", account_id=book["debit"]["id"], category_id=book["salary"]["id"], amount_cents=50_000)
    api.tx(kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=12_345)
    assert api.balance(book["debit"]) == 100_000 + 50_000 - 12_345
    assert api.balance(book["salary"]) == 50_000
    assert api.balance(book["food"]) == 12_345
    assert month_totals(api) == {"income_cents": 50_000, "expense_cents": 12_345, "net_cents": 37_655}


def test_r2_card_purchase_is_expense_and_obligation(api, book):
    t = api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
               amount_cents=30_000)
    assert t["kind"] == "card_purchase"
    assert api.balance(book["card"]) == 30_000  # adeudado
    assert api.balance(book["food"]) == 30_000  # gasto
    assert api.balance(book["debit"]) == 100_000  # el efectivo no se mueve aún
    card = api.c.get("/api/v1/dashboard").json()["cards"][0]
    assert card["owed_cents"] == 30_000 and card["available_credit_cents"] == 470_000


def test_r2_expense_paid_with_card_is_classified_as_card_purchase(api, book):
    t = api.tx(kind="expense", account_id=book["card"]["id"], category_id=book["food"]["id"], amount_cents=1_000)
    assert t["kind"] == "card_purchase"
    assert api.balance(book["card"]) == 1_000


def test_r3_card_payment_reduces_debt_without_new_expense(api, book):
    api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
           amount_cents=30_000)
    t = api.tx(kind="card_payment", from_account_id=book["debit"]["id"], card_account_id=book["card"]["id"],
               amount_cents=30_000)
    assert t["kind"] == "card_payment"
    assert api.balance(book["card"]) == 0
    assert api.balance(book["debit"]) == 70_000
    assert month_totals(api)["expense_cents"] == 30_000  # sólo la compra, no el pago


def test_r3_transfer_to_card_is_card_payment(api, book):
    t = api.tx(kind="transfer", from_account_id=book["debit"]["id"], to_account_id=book["card"]["id"],
               amount_cents=5_000)
    assert t["kind"] == "card_payment"
    assert month_totals(api)["expense_cents"] == 0


def test_r4_transfer_is_neither_income_nor_expense(api, book):
    t = api.tx(kind="transfer", from_account_id=book["debit"]["id"], to_account_id=book["savings"]["id"],
               amount_cents=40_000)
    assert t["kind"] == "transfer"
    assert api.balance(book["debit"]) == 60_000 and api.balance(book["savings"]) == 40_000
    assert month_totals(api) == {"income_cents": 0, "expense_cents": 0, "net_cents": 0}
    assert api.c.get("/api/v1/dashboard").json()["available_cents"] == 100_000


def test_transfer_same_account_rejected(api, book):
    api.tx(expect=422, kind="transfer", from_account_id=book["debit"]["id"], to_account_id=book["debit"]["id"],
           amount_cents=1)


def test_loan_payment_splits_principal_and_interest(api, book):
    t = api.tx(kind="loan_payment", from_account_id=book["debit"]["id"], loan_account_id=book["loan"]["id"],
               principal_cents=40_000, interest_cents=10_000, interest_category_id=book["interest"]["id"])
    assert t["amount_cents"] == 50_000
    assert api.balance(book["debit"]) == 50_000
    assert api.balance(book["loan"]) == 960_000
    assert api.balance(book["interest"]) == 10_000
    assert month_totals(api)["expense_cents"] == 10_000  # sólo el interés es gasto


def test_loan_payment_interest_requires_category(api, book):
    api.tx(expect=422, kind="loan_payment", from_account_id=book["debit"]["id"], loan_account_id=book["loan"]["id"],
           principal_cents=1, interest_cents=1)


def test_loan_disbursement(api, book):
    api.tx(kind="loan_disbursement", loan_account_id=book["loan"]["id"], to_account_id=book["debit"]["id"],
           amount_cents=200_000)
    assert api.balance(book["loan"]) == 1_200_000 and api.balance(book["debit"]) == 300_000
    assert month_totals(api)["income_cents"] == 0  # un préstamo no es ingreso


def test_adjustment_natural_sign(api, book):
    api.tx(kind="adjustment", account_id=book["debit"]["id"], delta_cents=-1_000)
    api.tx(kind="adjustment", account_id=book["loan"]["id"], delta_cents=500)
    assert api.balance(book["debit"]) == 99_000
    assert api.balance(book["loan"]) == 1_000_500
    assert month_totals(api)["expense_cents"] == 0


def test_category_class_is_enforced(api, book):
    api.tx(expect=422, kind="expense", account_id=book["debit"]["id"], category_id=book["salary"]["id"],
           amount_cents=1)
    api.tx(expect=422, kind="income", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=1)
    api.tx(expect=422, kind="expense", account_id=book["loan"]["id"], category_id=book["food"]["id"], amount_cents=1)
    api.tx(expect=422, kind="card_purchase", card_account_id=book["debit"]["id"], category_id=book["food"]["id"],
           amount_cents=1)


def test_system_equity_accounts_cannot_be_used(api, book):
    eq = [a for a in api.c.get("/api/v1/accounts?account_class=equity").json() if a["is_system"]][0]
    api.tx(expect=422, kind="transfer", from_account_id=eq["id"], to_account_id=book["debit"]["id"], amount_cents=1)


def test_r5_r6_void_creates_reversal_and_restores_balances(api, book):
    t = api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
               amount_cents=30_000)
    r = api.c.post(f"/api/v1/transactions/{t['id']}/void", json={"reason": "Cargo duplicado"})
    assert r.status_code == 200, r.text
    rev = r.json()
    assert rev["kind"] == "reversal" and rev["reverses_id"] == t["id"]
    assert rev["occurred_on"] == t["occurred_on"]
    orig = api.c.get(f"/api/v1/transactions/{t['id']}").json()
    assert orig["voided_at"] and orig["reversed_by_id"] == rev["id"] and orig["void_reason"] == "Cargo duplicado"
    assert api.balance(book["card"]) == 0 and api.balance(book["food"]) == 0
    assert month_totals(api)["expense_cents"] == 0
    # Nada se borró: ambas siguen visibles.
    assert api.c.get("/api/v1/transactions").json()["total"] == 4  # 2 saldos iniciales + compra + reversión
    assert api.c.get("/api/v1/transactions?include_voided=false").json()["total"] == 2
    # No se puede anular dos veces ni anular una reversión.
    assert api.c.post(f"/api/v1/transactions/{t['id']}/void", json={"reason": "x"}).status_code == 409
    assert api.c.post(f"/api/v1/transactions/{rev['id']}/void", json={"reason": "x"}).status_code == 422


def test_r7_idempotency(api, book):
    body = dict(kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=777)
    h = {"Idempotency-Key": "pago-abc-1"}
    a = api.tx(headers=h, **body)
    r = api.c.post("/api/v1/transactions", json={**body, "occurred_on": a["occurred_on"], "description": "prueba"},
                   headers=h)
    assert r.status_code == 200 and r.json()["id"] == a["id"]
    assert api.balance(book["debit"]) == 100_000 - 777  # sólo se aplicó una vez
    api.tx(expect=409, headers=h, **{**body, "amount_cents": 778})


def test_r9_integrity_report(api, book):
    api.tx(kind="income", account_id=book["debit"]["id"], category_id=book["salary"]["id"], amount_cents=1)
    rep = api.c.get("/api/v1/reports/integrity").json()
    assert rep["ok"] is True and rep["ledger_sum_cents"] == 0 and rep["checked_transactions"] == 3


def test_r10_reconcile(api, book):
    r = api.c.post(f"/api/v1/accounts/{book['debit']['id']}/reconcile",
                   json={"statement_balance_cents": 98_500, "as_of": date.today().isoformat()})
    assert r.json()["difference_cents"] == -1_500 and r.json()["adjustment_transaction_id"] is None
    r = api.c.post(f"/api/v1/accounts/{book['debit']['id']}/reconcile",
                   json={"statement_balance_cents": 98_500, "as_of": date.today().isoformat(),
                         "create_adjustment": True})
    assert r.json()["adjustment_transaction_id"]
    assert api.balance(book["debit"]) == 98_500


def test_archive_requires_zero_balance(api, book):
    assert api.c.post(f"/api/v1/accounts/{book['debit']['id']}/archive").status_code == 422
    assert api.c.post(f"/api/v1/accounts/{book['cash']['id']}/archive").status_code == 200
    api.tx(expect=422, kind="expense", account_id=book["cash"]["id"], category_id=book["food"]["id"], amount_cents=1)


def test_cashflow_accrual_vs_liquid(api, book):
    api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"],
           amount_cents=30_000)
    api.tx(kind="card_payment", from_account_id=book["debit"]["id"], card_account_id=book["card"]["id"],
           amount_cents=10_000)
    totals = api.c.get("/api/v1/reports/cashflow").json()["totals"]
    assert totals["expense_cents"] == 30_000  # devengado: la compra
    assert totals["liquid_change_cents"] == -10_000  # caja real: el pago (sin contar saldo inicial)


def test_by_category(api, book):
    api.tx(kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=300)
    api.tx(kind="card_purchase", card_account_id=book["card"]["id"], category_id=book["food"]["id"], amount_cents=200)
    rows = api.c.get("/api/v1/reports/by-category").json()
    assert rows == [{"category_id": book["food"]["id"], "name": "Comida", "total_cents": 500}]


def test_duplicate_account_name_rejected(api, book):
    r = api.c.post("/api/v1/accounts", json={"name": " débito ", "subtype": "savings"})
    assert r.status_code == 409


def test_card_fields_only_for_cards(api):
    r = api.c.post("/api/v1/accounts", json={"name": "X", "subtype": "checking", "credit_limit_cents": 5})
    assert r.status_code == 422


def test_future_dated_transaction_allowed_and_listed(api, book):
    when = (date.today() + timedelta(days=3)).isoformat()
    api.tx(kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=1,
           occurred_on=when)
    assert api.c.get("/api/v1/transactions").json()["items"][0]["occurred_on"] == when
