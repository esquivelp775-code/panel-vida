"""Ryventis: área 'ryventis' y estado 'doing' (En marcha) en tasks.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-05
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE tasks DROP CONSTRAINT tasks_area_check;
        ALTER TABLE tasks ADD CONSTRAINT tasks_area_check
            CHECK (area IN ('finanzas','personal','trabajo','casa','salud','otro','ryventis'));
        ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
        ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending','doing','done'));
        CREATE INDEX ix_tasks_user_area ON tasks(user_id, area);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS ix_tasks_user_area;
        UPDATE tasks SET status = 'pending' WHERE status = 'doing';
        UPDATE tasks SET area = 'trabajo' WHERE area = 'ryventis';
        ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
        ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending','done'));
        ALTER TABLE tasks DROP CONSTRAINT tasks_area_check;
        ALTER TABLE tasks ADD CONSTRAINT tasks_area_check
            CHECK (area IN ('finanzas','personal','trabajo','casa','salud','otro'));
    """)
