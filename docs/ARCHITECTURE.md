# Arquitectura — Panel de Vida

Prioridad rectora: **integridad financiera > seguridad > funcionalidad > portabilidad > experiencia visual**.

## Vista general

```
 Teléfono / navegador
        │  HTTPS (JSON, Bearer token)
        ▼
 ┌──────────────────────┐        ┌───────────────────────────┐
 │ Frontend (Next.js)   │        │ Backend (FastAPI)          │
 │ export estático, PWA │ ─────► │ /api/v1/*                  │
 │ Netlify (o nginx)    │  CORS  │ reglas financieras, auth   │
 └──────────────────────┘        └────────────┬──────────────┘
                                              │ SQLAlchemy + psycopg 3
                                              ▼
                                  ┌───────────────────────────┐
                                  │ PostgreSQL 16              │
                                  │ libro mayor de doble       │
                                  │ partida + triggers de      │
                                  │ integridad (Alembic)       │
                                  └───────────────────────────┘
```

* El navegador **nunca** habla con PostgreSQL. Todo pasa por la API.
* El frontend es un export estático (`next build` con `output: "export"`): se puede servir desde
  Netlify hoy y desde nginx en un servidor Debian mañana, sin cambios.
* El backend es un contenedor Docker sin dependencias de proveedor cloud. Configuración 100 % por
  variables de entorno (`PANEL_*`).

## Decisiones clave (ver `DECISIONS.md`)

1. **Libro mayor de doble partida.** Cada operación es una `transaction` con ≥ 2 `entries`
   cuya suma es exactamente 0. Categorías de ingreso/gasto son cuentas nominales. Los saldos
   **no se almacenan**: se calculan como `SUM(entries.amount_cents)`. No hay saldos cacheados que
   puedan desincronizarse.
2. **Centavos enteros** (`BIGINT`) en toda la cadena: BD, API (`*_cents`) y frontend. El frontend
   formatea; nunca usa floats para aritmética.
3. **Inmutabilidad.** Las entradas no se actualizan ni se borran (trigger). Una corrección es una
   *reversión* (transacción espejo) más una nueva transacción. El original queda marcado como
   anulado y enlazado.
4. **Idempotencia** por cabecera `Idempotency-Key` en la creación de transacciones.
5. **Clasificación en servidor.** El cliente pide "gasto con tarjeta X"; el servidor decide que es
   `card_purchase`. Las reglas no dependen del frontend.

## Estructura del repositorio

```
backend/            FastAPI + SQLAlchemy + Alembic
  app/
    main.py         app, CORS, routers
    config.py       settings (pydantic-settings, prefijo PANEL_)
    db.py           engine / sesiones
    models.py       ORM
    schemas.py      contratos Pydantic de la API
    security.py     hash de contraseñas (scrypt) y JWT
    ledger.py       NÚCLEO: construcción y validación de asientos
    reports.py      saldos, dashboard, flujo, proyecciones, vencimientos
    routers/        endpoints por recurso
    cli.py          crear usuario, seed ficticio
  alembic/          migraciones versionadas
  tests/            pytest contra PostgreSQL real
frontend/           Next.js + TypeScript + Tailwind (PWA)
docs/               documentación
.claude/agents/     equipo de agentes
```

## Contrato de la API v1

Base: `${API_URL}/api/v1`. JSON. Todas las rutas salvo `/health` y `/auth/login` requieren
`Authorization: Bearer <token>`. Errores: `{"detail": "mensaje legible en español"}` con 4xx.
Fechas `YYYY-MM-DD`. Montos: enteros en centavos, siempre **positivos** en la entrada salvo
`adjustment.delta_cents`.

