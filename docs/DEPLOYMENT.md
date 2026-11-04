# Despliegue

Estado: **preparado, no desplegado**. No hay credenciales de infraestructura en esta sesión.

## Opción A — Netlify (frontend) + backend propio
1. Backend en cualquier host con Docker (Debian doméstico, VPS):
   `docker build -t panel-vida-api backend` y ejecutar con `PANEL_ENV=production`,
   `PANEL_DATABASE_URL`, `PANEL_SECRET_KEY`, `PANEL_CORS_ORIGINS=https://<sitio>.netlify.app`.
   Debe quedar detrás de HTTPS.
2. Netlify: conectar el repositorio; `netlify.toml` ya define base `frontend`, comando `npm run build`,
   publicación `out`. Variable de entorno en Netlify: `NEXT_PUBLIC_API_URL=https://api.tu-dominio`.
3. Crear el usuario: `docker exec -it <api> python -m app.cli create-user --email TU@CORREO`.

## Opción B — Todo en un servidor Debian (docker compose)
```bash
sudo apt install docker.io docker-compose-plugin
git clone <repo> && cd panel-vida
cat > .env <<'X'
POSTGRES_PASSWORD=<aleatorio>
PANEL_SECRET_KEY=<python -c "import secrets;print(secrets.token_urlsafe(48))">
PANEL_CORS_ORIGINS=https://panel.tu-dominio
X
(cd frontend && npm ci && NEXT_PUBLIC_API_URL=https://panel.tu-dominio npm run build)
docker compose up -d --build
docker compose exec api python -m app.cli create-user --email TU@CORREO
```
nginx (`deploy/nginx.conf`) sirve el frontend en :8080 y hace proxy de `/api` → mismo origen.
Poner delante un proxy TLS (Caddy recomendado) o Tailscale para acceso privado.

## Respaldo (recomendado, diario)
```bash
docker compose exec -T db pg_dump -Fc -U panel panel_vida > respaldos/panel_vida_$(date +%F).dump
```
Probar la restauración periódicamente (ver MIGRATION.md).

## Verificado en esta sesión
* API + PostgreSQL 16 locales, 59 pruebas, frontend compilado y recorrido en Chromium (360 px):
  login → dashboard → registrar gasto → movimientos; integridad `ok`.
* `docker compose config` válido. **No verificado:** construcción de imágenes (sin daemon Docker).
