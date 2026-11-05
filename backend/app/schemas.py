"""Contratos Pydantic de la API v1. Montos: enteros en centavos (StrictInt: se rechazan floats)."""
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_CENTS = 1_000_000_000_000
Cents = Annotated[int, Field(strict=True, gt=0, le=MAX_CENTS)]
NonNegCents = Annotated[int, Field(strict=True, ge=0, le=MAX_CENTS)]
SignedCents = Annotated[int, Field(strict=True, ge=-MAX_CENTS, le=MAX_CENTS)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Day = Annotated[int, Field(strict=True, ge=1, le=31)]
Id = Annotated[int, Field(strict=True, gt=0)]
Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ auth
class LoginIn(Strict):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str | None
    currency: str


class ProfileUpdate(Strict):
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None


class PasswordChange(Strict):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=256)]
    new_password: Annotated[str, StringConstraints(max_length=256)]


# ------------------------------------------------------------------ accounts
Subtype = Literal[
    "cash", "checking", "savings", "investment", "credit_card", "loan", "other_liability", "income", "expense"
]


class AccountCreate(Strict):
    name: Name
    subtype: Subtype
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")] | None = None
    opening_balance_cents: NonNegCents = 0
    opening_date: date | None = None
    credit_limit_cents: NonNegCents | None = None
    statement_day: Day | None = None
    due_day: Day | None = None
    interest_rate_bps: Annotated[int, Field(strict=True, ge=0, le=100_000)] | None = None


class AccountUpdate(Strict):
    name: Name | None = None
    credit_limit_cents: NonNegCents | None = None
    statement_day: Day | None = None
    due_day: Day | None = None
    interest_rate_bps: Annotated[int, Field(strict=True, ge=0, le=100_000)] | None = None


class AccountOut(BaseModel):
    id: int
    name: str
    account_class: str
    subtype: str
    currency: str
    credit_limit_cents: int | None
    statement_day: int | None
    due_day: int | None
    interest_rate_bps: int | None
    is_system: bool
    archived_at: datetime | None
    balance_cents: int
    created_at: datetime


class ReconcileIn(Strict):
    statement_balance_cents: SignedCents
    as_of: date
    create_adjustment: bool = False


class ReconcileOut(BaseModel):
    account_id: int
    as_of: date
    ledger_balance_cents: int
    statement_balance_cents: int
    difference_cents: int
    adjustment_transaction_id: int | None


# ------------------------------------------------------------------ transactions
class _TxBase(Strict):
    occurred_on: date
    description: Description = ""
    notes: Notes | None = None


class IncomeIn(_TxBase):
    kind: Literal["income"]
    account_id: Id
    category_id: Id
    amount_cents: Cents


Installments = Annotated[int, Field(strict=True, ge=2, le=60)]


class ExpenseIn(_TxBase):
    kind: Literal["expense"]
    account_id: Id
    category_id: Id
    amount_cents: Cents
    installments: Installments | None = None  # meses sin intereses; sólo con tarjeta


class CardPurchaseIn(_TxBase):
    kind: Literal["card_purchase"]
    card_account_id: Id
    category_id: Id
    amount_cents: Cents
    installments: Installments | None = None  # meses sin intereses


class RefundIn(_TxBase):
    """Devolución de una compra: reduce el gasto de la categoría en la fecha de la devolución."""
    kind: Literal["refund"]
    account_id: Id
    category_id: Id
    amount_cents: Cents


class TransferIn(_TxBase):
    kind: Literal["transfer"]
    from_account_id: Id
    to_account_id: Id
    amount_cents: Cents


class CardPaymentIn(_TxBase):
    kind: Literal["card_payment"]
    from_account_id: Id
    card_account_id: Id
    amount_cents: Cents


class LoanPaymentIn(_TxBase):
    kind: Literal["loan_payment"]
    from_account_id: Id
    loan_account_id: Id
    principal_cents: NonNegCents
    interest_cents: NonNegCents = 0
    interest_category_id: Id | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.principal_cents + self.interest_cents <= 0:
            raise ValueError("El pago debe tener capital o interés mayor a cero")
        if self.interest_cents > 0 and self.interest_category_id is None:
            raise ValueError("Indica la categoría de gasto para los intereses")
        return self


