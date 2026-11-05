"""Ryventis CRM + ERP: clientes, interacciones, proyectos y cobros (receivables ligados al libro mayor).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-05
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE rv_clients (
            id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            name           TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
            company        TEXT CHECK (length(company) <= 120),
            phone          TEXT CHECK (length(phone) <= 40),
            email          TEXT CHECK (length(email) <= 254),
            stage          TEXT NOT NULL DEFAULT 'nuevo' CHECK (stage IN ('nuevo','charla','propuesta','cliente','perdido')),
            source         TEXT CHECK (length(source) <= 60),
            notes          TEXT CHECK (length(notes) <= 4000),
            next_step      TEXT CHECK (length(next_step) <= 200),
            next_step_date DATE,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_rv_clients_user ON rv_clients(user_id, stage);

        CREATE TABLE rv_interactions (
            id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            client_id   BIGINT NOT NULL REFERENCES rv_clients(id) ON DELETE CASCADE,
            kind        TEXT NOT NULL CHECK (kind IN ('mensaje','llamada','email','reunion','otro')),
            summary     TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1000),
            happened_on DATE NOT NULL DEFAULT current_date,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_rv_interactions_client ON rv_interactions(client_id, happened_on DESC);

        CREATE TABLE rv_projects (
            id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            client_id    BIGINT REFERENCES rv_clients(id) ON DELETE RESTRICT,
            name         TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
            amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
            status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_marcha','terminado','cancelado')),
            due_date     DATE,
            notes        TEXT CHECK (length(notes) <= 4000),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_rv_projects_user ON rv_projects(user_id, status);

        CREATE TABLE rv_receivables (
            id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id                  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            project_id               BIGINT REFERENCES rv_projects(id) ON DELETE RESTRICT,
            client_id                BIGINT REFERENCES rv_clients(id) ON DELETE RESTRICT,
            description              TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
            amount_cents             BIGINT NOT NULL CHECK (amount_cents > 0),
            due_date                 DATE,
            status                   TEXT NOT NULL DEFAULT 'por_cobrar' CHECK (status IN ('por_cobrar','cobrado')),
            collected_transaction_id BIGINT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK ((status = 'cobrado') = (collected_transaction_id IS NOT NULL))
        );
        CREATE INDEX ix_rv_receivables_user ON rv_receivables(user_id, status, due_date);

        ALTER TABLE tasks ADD COLUMN project_id BIGINT REFERENCES rv_projects(id) ON DELETE SET NULL;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE tasks DROP COLUMN IF EXISTS project_id;
        DROP TABLE IF EXISTS rv_receivables, rv_projects, rv_interactions, rv_clients;
    """)
