/** Reparto de meses sin intereses en centavos enteros (FINANCIAL_RULES §4b). */

export const MSI_OPTIONS = [3, 6, 9, 12, 18, 24];

export interface InstallmentSplit { base: number; extra: number; first: number; rest: number }

/** total // n por mensualidad; las primeras (total % n) llevan +1 centavo. */
export function splitInstallments(totalCents: number, n: number): InstallmentSplit | null {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return null;
  if (!Number.isInteger(n) || n < 2 || n > 60) return null;
  const base = Math.floor(totalCents / n);
  const extra = totalCents % n;
  return { base, extra, first: extra > 0 ? base + 1 : base, rest: base };
}
