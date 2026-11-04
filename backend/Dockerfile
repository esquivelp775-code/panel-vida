FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd --system --uid 10001 panel && chown -R panel /app
USER panel
EXPOSE 8000
# Migra y arranca. Las migraciones son aditivas; ver docs/MIGRATION.md antes de cambiar esto.
ENV PANEL_ENV=production
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=${PANEL_FORWARDED_ALLOW_IPS:-127.0.0.1}"]
