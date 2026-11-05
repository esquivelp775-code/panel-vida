BODY = {
    "accounts": [
        {"name": "Débito (demo)", "subtype": "checking", "opening_balance_cents": 500_000, "opening_date": "2026-11-05"},
        {"name": "Tarjeta (demo)", "subtype": "credit_card", "opening_balance_cents": 100_000,
         "credit_limit_cents": 2_000_000, "statement_day": 5, "due_day": 25},
        {"name": "Tanda semanal (demo)", "subtype": "other_liability", "opening_balance_cents": 27_500_00},
        {"name": "Tanda mensual (demo)", "subtype": "investment"},
    ],
    "categories": [{"name": "Renta", "subtype": "expense"}],
    "obligations": [
        {"name": "Renta", "kind": "bill", "amount_cents": 300_000, "due_date": "2026-11-10", "recurrence": "monthly",
         "pay_from": "Débito (demo)", "category": "Renta"},
        {"name": "Tanda semanal 10-nov", "kind": "loan_installment", "amount_cents": 250_000,
         "due_date": "2026-11-10", "pay_from": "Débito (demo)", "target": "Tanda semanal (demo)"},
        {"name": "Tanda mensual dic", "kind": "savings", "amount_cents": 200_000, "due_date": "2026-12-05",
         "pay_from": "Débito (demo)", "target": "Tanda mensual (demo)"},
    ],
}


def test_bulk_dry_run_then_commit_and_idempotent(api):
    c = api.c
    r = c.post("/api/v1/setup/bulk", json={**BODY, "dry_run": True}).json()
    assert r["created"] == {"accounts": 4, "categories": 1, "obligations": 3}
    assert c.get("/api/v1/accounts").json() == []  # dry_run no guarda
    r = c.post("/api/v1/setup/bulk", json={**BODY, "dry_run": False}).json()
    assert r["created"]["obligations"] == 3
    again = c.post("/api/v1/setup/bulk", json={**BODY, "dry_run": False}).json()
    assert again["created"] == {"accounts": 0, "categories": 0, "obligations": 0} and len(again["skipped"]) == 8
    debts = {a["name"]: a["balance_cents"] for a in c.get("/api/v1/accounts?account_class=liability").json()}
    assert debts == {"Tarjeta (demo)": 100_000, "Tanda semanal (demo)": 2_750_000}
    # Aportación a tanda = transferencia (no gasto)
    ob = next(o for o in c.get("/api/v1/obligations").json() if o["kind"] == "savings")
    paid = c.post(f"/api/v1/obligations/{ob['id']}/settle", json={}).json()
    tx = c.get(f"/api/v1/transactions/{paid['settled_transaction_id']}").json()
    assert tx["kind"] == "transfer"
    assert c.get("/api/v1/dashboard").json()["month"]["expense_cents"] == 0


def test_bulk_unknown_reference_is_422_and_nothing_saved(api):
    bad = {"dry_run": False, "accounts": [{"name": "A", "subtype": "cash"}],
           "obligations": [{"name": "X", "kind": "bill", "amount_cents": 1, "due_date": "2026-12-01",
                            "pay_from": "No existe", "category": None}]}
    r = api.c.post("/api/v1/setup/bulk", json=bad)
    assert r.status_code == 422 and "No existe" in r.json()["detail"]
    assert api.c.get("/api/v1/accounts").json() == []
