"""Ryventis CRM + ERP: clientes, proyectos, cobros ligados al libro mayor (datos ficticios)."""
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app

from .conftest import PASSWORD, make_user

T = date.today()
RV = "/api/v1/ryventis"


def test_crm_pipeline_and_interactions(api):
    c = api.c
    cl = c.post(f"{RV}/clients", json={"name": "Laura (demo)", "company": "Estudio Demo", "stage": "propuesta",
                                       "next_step": "Enviar propuesta", "next_step_date": T.isoformat(),
                                       "source": "Instagram"}).json()
    assert cl["stage"] == "propuesta" and cl["interactions"] == []
    i = c.post(f"{RV}/clients/{cl['id']}/interactions", json={"kind": "llamada", "summary": "Briefing 30 min"}).json()
    assert i["happened_on"] == T.isoformat()
    assert c.patch(f"{RV}/clients/{cl['id']}", json={"stage": "cliente"}).json()["stage"] == "cliente"
    full = c.get(f"{RV}/clients/{cl['id']}").json()
    assert len(full["interactions"]) == 1
    summ = c.get(f"{RV}/summary").json()
    assert summ["pipeline"]["cliente"] == 1 and summ["followups"][0]["name"] == "Laura (demo)"
    assert c.post(f"{RV}/clients", json={"name": "x", "stage": "inventada"}).status_code == 422


def test_projects_receivables_and_collect_creates_income(api):
    c = api.c
    debit = api.account("Débito", "checking", opening_balance_cents=10_000)
    cl = c.post(f"{RV}/clients", json={"name": "Café (demo)"}).json()
    pr = c.post(f"{RV}/projects", json={"name": "Identidad visual", "client_id": cl["id"], "amount_cents": 180_000,
                                        "status": "en_marcha",
                                        "due_date": (T + timedelta(days=2)).isoformat()}).json()
    t = c.post("/api/v1/tasks", json={"title": "Logotipo", "area": "ryventis", "project_id": pr["id"]}).json()
    c.post(f"/api/v1/tasks/{t['id']}/complete")
    c.post("/api/v1/tasks", json={"title": "Manual", "area": "ryventis", "project_id": pr["id"]})
    pv = c.get(f"{RV}/projects").json()[0]
    assert (pv["tasks_total"], pv["tasks_done"], pv["client_name"]) == (2, 1, "Café (demo)")
    rc = c.post(f"{RV}/receivables", json={"description": "Anticipo 50%", "amount_cents": 90_000,
                                           "project_id": pr["id"],
                                           "due_date": (T - timedelta(days=1)).isoformat()}).json()
    assert rc["client_id"] == cl["id"] and rc["overdue"] is True  # hereda cliente del proyecto
    s = c.get(f"{RV}/summary").json()
    assert s["receivable_cents"] == 90_000 and s["overdue_receivable_cents"] == 90_000
    assert s["active_value_cents"] == 180_000 and s["tasks"] == {"pending": 1, "doing": 0, "done": 1}
    done = c.post(f"{RV}/receivables/{rc['id']}/collect", json={"account_id": debit["id"]}).json()
    assert done["status"] == "cobrado" and done["collected_on"] == T.isoformat()
    assert api.balance(debit) == 100_000
    assert c.get("/api/v1/dashboard").json()["month"]["income_cents"] == 90_000  # ingreso real en finanzas
    assert c.post(f"{RV}/receivables/{rc['id']}/collect", json={"account_id": debit["id"]}).status_code == 409
    assert c.delete(f"{RV}/receivables/{rc['id']}").status_code == 422  # cobrado: no se borra
    # Anular el ingreso devuelve el cobro a "por cobrar"
    c.post(f"/api/v1/transactions/{done['collected_transaction_id']}/void", json={"reason": "error"})
    assert c.get(f"{RV}/receivables").json()[0]["status"] == "por_cobrar"
    assert api.balance(debit) == 10_000
    assert c.delete(f"{RV}/projects/{pr['id']}").status_code == 422  # tiene cobros
    assert c.get("/api/v1/reports/integrity").json()["ok"] is True


def test_ryventis_isolation(api):
    cl = api.c.post(f"{RV}/clients", json={"name": "Privado"}).json()
    pr = api.c.post(f"{RV}/projects", json={"name": "Privado"}).json()
    make_user("otro@example.com")
    o = TestClient(app)
    tok = o.post("/api/v1/auth/login", json={"email": "otro@example.com", "password": PASSWORD}).json()["access_token"]
    o.headers["Authorization"] = f"Bearer {tok}"
    assert o.get(f"{RV}/clients").json() == [] and o.get(f"{RV}/projects").json() == []
    assert o.get(f"{RV}/clients/{cl['id']}").status_code == 404
    assert o.post(f"{RV}/projects", json={"name": "x", "client_id": cl["id"]}).status_code == 404
    assert o.post("/api/v1/tasks", json={"title": "x", "project_id": pr["id"]}).status_code == 404
    assert o.post(f"{RV}/receivables", json={"description": "x", "amount_cents": 1,
                                             "project_id": pr["id"]}).status_code == 404
