"""CLI: python -m app.cli create-user | seed-demo. Sin registro público: el usuario se crea aquí."""
import argparse
import getpass
from datetime import timedelta

from sqlalchemy import select

from . import dates, ledger
from . import obligations as obs
from . import schemas as s
from .db import SessionLocal
from .models import User
from .security import hash_password


def create_user(email: str, password: str | None, name: str | None, currency: str) -> None:
    password = password or getpass.getpass("Contraseña: ")
    if len(password) < 10:
        raise SystemExit("La contraseña debe tener al menos 10 caracteres")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email.lower())):
            raise SystemExit("Ese usuario ya existe")
        db.add(User(email=email.lower(), password_hash=hash_password(password), display_name=name, currency=currency))
        db.commit()
    print(f"Usuario {email} creado")


def bootstrap() -> None:
    """Crea el primer usuario con PANEL_BOOTSTRAP_EMAIL/PASSWORD si la base no tiene ninguno. Idempotente:
    con usuarios existentes no hace nada (y nunca cambia contraseñas)."""
    from .config import get_settings

    s = get_settings()
    if not (s.bootstrap_email and s.bootstrap_password):
        return
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            print("bootstrap: ya existe un usuario; no se hace nada (puedes borrar PANEL_BOOTSTRAP_*)")
            return
    if len(s.bootstrap_password) < 10:
        raise SystemExit("bootstrap: PANEL_BOOTSTRAP_PASSWORD debe tener al menos 10 caracteres")
    create_user(s.bootstrap_email, s.bootstrap_password, None, "MXN")


def seed_demo(email: str) -> None:
    """Datos 100 % ficticios para probar la interfaz."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            raise SystemExit("Crea primero el usuario")
        today = dates.today()
        mk = lambda **kw: ledger.create_account(db, user, s.AccountCreate(**kw))  # noqa: E731
        debit = mk(name="Cuenta de débito (demo)", subtype="checking", opening_balance_cents=1_250_000,
                   opening_date=today - timedelta(days=40))
        cash = mk(name="Efectivo (demo)", subtype="cash", opening_balance_cents=80_000)
        savings = mk(name="Ahorro (demo)", subtype="savings", opening_balance_cents=3_000_000)
        card = mk(name="Tarjeta (demo)", subtype="credit_card", credit_limit_cents=2_000_000, statement_day=5,
                  due_day=25, opening_balance_cents=350_000)
        loan = mk(name="Préstamo auto (demo)", subtype="loan", opening_balance_cents=9_000_000)
        salary = mk(name="Salario", subtype="income")
        food = mk(name="Comida", subtype="expense")
        transport = mk(name="Transporte", subtype="expense")
        services = mk(name="Servicios", subtype="expense")
        interest = mk(name="Intereses", subtype="expense")
        rec = lambda p: ledger.record(db, user, p)  # noqa: E731
        rec(s.IncomeIn(kind="income", account_id=debit.id, category_id=salary.id, amount_cents=2_500_000,
                       occurred_on=today - timedelta(days=15), description="Quincena (demo)"))
        rec(s.ExpenseIn(kind="expense", account_id=cash.id, category_id=food.id, amount_cents=18_550,
                        occurred_on=today - timedelta(days=3), description="Tacos (demo)"))
        rec(s.ExpenseIn(kind="expense", account_id=card.id, category_id=transport.id, amount_cents=95_000,
                        occurred_on=today - timedelta(days=2), description="Gasolina (demo)"))
        rec(s.CardPaymentIn(kind="card_payment", from_account_id=debit.id, card_account_id=card.id,
                            amount_cents=200_000, occurred_on=today - timedelta(days=1), description="Pago tarjeta"))
        rec(s.TransferIn(kind="transfer", from_account_id=debit.id, to_account_id=savings.id, amount_cents=300_000,
                         occurred_on=today, description="Ahorro mensual"))
        rec(s.LoanPaymentIn(kind="loan_payment", from_account_id=debit.id, loan_account_id=loan.id,
                            principal_cents=420_000, interest_cents=80_000, interest_category_id=interest.id,
                            occurred_on=today, description="Mensualidad auto (demo)"))
        obs.create(db, user, s.ObligationCreate(name="Luz (demo)", kind="bill", amount_cents=65_000,
                                                due_date=today + timedelta(days=7), recurrence="monthly",
                                                pay_from_account_id=debit.id, category_id=services.id))
        obs.create(db, user, s.ObligationCreate(name="Mensualidad auto (demo)", kind="loan_installment",
                                                amount_cents=500_000, due_date=today + timedelta(days=30),
                                                recurrence="monthly", pay_from_account_id=debit.id,
                                                target_account_id=loan.id, category_id=interest.id))
        db.commit()
    print("Datos ficticios creados")


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user")
    cu.add_argument("--email", required=True)
    cu.add_argument("--password")
    cu.add_argument("--name")
    cu.add_argument("--currency", default="MXN")
    sub.add_parser("bootstrap")
    sd = sub.add_parser("seed-demo")
    sd.add_argument("--email", required=True)
    a = ap.parse_args()
    if a.cmd == "create-user":
        create_user(a.email, a.password, a.name, a.currency)
    elif a.cmd == "bootstrap":
        bootstrap()
    else:
        seed_demo(a.email)


if __name__ == "__main__":
    main()
