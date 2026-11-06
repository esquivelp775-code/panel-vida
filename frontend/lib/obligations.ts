/* Reglas de la pantalla de vencimientos: qué cuentas tienen sentido para cada tipo de obligación. */
type Acc = { subtype: string; account_class: string };

export const KIND_ES: Record<string, string> = {
  bill: "Recibo / servicio", loan_installment: "Cuota de préstamo", card_payment: "Pago de tarjeta",
  savings: "Aportación (tanda o ahorro)", income_expected: "Ingreso esperado", other: "Otro",
};

/** Cuentas válidas como destino del pago; lista vacía si ese tipo no tiene destino. */
export function obligationTargets<T extends Acc>(kind: string, accounts: T[]): T[] {
  if (kind === "card_payment") return accounts.filter((a) => a.subtype === "credit_card");
  if (kind === "loan_installment") return accounts.filter((a) => a.subtype === "loan" || a.subtype === "other_liability");
  if (kind === "savings") return accounts.filter((a) => a.account_class === "asset");
  return [];
}

/** Cuentas con las que se puede liquidar: un recibo también se paga con tarjeta; una deuda, sólo con dinero. */
export function settleAccounts<T extends Acc>(kind: string, accounts: T[]): T[] {
  const withCard = kind === "bill" || kind === "other";
  const order = ["checking", "cash", "savings", "credit_card", "investment"];
  return accounts.filter((a) => a.account_class === "asset" || (withCard && a.subtype === "credit_card"))
    .map((a, i) => ({ a, i })).sort((x, y) => order.indexOf(x.a.subtype) - order.indexOf(y.a.subtype) || x.i - y.i).map((x) => x.a);
}
