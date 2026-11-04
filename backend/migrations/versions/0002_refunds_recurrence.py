"""Devoluciones (refund), día ancla de recurrencia y enlace a la obligación siguiente.

Aditiva: sólo añade columnas nullable y amplía un CHECK.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

KINDS_OLD = ("'income','expense','transfer','card_purchase','card_payment','loan_payment','loan_disbursement',"
             "'adjustment','opening_balance','reversal'")
KINDS_NEW = KINDS_OLD + ",'refund'"


def upgrade() -> None:
    op.execute(f"""
        ALTER TABLE transactions DROP CONSTRAINT transactions_kind_check;
        ALTER TABLE transactions ADD CONSTRAINT transactions_kind_check CHECK (kind IN ({KINDS_NEW}));
        ALTER TABLE obligations ADD COLUMN anchor_day SMALLINT CHECK (anchor_day BETWEEN 1 AND 31);
        UPDATE obligations SET anchor_day = extract(day FROM due_date);
        ALTER TABLE obligations ADD COLUMN generated_from_id BIGINT UNIQUE REFERENCES obligations(id) ON DELETE RESTRICT;
    """)


def downgrade() -> None:
    op.execute(f"""
        ALTER TABLE obligations DROP COLUMN generated_from_id;
        ALTER TABLE obligations DROP COLUMN anchor_day;
        ALTER TABLE transactions DROP CONSTRAINT transactions_kind_check;
        ALTER TABLE transactions ADD CONSTRAINT transactions_kind_check CHECK (kind IN ({KINDS_OLD}));
    """)
