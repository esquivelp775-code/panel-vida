"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, fmtDate, todayISO, type Habit, type Task, type UpcomingItem } from "@/lib/api";
import { addDays, greeting } from "@/lib/calendar";
import { parseReminders } from "@/lib/reminders";
import { getPref, useLoad, errMsg } from "@/lib/useLoad";
import { Btn, ErrorBox, Field, Input, Kicker, Money, Muted, useToast } from "@/components/ui";
import { CheckBox, CountMoney, Sheet, Skeleton } from "@/components/anim";

function Seg({ kicker, children, className = "" }: { kicker: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] bg-surface p-5 ring-1 ring-line ${className}`}>
      <Kicker>{kicker}</Kicker>
      {children}
    </section>
  );
}

const FRASES = [
  "La disciplina de hoy es la libertad de mañana.",
  "Paga primero la deuda más cara; cada peso cuenta.",
  "Pequeños pasos todos los días hacen grandes cambios.",
  "Lo que se mide, mejora.",
  "Hoy es buen día para avanzar un poco.",
  "Tu yo de junio te lo va a agradecer.",
  "Constancia antes que intensidad.",
];

export default function Inicio() {
  const toast = useToast();
  const today = todayISO();
  const dash = useLoad(() => api.dashboard(), []);
  const me = useLoad(() => api.me(), []);
  // Nombre del usuario (display_name) o la parte del correo antes de "@"; nunca un nombre fijo en el código.
  const firstName = (me.data?.display_name || me.data?.email?.split("@")[0] || "").split(/[\s._-]/)[0];
  const ryvS = useLoad(() => api.ryvSummary(), []);
  const up = useLoad(() => api.upcoming(7), []);
  const tasksL = useLoad(() => api.tasks(), []);
  const habitsL = useLoad(() => api.habits(), []);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [habitOver, setHabitOver] = useState<Record<number, Habit>>({});
  const [sheet, setSheet] = useState<"task" | "habit" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // AppShell sólo renderiza tras montar: aquí ya se puede leer la preferencia de este dispositivo.
  const [reminders] = useState(() => parseReminders(getPref("reminders") || null));
  const [showQuote] = useState(() => getPref("hide_quote") !== "1");
  // Si falla una carga no debe parecer que "no hay nada": un vencimiento oculto sale caro.
  const loadError = dash.error || up.error || tasksL.error || habitsL.error;
  const reloadAll = () => { dash.reload(); up.reload(); tasksL.reload(); habitsL.reload(); };

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const limit = addDays(today, 7);
  const open = useMemo(() => (tasksL.data || []).filter((t) => t.status !== "done"), [tasksL.data]);
  const todayTasks = open.filter((t) => t.due_date && t.due_date <= today);
  const weekTasks = open.filter((t) => t.due_date && t.due_date > today && t.due_date <= limit);
  const ryv = open.filter((t) => t.area === "ryventis");
  const ryvPending = ryv.filter((t) => t.status === "pending").length;
  const ryvDoing = ryv.filter((t) => t.status === "doing");

  const upData = up.data;
  const byDay = (() => {
    const m: Record<string, { tasks: Task[]; money: UpcomingItem[] }> = {};
    const slot = (d: string) => (m[d] ||= { tasks: [], money: [] });
    weekTasks.forEach((t) => slot(t.due_date!).tasks.push(t));
    (upData || []).forEach((u) => slot(u.due_date).money.push(u));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  })();

  async function complete(t: Task) {
    setDoneIds((x) => [...x, t.id]);
    try { await api.completeTask(t.id); } catch (e) { setDoneIds((x) => x.filter((i) => i !== t.id)); toast(errMsg(e), "err"); }
  }
  async function toggle(h: Habit) {
    try { const r = await api.toggleHabit(h.id); setHabitOver((o) => ({ ...o, [h.id]: r })); } catch (e) { toast(errMsg(e), "err"); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (sheet === "task") { await api.createTask({ title: text.trim(), due_date: today }); await tasksL.reload(); }
      else { await api.createHabit({ name: text.trim() }); await habitsL.reload(); }
      setText(""); setSheet(null); toast("Guardado");
    } catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }

  const d = dash.data;
  const habits = (habitsL.data || []).map((h) => habitOver[h.id] || h);
  const pill = "pv-press inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-line";

  return (
    <div className="stagger space-y-4">
      <header>
        <p className="text-sm capitalize text-muted">{dateStr}</p>
        <h1 className="t-h1">{greeting(now.getHours())}{firstName && <>, <span className="serif capitalize">{firstName}</span></>}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={pill} onClick={() => { setText(""); setSheet("task"); }}>+ Pendiente</button>
          <Link href="/registrar/" className={pill}>+ Gasto</Link>
          <button className={pill} onClick={() => { setText(""); setSheet("habit"); }}>+ Hábito</button>
        </div>
      </header>
      <ErrorBox message={loadError} onRetry={reloadAll} />

      {(showQuote || reminders.length > 0) && (
        <Seg kicker="Recordatorios">
          {showQuote && <p className="serif mb-3 text-2xl leading-snug">“{FRASES[new Date().getDate() % FRASES.length]}”</p>}
          <ul className="flex flex-wrap gap-2 text-sm">
            {reminders.map((r) => (
              <li key={r} className="rounded-full bg-surface px-3 py-1.5 ring-1 ring-line">{r}</li>
            ))}
          </ul>
        </Seg>
      )}
      <Seg kicker="Hoy">
        {tasksL.loading && !tasksL.data ? <Skeleton className="h-16" /> : (
          <>
            {todayTasks.length === 0 && habits.length === 0 && <Muted>Nada para hoy. Disfruta el día.</Muted>}
            <ul>
              {todayTasks.map((t) => {
                const done = doneIds.includes(t.id);
                return (
                  <li key={t.id} className="flex items-center gap-1">
                    <CheckBox checked={done} onChange={() => !done && complete(t)} label={`Completar ${t.title}`} />
                    <div className={`min-w-0 flex-1 ${done ? "opacity-50" : ""}`}>
                      <p className={`truncate text-sm font-semibold ${done ? "line-through" : ""}`}>{t.title}</p>
                      {t.due_date! < today && !done && <p className="text-xs font-semibold text-expense">Vencido · {fmtDate(t.due_date!)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {habits.length > 0 && (
              <div className="hide-scroll -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {habits.map((h) => (
                  <button key={h.id} onClick={() => toggle(h)} aria-pressed={h.done_today}
                    className={`pv-press flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ${h.done_today ? "bg-accent text-onaccent ring-transparent" : "bg-soft ring-line"}`}>
                    <span>{h.emoji}</span><span className="max-w-28 truncate">{h.name}</span>{h.streak_days > 0 && <span className="text-xs opacity-70">🔥{h.streak_days}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Seg>

      <Seg kicker="Esta semana">
        {up.loading && !up.data ? <Skeleton className="h-16" /> : byDay.length === 0 ? <Muted>Nada por vencer en los próximos 7 días.</Muted> : (
          <div className="space-y-3">
            {byDay.map(([day, g]) => (
              <div key={day}>
                <p className="mb-1 text-xs font-semibold capitalize text-muted">{fmtDate(day)}</p>
                <ul className="space-y-1">
                  {g.tasks.map((t) => <li key={`t${t.id}`} className="flex min-h-9 items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-accent" /><span className="min-w-0 flex-1 truncate">{t.title}</span></li>)}
                  {g.money.map((u, i) => (
                    <li key={`${u.source}-${u.ref_id}-${i}`} className="flex min-h-9 items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: u.direction === "inflow" ? "var(--income)" : "#FF9E7A" }} />
                      <span className="min-w-0 flex-1 truncate">{u.overdue ? "Vencido · " : ""}{u.name}</span>
                      <span className={`num text-sm ${u.direction === "inflow" ? "text-income" : "text-expense"}`}>{u.direction === "inflow" ? "+" : "−"}<Money cents={u.amount_cents} /></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Seg>

      <Seg kicker="Ryventis">
        <div className="mb-3 flex gap-6">
          <div><p className="num text-3xl">{ryvS.data ? <Money cents={ryvS.data.receivable_cents} /> : "—"}</p><p className="text-xs text-muted">Por cobrar</p></div>
          <div><p className="num text-3xl">{ryvPending}</p><p className="text-xs text-muted">Pendientes</p></div>
          <div><p className="num text-3xl">{ryvS.data ? ryvS.data.projects.en_marcha : ryvDoing.length}</p><p className="text-xs text-muted">En marcha</p></div>
        </div>
        <Link href="/ryventis/" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Ver tablero →</Link>
      </Seg>

      <Seg kicker="Finanzas">
        {!d ? <Skeleton className="h-20" /> : (
          <>
            <p className="text-sm text-muted">Dinero disponible</p>
            <p className="text-4xl font-bold"><CountMoney cents={d.available_cents} /></p>
            <p className="mt-1 text-sm text-muted">Deuda total <span className="num text-ink"><Money cents={d.total_debt_cents} /></span></p>
          </>
        )}
        <Link href="/finanzas/" className="btn-accent pv-press mt-3 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">Ver finanzas</Link>
      </Seg>

      <Sheet open={!!sheet} title={sheet === "task" ? "Nuevo pendiente" : "Nuevo hábito"} onClose={() => setSheet(null)}>
        <form onSubmit={save}>
          <Field label={sheet === "task" ? "Título (para hoy)" : "Nombre del hábito"}><Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoFocus /></Field>
          <Btn type="submit" className="w-full" disabled={busy || !text.trim()}>Guardar</Btn>
        </form>
      </Sheet>
    </div>
  );
}
