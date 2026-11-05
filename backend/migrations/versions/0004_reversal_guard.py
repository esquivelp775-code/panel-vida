"""F15: la base de datos impide anular una reversión (antes sólo lo impedía Python).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-05
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

UPGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION fn_transactions_guard_update() RETURNS trigger AS $$
BEGIN
    IF (NEW.id, NEW.user_id, NEW.kind, NEW.occurred_on, NEW.description, NEW.notes,
        NEW.idempotency_key, NEW.request_hash, NEW.reverses_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.kind, OLD.occurred_on, OLD.description, OLD.notes,
        OLD.idempotency_key, OLD.request_hash, OLD.reverses_id, OLD.created_at) THEN
        RAISE EXCEPTION 'transactions are immutable except for voiding'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.kind = 'reversal' AND NEW.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'reversal % cannot be voided', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.voided_at IS NOT NULL AND
       (NEW.voided_at, NEW.void_reason) IS DISTINCT FROM (OLD.voided_at, OLD.void_reason) THEN
        RAISE EXCEPTION 'transaction % is already voided', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

DOWNGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION fn_transactions_guard_update() RETURNS trigger AS $$
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
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
