FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd --system --uid 10001 panel && chown -R panel /app
USER panel
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/v1/health' % os.environ.get('PORT','8000'), timeout=4).status == 200 else 1)"
# Migra y arranca. Las migraciones son aditivas; ver docs/MIGRATION.md antes de cambiar esto.
ENV PANEL_ENV=production
# PORT lo asigna la plataforma (Render); en docker compose es 8000.
CMD ["sh", "-c", "alembic upgrade head && python -m app.cli bootstrap && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=${PANEL_FORWARDED_ALLOW_IPS:-127.0.0.1}"]
