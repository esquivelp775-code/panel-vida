"""R6/R8/R9 a nivel de base de datos: aunque el código tuviera un bug, PostgreSQL lo impide."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db import engine


@pytest.fixture
def ids(api):
    a = api.account("Débito", "checking", opening_balance_cents=10_000)
    c = api.account("Comida", "expense")
    t = api.tx(kind="expense", account_id=a["id"], category_id=c["id"], amount_cents=100)
    return a["id"], c["id"], t["id"]


def run(sql, **params):
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def test_entries_cannot_be_updated(ids):
    with pytest.raises(DBAPIError, match="immutable"):
        run("UPDATE entries SET amount_cents = amount_cents * 2")


def test_entries_cannot_be_deleted(ids):
    with pytest.raises(DBAPIError, match="immutable"):
        run("DELETE FROM entries")


def test_transactions_cannot_be_deleted(ids):
    with pytest.raises(DBAPIError, match="cannot be deleted"):
        run("DELETE FROM transactions WHERE id = :i", i=ids[2])


def test_transactions_only_void_fields_change(ids):
    with pytest.raises(DBAPIError, match="immutable except for voiding"):
        run("UPDATE transactions SET occurred_on = occurred_on - 1 WHERE id = :i", i=ids[2])


def test_accounts_cannot_be_deleted_or_change_class(ids):
    with pytest.raises(DBAPIError, match="cannot be deleted"):
        run("DELETE FROM accounts WHERE id = :i", i=ids[0])
    with pytest.raises(DBAPIError, match="immutable"):
        run("UPDATE accounts SET subtype = 'savings' WHERE id = :i", i=ids[0])


def test_unbalanced_transaction_rejected_at_commit(ids):
    a, c, _ = ids
    with pytest.raises(DBAPIError, match="unbalanced"):
        with engine.begin() as conn:
            tid = conn.execute(text("INSERT INTO transactions (user_id, kind, occurred_on, description) "
                                    "VALUES (1, 'expense', current_date, 'x') RETURNING id")).scalar()
            conn.execute(text("INSERT INTO entries (transaction_id, account_id, amount_cents) VALUES "
                              "(:t, :a, -100), (:t, :c, 99)"), {"t": tid, "a": a, "c": c})


def test_transaction_without_entries_rejected(ids):
    with pytest.raises(DBAPIError, match="at least 2 entries"):
        run("INSERT INTO transactions (user_id, kind, occurred_on, description) VALUES (1,'expense',current_date,'x')")


def test_zero_entry_rejected(ids):
    with pytest.raises(DBAPIError):
        run("INSERT INTO entries (transaction_id, account_id, amount_cents) VALUES (:t, :a, 0)", t=ids[2], a=ids[0])


def test_rejected_write_leaves_no_trace(api, ids):
    before = api.c.get("/api/v1/transactions").json()["total"]
    test_unbalanced_transaction_rejected_at_commit(ids)
    assert api.c.get("/api/v1/transactions").json()["total"] == before
    assert api.c.get("/api/v1/reports/integrity").json()["ok"] is True
