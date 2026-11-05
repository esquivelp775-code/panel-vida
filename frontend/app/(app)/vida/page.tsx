"use client";
import { useEffect, useState } from "react";
import Board from "@/components/Board";
import { api, fmtDate, todayISO, type Area, type Habit, type Priority, type Task } from "@/lib/api";
import { addDays } from "@/lib/calendar";
import { AREAS, AREA_COLOR, AREA_LABEL, groupTasks } from "@/lib/tasks";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, Empty, ErrorBox, Field, Input, Muted, Select, Textarea, useToast } from "@/components/ui";
import { CheckBox, Ring, Sheet, Skeleton } from "@/components/anim";

type Tab = "tasks" | "habits" | "ryventis";

export default function Vida() {
  const [tab, setTab] = useState<Tab>("tasks");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "ryventis" || t === "habits") setTab(t);
  }, []);
  return (
    <>
      <h1 className="mb-4 text-4xl font-bold"><span className="serif text-5xl">Vida</span> diaria</h1>
      <div role="tablist" className="relative mb-4 grid grid-cols-3 rounded-full bg-soft p-1">
        {([["tasks", "Pendientes"], ["habits", "Hábitos"], ["ryventis", "Ryventis"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative z-10 min-h-11 text-sm font-semibold transition-colors duration-200 ${tab === k ? "text-onaccent" : "text-muted"}`}>{l}</button>
        ))}
        <span className="absolute inset-y-1 left-1 w-[calc(33.333%-3px)] rounded-full bg-accent transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" style={{ transform: `translateX(${["tasks", "habits", "ryventis"].indexOf(tab) * 100}%)` }} />
      </div>
      <div key={tab} className="pv-page">{tab === "tasks" ? <Tasks /> : tab === "habits" ? <Habits /> : <Board />}</div>
    </>
  );
}

/* ---------------- Pendientes ---------------- */
const PRI_LABEL: Record<Priority, string> = { low: "Baja", normal: "Normal", high: "Alta" };

function Tasks() {
  const toast = useToast();
  const today = todayISO();
  const { data, error, loading, reload } = useLoad(() => api.tasks(), []);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState<Priority>("normal");
  const [area, setArea] = useState<Area>("personal");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [del, setDel] = useState<Task | null>(null);
  const [local, setLocal] = useState<Record<number, "done" | "pending">>({});

  const [day, setDay] = useState<string | null>(null);
  const dow = new Date(`${today}T12:00:00`).getDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const DOW3 = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const tasks = (data || []).map((t) => (local[t.id] ? { ...t, status: local[t.id] } : t)).filter((t) => !day || t.due_date === day);
  const g = groupTasks(tasks, today);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await api.createTask({ title: title.trim(), due_date: due || null, priority: pri, area }); setTitle(""); setDue(""); setPri("normal"); await reload(); }
    catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }
  async function flip(t: Task) {
    const to = t.status === "done" ? "pending" : "done";
    setLocal((l) => ({ ...l, [t.id]: to }));
    try { await (to === "done" ? api.completeTask(t.id) : api.reopenTask(t.id)); await reload(); setLocal((l) => { const n = { ...l }; delete n[t.id]; return n; }); }
    catch (err) { setLocal((l) => { const n = { ...l }; delete n[t.id]; return n; }); toast(errMsg(err), "err"); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.deleteTask(del.id); setDel(null); toast("Pendiente eliminado"); await reload(); }
    catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }

  const section = (label: string, items: Task[], tone = "") => items.length > 0 && (
    <div className="mb-4">
      <h2 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone || "text-muted"}`}>{label} · {items.length}</h2>
      <Card className="!p-1"><ul className="divide-y divide-line">{items.map((t) => <TaskRow key={t.id} t={t} today={today} onFlip={() => flip(t)} onEdit={() => setEdit(t)} />)}</ul></Card>
    </div>
  );

  return (
    <>
      <div role="group" aria-label="Filtrar por día" className="hide-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" aria-pressed={day === null} onClick={() => setDay(null)}
          className={`pv-press flex h-16 min-w-14 shrink-0 flex-col items-center justify-center rounded-full px-3 text-xs font-semibold ${day === null ? "bg-ink text-onink shadow-soft" : "bg-surface text-muted ring-1 ring-line"}`}>Todos</button>
        {week.map((d, i) => (
          <button type="button" key={d} aria-pressed={day === d} aria-label={`${DOW3[i]} ${Number(d.slice(8))}`} onClick={() => setDay(day === d ? null : d)}
            className={`pv-press flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-semibold ${day === d ? "bg-ink text-onink shadow-soft" : "bg-surface text-muted ring-1 ring-line"}`}>
            <span className="text-[11px] opacity-70">{DOW3[i]}</span>
            <span className="num text-base">{Number(d.slice(8))}</span>
            {d === today && <span className={`h-1 w-1 rounded-full ${day === d ? "bg-onink" : "bg-ink"}`} />}
          </button>
        ))}
      </div>
      <form onSubmit={add} className="mb-4 rounded-[28px] bg-surface p-4 ring-1 ring-line">
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nuevo pendiente…" maxLength={200} aria-label="Título del pendiente" />
          <Btn type="submit" disabled={busy || !title.trim()}>Añadir</Btn>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {([["Hoy", today], ["Mañana", addDays(today, 1)]] as const).map(([l, v]) => (
            <button type="button" key={l} onClick={() => setDue(due === v ? "" : v)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ring-1 ${due === v ? "bg-ink text-onink ring-ink" : "ring-ink/15"}`}>{l}</button>
          ))}
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="!min-h-9 !w-36 !py-1 !text-xs" aria-label="Fecha" />
          <Select value={pri} onChange={(e) => setPri(e.target.value as Priority)} className="!min-h-9 !w-24 !py-1 !text-xs" aria-label="Prioridad">
            {(["low", "normal", "high"] as const).map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
          </Select>
          <Select value={area} onChange={(e) => setArea(e.target.value as Area)} className="!min-h-9 !w-28 !py-1 !text-xs" aria-label="Área">
            {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
        </div>
      </form>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : tasks.length === 0 ? <Empty title="Sin pendientes" hint="Escribe arriba tu primera tarea." /> : (
        <>
          {section("Vencidas", g.overdue, "text-expense")}
          {section("Hoy", g.today)}
          {section("Próximas", g.upcoming)}
          {section("Sin fecha", g.nodate)}
          {g.done.length > 0 && (
            <div className="mb-4">
              <button onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className="mb-1 min-h-9 text-xs font-semibold uppercase tracking-wide text-muted">
                Hechas · {g.done.length} <span className={`inline-block transition-transform ${showDone ? "rotate-90" : ""}`}>›</span>
              </button>
              {showDone && <Card className="!p-1"><ul className="divide-y divide-line">{g.done.map((t) => <TaskRow key={t.id} t={t} today={today} onFlip={() => flip(t)} onEdit={() => setEdit(t)} />)}</ul></Card>}
            </div>
          )}
        </>
      )}
      <Sheet open={!!edit} title="Editar pendiente" onClose={() => setEdit(null)}>
        {edit && <EditForm key={edit.id} task={edit} onDelete={() => { setDel(edit); setEdit(null); }} onSaved={async () => { setEdit(null); await reload(); }} />}
      </Sheet>
      <Confirm open={!!del} title="Eliminar pendiente" message={del ? `¿Eliminar «${del.title}»? Esta acción no se puede deshacer.` : ""} confirmLabel="Eliminar" danger busy={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}

function TaskRow({ t, today, onFlip, onEdit }: { t: Task; today: string; onFlip: () => void; onEdit: () => void }) {
  const done = t.status === "done";
  return (
    <li className="flex items-center gap-1">
      <CheckBox checked={done} onChange={onFlip} label={`${done ? "Reabrir" : "Completar"} ${t.title}`} />
      <button onClick={onEdit} className="min-h-11 min-w-0 flex-1 py-1 text-left">
        <span className={`block truncate text-sm font-medium transition-all duration-300 ${done ? "text-muted line-through" : ""}`}>{t.priority === "high" && !done ? "❗ " : ""}{t.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${AREA_COLOR[t.area] || AREA_COLOR.otro}`}>{AREA_LABEL[t.area] || t.area}</span>
          {t.due_date && <span className={t.due_date < today && !done ? "font-semibold text-expense" : ""}>{fmtDate(t.due_date)}</span>}
        </span>
      </button>
    </li>
  );
}

function EditForm({ task, onSaved, onDelete }: { task: Task; onSaved: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: task.title, notes: task.notes || "", due: task.due_date || "", pri: task.priority, area: task.area });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    try { await api.updateTask(task.id, { title: f.title.trim(), notes: f.notes.trim() || undefined, due_date: f.due || null, priority: f.pri, area: f.area }); onSaved(); }
    catch (err) { toast(errMsg(err), "err"); setBusy(false); }
  }
  return (
    <form onSubmit={save}>
      <Field label="Título"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} /></Field>
      <Field label="Notas"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Fecha"><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Prioridad"><Select value={f.pri} onChange={(e) => setF({ ...f, pri: e.target.value as Priority })}>{(["low", "normal", "high"] as const).map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</Select></Field>
        <Field label="Área"><Select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })}>{AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}</Select></Field>
      </div>
      <div className="flex gap-2">
        <Btn variant="danger" onClick={onDelete}>Eliminar</Btn>
        <Btn type="submit" className="flex-1" disabled={busy}>Guardar</Btn>
      </div>
    </form>
  );
}

