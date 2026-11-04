"""Esquema inicial: libro mayor de doble partida con triggers de integridad.

Revision ID: 0001
Revises:
Create Date: 2026-11-04
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

UPGRADE_SQL = r"""
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    currency      CHAR(3) NOT NULL DEFAULT 'MXN',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name               TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    account_class      TEXT NOT NULL CHECK (account_class IN ('asset','liability','income','expense','equity')),
    subtype            TEXT NOT NULL,
    currency           CHAR(3) NOT NULL,
    credit_limit_cents BIGINT CHECK (credit_limit_cents >= 0),
    statement_day      SMALLINT CHECK (statement_day BETWEEN 1 AND 31),
    due_day            SMALLINT CHECK (due_day BETWEEN 1 AND 31),
    interest_rate_bps  INTEGER CHECK (interest_rate_bps >= 0),
    is_system          BOOLEAN NOT NULL DEFAULT false,
    archived_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_accounts_subtype CHECK (
        (account_class = 'asset'     AND subtype IN ('cash','checking','savings','investment')) OR
        (account_class = 'liability' AND subtype IN ('credit_card','loan','other_liability')) OR
        (account_class = 'income'    AND subtype = 'income') OR
        (account_class = 'expense'   AND subtype = 'expense') OR
        (account_class = 'equity'    AND subtype = 'equity')
    ),
    CONSTRAINT ck_accounts_card_fields CHECK (
        subtype = 'credit_card' OR (credit_limit_cents IS NULL AND statement_day IS NULL AND due_day IS NULL)
    )
);
CREATE INDEX ix_accounts_user ON accounts(user_id);
CREATE UNIQUE INDEX uq_accounts_name ON accounts(user_id, account_class, lower(btrim(name)));

CREATE TABLE transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind            TEXT NOT NULL CHECK (kind IN ('income','expense','transfer','card_purchase','card_payment',
                        'loan_payment','loan_disbursement','adjustment','opening_balance','reversal')),
    occurred_on     DATE NOT NULL CHECK (occurred_on >= DATE '1900-01-01'),
    description     TEXT NOT NULL CHECK (length(description) <= 500),
    notes           TEXT CHECK (length(notes) <= 2000),
    idempotency_key TEXT CHECK (length(idempotency_key) BETWEEN 1 AND 200),
    request_hash    TEXT,
    reverses_id     BIGINT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
    voided_at       TIMESTAMPTZ,
    void_reason     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_transactions_reversal CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
    CONSTRAINT ck_transactions_void CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
    CONSTRAINT uq_transactions_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX ix_transactions_user_date ON transactions(user_id, occurred_on DESC, id DESC);

CREATE TABLE entries (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    account_id     BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount_cents   BIGINT NOT NULL CONSTRAINT ck_entries_nonzero CHECK (amount_cents <> 0)
);
CREATE INDEX ix_entries_transaction ON entries(transaction_id);
CREATE INDEX ix_entries_account ON entries(account_id);

CREATE TABLE obligations (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name                   TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    kind                   TEXT NOT NULL CHECK (kind IN ('bill','loan_installment','card_payment','income_expected','other')),
    direction              TEXT NOT NULL DEFAULT 'outflow' CHECK (direction IN ('outflow','inflow')),
    amount_cents           BIGINT NOT NULL CHECK (amount_cents > 0),
    due_date               DATE NOT NULL,
    recurrence             TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','monthly','yearly')),
    status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
    pay_from_account_id    BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
    target_account_id      BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id            BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
    settled_transaction_id BIGINT REFERENCES transactions(id) ON DELETE RESTRICT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_obligations_paid CHECK ((status = 'paid') = (settled_transaction_id IS NOT NULL))
);
CREATE INDEX ix_obligations_user_due ON obligations(user_id, status, due_date);

CREATE TABLE budgets (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    month        DATE NOT NULL CHECK (extract(day FROM month) = 1),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    CONSTRAINT uq_budgets_month UNIQUE (user_id, category_id, month)
);

CREATE TABLE audit_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    entity     TEXT NOT NULL,
    entity_id  BIGINT,
    action     TEXT NOT NULL,
    payload    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_log(entity, entity_id);

