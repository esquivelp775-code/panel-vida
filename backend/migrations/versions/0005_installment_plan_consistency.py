"""F13: la BD verifica que un plan MSI corresponda a su compra (mismo usuario, tarjeta y monto).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-05
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(r"""
        CREATE FUNCTION fn_installment_plan_consistent() RETURNS trigger AS $$
        DECLARE ok BOOLEAN;
        BEGIN
            SELECT EXISTS (
                SELECT 1 FROM transactions t
                JOIN entries e ON e.transaction_id = t.id
                JOIN accounts a ON a.id = e.account_id
                WHERE t.id = NEW.transaction_id AND t.user_id = NEW.user_id AND t.kind = 'card_purchase'
                  AND a.id = NEW.card_account_id AND a.user_id = NEW.user_id AND a.subtype = 'credit_card'
                  AND e.amount_cents = -NEW.total_cents
            ) INTO ok;
            IF NOT ok THEN
                RAISE EXCEPTION 'installment plan does not match its card purchase' USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_installment_plan_consistent
            BEFORE INSERT ON installment_plans
            FOR EACH ROW EXECUTE FUNCTION fn_installment_plan_consistent();
    """)


def downgrade() -> None:
    op.execute("""
        DROP TRIGGER IF EXISTS trg_installment_plan_consistent ON installment_plans;
        DROP FUNCTION IF EXISTS fn_installment_plan_consistent;
    """)
