"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, fmtMonth, monthISO, shiftMonth, todayISO, type CalDay, type CalEvent } from "@/lib/api";
import { buildMonthGrid } from "@/lib/calendar";
import { errMsg, useLoad } from "@/lib/useLoad";
import { formatCents } from "@/lib/money";
import { Btn, ErrorBox, Input, Money, Muted, useToast } from "@/components/ui";
import { Sheet, Skeleton } from "@/components/anim";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const BADGE: Record<string, [string, string]> = {
  paid: ["Pagado", "bg-income/15 text-income"], overdue: ["Vencido", "bg-expense/15 text-expense"],
  done: ["Hecho", "bg-income/15 text-income"], pending: ["Pendiente", "bg-soft text-muted"],
};

function dots(d: CalDay | undefined): string[] {
  if (!d) return [];
  const c: string[] = [];
  if (d.income_cents > 0) c.push("bg-ink");
  if (d.expense_cents > 0) c.push("bg-expense");
  if (d.events.some((e) => e.kind === "obligation" || e.kind === "card")) c.push("bg-warn");
  if (d.events.some((e) => e.kind === "task")) c.push("bg-muted");
  if (d.habits_done > 0) c.push("bg-muted/50");
  return c;
}

export default function Calendario() {
  const toast = useToast();
  const today = todayISO();
  const [month, setMonth] = useState(monthISO());
  const [dir, setDir] = useState<"l" | "r">("r");
  const [sel, setSel] = useState<string | null>(null);
  const cal = useLoad(() => api.calendar(month), [month]);
  const grid = buildMonthGrid(month);
  const byDate = new Map((cal.data?.days || []).map((d) => [d.date, d]));
  const startX = useRef<number | null>(null);

  const go = (delta: number) => { setDir(delta > 0 ? "r" : "l"); setMonth((m) => shiftMonth(m, delta)); };
  const selDay = sel ? byDate.get(sel) : undefined;

  return (
    <div onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => { if (startX.current !== null) { const dx = e.clientX - startX.current; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); } startX.current = null; }}
      onPointerCancel={() => { startX.current = null; }} style={{ touchAction: "pan-y" }}>
      <div className="mb-2 flex items-center justify-between">
        <Btn variant="ghost" onClick={() => go(-1)} aria-label="Mes anterior">‹</Btn>
        <h1 className="text-lg font-bold capitalize">{fmtMonth(month)}</h1>
        <Btn variant="ghost" onClick={() => go(1)} aria-label="Mes siguiente">›</Btn>
      </div>
      <div className="mb-3 flex justify-center gap-4 text-sm">
        <span className="text-income">Ingresos <b><Money cents={cal.data?.totals.income_cents ?? 0} /></b></span>
        <span className="text-expense">Gastos <b><Money cents={cal.data?.totals.expense_cents ?? 0} /></b></span>
      </div>
      <ErrorBox message={cal.error} onRetry={cal.reload} />
      <div key={month} className={dir === "r" ? "pv-slide-r" : "pv-slide-l"}>
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-muted">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
        {cal.loading && !cal.data ? <Skeleton className="h-72" /> : (
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map((c) => {
              const d = byDate.get(c.date);
              const isToday = c.date === today;
              return (
                <button key={c.date} disabled={!c.inMonth} onClick={() => setSel(c.date)} aria-label={c.date}
                  className={`pv-press flex h-14 flex-col items-center justify-start gap-1 rounded-[18px] pt-1.5 text-sm ${!c.inMonth ? "opacity-0" : "bg-surface ring-1 ring-line"} ${isToday ? "!bg-ink font-bold text-onink !ring-0" : ""}`}>
                  <span>{Number(c.date.slice(8))}</span>
                  <span className="flex gap-0.5">{dots(d).map((k, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${k} `} />)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">
        <span className="text-income">●</span> ingreso <span className="text-expense">●</span> gasto <span className="text-warn">●</span> vencimiento <span className="text-muted">●</span> pendiente <span className="text-muted/50">●</span> hábitos
      </p>
      <Sheet open={!!sel} title={sel ? new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${sel}T12:00:00`)) : ""} onClose={() => setSel(null)}>
        {sel && <DayDetail date={sel} day={selDay} onChanged={() => { cal.reload(); }} toast={toast} />}
      </Sheet>
    </div>
  );
}

function EventRow({ e }: { e: CalEvent }) {
  const [label, cls] = BADGE[e.status] || BADGE.pending;
  const icon = e.kind === "task" ? "☑️" : e.kind === "card" ? "💳" : "🧾";
  return (
    <li className="flex items-center gap-2 py-2">
      <span aria-hidden="true">{icon}</span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</p>
      {e.amount_cents != null && <span className={`text-sm font-semibold ${e.direction === "inflow" ? "text-ink" : ""}`}>{e.direction === "inflow" ? "+" : "−"}{formatCents(e.amount_cents)}</span>}
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
    </li>
  );
}

function DayDetail({ date, day, onChanged, toast }: { date: string; day: CalDay | undefined; onChanged: () => void; toast: (t: string, k?: "ok" | "err") => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await api.createTask({ title: title.trim(), due_date: date }); toast("Pendiente creado"); setTitle(""); setAdding(false); onChanged(); }
    catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-3 flex gap-4 text-sm">
        <span className="text-income">Ingresos <b><Money cents={day?.income_cents ?? 0} /></b></span>
        <span className="text-expense">Gastos <b><Money cents={day?.expense_cents ?? 0} /></b></span>
      </div>
      {day && day.events.length > 0 ? <ul className="divide-y divide-line">{day.events.map((e, i) => <EventRow key={`${e.kind}${e.ref_id}${i}`} e={e} />)}</ul> : <Muted>Sin eventos este día.</Muted>}
      {day && day.habits_done > 0 && <Muted className="mt-2">💜 Hábitos hechos: {day.habits_done}</Muted>}
      <Link href={`/movimientos/?date_from=${date}&date_to=${date}`} className="mt-3 block text-sm font-semibold text-ink underline">Ver movimientos del día</Link>
      {adding ? (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué hay que hacer?" maxLength={200} />
          <Btn type="submit" disabled={busy || !title.trim()}>Guardar</Btn>
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <Btn variant="secondary" className="flex-1" onClick={() => setAdding(true)}>+ Pendiente para este día</Btn>
          <Link href={`/registrar/?date=${date}`} className="pv-press flex min-h-11 flex-1 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-onink">+ Movimiento</Link>
        </div>
      )}
    </div>
  );
}
