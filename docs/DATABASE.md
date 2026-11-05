# Base de datos — Panel de Vida

PostgreSQL 16. Esquema gestionado **sólo** por Alembic (`backend/alembic/versions`).
Nunca editar una migración ya aplicada: crear una nueva.

## Modelo entidad-relación

```
users 1───* accounts 1───* entries *───1 transactions *───1 users
                │                             │  ▲
                │                             │  └── reverses_id (0..1, reversión)
                ├──* budgets (cuentas expense)│
                └──* obligations ─────────────┘ settled_transaction_id
users 1───* audit_log
```

### `users`
| columna | tipo | notas |
|---|---|---|
| id | bigint identity PK | |
| email | text unique not null | |
| password_hash | text not null | scrypt |
| display_name | text | |
| currency | char(3) default `MXN` | moneda base |
| created_at | timestamptz | |

### `accounts`
Activos, pasivos, categorías de ingreso/gasto y cuentas de capital del sistema.

| columna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| user_id | FK users | |
| name | text | unique `(user_id, account_class, lower(name))` |
| account_class | text CHECK | `asset, liability, income, expense, equity` |
| subtype | text CHECK | coherente con la clase (CHECK compuesto) |
| currency | char(3) | |
| credit_limit_cents | bigint ≥0 null | sólo `credit_card` |
| statement_day, due_day | smallint 1..31 null | sólo `credit_card` |
| interest_rate_bps | int ≥0 null | informativo |
| is_system | bool | capital: saldos iniciales y ajustes |
| archived_at | timestamptz null | baja lógica |
| created_at | timestamptz | |

### `transactions`
| columna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| user_id | FK | |
| kind | text CHECK | `income, expense, transfer, card_purchase, card_payment, loan_payment, loan_disbursement, adjustment, opening_balance, reversal` |
| occurred_on | date | |
| description | text not null | |
| notes | text null | |
| idempotency_key | text null | unique `(user_id, idempotency_key)` |
| request_hash | text null | sha256 del cuerpo canónico |
| reverses_id | FK transactions unique null | CHECK `kind='reversal' ⇔ reverses_id not null` |
| voided_at, void_reason | null | sólo se fijan una vez |
| created_at | timestamptz | |

### `entries`
| columna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| transaction_id | FK RESTRICT | |
| account_id | FK RESTRICT | |
| amount_cents | bigint CHECK ≠ 0 | débito positivo |

Índices: `(account_id)`, `(transaction_id)`; `transactions (user_id, occurred_on desc, id desc)`.

### Migración 0002
`transactions.kind` admite `refund`; `obligations.anchor_day` (día ancla de recurrencia) y
`obligations.generated_from_id` (enlace único a la obligación que la generó).

### Migración 0003 — `installment_plans`
| columna | tipo | notas |
|---|---|---|
| transaction_id | FK unique | la compra con tarjeta |
| card_account_id | FK | |
| total_cents | bigint > 0 | ≥ months |
| months | smallint 2..60 | |
| first_closing | date | primer corte que factura |

Trigger `trg_installment_plans_immutable` (función genérica `fn_immutable_row`) bloquea UPDATE/DELETE.

### Migraciones 0004 y 0005
* 0004: `fn_transactions_guard_update` también impide anular una reversión (antes sólo Python).
* 0005: `trg_installment_plan_consistent` — al crear un plan MSI, la transacción debe ser una
  `card_purchase` del mismo usuario con una entrada de esa tarjeta por `-total_cents`.

### `obligations`, `budgets`, `audit_log`
Ver `backend/app/models.py`. `budgets` único por `(user_id, category_id, month)`.

## Triggers de integridad

| Trigger | Tabla | Efecto |
|---|---|---|
| `trg_entries_balanced` | entries (constraint, DEFERRABLE INITIALLY DEFERRED) | al hacer COMMIT, cada transacción tocada debe sumar 0, tener ≥2 entradas, una sola moneda y cuentas del mismo usuario |
| `trg_entries_immutable` | entries BEFORE UPDATE/DELETE | lanza excepción |
| `trg_transactions_no_delete` | transactions BEFORE DELETE | lanza excepción |
| `trg_transactions_guard_update` | transactions BEFORE UPDATE | sólo permite fijar `voided_at`/`void_reason` cuando eran NULL |
| `trg_transactions_has_entries` | transactions (constraint, diferido) | una transacción sin entradas no puede confirmarse |

`TRUNCATE` (usado sólo por las pruebas sobre la BD de test) no dispara triggers de fila.

## Respaldo y restauración

* `pg_dump -Fc panel_vida > panel_vida_$(date +%F).dump`
* `pg_restore -d panel_vida_nuevo panel_vida_YYYY-MM-DD.dump`
* Exportación lógica independiente: `GET /api/v1/export/full.json`.
