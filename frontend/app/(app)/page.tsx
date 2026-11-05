"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, fmtDate, monthISO, monthRange, shiftMonth, todayISO, type Habit, type Task } from "@/lib/api";
import { addDays, greeting } from "@/lib/calendar";
import { useLoad, errMsg } from "@/lib/useLoad";
import { Bar, Card, Empty, ErrorBox, H2, Money, Muted, pctOf, useToast } from "@/components/ui";
import { CheckBox, CountMoney, DONUT_COLORS, Donut, Ring, Skeleton, Sparkline } from "@/components/anim";
import { formatCents } from "@/lib/money";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mlabel = (m: string) => MESES[Number(m.slice(5, 7)) - 1];

function Chip({ label, cents, tone, i }: { label: string; cents: number; tone?: boolean; i: number }) {
  const c = tone ? (cents < 0 ? "text-[#FF6369]" : cents > 0 ? "text-[#3DD68C]" : "") : "";
  return (
    <div className="pv-in rounded-[20px] bg-white/10 p-3" style={{ animationDelay: `${i * 40}ms` }}>
      <p className="text-[11px] text-white/60">{label}</p>
      <p className={`num mt-0.5 text-sm ${c}`}>{formatCents(cents)}</p>
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
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight">{greeting(now.getHours())} 👋</h1>
        <p className="text-sm capitalize text-muted">{dateStr}</p>
      </div>
      <ErrorBox message={dash.error} onRetry={dash.reload} />
      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
      <Card className="pv-in mb-4 !bg-inverse !text-oninv !ring-0 lg:col-span-2">
        <p className="text-sm text-white/60">Dinero disponible</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-4xl font-bold"><CountMoney cents={d.available_cents} /></p>
          {months.length > 1 && <Sparkline values={months.map((m) => m.net_cents)} color="#ffffff" />}
        </div>
        <p className="mt-1 text-xs text-white/50">Neto de los últimos 6 meses</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Chip i={1} label="Deuda total" cents={d.total_debt_cents} />
          <Chip i={2} label="Patrimonio" cents={d.net_worth_cents} tone />
          <Chip i={3} label="Neto del mes" cents={d.month.net_cents} tone />
        </div>
      </Card>

      <div className="mb-4">
      <H2>Gasto por categoría este mes</H2>
      <Card>
        {cats.loading && !cats.data ? <Skeleton className="h-36" /> : slices.length === 0 ? <Muted>Sin gastos este mes.</Muted> : (
          <div className="flex items-center gap-3">
            <Donut slices={slices} onPick={goCat} />
            <ul className="min-w-0 flex-1 space-y-1">
              {slices.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => goCat(s.id)} className="flex min-h-8 w-full items-center gap-2 text-left text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="tabular-nums text-muted">{pctOf(s.value, catTotal)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      </div>
      <div className="mb-4">
      <H2>Ingresos vs gastos (6 meses)</H2>
      <Card>
        {flow.loading && !flow.data ? <Skeleton className="h-32" /> : months.length === 0 ? <Muted>Sin datos.</Muted> : (
          <>
            <div className="flex h-32 items-end justify-between gap-2">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <GrowBar pct={pctOf(m.income_cents, maxBar)} color="bg-ink" title={`Ingresos ${formatCents(m.income_cents)}`} />
                    <GrowBar pct={pctOf(m.expense_cents, maxBar)} color="bg-ink/25" title={`Gastos ${formatCents(m.expense_cents)}`} />
                  </div>
                  <span className="text-[10px] uppercase text-muted">{mlabel(m.month)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted"><span className="text-ink">■</span> Ingresos · <span className="text-ink/25">■</span> Gastos</p>
          </>
        )}
      </Card>

      </div>

      <div className="lg:col-span-2">
      <H2>Próximos 7 días</H2>
      <div className="mb-4">
        {up.loading && !up.data ? <Skeleton className="h-16" /> : (up.data || []).length === 0 && tasks.length === 0 ? <Card><Muted>Nada por vencer esta semana.</Muted></Card> : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {tasks.map((t, i) => {
              const done = doneIds.includes(t.id);
              return (
                <li key={`t${t.id}`} className="pv-in flex items-center gap-1 rounded-[28px] bg-inverse p-2 pr-4 text-oninv" style={{ animationDelay: `${i * 40}ms` }}>
                  <CheckBox checked={done} onChange={() => !done && complete(t)} label={`Completar ${t.title}`} />
                  <div className={`min-w-0 flex-1 transition-opacity ${done ? "opacity-50" : ""}`}>
                    <p className={`truncate text-sm font-semibold ${done ? "line-through" : ""}`}>{t.title}</p>
                    <p className={`text-xs ${t.due_date! < today && !done ? "font-semibold text-[#FF6369]" : "text-white/60"}`}>Pendiente · {fmtDate(t.due_date!)}</p>
                  </div>
                </li>
              );
            })}
            {(up.data || []).map((u, i) => (
              <li key={`${u.source}-${u.ref_id}-${u.due_date}-${i}`} className="pv-in flex items-center gap-3 rounded-[28px] bg-inverse p-3 pr-5 text-oninv" style={{ animationDelay: `${(tasks.length + i) * 40}ms` }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /></svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{u.name}</p>
                  <p className={`text-xs ${u.overdue ? "font-semibold text-[#FF6369]" : "text-white/60"}`}>{u.overdue ? "Vencido · " : ""}{fmtDate(u.due_date)}</p>
                </div>
                <p className={`num text-sm ${u.direction === "inflow" ? "text-[#3DD68C]" : ""}`}>{u.direction === "inflow" ? "+" : "−"}<Money cents={u.amount_cents} /></p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <H2>Hábitos de hoy</H2>
      {habitsL.loading && !habitsL.data ? <Skeleton className="mb-4 h-24" /> : habits.length === 0 ? (
        <div className="mb-4"><Empty title="Sin hábitos" hint="Crea uno para seguir tu racha." action={<Link href="/vida/" className="font-semibold text-ink underline">Ir a Vida</Link>} /></div>
      ) : (
        <div className="hide-scroll -mx-4 mb-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          {habits.map((h) => (
            <button key={h.id} onClick={() => toggle(h)} aria-pressed={h.done_today}
              className={`pv-press flex w-28 shrink-0 flex-col items-center gap-2 rounded-[28px] p-4 text-center shadow-soft ring-1 ${h.done_today ? "bg-ink text-onink ring-ink" : "bg-surface ring-line"}`}>
              <Ring size={56} stroke={5} pct={Math.round((h.week_count * 100) / Math.max(1, h.target_per_week))} color={h.done_today ? "currentColor" : "var(--ink)"}>
                <span className={`text-xl ${popId === h.id ? "pv-pop inline-block" : "inline-block"}`}>{h.emoji}</span>
              </Ring>
              <span className="w-full truncate text-xs font-semibold">{h.name}</span>
              <span className={`text-[11px] ${h.done_today ? "opacity-70" : "text-muted"}`}>{h.week_count}/{h.target_per_week}{h.streak_days > 0 ? ` · 🔥${h.streak_days}` : ""}</span>
            </button>
          ))}
        </div>
      )}
      </div>
      </div>

      <H2>Tarjetas</H2>
      {d.cards.length === 0 ? (
        <Empty title="Sin tarjetas" hint="Agrega una tarjeta de crédito en Cuentas." action={<Link href="/cuentas/" className="font-semibold text-ink underline">Ir a Cuentas</Link>} />
      ) : (
        <div className="mb-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {d.cards.map((c) => (
            <Card key={c.id}>
              <div className="flex items-baseline justify-between"><p className="font-semibold">{c.name}{c.overdue && <span className="ml-2 rounded-full bg-expense px-2 py-0.5 text-xs font-semibold text-white">Vencido</span>}</p><p className="num"><Money cents={c.owed_cents} /></p></div>
              {c.credit_limit_cents != null && (
                <>
                  <div className="my-2"><Bar pct={pctOf(c.owed_cents, c.credit_limit_cents)} over={c.owed_cents > c.credit_limit_cents} label="Uso del límite" /></div>
                  <Muted>Límite {formatCents(c.credit_limit_cents)} · disponible {c.available_credit_cents != null ? formatCents(c.available_credit_cents) : "—"}</Muted>
                </>
              )}
              {c.next_due_date && (
                <Muted>Próximo pago: {fmtDate(c.next_due_date)}{c.statement_due_cents != null ? ` · para no generar intereses ${formatCents(c.statement_due_cents)}` : ""}</Muted>
              )}
              {(c.minimum_due_cents ?? 0) > 0 && <p className="text-xs text-muted" title="Estimación: no incluye intereses ni IVA">Pago mínimo (estimado) {formatCents(c.minimum_due_cents ?? 0)} · Estimación: no incluye intereses ni IVA</p>}
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
  return <div title={title} className={`w-4 rounded-full ${color}`} style={{ height: `${Math.max(h, pct > 0 ? 2 : 0)}%`, transition: "height .8s cubic-bezier(.22,1,.36,1)" }} />;
}
