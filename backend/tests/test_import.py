"""Importación CSV: parseo sin floats, duplicados, idempotencia y atomicidad."""
from datetime import date

import pytest

from app.importer import parse_amount, parse_date

BANK_CSV = """Fecha,Concepto,Cargo,Abono
01/03/2026,OXXO TIENDA (demo),"1,234.56",
02/03/2026,NOMINA (demo),,"15,000.00"
03/03/2026,OXXO TIENDA (demo),"1,234.56",
05/03/2026,PAGO TARJETA (demo),"2,000.00",
"""


def test_parse_amount_exact():
    assert parse_amount("$1,234.56") == 123_456
    assert parse_amount("-1234.5") == -123_450
    assert parse_amount("(1,234.56)") == -123_456
    assert parse_amount("1234") == 123_400
    assert parse_amount("") is None
    assert parse_amount("0.10") == 10
    with pytest.raises(ValueError):
        parse_amount("12.345")
    with pytest.raises(ValueError):
        parse_amount("12,34")


def test_parse_date_formats():
    assert parse_date("2026-03-01") == date(2026, 3, 1)
    assert parse_date("01/03/2026") == date(2026, 3, 1)  # día/mes/año
    assert parse_date("1-3-26") == date(2026, 3, 1)
    with pytest.raises(ValueError):
        parse_date("marzo 1")


@pytest.fixture
def book(api):
    return {"debit": api.account("Débito", "checking", opening_balance_cents=100_000),
            "card": api.account("Tarjeta", "credit_card", statement_day=5, due_day=25),
            "food": api.account("Comida", "expense"), "salary": api.account("Salario", "income")}


def preview(api, account, text, **kw):
    r = api.c.post("/api/v1/imports/preview", json={"account_id": account["id"], "csv_text": text, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_preview_cargo_abono_and_identical_rows(api, book):
    p = preview(api, book["debit"], BANK_CSV)
    rows = p["rows"]
    assert [(r["direction"], r["amount_cents"]) for r in rows] == [
        ("outflow", 123_456), ("inflow", 1_500_000), ("outflow", 123_456), ("outflow", 200_000)]
    assert len({r["fingerprint"] for r in rows}) == 4  # dos OXXO idénticos en fechas distintas → huellas distintas
    assert p["summary"] == {"total": 4, "new": 4, "imported": 0, "duplicates": 0}


def test_commit_creates_and_reimport_is_idempotent(api, book):
    rows = preview(api, book["debit"], BANK_CSV)["rows"]
    sel = []
    for r in rows:
        x = {k: r[k] for k in ("row", "fingerprint", "occurred_on", "description", "amount_cents", "direction")}
        if r["description"].startswith("PAGO TARJETA"):
            x["counter_account_id"] = book["card"]["id"]
        else:
            x["category_id"] = book["salary"]["id"] if r["direction"] == "inflow" else book["food"]["id"]
        sel.append(x)
    body = {"account_id": book["debit"]["id"], "rows": sel}
    out = api.c.post("/api/v1/imports/commit", json=body).json()
    assert out["created"] == 4 and out["skipped_existing"] == 0
    assert api.balance(book["debit"]) == 100_000 - 123_456 * 2 + 1_500_000 - 200_000
    assert api.balance(book["card"]) == -200_000  # pago a tarjeta (saldo a favor), no gasto
    kinds = {t["kind"] for t in api.c.get("/api/v1/transactions?limit=10").json()["items"]}
    assert {"expense", "income", "card_payment"} <= kinds
    # Reimportar el mismo archivo: todo marcado como ya importado y nada se duplica.
    p = preview(api, book["debit"], BANK_CSV)
    assert p["summary"]["imported"] == 4
    again = api.c.post("/api/v1/imports/commit", json=body).json()
    assert again == {"created": 0, "skipped_existing": 4, "transaction_ids": []}
    assert api.c.get("/api/v1/reports/integrity").json()["ok"] is True


def test_duplicate_detection_against_manual_entry(api, book):
    api.tx(kind="expense", account_id=book["debit"]["id"], category_id=book["food"]["id"], amount_cents=123_456,
           occurred_on="2026-03-02")
    rows = preview(api, book["debit"], BANK_CSV)["rows"]
    assert [r["status"] for r in rows] == ["duplicate", "new", "new", "new"]  # sólo un OXXO coincide (±3 días)
    assert rows[0]["duplicate_of"] is not None


def test_commit_is_all_or_nothing(api, book):
    rows = preview(api, book["debit"], BANK_CSV)["rows"]
    sel = [{k: r[k] for k in ("row", "fingerprint", "occurred_on", "description", "amount_cents", "direction")}
           | {"category_id": book["food"]["id"]} for r in rows]
    sel[1]["category_id"] = book["food"]["id"]  # ingreso con categoría de gasto → inválido
    before = api.c.get("/api/v1/transactions").json()["total"]
    r = api.c.post("/api/v1/imports/commit", json={"account_id": book["debit"]["id"], "rows": sel})
    assert r.status_code == 422 and "Fila 3" in r.json()["detail"]
    assert api.c.get("/api/v1/transactions").json()["total"] == before  # nada a medias


def test_card_statement_sign_and_refund(api, book):
    text = "fecha;descripcion;importe\n2026-03-01;AMAZON (demo);500.00\n2026-03-04;DEVOLUCION AMAZON (demo);-200.00\n"
    rows = preview(api, book["card"], text)["rows"]
    assert [(r["direction"], r["amount_cents"]) for r in rows] == [("outflow", 50_000), ("inflow", 20_000)]
    sel = [{k: r[k] for k in ("row", "fingerprint", "occurred_on", "description", "amount_cents", "direction")}
           | {"category_id": book["food"]["id"]} for r in rows]
    api.c.post("/api/v1/imports/commit", json={"account_id": book["card"]["id"], "rows": sel})
    assert api.balance(book["card"]) == 30_000 and api.balance(book["food"]) == 30_000


def test_bad_csv_messages(api, book):
    r = api.c.post("/api/v1/imports/preview", json={"account_id": book["debit"]["id"], "csv_text": "a,b\n1,2\n"})
    assert r.status_code == 422 and "columnas" in r.json()["detail"]
    r = api.c.post("/api/v1/imports/preview", json={"account_id": book["debit"]["id"],
                                                    "csv_text": "Fecha,Concepto,Monto\n2026-13-01,x,1\n"})
    assert r.status_code == 422 and "Fila 2" in r.json()["detail"]
    food = book["food"]
    r = api.c.post("/api/v1/imports/preview", json={"account_id": food["id"], "csv_text": BANK_CSV})
    assert r.status_code == 422
