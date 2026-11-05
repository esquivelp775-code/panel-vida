"""Pruebas contra PostgreSQL real (los triggers son parte de las garantías)."""
import os

os.environ.setdefault(
    "PANEL_DATABASE_URL",
    os.environ.get("PANEL_TEST_DATABASE_URL", "postgresql+psycopg://panel:panel_dev_only@localhost:5432/panel_vida_test"),
)
os.environ["PANEL_ENV"] = "test"
os.environ.setdefault("PANEL_SECRET_KEY", "test-secret-key-not-for-production-0123456789")

from datetime import date  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password, login_limiter  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = "contraseña-ficticia-123"


@pytest.fixture(scope="session", autouse=True)
def migrated():
    cfg = Config(os.path.join(HERE, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(HERE, "migrations"))
    cfg.attributes["database_url"] = os.environ["PANEL_DATABASE_URL"]
    # Datos de una ejecución anterior (p. ej. tipos añadidos por migraciones nuevas) impedirían el downgrade.
    with engine.begin() as c:
        tables = c.execute(text("SELECT string_agg(quote_ident(tablename), ', ') FROM pg_tables "
                                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'")).scalar()
        if tables:
            c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_db(migrated):
    with engine.begin() as c:
        c.execute(text("TRUNCATE rv_receivables, rv_interactions, habit_logs, habits, tasks, rv_projects, rv_clients, installment_plans, audit_log, budgets, obligations, entries, transactions, accounts, users "
                       "RESTART IDENTITY CASCADE"))
    login_limiter.reset()
    yield


def make_user(email="ana@example.com"):
    with SessionLocal() as db:
        u = User(email=email, password_hash=hash_password(PASSWORD), display_name="Ana Ficticia", currency="MXN")
        db.add(u)
        db.commit()
        return u.id


@pytest.fixture
def client():
    make_user()
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c


class Api:
    """Atajos para escribir pruebas legibles."""

    def __init__(self, c: TestClient):
        self.c = c

    def account(self, name, subtype, **kw):
        r = self.c.post("/api/v1/accounts", json={"name": name, "subtype": subtype, **kw})
        assert r.status_code == 201, r.text
        return r.json()

    def balance(self, acc):
        return self.c.get(f"/api/v1/accounts/{acc['id']}").json()["balance_cents"]

    def tx(self, expect=201, headers=None, **body):
        body.setdefault("occurred_on", date.today().isoformat())
        body.setdefault("description", "prueba")
        r = self.c.post("/api/v1/transactions", json=body, headers=headers or {})
        assert r.status_code == expect, r.text
        return r.json()


@pytest.fixture
def api(client):
    return Api(client)
