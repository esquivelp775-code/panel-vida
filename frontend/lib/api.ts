/* Cliente tipado de la API v1 (ver docs/ARCHITECTURE.md). Montos = centavos enteros. */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "pv_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/* ---------- Tipos ---------- */
export type AccountClass = "asset" | "liability" | "income" | "expense" | "equity";
export type Subtype = "cash" | "checking" | "savings" | "investment" | "credit_card" | "loan" | "other_liability" | "income" | "expense" | "equity";

export interface Account {
  id: number; name: string; account_class: AccountClass; subtype: Subtype; currency: string;
  credit_limit_cents: number | null; statement_day: number | null; due_day: number | null;
  interest_rate_bps: number | null; is_system: boolean; archived_at: string | null;
  balance_cents: number; created_at: string;
}
export interface AccountCreate {
  name: string; subtype: Subtype; currency?: string; opening_balance_cents?: number; opening_date?: string;
  credit_limit_cents?: number; statement_day?: number; due_day?: number; interest_rate_bps?: number;
}
export interface ReconcileResult {
  ledger_balance_cents: number; statement_balance_cents: number; difference_cents: number;
  adjustment_transaction_id: number | null;
}

export type TxKind = "income" | "expense" | "card_purchase" | "transfer" | "card_payment" | "loan_payment" | "loan_disbursement" | "adjustment" | "opening_balance" | "reversal" | "refund" | string;
export interface Entry { account_id: number; account_name: string; account_class: AccountClass; amount_cents: number }
export interface Transaction {
  id: number; kind: TxKind; occurred_on: string; description: string; notes: string | null; created_at: string;
  voided_at: string | null; void_reason: string | null; reverses_id: number | null; reversed_by_id: number | null;
  entries: Entry[]; amount_cents: number;
}
export type TxCreate =
  | { kind: "income"; occurred_on: string; description: string; notes?: string; account_id: number; category_id: number; amount_cents: number }
  | { kind: "expense"; occurred_on: string; description: string; notes?: string; account_id: number; category_id: number; amount_cents: number; installments?: number }
  | { kind: "refund"; occurred_on: string; description: string; notes?: string; account_id: number; category_id: number; amount_cents: number }
  | { kind: "transfer"; occurred_on: string; description: string; notes?: string; from_account_id: number; to_account_id: number; amount_cents: number }
  | { kind: "card_payment"; occurred_on: string; description: string; notes?: string; from_account_id: number; card_account_id: number; amount_cents: number }
  | { kind: "loan_payment"; occurred_on: string; description: string; notes?: string; from_account_id: number; loan_account_id: number; principal_cents: number; interest_cents: number; interest_category_id?: number };
export interface AccountUpdate {
  name?: string; credit_limit_cents?: number; statement_day?: number; due_day?: number; interest_rate_bps?: number;
}
export interface InstallmentPlan {
  plan_id: number; transaction_id: number; description: string; purchased_on: string; total_cents: number;
  months: number; installment_cents: number; billed_count: number; remaining_cents: number; next_closing: string | null;
}
export type ObligationUpdate = Partial<Pick<Obligation, "name" | "amount_cents" | "due_date" | "recurrence" | "pay_from_account_id" | "target_account_id" | "category_id">>;
export interface TxList { items: Transaction[]; total: number }
export interface TxFilters { account_id?: string; kind?: string; date_from?: string; date_to?: string; q?: string; include_voided?: boolean; limit?: number; offset?: number }

export interface Obligation {
  id: number; name: string; kind: "bill" | "loan_installment" | "card_payment" | "income_expected" | "other";
  direction: "outflow" | "inflow"; amount_cents: number; due_date: string; recurrence: "none" | "monthly" | "yearly";
  status: "pending" | "paid" | "cancelled"; pay_from_account_id: number | null; target_account_id: number | null;
  category_id: number | null; settled_transaction_id: number | null; created_at: string;
}
// `direction` lo deriva el servidor a partir de `kind`; el API rechaza campos extra.
export type ObligationCreate = Partial<Omit<Obligation, "id" | "status" | "settled_transaction_id" | "created_at" | "direction">> &
  Pick<Obligation, "name" | "kind" | "amount_cents" | "due_date" | "recurrence">;
