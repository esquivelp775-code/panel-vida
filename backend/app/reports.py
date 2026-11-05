"""Lecturas derivadas del libro mayor. Nada aquí escribe en la BD."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session, aliased

from . import installments as msi
from .dates import add_months, clamp, month_start  # noqa: F401  (re-exportadas para quien importe reports)
from .ledger import natural
from .models import LIQUID_SUBTYPES, Account, Budget, Entry, InstallmentPlan, Obligation, Transaction, User


# ------------------------------------------------------------------ saldos
def balances(db: Session, user: User, as_of: date | None = None) -> dict[int, int]:
    """Saldo bruto (suma de entradas) por cuenta."""
    q = (
        select(Entry.account_id, func.sum(Entry.amount_cents))
        .join(Transaction)
        .where(Transaction.user_id == user.id)
        .group_by(Entry.account_id)
    )
    if as_of is not None:
        q = q.where(Transaction.occurred_on <= as_of)
    return {aid: int(total) for aid, total in db.execute(q)}


def accounts_with_balance(db: Session, user: User, account_class: str | None = None, include_archived=False,
                          as_of: date | None = None):
    q = select(Account).where(Account.user_id == user.id).order_by(Account.account_class, Account.name)
    if account_class:
        q = q.where(Account.account_class == account_class)
    if not include_archived:
        q = q.where(Account.archived_at.is_(None))
    bal = balances(db, user, as_of)
    return [(a, natural(a, bal.get(a.id, 0))) for a in db.scalars(q)]


# ------------------------------------------------------------------ tarjetas
def due_after_closing(closing: date, statement_day: int, due_day: int) -> date:
    """Fecha límite del estado que cierra en `closing`. Si el día de pago es mayor que el de corte, vence el
    mismo mes (o al día siguiente del corte si el mes es corto); si no, vence el mes siguiente."""
    if due_day > statement_day:
        due = clamp(closing.year, closing.month, due_day)
        return due if due > closing else closing + timedelta(days=1)
    return add_months(closing, 1, due_day)


def active_plans(db: Session, card: Account, today: date) -> list[tuple[InstallmentPlan, Transaction]]:
    """Planes MSI vigentes: compra no anulada y ya ocurrida."""
    q = (
        select(InstallmentPlan, Transaction)
        .join(Transaction, Transaction.id == InstallmentPlan.transaction_id)
        .where(InstallmentPlan.card_account_id == card.id, Transaction.voided_at.is_(None),
               Transaction.occurred_on <= today)
        .order_by(Transaction.occurred_on, InstallmentPlan.id)
    )
    return [(p, t) for p, t in db.execute(q)]


def deferred_cents(plans, statement_day: int, as_of: date) -> int:
    return sum(msi.deferred_at(p.total_cents, p.months, p.first_closing, statement_day, t.occurred_on, as_of)
               for p, t in plans)


def billed_at_closing(plans, statement_day: int, closing: date) -> int:
    return sum(msi.billed_at(p.total_cents, p.months, p.first_closing, statement_day, closing) for p, _ in plans)


def minimum_due(statement_due: int, msi_billed: int, credit_limit: int | None) -> int:
    """Pago mínimo ESTIMADO (criterio Banxico): mayor entre 1.5 % del saldo revolvente del estado y
    1.25 % del límite, más las mensualidades MSI del periodo; nunca mayor que el pago del estado.
    No incluye intereses ni IVA (si el banco los cargó, regístralos y se sumarán al saldo)."""
    if statement_due <= 0:
        return 0
    revolving = max(0, statement_due - msi_billed)
    base = max(msi.pct_ceil(revolving, 150), msi.pct_ceil(credit_limit or 0, 125))
    return min(statement_due, base + msi_billed)


def installment_rows(db: Session, card: Account, today: date) -> list[dict]:
    rows = []
    for p, t in active_plans(db, card, today):
        sched = msi.schedule(p.total_cents, p.months)
        k = msi.billed_count(p.first_closing, p.months, card.statement_day, today)
        nxt = add_months(p.first_closing, k, card.statement_day) if k < p.months else None
        rows.append({
            "plan_id": p.id, "transaction_id": t.id, "description": t.description, "purchased_on": t.occurred_on,
            "total_cents": p.total_cents, "months": p.months, "installment_cents": sched[0], "billed_count": k,
            "remaining_cents": p.total_cents - sum(sched[:k]), "next_closing": nxt,
        })
    return rows


def card_status(db: Session, card: Account, today: date) -> dict:
    # Sólo cuenta lo ocurrido hasta hoy: las operaciones con fecha futura aparecen al llegar su fecha.
    owed = -int(
        db.scalar(
            select(func.coalesce(func.sum(Entry.amount_cents), 0))
            .join(Transaction)
            .where(Entry.account_id == card.id, Transaction.occurred_on <= today)
        )
    )
    out = {
        "id": card.id, "name": card.name, "owed_cents": owed, "credit_limit_cents": card.credit_limit_cents,
        "available_credit_cents": (card.credit_limit_cents - owed) if card.credit_limit_cents is not None else None,
        "next_due_date": None, "statement_due_cents": None, "overdue": False, "deferred_cents": 0,
        "minimum_due_cents": None, "statement_closing": None,
    }
    if not (card.statement_day and card.due_day):
        return out
    plans = active_plans(db, card, today)
    out["deferred_cents"] = deferred_cents(plans, card.statement_day, today)
    closing = clamp(today.year, today.month, card.statement_day)
    if closing > today:
        closing = add_months(closing, -1, card.statement_day)
    due = due_after_closing(closing, card.statement_day, card.due_day)
    owed_at_close = -int(
        db.scalar(
            select(func.coalesce(func.sum(Entry.amount_cents), 0))
            .join(Transaction)
            .where(Entry.account_id == card.id, Transaction.occurred_on <= closing)
        )
    )
    statement_due = max(0, owed_at_close - deferred_cents(plans, card.statement_day, closing)
                        - _credits(db, card, closing, today))
    if statement_due > 0:
        out.update(next_due_date=due, statement_due_cents=statement_due, overdue=due < today, statement_closing=closing,
                   minimum_due_cents=minimum_due(statement_due, billed_at_closing(plans, card.statement_day, closing),
                                                 card.credit_limit_cents))
    else:
        # Estado cubierto: se muestra el siguiente ciclo, estimado con el saldo actual.
        next_close = add_months(closing, 1, card.statement_day)
        est = max(0, owed - deferred_cents(plans, card.statement_day, next_close))
        out.update(next_due_date=due_after_closing(next_close, card.statement_day, card.due_day),
                   statement_due_cents=est, statement_closing=next_close,
                   minimum_due_cents=minimum_due(est, billed_at_closing(plans, card.statement_day, next_close),
                                                 card.credit_limit_cents))
    # F12: si el estado ANTERIOR venció sin cubrirse, la tarjeta sigue marcada como vencida.
    prev_close = add_months(closing, -1, card.statement_day)
    prev_due = due_after_closing(prev_close, card.statement_day, card.due_day)
    if not out["overdue"] and prev_due < today:
        owed_prev = -int(db.scalar(
            select(func.coalesce(func.sum(Entry.amount_cents), 0)).join(Transaction)
            .where(Entry.account_id == card.id, Transaction.occurred_on <= prev_close)))
        # Los pagos se aplican a la deuda más antigua: cuenta todo lo pagado después de ese corte.
        unpaid_prev = owed_prev - deferred_cents(plans, card.statement_day, prev_close) \
            - _credits(db, card, prev_close, today)
        if unpaid_prev > 0:
            out["overdue"] = True
    return out


def _credits(db: Session, card: Account, after: date, until: date) -> int:
    """Créditos (pagos, devoluciones) en (after, until]; excluye anuladas y reversiones, que se netean
    en su fecha original."""
    return int(db.scalar(
        select(func.coalesce(func.sum(Entry.amount_cents), 0))
        .join(Transaction)
        .where(
            Entry.account_id == card.id, Entry.amount_cents > 0, Transaction.occurred_on > after,
            Transaction.occurred_on <= until, Transaction.voided_at.is_(None), Transaction.kind != "reversal",
        )
    ))


def cards(db: Session, user: User, today: date) -> list[dict]:
    q = select(Account).where(
        Account.user_id == user.id, Account.subtype == "credit_card", Account.archived_at.is_(None)
    ).order_by(Account.name)
    return [card_status(db, c, today) for c in db.scalars(q)]


# ------------------------------------------------------------------ vencimientos
def upcoming(db: Session, user: User, today: date, days: int = 30) -> list[dict]:
    """Obligaciones pendientes (con sus repeticiones futuras dentro del horizonte) + pagos de tarjeta."""
    horizon = today + timedelta(days=days)
    items: list[dict] = []
    pending = list(
        db.scalars(
            select(Obligation)
            .where(Obligation.user_id == user.id, Obligation.status == "pending", Obligation.due_date <= horizon)
            .order_by(Obligation.due_date, Obligation.id)
        )
    )
    has_child = set(db.scalars(select(Obligation.generated_from_id).where(
        Obligation.user_id == user.id, Obligation.generated_from_id.is_not(None))))
    covered_cards = {o.target_account_id for o in pending if o.kind == "card_payment"}
    card_list = cards(db, user, today)
    card_need = {c["id"]: c["statement_due_cents"] for c in card_list if c["statement_due_cents"] is not None}
    for o in pending:
        when, step = o.due_date, {"monthly": 1, "yearly": 12}.get(o.recurrence)
        amount = o.amount_cents
        if o.kind == "card_payment" and o.target_account_id in card_need:
            # F7: si la tarjeta ya se pagó directamente, el vencimiento sólo cuenta por lo que falte.
            amount = min(amount, card_need[o.target_account_id])
            if amount == 0:
                continue
        n = 0
        while when <= horizon:
            items.append({
                "source": "obligation", "ref_id": o.id, "name": o.name, "due_date": when,
                "amount_cents": amount if n == 0 else o.amount_cents, "direction": o.direction,
                "overdue": when < today,
            })
            if not step or o.id in has_child:  # la siguiente ya existe como obligación real
                break
            n += 1
            when = add_months(o.due_date, step * n, o.anchor_day or o.due_date.day)
    for c in card_list:
        if c["id"] in covered_cards or not c["next_due_date"] or not c["statement_due_cents"]:
            continue
        if c["next_due_date"] <= horizon:
            items.append({
                "source": "card", "ref_id": c["id"], "name": f"Pago tarjeta {c['name']}",
                "due_date": c["next_due_date"], "amount_cents": c["statement_due_cents"], "direction": "outflow",
                "overdue": c["overdue"],
            })
    # Ciclos futuros de tarjeta: sólo lo ya comprometido (mensualidades MSI), sin inventar consumo.
    for c in card_list:
        if c["id"] in covered_cards or not c["statement_closing"]:
            continue
        card = db.get(Account, c["id"])
        plans = active_plans(db, card, today)
        j = 1
        while plans:
            close_j = add_months(c["statement_closing"], j, card.statement_day)
            due_j = due_after_closing(close_j, card.statement_day, card.due_day)
            if due_j > horizon:
                break
            amt = billed_at_closing(plans, card.statement_day, close_j)
            if amt:
                items.append({"source": "card", "ref_id": c["id"], "name": f"MSI tarjeta {c['name']}",
                              "due_date": due_j, "amount_cents": amt, "direction": "outflow", "overdue": False})
            j += 1
    # Mismo día: entradas antes que salidas (evita mínimos proyectados que no ocurren).
    items.sort(key=lambda i: (i["due_date"], i["direction"] != "inflow", i["source"], i["ref_id"]))
    return items


# ------------------------------------------------------------------ dashboard
def available_cents(db: Session, user: User, as_of: date | None = None) -> int:
    bal = balances(db, user, as_of)
    liquid = db.scalars(
        select(Account.id).where(Account.user_id == user.id, Account.subtype.in_(LIQUID_SUBTYPES))
    )
    return sum(bal.get(i, 0) for i in liquid)


def dashboard(db: Session, user: User, today: date) -> dict:
    accs = accounts_with_balance(db, user, as_of=today)
    available = sum(b for a, b in accs if a.subtype in LIQUID_SUBTYPES)
    assets = sum(b for a, b in accs if a.account_class == "asset")
    debt = sum(b for a, b in accs if a.account_class == "liability")
    month = cashflow(db, user, month_start(today), today)["totals"]
    return {
        "available_cents": available,
        "total_debt_cents": debt,
        "net_worth_cents": assets - debt,
        "month": {k: month[k] for k in ("income_cents", "expense_cents", "net_cents")},
        "cards": cards(db, user, today),
        "upcoming": upcoming(db, user, today, 30)[:10],
        "accounts": [(a, b) for a, b in accs if a.account_class == "asset"],
    }


# ------------------------------------------------------------------ flujo de efectivo
def cashflow(db: Session, user: User, date_from: date, date_to: date) -> dict:
    month_col = func.to_char(Transaction.occurred_on, "YYYY-MM")
    orig = aliased(Transaction)
    reverses_opening = select(orig.id).where(orig.id == Transaction.reverses_id, orig.kind == "opening_balance").exists()
    is_liquid_real = and_(Account.subtype.in_(LIQUID_SUBTYPES), Transaction.kind != "opening_balance",
                          ~reverses_opening)
    q = (
        select(
            month_col,
            func.sum(case((Account.account_class == "income", -Entry.amount_cents), else_=0)),
            func.sum(case((Account.account_class == "expense", Entry.amount_cents), else_=0)),
            func.sum(case((is_liquid_real, Entry.amount_cents), else_=0)),
        )
        .select_from(Entry)
        .join(Transaction)
        .join(Account)
        .where(Transaction.user_id == user.id, Transaction.occurred_on.between(date_from, date_to))
        .group_by(month_col)
        .order_by(month_col)
    )
    months = []
    for m, inc, exp, liq in db.execute(q):
        inc, exp, liq = int(inc or 0), int(exp or 0), int(liq or 0)
        months.append({"month": m, "income_cents": inc, "expense_cents": exp, "net_cents": inc - exp,
                       "liquid_change_cents": liq})
    totals = {k: sum(x[k] for x in months) for k in ("income_cents", "expense_cents", "net_cents",
                                                    "liquid_change_cents")}
    return {"months": months, "totals": totals}


def by_category(db: Session, user: User, date_from: date, date_to: date, account_class: str = "expense"):
    sign = -1 if account_class == "income" else 1
    q = (
        select(Account.id, Account.name, func.sum(Entry.amount_cents))
        .select_from(Entry)
        .join(Transaction)
        .join(Account)
        .where(
            Transaction.user_id == user.id, Account.account_class == account_class,
            Transaction.occurred_on.between(date_from, date_to),
        )
        .group_by(Account.id, Account.name)
    )
    rows = [{"category_id": i, "name": n, "total_cents": sign * int(t)} for i, n, t in db.execute(q)]
    rows = [r for r in rows if r["total_cents"] != 0]
    rows.sort(key=lambda r: -r["total_cents"])
    return rows


# ------------------------------------------------------------------ proyección
def projection(db: Session, user: User, today: date, days: int = 90) -> dict:
    start = available_cents(db, user, as_of=today)
    bal = start
    points = []
    min_bal, min_date = start, today
    for it in upcoming(db, user, today, days):
        when = max(it["due_date"], today)
        delta = it["amount_cents"] if it["direction"] == "inflow" else -it["amount_cents"]
        bal += delta
        points.append({"date": when, "event": it["name"], "amount_cents": delta, "balance_cents": bal})
        if bal < min_bal:
            min_bal, min_date = bal, when
    points.sort(key=lambda p: p["date"])
    return {"starting_available_cents": start, "points": points, "min_balance_cents": min_bal,
            "min_balance_date": min_date}


# ------------------------------------------------------------------ presupuestos
def budget_rows(db: Session, user: User, month: date) -> list[dict]:
    end = add_months(month, 1, 1) - timedelta(days=1)
    spent = dict(
        db.execute(
            select(Entry.account_id, func.sum(Entry.amount_cents))
            .join(Transaction)
            .where(Transaction.user_id == user.id, Transaction.occurred_on.between(month, end))
            .group_by(Entry.account_id)
        ).all()
    )
    q = (
        select(Budget, Account.name)
        .join(Account, Account.id == Budget.category_id)
        .where(Budget.user_id == user.id, Budget.month == month)
        .order_by(Account.name)
    )
    out = []
    for b, name in db.execute(q):
        sp = int(spent.get(b.category_id, 0))
        out.append({"id": b.id, "category_id": b.category_id, "category_name": name, "month": month.strftime("%Y-%m"),
                    "amount_cents": b.amount_cents, "spent_cents": sp, "remaining_cents": b.amount_cents - sp})
    return out


# ------------------------------------------------------------------ integridad
def integrity(db: Session, user: User) -> dict:
    per_tx = (
        select(Transaction.id, func.coalesce(func.sum(Entry.amount_cents), 0), func.count(Entry.id))
        .outerjoin(Entry)
        .where(Transaction.user_id == user.id)
        .group_by(Transaction.id)
    )
    rows = db.execute(per_tx).all()
    bad = [tid for tid, total, n in rows if total != 0 or n < 2]
    ledger_sum = sum(int(t) for _, t, _ in rows)
    rev = aliased(Transaction)
    voided_without_reversal = list(
        db.scalars(
            select(Transaction.id)
            .outerjoin(rev, rev.reverses_id == Transaction.id)
            .where(Transaction.user_id == user.id, Transaction.voided_at.is_not(None), rev.id.is_(None))
        )
    )
    # Cada reversión debe ser el espejo exacto de su original (mismas cuentas, montos opuestos).
    rev_pairs = db.execute(select(Transaction.id, Transaction.reverses_id).where(
        Transaction.user_id == user.id, Transaction.reverses_id.is_not(None))).all()
    ids = {i for pair in rev_pairs for i in pair}
    lines: dict[int, list[tuple[int, int]]] = {}
    if ids:
        for tid, aid, amt in db.execute(select(Entry.transaction_id, Entry.account_id, Entry.amount_cents)
                                        .where(Entry.transaction_id.in_(ids))):
            lines.setdefault(tid, []).append((aid, amt))
    bad_reversals = [rid for rid, oid in rev_pairs
                     if sorted(lines.get(rid, [])) != sorted((a, -m) for a, m in lines.get(oid, []))]
    bal = balances(db, user)
    archived_nonzero = [a for a in db.scalars(select(Account.id).where(
        Account.user_id == user.id, Account.archived_at.is_not(None))) if bal.get(a, 0) != 0]
    return {"ok": not bad and ledger_sum == 0 and not voided_without_reversal and not archived_nonzero
            and not bad_reversals,
            "unbalanced_transactions": bad, "voided_without_reversal": voided_without_reversal,
            "reversals_not_mirrored": bad_reversals,
            "archived_with_balance": archived_nonzero, "ledger_sum_cents": ledger_sum,
            "checked_transactions": len(rows)}
