"""Obligaciones de tipo 'savings': aportaciones a una tanda/ahorro (transferencia a un activo, no gasto).

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE obligations DROP CONSTRAINT obligations_kind_check;
        ALTER TABLE obligations ADD CONSTRAINT obligations_kind_check
            CHECK (kind IN ('bill','loan_installment','card_payment','income_expected','other','savings'));
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE obligations SET kind = 'other' WHERE kind = 'savings';
        ALTER TABLE obligations DROP CONSTRAINT obligations_kind_check;
        ALTER TABLE obligations ADD CONSTRAINT obligations_kind_check
            CHECK (kind IN ('bill','loan_installment','card_payment','income_expected','other'));
    """)
