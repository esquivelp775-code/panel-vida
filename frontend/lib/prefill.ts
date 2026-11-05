/**
 * Reconstruye los campos del formulario de Registrar a partir de los asientos
 * de una transacción (para "Corregir"). Convención: débito positivo.
 * Devuelve null cuando no se puede derivar de forma fiable.
 */
import type { Entry } from "./api";

export type PrefillMode = "expense" | "income" | "transfer" | "card_payment" | "loan_payment" | "refund";
export interface Prefill {
  mode: PrefillMode;
  amountCents: number; // monto principal (capital en loan_payment)
  accountId?: number;  // cuenta/tarjeta (gasto, ingreso, devolución)
  categoryId?: number;
  fromId?: number;     // origen (transfer, card_payment, loan_payment)
  toId?: number;       // destino (transfer, card_payment=tarjeta, loan_payment=préstamo)
  interestCents?: number;
  interestCategoryId?: number;
}

export const CORRECTABLE_KINDS = ["income", "expense", "card_purchase", "transfer", "card_payment", "loan_payment", "refund"];

const isMoney = (e: Entry) => e.account_class === "asset" || e.account_class === "liability";

export function prefillFromEntries(kind: string, entries: Entry[]): Prefill | null {
  if (!CORRECTABLE_KINDS.includes(kind)) return null;
  const pos = entries.filter((e) => e.amount_cents > 0);
  const neg = entries.filter((e) => e.amount_cents < 0);
  if (entries.some((e) => e.amount_cents === 0)) return null;

  if (kind === "loan_payment") {
    if (neg.length !== 1 || !isMoney(neg[0]) || neg[0].account_class !== "asset") return null;
    const loans = pos.filter((e) => e.account_class === "liability");
    const exps = pos.filter((e) => e.account_class === "expense");
    if (loans.length !== 1 || exps.length > 1 || loans.length + exps.length !== pos.length) return null;
    const interest = exps[0]?.amount_cents ?? 0;
    if (neg[0].amount_cents !== -(loans[0].amount_cents + interest)) return null;
    return {
      mode: "loan_payment", amountCents: loans[0].amount_cents, fromId: neg[0].account_id, toId: loans[0].account_id,
      ...(exps[0] ? { interestCents: interest, interestCategoryId: exps[0].account_id } : {}),
    };
  }

  if (pos.length !== 1 || neg.length !== 1) return null;
  const p = pos[0], n = neg[0];
  if (p.amount_cents !== -n.amount_cents) return null;
  const amountCents = p.amount_cents;

  switch (kind) {
    case "income":
      if (p.account_class !== "asset" || n.account_class !== "income") return null;
      return { mode: "income", amountCents, accountId: p.account_id, categoryId: n.account_id };
    case "expense":
    case "card_purchase":
      if (p.account_class !== "expense" || !isMoney(n)) return null;
      return { mode: "expense", amountCents, accountId: n.account_id, categoryId: p.account_id };
    case "refund":
      if (n.account_class !== "expense" || !isMoney(p)) return null;
      return { mode: "refund", amountCents, accountId: p.account_id, categoryId: n.account_id };
    case "transfer":
      if (!isMoney(p) || !isMoney(n)) return null;
      return { mode: "transfer", amountCents, fromId: n.account_id, toId: p.account_id };
    case "card_payment":
      if (n.account_class !== "asset" || p.account_class !== "liability") return null;
      return { mode: "card_payment", amountCents, fromId: n.account_id, toId: p.account_id };
  }
  return null;
}