### Auth
| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/health` | – | `{"status":"ok"}` |
| POST | `/auth/login` | `{email, password}` | `{access_token, token_type:"bearer", expires_at}` |
| GET | `/auth/me` | – | `{id, email, display_name, currency}` |

### Cuentas (`/accounts`)
`Account` = `{id, name, account_class, subtype, currency, credit_limit_cents, statement_day,
due_day, interest_rate_bps, is_system, archived_at, balance_cents, created_at}`

* `account_class`: `asset | liability | income | expense | equity`
* `subtype`: `cash | checking | savings | investment` (asset) · `credit_card | loan | other_liability`
  (liability) · `income` · `expense` · `equity`
* `balance_cents`: perspectiva natural de la cuenta — activos: dinero que tienes; pasivos:
  **lo que debes (positivo)**; ingresos/gastos: total acumulado (positivo).

| Método | Ruta | Notas |
|---|---|---|
| GET | `/accounts?account_class=&include_archived=false` | lista con saldo |
| POST | `/accounts` | `{name, subtype, currency?, opening_balance_cents?, opening_date?, credit_limit_cents?, statement_day?, due_day?, interest_rate_bps?}` — saldo inicial genera transacción `opening_balance` |
| GET | `/accounts/{id}` | |
| PATCH | `/accounts/{id}` | `{name?, credit_limit_cents?, statement_day?, due_day?, interest_rate_bps?}` (no cambia tipo ni saldo) |
| POST | `/accounts/{id}/archive` | sólo si saldo = 0 (activos/pasivos) |
| GET | `/accounts/{id}/installments` | planes MSI vigentes: `[{plan_id, transaction_id, description, purchased_on, total_cents, months, installment_cents, billed_count, remaining_cents, next_closing}]` |
| POST | `/accounts/{id}/reconcile` | `{statement_balance_cents, as_of, create_adjustment:false}` → `{ledger_balance_cents, statement_balance_cents, difference_cents, adjustment_transaction_id}` |

Categorías = cuentas con `subtype` `income` o `expense` (se crean igual con `POST /accounts`).

### Transacciones (`/transactions`)
`POST /transactions` con cabecera opcional `Idempotency-Key`. Cuerpo discriminado por `kind`:

| kind | campos (además de `occurred_on`, `description`, `notes?`) |
|---|---|
| `income` | `account_id` (activo), `category_id` (income), `amount_cents` |
| `expense` | `account_id` (activo **o tarjeta**), `category_id` (expense), `amount_cents`, `installments?` (2–60, sólo tarjeta) → si la cuenta es tarjeta se guarda como `card_purchase` |
| `card_purchase` | `card_account_id`, `category_id`, `amount_cents`, `installments?` (meses sin intereses, 2–60; la tarjeta debe tener `statement_day`) |
| `refund` | `account_id` (activo o tarjeta), `category_id` (expense), `amount_cents` — devolución: reduce el gasto en su fecha |
| `transfer` | `from_account_id`, `to_account_id`, `amount_cents` → si destino es tarjeta se guarda `card_payment`; si destino es préstamo, `loan_payment` sin interés |
| `card_payment` | `from_account_id` (activo), `card_account_id`, `amount_cents` |
| `loan_payment` | `from_account_id`, `loan_account_id`, `principal_cents`, `interest_cents` (≥0), `interest_category_id?` (requerido si interés > 0) |
| `loan_disbursement` | `loan_account_id`, `to_account_id`, `amount_cents` |
| `adjustment` | `account_id`, `delta_cents` (≠0, con signo en perspectiva natural de la cuenta) |

Respuesta `201` (o `200` si la clave de idempotencia ya existía con el mismo cuerpo; `409` si
existía con otro cuerpo):

`Transaction` = `{id, kind, occurred_on, description, notes, created_at, voided_at, void_reason,
reverses_id, reversed_by_id, entries:[{account_id, account_name, account_class, amount_cents}],
amount_cents}` — `amount_cents` es el importe principal positivo de la operación.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/transactions?account_id=&kind=&date_from=&date_to=&q=&include_voided=true&limit=50&offset=0` | `{items, total}` orden `occurred_on desc, id desc` |
| GET | `/transactions/{id}` | |
| POST | `/transactions/{id}/void` | `{reason}` → crea reversión; responde la reversión |

### Obligaciones y vencimientos
`Obligation` = `{id, name, kind, direction, amount_cents, due_date, recurrence, status,
pay_from_account_id, target_account_id, category_id, settled_transaction_id, created_at}`

* `kind`: `bill | loan_installment | card_payment | income_expected | other`
* `direction`: `outflow | inflow` · `recurrence`: `none | monthly | yearly`
* `status`: `pending | paid | cancelled`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/obligations?status=pending` | |
| POST | `/obligations` | |
| PATCH | `/obligations/{id}` | campos editables mientras `pending` |
| POST | `/obligations/{id}/settle` | `{account_id?, amount_cents?, occurred_on?}` → crea la transacción correspondiente, marca `paid` y genera la siguiente si es recurrente |
| POST | `/obligations/{id}/skip` | omite sólo esta repetición (queda `cancelled`) y responde la siguiente de la serie; 422 si no es recurrente |
| POST | `/obligations/{id}/cancel` | termina la obligación (y la serie) |
| GET | `/upcoming?days=30` | obligaciones pendientes + pagos de tarjeta calculados: `[{source:"obligation"\|"card", ref_id, name, due_date, amount_cents, direction, overdue}]` |

### Presupuestos
| GET | `/budgets?month=YYYY-MM` | `[{id, category_id, category_name, month, amount_cents, spent_cents, remaining_cents}]` |
|---|---|---|
| PUT | `/budgets` | `{category_id, month:"YYYY-MM", amount_cents}` (upsert) |
| DELETE | `/budgets/{id}` | un presupuesto es un plan, no un dato financiero: se puede borrar |

### Reportes
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/dashboard` | `{available_cents, total_debt_cents, net_worth_cents, month:{income_cents, expense_cents, net_cents}, cards:[{id,name,owed_cents,credit_limit_cents,available_credit_cents,next_due_date,statement_due_cents,overdue,deferred_cents}], upcoming:[…≤10], accounts:[Account…activos]}` |
| GET | `/reports/cashflow?date_from&date_to` | `{months:[{month:"YYYY-MM", income_cents, expense_cents, net_cents, liquid_change_cents}], totals:{…}}` |
| GET | `/reports/by-category?date_from&date_to&account_class=expense` | `[{category_id, name, total_cents}]` |
| GET | `/reports/projection?days=90` | `{starting_available_cents, points:[{date, event, amount_cents, balance_cents}], min_balance_cents, min_balance_date}` |
| GET | `/reports/integrity` | `{ok, unbalanced_transactions:[], voided_without_reversal:[], archived_with_balance:[], ledger_sum_cents, checked_transactions}` |
| GET | `/export/transactions.csv?date_from&date_to` | CSV UTF‑8 |
| GET | `/export/full.json` | respaldo completo (cuentas, transacciones, entradas, obligaciones, presupuestos) |
