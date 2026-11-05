"""Vida: pendientes (tasks) y hábitos con registro diario. No son datos financieros (se pueden borrar).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-05
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE tasks (
            id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            title        TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
            notes        TEXT CHECK (length(notes) <= 2000),
            due_date     DATE,
            priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
            area         TEXT NOT NULL DEFAULT 'personal'
                         CHECK (area IN ('finanzas','personal','trabajo','casa','salud','otro')),
            status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
            completed_at TIMESTAMPTZ,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK ((status = 'done') = (completed_at IS NOT NULL))
        );
        CREATE INDEX ix_tasks_user_status_due ON tasks(user_id, status, due_date);

        CREATE TABLE habits (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            name            TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
            emoji           TEXT NOT NULL DEFAULT '✅' CHECK (length(emoji) BETWEEN 1 AND 8),
            target_per_week SMALLINT NOT NULL DEFAULT 7 CHECK (target_per_week BETWEEN 1 AND 7),
            archived_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_habits_user ON habits(user_id);

        CREATE TABLE habit_logs (
            habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            day      DATE NOT NULL,
            PRIMARY KEY (habit_id, day)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS habit_logs, habits, tasks;")