class LoanDisbursementIn(_TxBase):
    kind: Literal["loan_disbursement"]
    loan_account_id: Id
    to_account_id: Id
    amount_cents: Cents


class AdjustmentIn(_TxBase):
    kind: Literal["adjustment"]
    account_id: Id
    delta_cents: SignedCents

    @model_validator(mode="after")
    def _nonzero(self):
        if self.delta_cents == 0:
            raise ValueError("El ajuste no puede ser cero")
        return self


TransactionIn = Annotated[
    IncomeIn | ExpenseIn | CardPurchaseIn | RefundIn | TransferIn | CardPaymentIn | LoanPaymentIn | LoanDisbursementIn
    | AdjustmentIn,
    Field(discriminator="kind"),
]


class EntryOut(BaseModel):
    account_id: int
    account_name: str
    account_class: str
    amount_cents: int


class TransactionOut(BaseModel):
    id: int
    kind: str
    occurred_on: date
    description: str
    notes: str | None
    created_at: datetime
    voided_at: datetime | None
    void_reason: str | None
    reverses_id: int | None
    reversed_by_id: int | None
    amount_cents: int
    entries: list[EntryOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


class VoidIn(Strict):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


# ------------------------------------------------------------------ obligations
class ObligationCreate(Strict):
    name: Name
    kind: Literal["bill", "loan_installment", "card_payment", "income_expected", "other", "savings"]
    amount_cents: Cents
    due_date: date
    recurrence: Literal["none", "monthly", "yearly"] = "none"
    pay_from_account_id: Id | None = None
    target_account_id: Id | None = None
    category_id: Id | None = None


class ObligationUpdate(Strict):
    name: Name | None = None
    amount_cents: Cents | None = None
    due_date: date | None = None
    recurrence: Literal["none", "monthly", "yearly"] | None = None
    pay_from_account_id: Id | None = None
    target_account_id: Id | None = None
    category_id: Id | None = None


class ObligationSettle(Strict):
    account_id: Id | None = None
    amount_cents: Cents | None = None
    interest_cents: NonNegCents = 0
    interest_category_id: Id | None = None
    occurred_on: date | None = None


class ObligationOut(BaseModel):
    id: int
    name: str
    kind: str
    direction: str
    amount_cents: int
    due_date: date
    recurrence: str
    status: str
    pay_from_account_id: int | None
    target_account_id: int | None
    category_id: int | None
    settled_transaction_id: int | None
    created_at: datetime


class UpcomingItem(BaseModel):
    source: Literal["obligation", "card"]
    ref_id: int
    name: str
    due_date: date
    amount_cents: int
    direction: Literal["outflow", "inflow"]
    overdue: bool


# ------------------------------------------------------------------ budgets
class BudgetIn(Strict):
    category_id: Id
    month: Month
    amount_cents: Cents


class BudgetOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    month: str
    amount_cents: int
    spent_cents: int
    remaining_cents: int


# ------------------------------------------------------------------ importación
class ImportPreviewIn(Strict):
    account_id: Id
    csv_text: Annotated[str, StringConstraints(min_length=1, max_length=1_000_000)]
    # None = automático: en tarjetas los montos positivos son cargos; en cuentas, los negativos son retiros.
    positive_is_outflow: bool | None = None


class ImportRowIn(Strict):
    row: Annotated[int, Field(strict=True, ge=1)]
    fingerprint: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    occurred_on: date
    description: Description = ""
    amount_cents: Cents
    direction: Literal["outflow", "inflow"]
    category_id: Id | None = None
    counter_account_id: Id | None = None


class ImportCommitIn(Strict):
    account_id: Id
    rows: Annotated[list[ImportRowIn], Field(min_length=1, max_length=2000)]


# ------------------------------------------------------------------ vida
Priority = Literal["low", "normal", "high"]
Area = Literal["finanzas", "personal", "trabajo", "casa", "salud", "otro", "ryventis"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class TaskCreate(Strict):
    project_id: Id | None = None
    title: Title
    notes: Notes | None = None
    due_date: date | None = None
    priority: Priority = "normal"
    area: Area = "personal"


class TaskUpdate(Strict):
    project_id: Id | None = None
    status: Literal["pending", "doing", "done"] | None = None
    title: Title | None = None
    notes: Notes | None = None
    due_date: date | None = None
    priority: Priority | None = None
    area: Area | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int | None = None
    title: str
    notes: str | None
    due_date: date | None
    priority: str
    area: str
    status: str
    completed_at: datetime | None
    created_at: datetime


class HabitCreate(Strict):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    emoji: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8)] = "✅"
    target_per_week: Annotated[int, Field(strict=True, ge=1, le=7)] = 7


