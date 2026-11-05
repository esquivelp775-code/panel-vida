from fastapi.testclient import TestClient

from app.main import app

from .conftest import PASSWORD, make_user


def test_requires_token():
    c = TestClient(app)
    assert c.get("/api/v1/health").status_code == 200
    assert c.get("/api/v1/accounts").status_code == 401
    assert c.get("/api/v1/accounts", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_wrong_password_and_rate_limit():
    make_user("b@example.com")
    c = TestClient(app)
    for _ in range(5):
        assert c.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "mal"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"email": "b@example.com", "password": PASSWORD})
    assert r.status_code == 429


def test_user_isolation(api):
    mine = api.account("Débito", "checking", opening_balance_cents=500)
    food = api.account("Comida", "expense")
    make_user("intruso@example.com")
    other = TestClient(app)
    tok = other.post("/api/v1/auth/login", json={"email": "intruso@example.com", "password": PASSWORD}).json()
    other.headers["Authorization"] = f"Bearer {tok['access_token']}"
    assert other.get(f"/api/v1/accounts/{mine['id']}").status_code == 404
    assert other.get("/api/v1/accounts").json() == []
    assert other.get("/api/v1/transactions").json()["total"] == 0
    r = other.post("/api/v1/transactions", json={"kind": "expense", "account_id": mine["id"],
                                                 "category_id": food["id"], "amount_cents": 1,
                                                 "occurred_on": "2026-01-01"})
    assert r.status_code == 404
    tx = api.c.get("/api/v1/transactions").json()["items"][0]
    assert other.post(f"/api/v1/transactions/{tx['id']}/void", json={"reason": "x"}).status_code == 404


def test_unknown_fields_rejected(api):
    r = api.c.post("/api/v1/accounts", json={"name": "X", "subtype": "cash", "user_id": 99})
    assert r.status_code == 422


def test_csv_formula_injection_neutralized(api):
    a = api.account("Débito", "checking", opening_balance_cents=500)
    c = api.account("Comida", "expense")
    api.tx(kind="expense", account_id=a["id"], category_id=c["id"], amount_cents=1, description="=HYPERLINK(1)")
    body = api.c.get("/api/v1/export/transactions.csv").text
    assert "'=HYPERLINK(1)" in body


def test_database_url_accepts_neon_style():
    from app.config import Settings

    neon = "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require"
    assert Settings(database_url=neon).database_url == "postgresql+psycopg://u:p@ep-x.neon.tech/neondb?sslmode=require"
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    already = "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url=already).database_url == already


def test_bootstrap_creates_first_user_only(monkeypatch):
    from sqlalchemy import func, select

    from app import cli
    from app.config import get_settings
    from app.db import SessionLocal
    from app.models import User

    monkeypatch.setenv("PANEL_BOOTSTRAP_EMAIL", "Dueno@Example.com")
    monkeypatch.setenv("PANEL_BOOTSTRAP_PASSWORD", "contraseña-ficticia-xyz")
    get_settings.cache_clear()
    try:
        cli.bootstrap()
        cli.bootstrap()  # segunda vez: no duplica ni cambia nada
        with SessionLocal() as db:
            assert db.scalar(select(func.count(User.id))) == 1
        c = TestClient(app)
        r = c.post("/api/v1/auth/login", json={"email": "dueno@example.com", "password": "contraseña-ficticia-xyz"})
        assert r.status_code == 200
    finally:
        get_settings.cache_clear()
