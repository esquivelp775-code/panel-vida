/**
 * Dinero: todo son centavos enteros. Nunca se hace aritmética con floats.
 */

const MAX_CENTS = 1_000_000_000_000; // tope del servidor (FINANCIAL_RULES §3)

/**
 * Convierte texto del usuario ("1,234.56", "1234.5", "1234") a centavos enteros
 * sin usar aritmética de punto flotante. Devuelve null si es inválido,
 * negativo, cero, con más de 2 decimales o excede el tope.
 * Separador de miles: coma (con grupos de 3). Decimal: punto.
 */
export function parseToCents(input: string): number | null {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^\$/, "").replace(/\s/g, "");
  if (s === "") return null;
  const parts = s.split(".");
  if (parts.length > 2) return null;
  let intPart = parts[0];
  const decPart = parts.length === 2 ? parts[1] : "";
  if (decPart.length > 2) return null;
  if (decPart !== "" && !/^\d+$/.test(decPart)) return null;
  if (intPart.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+$/.test(intPart)) return null;
    intPart = intPart.replace(/,/g, "");
  }
  if (intPart === "" && decPart === "") return null;
  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart)) return null;
  s = intPart + decPart.padEnd(2, "0");
  const cents = Number(s); // entero a partir de dígitos: exacto bajo 2^53
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

/** Igual que parseToCents pero permite 0 (p. ej. interés o saldo inicial). */
export function parseToCentsAllowZero(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  if (/^\$?0*(\.0{0,2})?$/.test(t) && /\d/.test(t)) return 0;
  return parseToCents(input);
}

/** Sólo para mostrar. Dividir entre 100 aquí es aceptable. */
export function formatCents(cents: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);
}

/** Centavos -> texto editable "1234.50" sin floats. */
export function centsToInput(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
