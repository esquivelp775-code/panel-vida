"""Planes de meses sin intereses (MSI) ligados a una compra con tarjeta.

Aditiva. El plan es inmutable (como las entradas): si la compra se anula, el plan deja de contar
porque su transacción queda anulada.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-04
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE installment_plans (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            transaction_id  BIGINT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
            card_account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
            total_cents     BIGINT NOT NULL CHECK (total_cents > 0),
            months          SMALLINT NOT NULL CHECK (months BETWEEN 2 AND 60),
            first_closing   DATE NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (total_cents >= months)
        );
        CREATE INDEX ix_installment_plans_card ON installment_plans(card_account_id);

        CREATE FUNCTION fn_immutable_row() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_installment_plans_immutable
            BEFORE UPDATE OR DELETE ON installment_plans
            FOR EACH ROW EXECUTE FUNCTION fn_immutable_row();
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS installment_plans;
        DROP FUNCTION IF EXISTS fn_immutable_row;
    """)