class HabitUpdate(Strict):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    emoji: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8)] | None = None
    target_per_week: Annotated[int, Field(strict=True, ge=1, le=7)] | None = None


class HabitToggle(Strict):
    day: date | None = None


# ------------------------------------------------------------------ carga inicial
class SetupAccount(Strict):
    name: Name
    subtype: Subtype
    opening_balance_cents: NonNegCents = 0
    opening_date: date | None = None
    credit_limit_cents: NonNegCents | None = None
    statement_day: Day | None = None
    due_day: Day | None = None
    interest_rate_bps: Annotated[int, Field(strict=True, ge=0, le=100_000)] | None = None


class SetupCategory(Strict):
    name: Name
    subtype: Literal["income", "expense"]


class SetupObligation(Strict):
    name: Name
    kind: Literal["bill", "loan_installment", "card_payment", "income_expected", "other", "savings"]
    amount_cents: Cents
    due_date: date
    recurrence: Literal["none", "monthly", "yearly"] = "none"
    pay_from: Name | None = None
    target: Name | None = None
    category: Name | None = None


class SetupTransaction(Strict):
    """Gasto histórico: sale de `account` hacia la categoría de gasto `category`."""
    occurred_on: date
    description: Description
    amount_cents: Cents
    account: Name
    category: Name
    notes: Notes | None = None


class SetupTask(Strict):
    title: Title
    due_date: date | None = None
    area: Area = "finanzas"
    priority: Priority = "normal"
    notes: Notes | None = None


class SetupBulkIn(Strict):
    dry_run: bool = True
    accounts: Annotated[list[SetupAccount], Field(max_length=200)] = []
    categories: Annotated[list[SetupCategory], Field(max_length=200)] = []
    obligations: Annotated[list[SetupObligation], Field(max_length=1000)] = []
    transactions: Annotated[list[SetupTransaction], Field(max_length=2000)] = []
    tasks: Annotated[list[SetupTask], Field(max_length=500)] = []


# ------------------------------------------------------------------ ryventis
Stage = Literal["nuevo", "charla", "propuesta", "cliente", "perdido"]
PStatus = Literal["pendiente", "en_marcha", "terminado", "cancelado"]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class ClientIn(Strict):
    name: Name
    company: Short | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)] | None = None
    stage: Stage = "nuevo"
    source: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    notes: Annotated[str, StringConstraints(max_length=4000)] | None = None
    next_step: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    next_step_date: date | None = None


class ClientPatch(ClientIn):
    name: Name | None = None
    stage: Stage | None = None


class InteractionIn(Strict):
    kind: Literal["mensaje", "llamada", "email", "reunion", "otro"]
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    happened_on: date | None = None


class ProjectIn(Strict):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    client_id: Id | None = None
    amount_cents: NonNegCents = 0
    status: PStatus = "pendiente"
    due_date: date | None = None
    notes: Annotated[str, StringConstraints(max_length=4000)] | None = None


class ProjectPatch(ProjectIn):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)] | None = None
    amount_cents: NonNegCents | None = None
    status: PStatus | None = None


class ReceivableIn(Strict):
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    amount_cents: Cents
    project_id: Id | None = None
    client_id: Id | None = None
    due_date: date | None = None


class ReceivablePatch(Strict):
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    amount_cents: Cents | None = None
    project_id: Id | None = None
    client_id: Id | None = None
    due_date: date | None = None


class CollectIn(Strict):
    account_id: Id
    category_id: Id | None = None
    occurred_on: date | None = None
