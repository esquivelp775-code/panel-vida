# Migraciones y portabilidad

## Reglas
1. El esquema cambia sólo con migraciones Alembic nuevas (`backend/migrations/versions/NNNN_*.py`).
2. Nunca editar una migración ya aplicada en algún entorno.
3. Migraciones **aditivas** por defecto (añadir columnas nullable, tablas, índices). Un cambio destructivo
   (borrar/renombrar columnas con datos) requiere: respaldo verificado, migración en dos pasos y
   autorización explícita del propietario.
4. Las tablas financieras son inmutables por trigger. Una migración que necesite tocar entradas
   históricas debe desactivar el trigger explícitamente dentro de la migración, justificarlo en
   DECISIONS.md y verificar `GET /reports/integrity` después.
5. Toda migración debe probar `upgrade head` → `downgrade base` → `upgrade head` en una BD limpia (las
   pruebas lo hacen en cada ejecución).

## Comandos
```bash
cd backend
alembic revision -m "descripcion"     # crear (escribir SQL/ops a mano)
alembic upgrade head                  # aplicar
alembic downgrade -1                  # revertir la última (sólo dev/test)
alembic upgrade head --sql            # ver el SQL sin ejecutar
```

## Mover de un servidor a otro (p. ej. cloud → Debian doméstico)
1. `pg_dump -Fc -h ORIGEN -U panel panel_vida > panel_vida.dump`
2. En destino: `docker compose up -d db`, luego
   `docker compose exec -T db pg_restore -U panel -d panel_vida --clean --if-exists < panel_vida.dump`
3. `docker compose up -d` (la API ejecuta `alembic upgrade head` al arrancar).
4. Verificar `GET /api/v1/reports/integrity` → `"ok": true` y comparar saldos con el origen.
