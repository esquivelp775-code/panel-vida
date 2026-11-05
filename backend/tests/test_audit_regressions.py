"""Regresiones de la auditoría de noviembre de 2026. Datos ficticios."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app import dates
from app.config import get_settings
from app.main import app

from .conftest import PASSWORD

TODAY = date.today()
OVERDUE = (TODAY - timedelta(days=6)).isoformat()


def card_with_late_opening(api, name="Tarjeta (demo)", owed=80_000):
    """Tarjeta cuyo saldo se cargó hoy: ningún corte anterior la conoce. El vencimiento cae en el ciclo sin estado."""
    close = TODAY - timedelta(days=20)
    due = TODAY - timedelta(days=6)
    return api.account(name, "credit_card", opening_balance_cents=owed, opening_date=TODAY.isoformat(),
                       credit_limit_cents=500_000, statement_day=close.day, due_day=due.day)


def add_obligation(api, **body):
    r = api.c.post("/api/v1/obligations", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------------------------------------ vencimientos de tarjeta
def test_overdue_card_payment_is_shown_when_statement_predates_the_loaded_balance(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=1_000_00)
    card = card_with_late_opening(api)
    add_obligation(api, name="Pago vencido (demo)", kind="card_payment", amount_cents=80_000, due_date=OVERDUE,
                   pay_from_account_id=bank["id"], target_account_id=card["id"])

    items = api.c.get("/api/v1/upcoming?days=45").json()
    mine = [i for i in items if i["name"] == "Pago vencido (demo)"]
    assert mine and mine[0]["overdue"] is True and mine[0]["amount_cents"] == 80_000
    # No se cuenta dos veces: el ciclo que lo cubre no aparece además como pago de tarjeta.
    assert sum(i["amount_cents"] for i in items if i["ref_id"] == card["id"] or i in mine) == 80_000


def test_projection_subtracts_overdue_card_payment_once(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=1_000_00)
    card = card_with_late_opening(api)
    add_obligation(api, name="Pago vencido (demo)", kind="card_payment", amount_cents=80_000, due_date=OVERDUE,
                   pay_from_account_id=bank["id"], target_account_id=card["id"])
    p = api.c.get("/api/v1/reports/projection?days=60").json()
    assert p["starting_available_cents"] == 100_000
    assert p["min_balance_cents"] == 20_000


def test_card_is_flagged_overdue_by_a_past_due_obligation(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=1_000_00)
    card = card_with_late_opening(api)
    add_obligation(api, name="Pago vencido (demo)", kind="card_payment", amount_cents=80_000, due_date=OVERDUE,
                   pay_from_account_id=bank["id"], target_account_id=card["id"])
    cards = api.c.get("/api/v1/dashboard").json()["cards"]
    assert next(c for c in cards if c["id"] == card["id"])["overdue"] is True


def test_card_without_obligation_and_loaded_balance_is_not_overdue(api):
    card = card_with_late_opening(api)
    cards = api.c.get("/api/v1/dashboard").json()["cards"]
    assert next(c for c in cards if c["id"] == card["id"])["overdue"] is False


# ------------------------------------------------------------------ plan de deudas
def test_debt_plan_counts_one_off_installments_toward_payoff(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=500_000)
    tanda = api.account("Tanda (demo)", "other_liability", opening_balance_cents=500_000)
    for i in range(1, 6):
        add_obligation(api, name=f"Tanda {i} (demo)", kind="loan_installment", amount_cents=100_000,
                       due_date=(TODAY + timedelta(days=7 * i)).isoformat(), pay_from_account_id=bank["id"],
                       target_account_id=tanda["id"])
    target = dates.add_months(TODAY, 3, 1).strftime("%Y-%m")
    debt = api.c.get(f"/api/v1/reports/debt-plan?target={target}").json()["debts"][0]
    last = (TODAY + timedelta(days=35)).strftime("%Y-%m")
    assert debt["projected_payoff_month"] == last
    assert debt["on_track"] is True


def test_debt_plan_past_due_one_off_payoff_is_not_before_this_month(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=500_000)
    loan = api.account("Préstamo (demo)", "loan", opening_balance_cents=100_000)
    add_obligation(api, name="Atrasado (demo)", kind="loan_installment", amount_cents=100_000, due_date=OVERDUE,
                   pay_from_account_id=bank["id"], target_account_id=loan["id"])
    debt = api.c.get("/api/v1/reports/debt-plan").json()["debts"][0]
    assert debt["projected_payoff_month"] == TODAY.strftime("%Y-%m")


def test_debt_plan_partial_one_offs_alone_do_not_project_payoff(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=500_000)
    loan = api.account("Préstamo (demo)", "loan", opening_balance_cents=300_000)
    add_obligation(api, name="Abono (demo)", kind="loan_installment", amount_cents=100_000,
                   due_date=(TODAY + timedelta(days=5)).isoformat(), pay_from_account_id=bank["id"],
                   target_account_id=loan["id"])
    debt = api.c.get("/api/v1/reports/debt-plan").json()["debts"][0]
    assert debt["projected_payoff_month"] is None and debt["on_track"] is False


def test_debt_plan_monthly_payments_finish_what_one_offs_leave(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=500_000)
    loan = api.account("Préstamo (demo)", "loan", opening_balance_cents=300_000)
    add_obligation(api, name="Abono (demo)", kind="loan_installment", amount_cents=100_000,
                   due_date=(TODAY + timedelta(days=5)).isoformat(), pay_from_account_id=bank["id"],
                   target_account_id=loan["id"])
    add_obligation(api, name="Mensual (demo)", kind="loan_installment", amount_cents=100_000, recurrence="monthly",
                   due_date=(TODAY + timedelta(days=5)).isoformat(), pay_from_account_id=bank["id"],
                   target_account_id=loan["id"])
    debt = api.c.get("/api/v1/reports/debt-plan").json()["debts"][0]
    # Quedan $2,000 tras el abono: dos mensualidades de $1,000 desde este mes.
    assert debt["scheduled_monthly_cents"] == 100_000
    assert debt["projected_payoff_month"] == dates.add_months(TODAY, 1, 1).strftime("%Y-%m")


# ------------------------------------------------------------------ calendario
def test_calendar_shows_pending_obligation_overdue_in_a_past_month(api):
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=100_000)
    cat = api.account("Servicio (demo)", "expense")
    past = dates.add_months(TODAY.replace(day=1), -2, 15)
    add_obligation(api, name="Recibo viejo (demo)", kind="bill", amount_cents=10_000, due_date=past.isoformat(),
                   pay_from_account_id=bank["id"], category_id=cat["id"])
    cal = api.c.get(f"/api/v1/calendar?month={past.strftime('%Y-%m')}").json()
    day = next(d for d in cal["days"] if d["date"] == past.isoformat())
    assert [(e["title"], e["status"]) for e in day["events"]] == [("Recibo viejo (demo)", "overdue")]


# ------------------------------------------------------------------ respaldo
def test_full_backup_includes_every_user_table(api):
    c = api.c
    card = api.account("Tarjeta (demo)", "credit_card", statement_day=5, due_day=25, credit_limit_cents=500_000)
    cat = api.account("Compras (demo)", "expense")
    api.tx(kind="expense", account_id=card["id"], category_id=cat["id"], amount_cents=120_000, installments=3)
    c.post("/api/v1/tasks", json={"title": "Pendiente (demo)"})
    habit = c.post("/api/v1/habits", json={"name": "Hábito (demo)"}).json()
    c.post(f"/api/v1/habits/{habit['id']}/toggle", json={})
    client = c.post("/api/v1/ryventis/clients", json={"name": "Cliente (demo)"}).json()
    c.post(f"/api/v1/ryventis/clients/{client['id']}/interactions", json={"kind": "llamada", "summary": "Hola"})
    project = c.post("/api/v1/ryventis/projects", json={"name": "Proyecto (demo)", "client_id": client["id"]}).json()
    c.post("/api/v1/ryventis/receivables", json={"description": "Anticipo", "amount_cents": 5_000,
                                                 "project_id": project["id"]})

    b = c.get("/api/v1/export/full.json").json()
    for key in ("installment_plans", "tasks", "habits", "habit_logs", "rv_clients", "rv_interactions", "rv_projects",
                "rv_receivables"):
        assert len(b[key]) == 1, key
    assert "password_hash" not in str(b)


def test_full_backup_does_not_leak_other_users_rows(api):
    c = api.c
    c.post("/api/v1/tasks", json={"title": "Mío (demo)"})
    from app.db import SessionLocal
    from app.models import Habit, HabitLog, RvClient, RvInteraction, User
    from app.security import hash_password

    with SessionLocal() as db:
        other = User(email="otro@example.com", password_hash=hash_password(PASSWORD), currency="MXN")
        db.add(other)
        db.flush()
        h = Habit(user_id=other.id, name="Ajeno (demo)")
        cl = RvClient(user_id=other.id, name="Ajeno (demo)")
        db.add_all([h, cl])
        db.flush()
        db.add_all([HabitLog(habit_id=h.id, day=TODAY),
                    RvInteraction(client_id=cl.id, kind="otro", summary="Ajeno", happened_on=TODAY)])
        db.commit()
    b = c.get("/api/v1/export/full.json").json()
    assert b["habit_logs"] == [] and b["rv_interactions"] == [] and b["habits"] == [] and b["rv_clients"] == []


# ------------------------------------------------------------------ inicio de sesión
def test_login_is_limited_per_email_even_when_the_ip_changes(client):
    limit = get_settings().login_max_attempts * 4
    for i in range(limit):
        c = TestClient(app, client=(f"10.0.0.{i + 1}", 50000))
        assert c.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": "mala"}).status_code == 401
    # Ni la contraseña correcta entra desde otra IP mientras dure el bloqueo.
    c = TestClient(app, client=("10.0.1.1", 50000))
    assert c.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD}).status_code == 429


# ------------------------------------------------------------------ carga inicial
def test_bulk_does_not_recreate_a_completed_task(api):
    body = {"dry_run": False, "tasks": [{"title": "Confirmar monto (demo)"}]}
    assert api.c.post("/api/v1/setup/bulk", json=body).json()["created"]["tasks"] == 1
    tid = api.c.get("/api/v1/tasks").json()[0]["id"]
    api.c.post(f"/api/v1/tasks/{tid}/complete")
    again = api.c.post("/api/v1/setup/bulk", json=body).json()
    assert again["created"]["tasks"] == 0 and len(again["skipped"]) == 1


def test_bulk_missing_reference_in_expense_says_expense(api):
    body = {"dry_run": True, "transactions": [{"occurred_on": "2026-10-01", "description": "X", "amount_cents": 100,
                                               "account": "No existe", "category": "Tampoco"}]}
    r = api.c.post("/api/v1/setup/bulk", json=body)
    assert r.status_code == 422 and r.json()["detail"].startswith("Gasto #1")


# ------------------------------------------------------------------ zona horaria
def test_today_uses_the_configured_timezone(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "timezone", "Pacific/Kiritimati")
    assert dates.today() == datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    monkeypatch.setattr(settings, "timezone", "America/Mexico_City")
    assert dates.today() == datetime.now(ZoneInfo("America/Mexico_City")).date()


def test_today_without_timezone_uses_the_system_date(monkeypatch):
    monkeypatch.setattr(get_settings(), "timezone", "")
    assert dates.today() == date.today()


def test_dashboard_month_follows_the_configured_timezone(api, monkeypatch):
    # En Kiritimati (UTC+14) y en Pago Pago (UTC−11) nunca es el mismo día: el reporte debe usar la zona configurada.
    bank = api.account("Banco (demo)", "checking", opening_balance_cents=100_000)
    cat = api.account("Comida (demo)", "expense")
    settings = get_settings()
    ahead = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    behind = datetime.now(ZoneInfo("Pacific/Pago_Pago")).date()
    assert ahead > behind
    api.tx(kind="expense", account_id=bank["id"], category_id=cat["id"], amount_cents=1_000,
           occurred_on=ahead.isoformat())
    monkeypatch.setattr(settings, "timezone", "Pacific/Pago_Pago")
    assert api.c.get("/api/v1/dashboard").json()["available_cents"] == 100_000
    monkeypatch.setattr(settings, "timezone", "Pacific/Kiritimati")
    assert api.c.get("/api/v1/dashboard").json()["available_cents"] == 99_000


# ------------------------------------------------------------------ configuración
def login(email="ana@example.com", password=PASSWORD):
    return TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": password})


def test_update_profile_name(client):
    r = client.patch("/api/v1/auth/me", json={"display_name": "  Ana María  "})
    assert r.status_code == 200 and r.json()["display_name"] == "Ana María"
    assert client.get("/api/v1/auth/me").json()["display_name"] == "Ana María"
    r = client.patch("/api/v1/auth/me", json={"display_name": None})
    assert r.status_code == 200 and r.json()["display_name"] is None


def test_profile_rejects_email_or_currency_changes(client):
    assert client.patch("/api/v1/auth/me", json={"email": "x@example.com"}).status_code == 422
    assert client.patch("/api/v1/auth/me", json={"currency": "USD"}).status_code == 422


def test_change_password_requires_the_current_one(client):
    r = client.post("/api/v1/auth/change-password", json={"current_password": "mala", "new_password": "nueva-clave-segura"})
    assert r.status_code == 422 and "actual" in r.json()["detail"]
    assert login().status_code == 200


def test_change_password_rejects_short_or_unchanged(client):
    short = {"current_password": PASSWORD, "new_password": "corta"}
    assert client.post("/api/v1/auth/change-password", json=short).status_code == 422
    same = {"current_password": PASSWORD, "new_password": PASSWORD}
    r = client.post("/api/v1/auth/change-password", json=same)
    assert r.status_code == 422 and "distinta" in r.json()["detail"]


def test_change_password_rotates_sessions(client):
    other_device = TestClient(app)
    other_device.headers["Authorization"] = f"Bearer {login().json()['access_token']}"
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": PASSWORD, "new_password": "nueva-clave-segura"})
    assert r.status_code == 200
    # El dispositivo que la cambió sigue dentro con el token nuevo; los demás quedan fuera.
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    assert client.get("/api/v1/auth/me").status_code == 200
    assert other_device.get("/api/v1/auth/me").status_code == 401
    assert login().status_code == 401
    assert login(password="nueva-clave-segura").status_code == 200


def test_change_password_is_rate_limited(client):
    for _ in range(get_settings().login_max_attempts):
        r = client.post("/api/v1/auth/change-password", json={"current_password": "mala", "new_password": "nueva-clave-segura"})
        assert r.status_code == 422
    r = client.post("/api/v1/auth/change-password", json={"current_password": PASSWORD, "new_password": "nueva-clave-segura"})
    assert r.status_code == 429


def test_logout_everywhere_invalidates_every_token(client):
    other_device = TestClient(app)
    other_device.headers["Authorization"] = f"Bearer {login().json()['access_token']}"
    r = client.post("/api/v1/auth/logout-all")
    assert r.status_code == 200
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    assert client.get("/api/v1/auth/me").status_code == 200
    assert other_device.get("/api/v1/auth/me").status_code == 401


def test_token_issued_before_this_feature_stays_valid(client):
    # Sesiones abiertas antes de la migración no llevan versión: equivalen a la versión 0.
    import jwt

    from app.security import create_token

    token, _ = create_token(1)
    payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    payload.pop("tv", None)
    old = jwt.encode(payload, get_settings().secret_key, "HS256")
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {old}"
    assert c.get("/api/v1/auth/me").status_code == 200
