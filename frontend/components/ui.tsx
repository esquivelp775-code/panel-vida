"use client";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatCents } from "@/lib/money";
import { useIndicator, usePresence } from "@/components/motion";

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
      <div className="fixed left-0 right-0 top-[max(.75rem,env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
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
  return <h2 className="t-kicker mb-2">{children}</h2>;
}
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 className="t-h1 min-w-0 break-words">{children}</h1>
      {right && <div className="shrink-0">{right}</div>}
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
    danger: "bg-expense text-[var(--on-expense)] hover:opacity-90",
    ghost: "text-ink hover:bg-soft",
  }[variant];
  return <button type="button" {...p} className={`pv-press min-h-11 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`} />;
}

const inputCls = "min-h-11 w-full min-w-0 rounded-[20px] border border-line bg-soft px-4 py-2 text-base text-ink outline-none transition-colors focus:border-[var(--accent)] focus:bg-soft";
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
  const ref = useRef<HTMLDivElement>(null);
  const active = options.findIndex((o) => o.value === value);
  const ind = useIndicator(ref, active, options.length);
  const [edges, setEdges] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEdges({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, [options.length]);
  // La pestaña activa siempre queda a la vista (sin mover la página en vertical).
  useEffect(() => {
    const el = ref.current;
    const it = el?.querySelectorAll<HTMLElement>("[data-ind-item]")[active];
    if (!el || !it || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: it.offsetLeft - (el.clientWidth - it.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);
  return (
    <div ref={ref} role="tablist" className={`relative mb-3 flex gap-1 overflow-x-auto rounded-full bg-soft p-1 hide-scroll ${edges.l ? "fade-l" : ""} ${edges.r ? "fade-r" : ""}`}>
      <span aria-hidden="true" className="pv-indicator absolute bottom-1 left-0 top-1 rounded-full bg-accent shadow-soft" style={ind} />
      {options.map((o) => (
        <button key={o.value} data-ind-item type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`pv-press relative min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${value === o.value ? "text-onaccent" : "text-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const { mounted, closing } = usePresence(open);
  // Durante la salida se sigue mostrando lo último que tuvo (quien lo abre suele vaciar su estado al cerrar).
  const last = useRef(children);
  if (open) last.current = children;
  if (!mounted || typeof document === "undefined") return null;
  const close = closing ? undefined : onClose;
  // Portal a <body>: el contenedor animado de la página crea su propio contexto de apilamiento y,
  // sin portal, la barra de navegación flotante tapaba los botones del diálogo.
  return createPortal(
    <div data-closing={closing || undefined} className="pv-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={close}>
      <div data-closing={closing || undefined} className="pv-sheet glass max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] glass-solid p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-line sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="t-h2 mb-3 !text-lg">{title}</h3>
        {open ? children : last.current}
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
  return <p className="t-kicker mb-2 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{children}</p>;
}
