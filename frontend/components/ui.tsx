"use client";
import { createPortal } from "react-dom";
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
          <div key={t.id} className={`rounded-full px-5 py-2.5 text-sm font-medium shadow-soft text-white ${t.kind === "ok" ? "bg-accent !text-onaccent" : "bg-expense"}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Básicos ---------- */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] bg-surface p-5 ring-1 ring-line ${className}`}>{children}</section>;
}
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[.14em] text-muted">{children}</h2>;
}
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-3xl font-bold">{children}</h1>
      {right}
    </div>
  );
}
export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-muted ${className}`}>{children}</p>;
}

export function Btn({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "btn-accent hover:brightness-105",
    secondary: "bg-surface text-ink ring-1 ring-line hover:bg-soft",
    danger: "bg-expense text-white hover:opacity-90",
    ghost: "text-ink hover:bg-soft",
  }[variant];
  return <button type="button" {...p} className={`pv-press min-h-11 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`} />;
}

const inputCls = "min-h-11 w-full rounded-[20px] border border-line bg-soft px-4 py-2 text-base text-ink outline-none transition-colors focus:border-[var(--accent)] focus:bg-soft";
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Input(p: React.ComponentProps<"input">) { return <input {...p} className={`${inputCls} ${p.className || ""}`} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={`${inputCls} ${p.className || ""}`} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`${inputCls} ${p.className || ""}`} />; }

export function ErrorBox({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 rounded-[20px] bg-expense/10 p-3 text-sm text-expense ring-1 ring-expense/20">
      {message}
      {onRetry && <button onClick={onRetry} className="ml-2 font-semibold underline">Reintentar</button>}
    </div>
  );
}
export function Loading({ text = "Cargando…" }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-muted" aria-busy="true">{text}</p>;
}
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-dashed border-ink/20 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Importe formateado; `tone` colorea según signo cuando aplica. */
export function Money({ cents, tone = false, className = "" }: { cents: number; tone?: boolean; className?: string }) {
  const c = tone ? (cents < 0 ? "text-expense" : cents > 0 ? "text-income" : "") : "";
  return <span className={`tabular-nums ${c} ${className}`}>{formatCents(cents)}</span>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-soft p-1 hide-scroll">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`pv-press min-h-10 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${value === o.value ? "bg-accent text-onaccent shadow-soft" : "text-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null;
  // Portal a <body>: el contenedor animado de la página crea su propio contexto de apilamiento y,
  // sin portal, la barra de navegación flotante tapaba los botones del diálogo.
  return createPortal(
    <div className="pv-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pv-sheet max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface glass-solid p-5 ring-1 ring-line sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold tracking-tight">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, message, confirmLabel, danger, busy, onConfirm, onClose, children }: {
  open: boolean; title: string; message?: string; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {message && <p className="mb-3 text-sm text-muted">{message}</p>}
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
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${over ? "bg-expense" : "bg-accent"}`} style={{ width: `${w}%`, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
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

/** Cabecera de sección con kicker en versalitas y palabra itálica serif. */
export function Kicker({ children }: { children: ReactNode }) {
  return <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{children}</p>;
}
