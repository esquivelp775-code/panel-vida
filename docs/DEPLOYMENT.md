# Despliegue

Estado: **listo para desplegar; todavía no desplegado.** Docker, compose, respaldo y restauración se
prueban en cada push (CI, trabajo `stack`).

## Esta noche: elige una opción (lista de pasos)

Netlify sólo sirve el **frontend**. La API y PostgreSQL necesitan vivir en un equipo encendido
(tu servidor Debian) o en un servidor con Docker.

| Opción | Para quién | Exposición | Necesitas |
|---|---|---|---|
| **A. Debian + Tailscale (recomendada)** | sólo tú, desde tus dispositivos | ninguna pública | servidor Debian, cuenta gratuita de Tailscale |
| B. Netlify + API en casa por Cloudflare Tunnel | acceso desde cualquier navegador | pública con HTTPS | dominio en Cloudflare, cuenta de Netlify |
| C. Todo en casa por Cloudflare Tunnel (sin Netlify) | como B, más simple | pública con HTTPS | dominio en Cloudflare |

Para datos financieros personales, **A** es la más segura: nada queda expuesto a Internet.

### Paso común: preparar el servidor Debian
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo git clone https://github.com/esquivelp775-code/panel-vida /opt/panel-vida
cd /opt/panel-vida && sudo git checkout claude/panel-vida-autonomous-mission-zb4856   # o main si ya se fusionó
sudo tee .env >/dev/null <<X
POSTGRES_PASSWORD=$(openssl rand -hex 24)
PANEL_SECRET_KEY=$(openssl rand -hex 32)
PANEL_CORS_ORIGINS=https://AQUI-TU-ORIGEN        # ver cada opción
X
sudo chmod 600 .env
```

### Opción A — Debian + Tailscale (privada)
1. Instala Tailscale en el servidor y en tu teléfono (`curl -fsSL https://tailscale.com/install.sh | sh`,
   luego `sudo tailscale up`).
2. En `.env`: `PANEL_CORS_ORIGINS=https://<servidor>.<tu-tailnet>.ts.net`.
3. Compila el frontend apuntando al mismo origen y levanta todo:
   ```bash
   cd frontend && npm ci && NEXT_PUBLIC_API_URL=https://<servidor>.<tu-tailnet>.ts.net npm run build && cd ..
   sudo docker compose up -d --build
   sudo tailscale serve --bg 8080        # HTTPS con certificado válido dentro de tu tailnet
   ```
4. Crea tu usuario: `sudo docker compose exec api python -m app.cli create-user --email TU@CORREO`
   (pide la contraseña sin mostrarla; mínimo 10 caracteres).
5. En el teléfono abre `https://<servidor>.<tu-tailnet>.ts.net` → menú del navegador → "Agregar a la
   pantalla de inicio" (PWA).

### Opción B — Netlify (frontend) + API en casa
1. En Cloudflare Zero Trust → Networks → Tunnels: crea un túnel, copia el token y añade un *Public
   hostname* `api.tudominio.com` → `http://web:80`.
2. En `.env`: `CLOUDFLARE_TUNNEL_TOKEN=...` y `PANEL_CORS_ORIGINS=https://<tu-sitio>.netlify.app`.
3. `sudo docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`
   (nginx también sirve el frontend local; no estorba).
4. Netlify → *Add new site* → *Import from GitHub* → repositorio `panel-vida`, rama
   `claude/panel-vida-autonomous-mission-zb4856` (o `main`). `netlify.toml` ya define base, comando y carpeta.
   Variable de entorno: `NEXT_PUBLIC_API_URL=https://api.tudominio.com`. Despliega.
5. Ajusta la CSP de `netlify.toml` (`connect-src`) a `https://api.tudominio.com` y crea el usuario como en A.4.

### Opción C — todo por Cloudflare Tunnel
Como B, pero el *Public hostname* `panel.tudominio.com` → `http://web:80`, frontend compilado con
`NEXT_PUBLIC_API_URL=https://panel.tudominio.com` y `PANEL_CORS_ORIGINS=https://panel.tudominio.com`.

## Respaldo diario cifrado (todas las opciones)
```bash
sudo sh -c 'openssl rand -base64 32 > /root/.panel-backup-pass && chmod 600 /root/.panel-backup-pass'
sudo cat /root/.panel-backup-pass      # GUÁRDALA en tu gestor de contraseñas: sin ella no hay restauración
sudo cp deploy/systemd/panel-backup.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now panel-backup.timer
sudo systemctl start panel-backup.service && journalctl -u panel-backup.service -n 5   # prueba inmediata
```
* `deploy/backup.sh`: `pg_dump` → cifrado AES‑256 (gpg) → verificación (descifra y lista el contenido) →
  borra respaldos de más de 30 días. Copia `/var/backups/panel-vida` a otro disco o a la nube (cifrado ya).
* `deploy/restore.sh archivo.dump.gpg base_nueva`: restaura en una base **nueva**; nunca sobre `panel_vida`.
* Probado: en esta sesión (local) y en cada CI (compose), comparando entradas entre original y restaurada.

## Actualizar a una versión nueva
```bash
cd /opt/panel-vida && sudo deploy/backup.sh   # (con PANEL_BACKUP_PASSFILE) respaldo antes de actualizar
sudo git pull && (cd frontend && npm ci && NEXT_PUBLIC_API_URL=... npm run build)
sudo docker compose up -d --build              # la API aplica migraciones al arrancar (son aditivas)
curl -s https://<tu-origen>/api/v1/health
```

## Verificado
* CI (GitHub Actions, trabajo `stack`): `docker compose up --build`, usuario y datos ficticios, E2E en
  Chromium a través de nginx, `pg_dump`/`pg_restore`, y `deploy/backup.sh` + `deploy/restore.sh` cifrados.
* Local: API + PostgreSQL 16, pruebas de backend, frontend en Chromium a 360 px; respaldo cifrado,
  frase incorrecta rechazada, restauración con las mismas entradas.
* **No verificado:** Netlify, Tailscale y Cloudflare Tunnel (requieren tus cuentas).
