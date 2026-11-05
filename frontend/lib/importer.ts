/* Ayudantes puros de la importación de estados de cuenta (sin React ni red). Montos = centavos enteros. */

export const MAX_CSV_BYTES = 1024 * 1024;
export const DESC_PREFIX = "imp_desc_";

export interface PreviewRow {
  row: number; occurred_on: string; description: string; amount_cents: number;
  direction: "outflow" | "inflow"; fingerprint: string;
  status: "new" | "duplicate" | "imported" | "installment"; duplicate_of: number | null;
}
export interface PreviewResult {
  account_id: number; positive_is_outflow: boolean; rows: PreviewRow[];
  summary: { total: number; new: number; duplicates: number; imported: number; installments?: number };
  date_order?: "dmy" | "mdy";
}
export interface CommitRow {
  row: number; fingerprint: string; occurred_on: string; description: string; amount_cents: number;
  direction: "outflow" | "inflow"; category_id?: number; counter_account_id?: number;
}
export interface CommitResult { created: number; skipped_existing: number; transaction_ids: number[] }

/** Clasificación elegida por el usuario para una fila. */
export interface RowState {
  selected: boolean;
  mode: "category" | "transfer";
  categoryId: string; // "" = sin clasificar
  counterId: string;
}

/** Descripción normalizada: minúsculas, sin acentos, sólo letras/números, espacios colapsados, máx. 60. */
export function normalizeDesc(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
}

export function descKey(description: string): string | null {
  const n = normalizeDesc(description);
  return n ? DESC_PREFIX + n : null;
}

export function isClassified(st: RowState): boolean {
  return st.mode === "transfer" ? st.counterId !== "" : st.categoryId !== "";
}

/** Estado inicial: nuevas seleccionadas, duplicadas/ya importadas no. */
export function initialState(r: PreviewRow, remembered?: string | null): RowState {
  return {
    selected: r.status === "new", mode: "category",
    categoryId: remembered && /^\d+$/.test(remembered) ? remembered : "", counterId: "",
  };
}

/**
 * Construye las filas del commit sólo con las seleccionadas. Si alguna seleccionada
 * no está clasificada devuelve el error indicando la fila (número del archivo).
 */
export function buildCommitRows(rows: PreviewRow[], states: Record<number, RowState>):
  { rows: CommitRow[]; error: string | null } {
  const out: CommitRow[] = [];
  for (const r of rows) {
    const st = states[r.row];
    if (!st || !st.selected || r.status === "imported") continue;
    if (!isClassified(st)) return { rows: [], error: `Falta clasificar la fila ${r.row} (${r.description}).` };
    const base: CommitRow = {
      row: r.row, fingerprint: r.fingerprint, occurred_on: r.occurred_on, description: r.description,
      amount_cents: r.amount_cents, direction: r.direction,
    };
    if (st.mode === "transfer") base.counter_account_id = Number(st.counterId);
    else base.category_id = Number(st.categoryId);
    out.push(base);
  }
  return { rows: out, error: null };
}

/** Aplica una categoría a las filas seleccionadas, sin clasificar y del sentido indicado. */
export function applyCategoryBulk(rows: PreviewRow[], states: Record<number, RowState>,
  direction: "outflow" | "inflow", categoryId: string): Record<number, RowState> {
  const next = { ...states };
  if (!categoryId) return next;
  for (const r of rows) {
    const st = next[r.row];
    if (r.direction === direction && st && st.selected && !isClassified(st)) next[r.row] = { ...st, mode: "category", categoryId };
  }
  return next;
}
