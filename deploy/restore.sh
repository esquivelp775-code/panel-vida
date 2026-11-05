#!/usr/bin/env bash
# Restaura un respaldo cifrado en una base NUEVA (nunca sobrescribe panel_vida).
# Uso: PANEL_BACKUP_PASSFILE=... deploy/restore.sh respaldos/panel_vida_FECHA.dump.gpg panel_vida_restaurada
# Después: comparar `GET /api/v1/reports/integrity` y saldos; cambiar a la base restaurada es una decisión manual.
set -euo pipefail
FILE="${1:?archivo .dump.gpg}"
TARGET="${2:?nombre de la base destino (nueva)}"
PASS="${PANEL_BACKUP_PASSFILE:?define PANEL_BACKUP_PASSFILE}"
MODE="${PANEL_BACKUP_MODE:-compose}"
[ "$TARGET" != "panel_vida" ] || { echo "Por seguridad no se restaura sobre panel_vida" >&2; exit 1; }
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS" --decrypt "$FILE" > "$TMP"
if [ "$MODE" = "compose" ]; then
  docker compose exec -T db createdb -U panel "$TARGET"
  docker compose exec -T db pg_restore -U panel -d "$TARGET" --no-owner < "$TMP"
else
  createdb "$TARGET"
  pg_restore -d "$TARGET" --no-owner "$TMP"
fi
echo "Restaurado en $TARGET"
