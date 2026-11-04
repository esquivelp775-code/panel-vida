# CLAUDE.md — Panel de Vida

Sistema financiero personal (un usuario, uso principal desde el teléfono).
Prioridad: **integridad financiera > seguridad > funcionalidad > portabilidad > experiencia visual**.

## Stack
* `backend/` — Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, psycopg 3.
* `frontend/` — Next.js (export estático), TypeScript, Tailwind, PWA. Desplegable en Netlify o nginx.
* Docker + docker-compose para portabilidad a servidor Debian.

## Documentos que mandan (leer antes de tocar el área)
* `docs/FINANCIAL_RULES.md` — reglas contables no negociables (doble partida, centavos, inmutabilidad).
* `docs/ARCHITECTURE.md` — arquitectura y **contrato de API v1**.
* `docs/DATABASE.md` — esquema y triggers.
* `docs/DECISIONS.md` — decisiones registradas (ADR).
* `docs/PROGRESS.md` — estado actual y siguiente acción.

## Reglas de código
1. Dinero = enteros en centavos (`*_cents`, `BIGINT`). Nunca `float`/`Decimal` en lógica de dinero.
2. Toda escritura financiera pasa por `backend/app/ledger.py`. Los routers no construyen entradas.
3. Nada financiero se borra: se anula con reversión. Los triggers de BD lo impiden de todos modos.
4. Cambios de esquema sólo con nueva migración Alembic.
5. Datos de prueba siempre ficticios. Ningún secreto en el repositorio (`.env` está ignorado).
6. Mensajes de error al usuario en español.

## Comandos
```bash
# BD local (dev): usuario panel / BD panel_vida y panel_vida_test
cd backend
alembic upgrade head                       # migrar
python -m app.cli create-user --email demo@example.com --password 'xxx'
python -m app.cli seed-demo --email demo@example.com   # datos ficticios
uvicorn app.main:app --reload              # API en :8000, docs en /docs
pytest -q                                  # pruebas (requiere PANEL_TEST_DATABASE_URL o BD local)

cd frontend
npm install && npm run dev                 # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run build                              # export estático en frontend/out
```

## Equipo de agentes (`.claude/agents/`)
systems-architect (opus), financial-domain-expert (opus), backend-engineer (sonnet),
frontend-engineer (sonnet), database-engineer (sonnet), qa-engineer (sonnet),
security-auditor (sonnet), ux-reviewer (haiku), documentation-specialist (haiku).

Los agentes de proyecto se registran al iniciar la sesión de Claude Code. Si se crearon durante
la sesión, invócalos como `general-purpose` con `model` explícito y pide que lean su archivo de
definición. Sólo el orquestador crea agentes; los subagentes no crean otros subagentes.

## Git
Trabajar en ramas `claude/*`. Commits pequeños y descriptivos. No hacer push a `main` sin revisión.
