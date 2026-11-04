"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { formatCents } from "@/lib/money";

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; kind: "ok" | "err" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed left-0 right-0 top-3 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`rounded-xl px-4 py-2 text-sm font-medium shadow-lg text-white ${t.kind === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Básicos ---------- */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}>{children}</section>;
}
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>;
}
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold">{children}</h1>
      {right}
    </div>
  );
}
export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>{children}</p>;
}

export function Btn({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800",
  }[variant];
  return <button type="button" {...p} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`} />;
}

const inputCls = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
export function Input(p: React.ComponentProps<"input">) { return <input {...p} className={`${inputCls} ${p.className || ""}`} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={`${inputCls} ${p.className || ""}`} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`${inputCls} ${p.className || ""}`} />; }

export function ErrorBox({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900">
      {message}
      {onRetry && <button onClick={onRetry} className="ml-2 font-semibold underline">Reintentar</button>}
    </div>
  );
}
export function Loading({ text = "Cargando…" }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-slate-500" aria-busy="true">{text}</p>;
}
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Importe formateado; `tone` colorea según signo cuando aplica. */
export function Money({ cents, tone = false, className = "" }: { cents: number; tone?: boolean; className?: string }) {
  const c = tone ? (cents < 0 ? "text-red-600 dark:text-red-400" : cents > 0 ? "text-emerald-700 dark:text-emerald-400" : "") : "";
  return <span className={`tabular-nums ${c} ${className}`}>{formatCents(cents)}</span>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${value === o.value ? "bg-white text-emerald-700 shadow dark:bg-slate-600 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel, danger, busy, onConfirm, onClose, children }: {
  open: boolean; title: string; message?: string; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {message && <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      {children}
      <div className="mt-2 flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancelar</Btn>
        <Btn variant={danger ? "danger" : "primary"} className="flex-1" onClick={onConfirm} disabled={busy}>{busy ? "Procesando…" : confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

export function Bar({ pct, over, label }: { pct: number; over?: boolean; label?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Porcentaje entero sin floats en dinero: sólo para dibujar barras. */
export function pctOf(part: number, total: number): number {
  if (total <= 0) return part > 0 ? 100 : 0;
  return Math.round((part * 100) / total);
}

export const SUBTYPE_LABEL: Record<string, string> = {
  cash: "Efectivo", checking: "Cuenta de cheques", savings: "Ahorro", investment: "Inversión",
  credit_card: "Tarjeta de crédito", loan: "Préstamo", other_liability: "Otra deuda",
  income: "Ingreso", expense: "Gasto", equity: "Capital",
};
export const KIND_LABEL: Record<string, string> = {
  income: "Ingreso", expense: "Gasto", card_purchase: "Compra con tarjeta", transfer: "Transferencia",
  card_payment: "Pago de tarjeta", loan_payment: "Pago de préstamo", loan_disbursement: "Disposición de préstamo",
  adjustment: "Ajuste", opening_balance: "Saldo inicial", reversal: "Reversión", refund: "Devolución",
};
