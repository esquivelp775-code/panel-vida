"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, fmtDate, monthISO, monthRange, shiftMonth, todayISO, type Habit, type Task } from "@/lib/api";
import { addDays, greeting } from "@/lib/calendar";
import { useLoad, errMsg } from "@/lib/useLoad";
import { Bar, Card, Empty, ErrorBox, H2, Money, Muted, pctOf, useToast } from "@/components/ui";
import { CheckBox, CountMoney, DONUT_COLORS, Donut, Skeleton, Sparkline } from "@/components/anim";
import { formatCents } from "@/lib/money";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mlabel = (m: string) => MESES[Number(m.slice(5, 7)) - 1];

function Chip({ label, cents, tone, i }: { label: string; cents: number; tone?: boolean; i: number }) {
  return (
    <div className="pv-in pv-press rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" style={{ animationDelay: `${i * 90}ms` }}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-bold"><Money cents={cents} tone={tone} /></p>
    </div>
  );
}

function DashSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Skeleton className="mb-3 h-32" />
      <div className="mb-3 grid grid-cols-3 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      <Skeleton className="mb-3 h-44" /><Skeleton className="mb-3 h-40" />
    </div>
  );
}

export default function Inicio() {
  const router = useRouter();
  const toast = useToast();
  const today = todayISO();
  const month = monthISO();
  const [mStart, mEnd] = monthRange(month);
  const dash = useLoad(() => api.dashboard(), []);
  const flow = useLoad(() => api.cashflow(`${shiftMonth(month, -5)}-01`, mEnd), []);
  const cats = useLoad(() => api.byCategory(mStart, mEnd), []);
  const up = useLoad(() => api.upcoming(7), []);
  const tasksL = useLoad(() => api.tasks("pending"), []);
  const habitsL = useLoad(() => api.habits(), []);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [habitOver, setHabitOver] = useState<Record<number, Habit>>({});
  const [popId, setPopId] = useState<number | null>(null);

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const limit = addDays(today, 7);
  const tasks = useMemo(() => (tasksL.data || []).filter((t) => t.due_date && t.due_date <= limit).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")), [tasksL.data, limit]);
  const months = flow.data?.months.slice(-6) || [];
  const maxBar = Math.max(1, ...months.flatMap((m) => [m.income_cents, m.expense_cents]));
  const slices = (cats.data || []).filter((c) => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents).slice(0, 8)
    .map((c) => ({ id: c.category_id, label: c.name, value: c.total_cents }));
  const catTotal = slices.reduce((a, s) => a + s.value, 0);
  const goCat = (id: number) => router.push(`/movimientos/?account_id=${id}&date_from=${mStart}`);

  async function complete(t: Task) {
    setDoneIds((x) => [...x, t.id]);
    try { await api.completeTask(t.id); } catch (e) { setDoneIds((x) => x.filter((i) => i !== t.id)); toast(errMsg(e), "err"); }
  }
  async function toggle(h: Habit) {
    setPopId(h.id);
    try { const r = await api.toggleHabit(h.id); setHabitOver((o) => ({ ...o, [h.id]: r })); setTimeout(() => setPopId(null), 400); }
    catch (e) { setPopId(null); toast(errMsg(e), "err"); }
  }

  if (dash.loading && !dash.data) return <DashSkeleton />;
  if (dash.error && !dash.data) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  const d = dash.data;
  if (!d) return null;
  const habits = (habitsL.data || []).map((h) => habitOver[h.id] || h);

  return (
    <>
      <div className="mb-3">
        <h1 className="text-xl font-bold">{greeting(now.getHours())} 👋</h1>
        <p className="text-sm capitalize text-slate-500">{dateStr}</p>
      </div>
      <ErrorBox message={dash.error} onRetry={dash.reload} />
      <Card className="mb-3 bg-gradient-to-br from-emerald-600 to-teal-700 !text-white !ring-0">
        <p className="text-sm opacity-90">Dinero disponible</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-3xl font-bold"><CountMoney cents={d.available_cents} /></p>
          {months.length > 1 && <Sparkline values={months.map((m) => m.net_cents)} color="#ffffff" />}
        </div>
        <p className="mt-1 text-xs opacity-80">Neto de los últimos 6 meses</p>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Chip i={0} label="Deuda total" cents={d.total_debt_cents} />
        <Chip i={1} label="Patrimonio" cents={d.net_worth_cents} tone />
        <Chip i={2} label="Neto del mes" cents={d.month.net_cents} tone />
      </div>

      <H2>Gasto por categoría este mes</H2>
      <Card className="mb-4">
        {cats.loading && !cats.data ? <Skeleton className="h-36" /> : slices.length === 0 ? <Muted>Sin gastos este mes.</Muted> : (
          <div className="flex items-center gap-3">
            <Donut slices={slices} onPick={goCat} />
            <ul className="min-w-0 flex-1 space-y-1">
              {slices.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => goCat(s.id)} className="flex min-h-8 w-full items-center gap-2 text-left text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="tabular-nums text-slate-500">{pctOf(s.value, catTotal)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <H2>Ingresos vs gastos (6 meses)</H2>
      <Card className="mb-4">
        {flow.loading && !flow.data ? <Skeleton className="h-32" /> : months.length === 0 ? <Muted>Sin datos.</Muted> : (
          <>
            <div className="flex h-32 items-end justify-between gap-2">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <GrowBar pct={pctOf(m.income_cents, maxBar)} color="bg-emerald-500" title={`Ingresos ${formatCents(m.income_cents)}`} />
                    <GrowBar pct={pctOf(m.expense_cents, maxBar)} color="bg-red-500" title={`Gastos ${formatCents(m.expense_cents)}`} />
                  </div>
                  <span className="text-[10px] uppercase text-slate-500">{mlabel(m.month)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500"><span className="text-emerald-600">■</span> Ingresos · <span className="text-red-500">■</span> Gastos</p>
          </>
        )}
      </Card>

      <H2>Próximos 7 días</H2>
      <Card className="mb-4">
        {up.loading && !up.data ? <Skeleton className="h-16" /> : (up.data || []).length === 0 && tasks.length === 0 ? <Muted>Nada por vencer esta semana.</Muted> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((t) => {
              const done = doneIds.includes(t.id);
              return (
                <li key={`t${t.id}`} className="flex items-center gap-1 py-0.5">
                  <CheckBox checked={done} onChange={() => !done && complete(t)} label={`Completar ${t.title}`} />
                  <div className={`min-w-0 flex-1 transition-opacity ${done ? "opacity-50" : ""}`}>
                    <p className={`truncate text-sm font-medium ${done ? "line-through" : ""}`}>{t.title}</p>
                    <p className={`text-xs ${t.due_date! < today && !done ? "font-semibold text-red-600" : "text-slate-500"}`}>Pendiente · {fmtDate(t.due_date!)}</p>
                  </div>
                </li>
              );
            })}
            {(up.data || []).map((u, i) => (
              <li key={`${u.source}-${u.ref_id}-${u.due_date}-${i}`} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className={`text-xs ${u.overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>{u.overdue ? "Vencido · " : ""}{fmtDate(u.due_date)}</p>
                </div>
                <p className={`text-sm font-semibold ${u.direction === "inflow" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{u.direction === "inflow" ? "+" : "−"}<Money cents={u.amount_cents} /></p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <H2>Hábitos de hoy</H2>
      {habitsL.loading && !habitsL.data ? <Skeleton className="mb-4 h-12" /> : habits.length === 0 ? (
        <div className="mb-4"><Empty title="Sin hábitos" hint="Crea uno para seguir tu racha." action={<Link href="/vida/" className="font-semibold text-emerald-700 underline">Ir a Vida</Link>} /></div>
      ) : (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {habits.map((h) => (
            <button key={h.id} onClick={() => toggle(h)} aria-pressed={h.done_today}
              className={`pv-press flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium ring-1 transition-colors ${h.done_today ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"}`}>
              <span className={popId === h.id ? "pv-pop inline-block" : "inline-block"}>{h.emoji}</span>
              <span>{h.name}</span>
              {h.streak_days > 0 && <span className="text-xs">🔥{h.streak_days}</span>}
            </button>
          ))}
        </div>
      )}

      <H2>Tarjetas</H2>
      {d.cards.length === 0 ? (
        <Empty title="Sin tarjetas" hint="Agrega una tarjeta de crédito en Cuentas." action={<Link href="/cuentas/" className="font-semibold text-emerald-700 underline">Ir a Cuentas</Link>} />
      ) : (
        <div className="mb-3 space-y-2">
          {d.cards.map((c) => (
            <Card key={c.id}>
              <div className="flex items-baseline justify-between"><p className="font-semibold">{c.name}{c.overdue && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Vencido</span>}</p><p className="font-bold"><Money cents={c.owed_cents} /></p></div>
              {c.credit_limit_cents != null && (
                <>
                  <div className="my-2"><Bar pct={pctOf(c.owed_cents, c.credit_limit_cents)} over={c.owed_cents > c.credit_limit_cents} label="Uso del límite" /></div>
                  <Muted>Límite {formatCents(c.credit_limit_cents)} · disponible {c.available_credit_cents != null ? formatCents(c.available_credit_cents) : "—"}</Muted>
                </>
              )}
              {c.next_due_date && (
                <Muted>Próximo pago: {fmtDate(c.next_due_date)}{c.statement_due_cents != null ? ` · para no generar intereses ${formatCents(c.statement_due_cents)}` : ""}</Muted>
              )}
              {(c.minimum_due_cents ?? 0) > 0 && <p className="text-xs text-slate-500" title="Estimación: no incluye intereses ni IVA">Pago mínimo (estimado) {formatCents(c.minimum_due_cents ?? 0)} · Estimación: no incluye intereses ni IVA</p>}
              {(c.deferred_cents ?? 0) > 0 && <Muted>MSI por facturar {formatCents(c.deferred_cents ?? 0)}</Muted>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** Barra vertical que crece con transición CSS tras montar. */
function GrowBar({ pct, color, title }: { pct: number; color: string; title: string }) {
  const [h, setH] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setH(pct))); return () => cancelAnimationFrame(id); }, [pct]);
  return <div title={title} className={`w-4 rounded-t ${color}`} style={{ height: `${Math.max(h, pct > 0 ? 2 : 0)}%`, transition: "height .8s cubic-bezier(.2,.8,.2,1)" }} />;
}
