"""Modelo ORM. El esquema real lo define la migración Alembic (incluye triggers)."""
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ASSET_SUBTYPES = ("cash", "checking", "savings", "investment")
LIQUID_SUBTYPES = ("cash", "checking", "savings")
LIABILITY_SUBTYPES = ("credit_card", "loan", "other_liability")
SUBTYPE_CLASS = {
    **{s: "asset" for s in ASSET_SUBTYPES},
    **{s: "liability" for s in LIABILITY_SUBTYPES},
    "income": "income",
    "expense": "expense",
    "equity": "equity",
}
TRANSACTION_KINDS = (
    "income",
    "expense",
    "transfer",
    "card_purchase",
    "card_payment",
    "loan_payment",
    "loan_disbursement",
    "adjustment",
    "opening_balance",
    "reversal",
    "refund",
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3), default="MXN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(Text)
    account_class: Mapped[str] = mapped_column(Text)
    subtype: Mapped[str] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3))
    credit_limit_cents: Mapped[int | None] = mapped_column(BigInteger)
    statement_day: Mapped[int | None] = mapped_column(SmallInteger)
    due_day: Mapped[int | None] = mapped_column(SmallInteger)
    interest_rate_bps: Mapped[int | None] = mapped_column(Integer)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(Text)
    occurred_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    request_hash: Mapped[str | None] = mapped_column(Text)
    reverses_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id", ondelete="RESTRICT"), unique=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="transaction", order_by="Entry.id", lazy="selectin"
    )


class Entry(Base):
    __tablename__ = "entries"
    __table_args__ = (CheckConstraint("amount_cents <> 0", name="ck_entries_nonzero"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="RESTRICT"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger)

    transaction: Mapped[Transaction] = relationship(back_populates="entries")
    account: Mapped[Account] = relationship(lazy="joined")


class Obligation(Base):
    __tablename__ = "obligations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    direction: Mapped[str] = mapped_column(Text, default="outflow")
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    due_date: Mapped[date] = mapped_column(Date)
    recurrence: Mapped[str] = mapped_column(Text, default="none")
    status: Mapped[str] = mapped_column(Text, default="pending")
    pay_from_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    target_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    settled_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"))
    anchor_day: Mapped[int | None] = mapped_column(SmallInteger)
    generated_from_id: Mapped[int | None] = mapped_column(ForeignKey("obligations.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("user_id", "category_id", "month", name="uq_budgets_month"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    category_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    month: Mapped[date] = mapped_column(Date)
    amount_cents: Mapped[int] = mapped_column(BigInteger)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