export interface UpcomingItem { source: "obligation" | "card"; ref_id: number; name: string; due_date: string; amount_cents: number; direction: "outflow" | "inflow"; overdue: boolean }

export interface Budget { id: number; category_id: number; category_name: string; month: string; amount_cents: number; spent_cents: number; remaining_cents: number }

export interface CardSummary { id: number; name: string; owed_cents: number; credit_limit_cents: number | null; available_credit_cents: number | null; next_due_date: string | null; statement_due_cents: number | null; overdue?: boolean; deferred_cents?: number; minimum_due_cents?: number | null; statement_closing?: string | null }
export interface Dashboard {
  available_cents: number; total_debt_cents: number; net_worth_cents: number;
  month: { income_cents: number; expense_cents: number; net_cents: number };
  cards: CardSummary[]; upcoming: UpcomingItem[]; accounts: Account[];
}
export interface CashflowMonth { month: string; income_cents: number; expense_cents: number; net_cents: number; liquid_change_cents: number }
export interface Cashflow { months: CashflowMonth[]; totals: Partial<CashflowMonth> }
export interface CategoryTotal { category_id: number; name: string; total_cents: number }
export interface Projection {
  starting_available_cents: number; points: { date: string; event: string; amount_cents: number; balance_cents: number }[];
  min_balance_cents: number; min_balance_date: string | null;
}

export interface DebtPlanDebt { account_id: number; name: string; subtype: string; owed_cents: number; monthly_needed_cents: number; scheduled_monthly_cents: number; projected_payoff_month: string | null; on_track: boolean }
export interface DebtPlan { target_month: string; months_left: number; total_owed_cents: number; total_monthly_needed_cents: number; avg_monthly_net_cents: number; feasible: boolean; debts: DebtPlanDebt[]; projection: { month: string; remaining_cents: number }[] }
export type Priority = "low" | "normal" | "high";
export type Area = "finanzas" | "personal" | "trabajo" | "casa" | "salud" | "ryventis" | "otro";
export interface Task { id: number; title: string; notes: string | null; due_date: string | null; priority: Priority; area: Area; status: "pending" | "doing" | "done"; completed_at: string | null; created_at: string; project_id?: number | null }
export interface TaskCreate { title: string; notes?: string; due_date?: string | null; priority?: Priority; area?: Area; project_id?: number | null }
export interface Habit { id: number; name: string; emoji: string; target_per_week: number; streak_days: number; done_today: boolean; week_count: number; last_7: { date: string; done: boolean }[] }
export interface CalEvent { kind: "obligation" | "card" | "task"; ref_id: number; title: string; amount_cents: number | null; direction: "outflow" | "inflow" | null; status: "pending" | "paid" | "done" | "overdue"; priority: Priority | null }
export interface CalDay { date: string; income_cents: number; expense_cents: number; tx_count: number; habits_done: number; events: CalEvent[] }
export interface CalMonth { month: string; today: string; totals: { income_cents: number; expense_cents: number }; days: CalDay[] }

/* ---------- Núcleo ---------- */
type Opts = { method?: string; body?: unknown; headers?: Record<string, string>; query?: Record<string, string | number | boolean | undefined | null> };

function qs(q?: Opts["query"]): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function detailToText(d: unknown): string {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && typeof x === "object" && "msg" in x ? String((x as { msg: unknown }).msg) : JSON.stringify(x))).join("; ");
  return "Error inesperado";
}

