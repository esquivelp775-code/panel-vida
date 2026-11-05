"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatCents } from "@/lib/money";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Interpola centavos enteros de 0 al objetivo (rAF). Siempre devuelve enteros. */
export function useCountUp(target: number, ms = 600): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { from.current = target; setV(target); return; }
    const start = performance.now();
    const f0 = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(f0 + (target - f0) * e);
      from.current = cur; setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CountMoney({ cents, className = "" }: { cents: number; className?: string }) {
  const v = useCountUp(cents);
  return <span className={`num ${className}`}>{formatCents(v)}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`pv-skel rounded-[28px] ${className}`} aria-hidden="true" />;
}

/** Línea con animación de trazo. Valores enteros sólo para dibujar. */
export function Sparkline({ values, w = 120, h = 36, color = "#34d399" }: { values: number[]; w?: number; h?: number; color?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [2 + (i * (w - 4)) / (values.length - 1), 2 + (h - 4) - ((v - min) * (h - 4)) / span]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Tendencia del neto de 6 meses" role="img">
      <path key={d} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pv-draw" style={{ ["--len" as string]: Math.ceil(len) + 2 }} />
    </svg>
  );
}

/** Anillo de progreso animado (0-100). */
export function Ring({ pct, size = 44, stroke = 5, color = "var(--ink)", children }: { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setP(Math.max(0, Math.min(100, pct)))); return () => cancelAnimationFrame(id); }, [pct]);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">{children}</div>
    </div>
  );
}

export const DONUT_COLORS = ["#D9FF4A", "#FF9E7A", "#6D4AFF", "#2ED3B7", "#FFD166", "#8FA8FF", "#FF7AB6", "#B8B8C8"];

/** Dona animada; cada porción es un trazo con dasharray (animado por transición). */
export function Donut({ slices, size = 140, onPick }: { slices: { id: number; label: string; value: number }[]; size?: number; onPick?: (id: number) => void }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  const r = size / 2 - 12, c = 2 * Math.PI * r;
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, x) => a + x.value, 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" role="img" aria-label="Gasto por categoría">
      {slices.map((s, i) => {
        const frac = total ? s.value / total : 0;
        const len = frac * c;
        const off = -(total ? starts[i] / total : 0) * c;
        return (
          <circle key={s.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="22"
            strokeDasharray={`${on ? Math.max(0, len - 1) : 0} ${c}`} strokeDashoffset={off}
            style={{ transition: `stroke-dasharray .8s ease-out ${i * 0.08}s`, cursor: onPick ? "pointer" : undefined }}
            onClick={() => onPick?.(s.id)}><title>{s.label}</title></circle>
        );
      })}
    </svg>
  );
}

/** Hoja inferior animada. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portal a <body>: el contenedor animado de la página crea su propio contexto de apilamiento y,
  // sin portal, la barra de navegación flotante tapaba los botones del diálogo.
  return createPortal(
    <div className="pv-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pv-sheet max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-surface glass-solid p-5 pb-8 ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/20" />
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-bold capitalize">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="min-h-11 min-w-11 text-xl text-muted">✕</button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Casilla con animación de palomita. */
export function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange} className="flex h-11 w-11 shrink-0 items-center justify-center">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-200 ${checked ? "border-current bg-current" : "border-current/40"} ${checked ? "pv-pop" : ""}`}>
        {checked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="pv-check mix-blend-difference"><path d="M4 12l5 5L20 6" /></svg>
        )}
      </span>
    </button>
  );
}