-- ---------------------------------------------------------------- integridad
-- R-balance: al confirmar, cada transacción suma 0, tiene >=2 entradas,
-- una sola moneda y todas sus cuentas pertenecen al dueño de la transacción.
CREATE FUNCTION fn_check_transaction_balanced() RETURNS trigger AS $$
DECLARE
    tx_id BIGINT;
    v_sum NUMERIC;
    v_count INTEGER;
    v_currencies INTEGER;
    v_foreign INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'entries' THEN
        tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
    ELSE
        tx_id := NEW.id;
    END IF;
    SELECT COALESCE(SUM(e.amount_cents), 0), COUNT(*), COUNT(DISTINCT a.currency),
           COUNT(*) FILTER (WHERE a.user_id <> t.user_id)
      INTO v_sum, v_count, v_currencies, v_foreign
      FROM transactions t
      LEFT JOIN entries e ON e.transaction_id = t.id
      LEFT JOIN accounts a ON a.id = e.account_id
     WHERE t.id = tx_id;
    IF v_count < 2 THEN
        RAISE EXCEPTION 'transaction % must have at least 2 entries (has %)', tx_id, v_count
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_sum <> 0 THEN
        RAISE EXCEPTION 'transaction % is unbalanced (sum=%)', tx_id, v_sum
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_currencies > 1 THEN
        RAISE EXCEPTION 'transaction % mixes currencies', tx_id USING ERRCODE = 'check_violation';
    END IF;
    IF v_foreign > 0 THEN
        RAISE EXCEPTION 'transaction % touches accounts of another user', tx_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_entries_balanced
    AFTER INSERT ON entries DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_check_transaction_balanced();

CREATE CONSTRAINT TRIGGER trg_transactions_has_entries
    AFTER INSERT ON transactions DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_check_transaction_balanced();

-- R-inmutabilidad: las entradas nunca se modifican ni se borran.
CREATE FUNCTION fn_entries_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'entries are immutable; void the transaction instead'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entries_immutable
    BEFORE UPDATE OR DELETE ON entries
    FOR EACH ROW EXECUTE FUNCTION fn_entries_immutable();

CREATE FUNCTION fn_transactions_no_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'transactions cannot be deleted; void them instead'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_no_delete
    BEFORE DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_transactions_no_delete();

-- Sólo se permite anular una vez (fijar voided_at/void_reason cuando son NULL).
CREATE FUNCTION fn_transactions_guard_update() RETURNS trigger AS $$
BEGIN
    IF (NEW.id, NEW.user_id, NEW.kind, NEW.occurred_on, NEW.description, NEW.notes,
        NEW.idempotency_key, NEW.request_hash, NEW.reverses_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.kind, OLD.occurred_on, OLD.description, OLD.notes,
        OLD.idempotency_key, OLD.request_hash, OLD.reverses_id, OLD.created_at) THEN
        RAISE EXCEPTION 'transactions are immutable except for voiding'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.voided_at IS NOT NULL AND
       (NEW.voided_at, NEW.void_reason) IS DISTINCT FROM (OLD.voided_at, OLD.void_reason) THEN
        RAISE EXCEPTION 'transaction % is already voided', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_guard_update
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_transactions_guard_update();

-- Las cuentas no se borran (baja lógica con archived_at).
CREATE FUNCTION fn_accounts_no_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'accounts cannot be deleted; archive them instead'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_no_delete
    BEFORE DELETE ON accounts
    FOR EACH ROW EXECUTE FUNCTION fn_accounts_no_delete();

-- La clase/subtipo/moneda de una cuenta no puede cambiar una vez creada.
CREATE FUNCTION fn_accounts_guard_update() RETURNS trigger AS $$
BEGIN
    IF (NEW.user_id, NEW.account_class, NEW.subtype, NEW.currency, NEW.is_system)
       IS DISTINCT FROM (OLD.user_id, OLD.account_class, OLD.subtype, OLD.currency, OLD.is_system) THEN
        RAISE EXCEPTION 'account class, subtype, currency and owner are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_guard_update
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION fn_accounts_guard_update();
"""

DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS audit_log, budgets, obligations, entries, transactions, accounts, users CASCADE;
DROP FUNCTION IF EXISTS fn_check_transaction_balanced, fn_entries_immutable, fn_transactions_no_delete,
    fn_transactions_guard_update, fn_accounts_no_delete, fn_accounts_guard_update;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