async function raw(path: string, opts: Opts = {}, auth = true): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}${qs(opts.query)}`, {
      method: opts.method || "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  if (res.status === 401 && auth) {
    clearToken();
    // Redirección dura intencional (fuera de React); limpia estado en memoria.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.assign("/login/");
    throw new ApiError(401, "Sesión expirada. Inicia sesión de nuevo.");
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = detailToText((await res.json()).detail); } catch { /* sin cuerpo JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res;
}

async function json<T>(path: string, opts: Opts = {}, auth = true): Promise<T> {
  const res = await raw(path, opts, auth);
  return (await res.json()) as T;
}


/* ---------- Ryventis (CRM + ERP) ---------- */
export type Stage = "nuevo" | "charla" | "propuesta" | "cliente" | "perdido";
export type InteractionKind = "mensaje" | "llamada" | "email" | "reunion" | "otro";
export type ProjectStatus = "pendiente" | "en_marcha" | "terminado" | "cancelado";
export interface Interaction { id: number; client_id: number; kind: InteractionKind; summary: string; happened_on: string }
export interface Client {
  id: number; name: string; company: string; phone: string; email: string; stage: Stage; source: string; notes: string;
  next_step: string; next_step_date: string | null; created_at: string;
  projects_count: number; open_value_cents: number; receivable_cents: number;
}
export interface ClientDetail extends Client { interactions: Interaction[]; projects: Project[] }
export interface ClientInput { name: string; company?: string; phone?: string; email?: string; stage?: Stage; source?: string; notes?: string; next_step?: string; next_step_date?: string | null }
export interface Project {
  id: number; client_id: number | null; client_name: string | null; name: string; amount_cents: number; status: ProjectStatus;
  due_date: string | null; notes: string; created_at: string; tasks_total: number; tasks_done: number; collected_cents: number; receivable_cents: number;
}
export interface ProjectInput { name: string; client_id?: number | null; amount_cents?: number; status?: ProjectStatus; due_date?: string | null; notes?: string }
export interface Receivable {
  id: number; project_id: number | null; project_name: string | null; client_id: number | null; client_name: string | null;
  description: string; amount_cents: number; due_date: string | null; status: "por_cobrar" | "cobrado";
  collected_transaction_id: number | null; collected_on: string | null; overdue: boolean;
}
export interface ReceivableInput { description: string; amount_cents: number; project_id?: number | null; client_id?: number | null; due_date?: string | null }
export interface RyventisSummary {
  pipeline: Record<Stage, number>; pipeline_value_cents: number; projects: { pendiente: number; en_marcha: number; terminado: number };
  active_value_cents: number; receivable_cents: number; overdue_receivable_cents: number; collected_month_cents: number; collected_year_cents: number;
  tasks: { pending: number; doing: number; done: number };
  followups: { client_id: number; name: string; next_step: string; next_step_date: string; overdue: boolean }[];
  upcoming_deliveries: { project_id: number; name: string; due_date: string; client_name: string | null }[];
}

/* ---------- Endpoints ---------- */
export interface BulkResult { dry_run: boolean; created: { accounts: number; categories: number; obligations: number; transactions?: number; tasks?: number }; skipped: string[]; warnings?: string[]; errors?: string[] }
export const api = {
  setupBulk: (body: Record<string, unknown>) => json<BulkResult>("/setup/bulk", { method: "POST", body }),
  login: (email: string, password: string) =>
    json<{ access_token: string; token_type: string; expires_at: string }>("/auth/login", { method: "POST", body: { email, password } }, false),
  me: () => json<{ id: number; email: string; display_name: string; currency: string }>("/auth/me"),

  accounts: (account_class?: AccountClass, include_archived = false) =>
    json<Account[]>("/accounts", { query: { account_class, include_archived } }),
  account: (id: number) => json<Account>(`/accounts/${id}`),
  createAccount: (b: AccountCreate) => json<Account>("/accounts", { method: "POST", body: b }),
  updateAccount: (id: number, b: AccountUpdate) => json<Account>(`/accounts/${id}`, { method: "PATCH", body: b }),
  installments: (id: number) => json<InstallmentPlan[]>(`/accounts/${id}/installments`),
  archiveAccount: (id: number) => json<Account>(`/accounts/${id}/archive`, { method: "POST" }),
  reconcile: (id: number, statement_balance_cents: number, as_of: string, create_adjustment: boolean) =>
    json<ReconcileResult>(`/accounts/${id}/reconcile`, { method: "POST", body: { statement_balance_cents, as_of, create_adjustment } }),

  transactions: (f: TxFilters) => json<TxList>("/transactions", { query: { ...f } }),
  transaction: (id: number) => json<Transaction>(`/transactions/${id}`),
  createTransaction: (b: TxCreate, idempotencyKey: string) =>
    json<Transaction>("/transactions", { method: "POST", body: b, headers: { "Idempotency-Key": idempotencyKey } }),
  voidTransaction: (id: number, reason: string) => json<Transaction>(`/transactions/${id}/void`, { method: "POST", body: { reason } }),

  obligations: (status?: string) => json<Obligation[]>("/obligations", { query: { status } }),
  createObligation: (b: ObligationCreate) => json<Obligation>("/obligations", { method: "POST", body: b }),
  settleObligation: (id: number, b: { account_id?: number; amount_cents?: number; occurred_on?: string }) =>
    json<Obligation>(`/obligations/${id}/settle`, { method: "POST", body: b }),
  updateObligation: (id: number, b: ObligationUpdate) => json<Obligation>(`/obligations/${id}`, { method: "PATCH", body: b }),
  skipObligation: (id: number) => json<Obligation>(`/obligations/${id}/skip`, { method: "POST" }),
  cancelObligation: (id: number) => json<Obligation>(`/obligations/${id}/cancel`, { method: "POST" }),
  importPreview: (account_id: number, csv_text: string, positive_is_outflow?: boolean) =>
    json<import("./importer").PreviewResult>("/imports/preview", { method: "POST", body: { account_id, csv_text, ...(positive_is_outflow === undefined ? {} : { positive_is_outflow }) } }),
  importCommit: (account_id: number, rows: import("./importer").CommitRow[]) =>
    json<import("./importer").CommitResult>("/imports/commit", { method: "POST", body: { account_id, rows } }),
  tasks: (status?: "pending" | "done", area?: string) => json<Task[]>("/tasks", { query: { status, area } }),
  startTask: (id: number) => json<Task>(`/tasks/${id}/start`, { method: "POST" }),
  setTaskStatus: (id: number, status: "pending" | "doing" | "done") => json<Task>(`/tasks/${id}`, { method: "PATCH", body: { status } }),
  debtPlan: (target?: string) => json<DebtPlan>("/reports/debt-plan", { query: { target } }),
  createTask: (b: TaskCreate) => json<Task>("/tasks", { method: "POST", body: b }),
  updateTask: (id: number, b: Partial<TaskCreate>) => json<Task>(`/tasks/${id}`, { method: "PATCH", body: b }),
  completeTask: (id: number) => json<Task>(`/tasks/${id}/complete`, { method: "POST" }),
  reopenTask: (id: number) => json<Task>(`/tasks/${id}/reopen`, { method: "POST" }),
  deleteTask: async (id: number) => { await raw(`/tasks/${id}`, { method: "DELETE" }); },
  ryvSummary: () => json<RyventisSummary>("/ryventis/summary"),
  ryvClients: (stage?: Stage) => json<Client[]>("/ryventis/clients", { query: { stage } }),
  ryvClient: (id: number) => json<ClientDetail>(`/ryventis/clients/${id}`),
  ryvCreateClient: (b: ClientInput) => json<Client>("/ryventis/clients", { method: "POST", body: b }),
  ryvUpdateClient: (id: number, b: Partial<ClientInput>) => json<Client>(`/ryventis/clients/${id}`, { method: "PATCH", body: b }),
  ryvDeleteClient: async (id: number) => { await raw(`/ryventis/clients/${id}`, { method: "DELETE" }); },
  ryvAddInteraction: (id: number, b: { kind: InteractionKind; summary: string; happened_on?: string }) =>
    json<Interaction>(`/ryventis/clients/${id}/interactions`, { method: "POST", body: b }),
  ryvProjects: (status?: ProjectStatus) => json<Project[]>("/ryventis/projects", { query: { status } }),
  ryvCreateProject: (b: ProjectInput) => json<Project>("/ryventis/projects", { method: "POST", body: b }),
  ryvUpdateProject: (id: number, b: Partial<ProjectInput>) => json<Project>(`/ryventis/projects/${id}`, { method: "PATCH", body: b }),
  ryvDeleteProject: async (id: number) => { await raw(`/ryventis/projects/${id}`, { method: "DELETE" }); },
  ryvReceivables: (status?: "por_cobrar" | "cobrado") => json<Receivable[]>("/ryventis/receivables", { query: { status } }),
  ryvCreateReceivable: (b: ReceivableInput) => json<Receivable>("/ryventis/receivables", { method: "POST", body: b }),
  ryvUpdateReceivable: (id: number, b: Partial<ReceivableInput>) => json<Receivable>(`/ryventis/receivables/${id}`, { method: "PATCH", body: b }),
  ryvDeleteReceivable: async (id: number) => { await raw(`/ryventis/receivables/${id}`, { method: "DELETE" }); },
  ryvCollect: (id: number, b: { account_id: number; category_id?: number; occurred_on?: string }) =>
    json<Receivable>(`/ryventis/receivables/${id}/collect`, { method: "POST", body: b }),
  habits: () => json<Habit[]>("/habits"),
  createHabit: (b: { name: string; emoji?: string; target_per_week?: number }) => json<Habit>("/habits", { method: "POST", body: b }),
  updateHabit: (id: number, b: { name?: string; emoji?: string; target_per_week?: number }) => json<Habit>(`/habits/${id}`, { method: "PATCH", body: b }),
  toggleHabit: (id: number, day?: string) => json<Habit>(`/habits/${id}/toggle`, { method: "POST", body: day ? { day } : {} }),
  deleteHabit: async (id: number) => { await raw(`/habits/${id}`, { method: "DELETE" }); },
  calendar: (month: string) => json<CalMonth>("/calendar", { query: { month } }),
  upcoming: (days = 30) => json<UpcomingItem[]>("/upcoming", { query: { days } }),

  budgets: (month: string) => json<Budget[]>("/budgets", { query: { month } }),
  upsertBudget: (category_id: number, month: string, amount_cents: number) =>
    json<Budget>("/budgets", { method: "PUT", body: { category_id, month, amount_cents } }),
  deleteBudget: async (id: number) => { await raw(`/budgets/${id}`, { method: "DELETE" }); },

  dashboard: () => json<Dashboard>("/dashboard"),
  cashflow: (date_from: string, date_to: string) => json<Cashflow>("/reports/cashflow", { query: { date_from, date_to } }),
  byCategory: (date_from: string, date_to: string) =>
    json<CategoryTotal[]>("/reports/by-category", { query: { date_from, date_to, account_class: "expense" } }),
  projection: (days = 90) => json<Projection>("/reports/projection", { query: { days } }),

  /** Descarga autenticada -> Blob -> archivo. */
  download: async (path: string, query: Opts["query"], filename: string) => {
    const res = await raw(path, { query });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

/* ---------- Fechas (sin zona horaria sorpresa) ---------- */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthISO(d = new Date()): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const idx = y * 12 + (mo - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
export function monthRange(m: string): [string, string] {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(y, mo, 0).getDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, "0")}`];
}
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}
export function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 1));
}