/* ---------------- Hábitos ---------------- */
const EMOJIS = ["✅", "💧", "🏃", "📚", "🧘", "💪", "😴", "🥗", "🚭", "💊", "✍️", "🎸", "🧹", "💰", "🦷", "🚶"];
const DIA = ["D", "L", "M", "M", "J", "V", "S"];

function Habits() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.habits(), []);
  const [over, setOver] = useState<Record<number, Habit>>({});
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [target, setTarget] = useState(7);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Habit | null>(null);
  const [pop, setPop] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await api.createHabit({ name: name.trim(), emoji, target_per_week: target }); setName(""); setOpen(false); await reload(); }
    catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }
  async function toggle(h: Habit, day: string) {
    setPop(`${h.id}${day}`);
    try { const r = await api.toggleHabit(h.id, day); setOver((o) => ({ ...o, [h.id]: r })); }
    catch (err) { toast(errMsg(err), "err"); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.deleteHabit(del.id); setDel(null); toast("Hábito eliminado"); await reload(); }
    catch (err) { toast(errMsg(err), "err"); } finally { setBusy(false); }
  }
  const habits = (data || []).map((h) => over[h.id] || h);

  return (
    <>
      {open ? (
        <form onSubmit={add} className="mb-4 rounded-[28px] bg-surface p-4 ring-1 ring-line">
          <Field label="Nombre del hábito"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus /></Field>
          <p className="mb-1 text-sm font-medium">Emoji</p>
          <div className="mb-3 grid grid-cols-8 gap-1">
            {EMOJIS.map((x) => <button type="button" key={x} onClick={() => setEmoji(x)} aria-label={`Emoji ${x}`} aria-pressed={emoji === x} className={`flex h-10 items-center justify-center rounded-lg text-xl transition-transform ${emoji === x ? "scale-110 bg-soft ring-2 ring-ink" : ""}`}>{x}</button>)}
          </div>
          <Field label={`Meta por semana: ${target} ${target === 1 ? "día" : "días"}`}>
            <input type="range" min={1} max={7} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-[var(--ink)]" />
          </Field>
          <div className="flex gap-2"><Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn><Btn type="submit" className="flex-1" disabled={busy || !name.trim()}>Crear hábito</Btn></div>
        </form>
      ) : <Btn className="mb-4 w-full" onClick={() => setOpen(true)}>+ Nuevo hábito</Btn>}
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-32" /> : habits.length === 0 ? <Empty title="Sin hábitos" hint="Crea el primero y construye tu racha." /> : (
        <div className="space-y-3">
          {habits.map((h) => (
            <Card key={h.id}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{h.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{h.name}</p>
                  <Muted>{h.streak_days > 0 ? `🔥${h.streak_days} ${h.streak_days === 1 ? "día" : "días"} de racha` : "Sin racha aún"}</Muted>
                </div>
                <Ring pct={Math.round((h.week_count * 100) / h.target_per_week)} color={h.week_count >= h.target_per_week ? "var(--income)" : "var(--ink)"}>{h.week_count}/{h.target_per_week}</Ring>
                <button onClick={() => setDel(h)} aria-label={`Eliminar ${h.name}`} className="min-h-11 min-w-9 text-muted">🗑</button>
              </div>
              <div className="flex justify-between">
                {h.last_7.map((d) => {
                  const dow = DIA[new Date(`${d.date}T12:00:00`).getDay()];
                  return (
                    <button key={d.date} onClick={() => toggle(h, d.date)} aria-pressed={d.done} aria-label={`${h.name} ${d.date}`} className="flex min-h-11 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted">{dow}</span>
                      <span key={pop === `${h.id}${d.date}` ? "p" : "n"} className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${d.done ? "bg-ink text-onink" : "bg-soft"} ${pop === `${h.id}${d.date}` ? "pv-pop" : ""}`}>{d.done ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Confirm open={!!del} title="Eliminar hábito" message={del ? `¿Eliminar «${del.name}»? Su historial se conserva pero ya no aparecerá.` : ""} confirmLabel="Eliminar" danger busy={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}
