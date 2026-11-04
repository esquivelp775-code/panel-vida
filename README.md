# Panel de Vida

Sistema financiero personal, mobile-first. Un usuario. Prioridad: **integridad financiera**.

* **Backend:** FastAPI + SQLAlchemy 2 + PostgreSQL 16 (libro mayor de doble partida con triggers de integridad).
* **Frontend:** Next.js (export estático) + TypeScript + Tailwind, PWA. Despliegue en Netlify o nginx.
* **Portabilidad:** Docker + docker-compose listo para un servidor Debian doméstico.

## Qué hace (MVP)
Dinero disponible, ingresos, gastos, transferencias, cuentas, tarjetas (corte, fecha de pago, crédito
disponible), préstamos (capital/interés), deudas, próximos vencimientos, presupuestos, flujo de efectivo
(devengado y liquidez), proyección, conciliación, anulación trazable y exportación CSV/JSON.

## Inicio rápido (desarrollo)
```bash
# PostgreSQL local con usuario panel y BD panel_vida / panel_vida_test
cd backend
pip install -r requirements-dev.txt
cp .env.example .env          # ajusta valores
alembic upgrade head
python -m app.cli create-user --email demo@example.com
python -m app.cli seed-demo --email demo@example.com   # datos ficticios
uvicorn app.main:app --reload # http://localhost:8000/docs
python -m pytest -q           # 47 pruebas contra PostgreSQL

cd ../frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

## Documentación
| Documento | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | guía para agentes y reglas de código |
| [docs/FINANCIAL_RULES.md](docs/FINANCIAL_RULES.md) | reglas contables no negociables |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | arquitectura y contrato de API v1 |
| [docs/DATABASE.md](docs/DATABASE.md) | modelo entidad-relación y triggers |
| [docs/SECURITY.md](docs/SECURITY.md) | controles y riesgos |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Netlify, Debian, respaldos |
| [docs/MIGRATION.md](docs/MIGRATION.md) | migraciones y traslado de servidor |
| [docs/DECISIONS.md](docs/DECISIONS.md) | decisiones de arquitectura |
| [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/PROGRESS.md](docs/PROGRESS.md) | plan y estado |
