#!/usr/bin/env bash
# Respaldo cifrado de Panel de Vida (pg_dump -Fc → gpg AES-256) con verificación y retención.
#
# Uso (servidor Debian, desde la raíz del repositorio):
#   PANEL_BACKUP_PASSFILE=/root/.panel-backup-pass deploy/backup.sh
# Variables:
#   PANEL_BACKUP_DIR       destino (por defecto ./respaldos)        — idealmente otro disco o montado remoto
#   PANEL_BACKUP_PASSFILE  archivo con la frase de cifrado (chmod 600). OBLIGATORIO. Guárdala fuera del servidor.
#   PANEL_BACKUP_KEEP_DAYS días a conservar (por defecto 30)
#   PANEL_BACKUP_MODE      compose (por defecto: usa el contenedor db) | local (usa pg_dump y PANEL_PG_URL)
#   PANEL_PG_URL           sólo en modo local, p. ej. postgresql://panel:xxx@localhost:5432/panel_vida
set -euo pipefail

DIR="${PANEL_BACKUP_DIR:-./respaldos}"
PASS="${PANEL_BACKUP_PASSFILE:?define PANEL_BACKUP_PASSFILE (archivo con la frase de cifrado)}"
KEEP="${PANEL_BACKUP_KEEP_DAYS:-30}"
MODE="${PANEL_BACKUP_MODE:-compose}"
[ -r "$PASS" ] || { echo "No se puede leer $PASS" >&2; exit 1; }
[ "$(stat -c %a "$PASS")" = "600" ] || echo "AVISO: $PASS debería tener permisos 600" >&2

mkdir -p "$DIR"
umask 077
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DIR/panel_vida_$STAMP.dump.gpg"
TMP="$(mktemp)"
trap 'rm -f "$TMP" "$TMP.check"' EXIT

if [ "$MODE" = "compose" ]; then
  docker compose exec -T db pg_dump -Fc -U panel panel_vida > "$TMP"
else
  pg_dump -Fc "${PANEL_PG_URL:?define PANEL_PG_URL en modo local}" > "$TMP"
fi

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS" \
    --symmetric --cipher-algo AES256 --output "$OUT" "$TMP"

# Verificación: descifrar y listar el contenido del dump (no restaura nada).
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS" --decrypt "$OUT" > "$TMP.check"
if [ "$MODE" = "compose" ]; then
  LIST=$(docker compose exec -T db pg_restore --list < "$TMP.check")
else
  LIST=$(pg_restore --list "$TMP.check")
fi
ITEMS=$(printf '%s\n' "$LIST" | grep -c "TABLE DATA" || true)
[ "$ITEMS" -ge 1 ] || { echo "ERROR: el respaldo no contiene datos de tablas" >&2; rm -f "$OUT"; exit 1; }

find "$DIR" -name 'panel_vida_*.dump.gpg' -type f -mtime +"$KEEP" -delete
echo "Respaldo OK: $OUT ($(du -h "$OUT" | cut -f1), $ITEMS tablas con datos)"
