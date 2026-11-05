"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Board from "@/components/Board";
import {
  api, fmtDate, todayISO, type Client, type ClientDetail, type InteractionKind, type Project, type ProjectStatus, type Receivable, type Stage,
} from "@/lib/api";
import { centsToInput, parseToCents, parseToCentsAllowZero } from "@/lib/money";
import { STAGES, STAGE_LABEL, STAGE_TINT, dueLabel, initials, pct, stageIndex } from "@/lib/ryventis";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, Empty, ErrorBox, Field, H2, Input, Money, Muted, Segmented, Select, Textarea, useToast } from "@/components/ui";
import { Sheet, Skeleton } from "@/components/anim";

type Tab = "resumen" | "clientes" | "proyectos" | "cobros" | "pendientes";
const TABS: { value: Tab; label: string }[] = [
  { value: "resumen", label: "Resumen" }, { value: "clientes", label: "Clientes" }, { value: "proyectos", label: "Proyectos" },
  { value: "cobros", label: "Cobros" }, { value: "pendientes", label: "Pendientes" },
];

export default function Page() {
  return <Suspense fallback={null}><Ryventis /></Suspense>;
}

function Ryventis() {
  const router = useRouter();
  const q = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>("resumen");
  // Reacciona a ?tab= (también al navegar desde el menú lateral).
  useEffect(() => { setTab(TABS.some((t) => t.value === q) ? (q as Tab) : "resumen"); }, [q]);
  function pick(t: Tab) { setTab(t); router.replace(t === "resumen" ? "/ryventis/" : `/ryventis/?tab=${t}`); }
  return (
    <>
      <h1 className="t-h1 mb-4"><span className="serif">Ryventis</span></h1>
      <Segmented value={tab} onChange={pick} options={TABS} />
      <div key={tab} className="pv-page">
        {tab === "resumen" ? <Resumen go={pick} /> : tab === "clientes" ? <Clientes /> : tab === "proyectos" ? <Proyectos /> : tab === "cobros" ? <Cobros /> : <Board />}
      </div>
    </>
  );
}

/* ---------------- Piezas comunes ---------------- */
function StageBadge({ stage }: { stage: Stage }) {
  const c = STAGE_TINT[stage] || STAGE_TINT.nuevo;
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `rgba(${c},.18)`, color: `rgb(${c})`, boxShadow: `inset 0 0 0 1px rgba(${c},.35)` }}>{STAGE_LABEL[stage]}</span>;
}
function Avatar({ name }: { name: string }) {
  return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-bold ring-1 ring-line" aria-hidden>{initials(name)}</span>;
}
function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-soft">
      <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}
function Kpi({ label, children, tone = "" }: { label: string; children: React.ReactNode; tone?: string }) {
  return <div className={`rounded-[22px] bg-soft p-4 ring-1 ring-line ${tone}`}><p className="text-xs text-muted">{label}</p><p className="num mt-1 text-xl font-bold">{children}</p></div>;
}

/* ---------------- Resumen ---------------- */
function Resumen({ go }: { go: (t: Tab) => void }) {
  const today = todayISO();
  const { data: s, error, loading, reload } = useLoad(() => api.ryvSummary(), []);
  if (loading && !s) return <Skeleton className="h-64" />;
  if (!s) return <ErrorBox message={error} onRetry={reload} />;
  const total = STAGES.reduce((n, k) => n + s.pipeline[k], 0);
  return (
    <>
      <ErrorBox message={error} onRetry={reload} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Kpi label="Por cobrar"><Money cents={s.receivable_cents} /></Kpi>
        <Kpi label="Vencido" tone={s.overdue_receivable_cents > 0 ? "!bg-expense/10" : ""}><span className={s.overdue_receivable_cents > 0 ? "text-expense" : ""}><Money cents={s.overdue_receivable_cents} /></span></Kpi>
        <Kpi label="Cobrado este mes"><Money cents={s.collected_month_cents} /></Kpi>
        <Kpi label="Valor activo en proyectos"><Money cents={s.active_value_cents} /></Kpi>
      </div>
      <Card className="mb-4">
        <H2>Pipeline por etapa</H2>
        <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label="Pipeline por etapa">
          {STAGES.map((k) => s.pipeline[k] > 0 && <div key={k} style={{ flex: s.pipeline[k], background: `rgb(${STAGE_TINT[k]})` }} title={`${STAGE_LABEL[k]}: ${s.pipeline[k]}`} />)}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {STAGES.map((k) => <li key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: `rgb(${STAGE_TINT[k]})` }} />{STAGE_LABEL[k]} <span className="num text-ink">{s.pipeline[k]}</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-muted">{total} contactos · valor abierto <Money cents={s.pipeline_value_cents} className="text-ink" /></p>
      </Card>
      <Card className="mb-4">
        <H2>Seguir hoy</H2>
        {s.followups.length === 0 ? <Muted>Nada que seguir. 🎉</Muted> : (
          <ul className="divide-y divide-line">
            {s.followups.map((f) => (
              <li key={f.client_id}><button onClick={() => go("clientes")} className={`flex min-h-11 w-full items-center gap-3 py-2 text-left ${f.overdue ? "text-expense" : ""}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{f.name}</span><span className="block truncate text-xs opacity-70">{f.next_step || "Dar seguimiento"}</span></span>
                <span className="text-xs font-semibold">{f.next_step_date <= today && !f.overdue ? "Hoy" : fmtDate(f.next_step_date)}</span>
              </button></li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mb-4">
        <H2>Próximas entregas</H2>
        {s.upcoming_deliveries.length === 0 ? <Muted>Sin entregas próximas.</Muted> : (
          <ul className="divide-y divide-line">
            {s.upcoming_deliveries.map((d) => (
              <li key={d.project_id} className="flex min-h-11 items-center gap-3 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{d.name}</span>{d.client_name && <span className="block truncate text-xs text-muted">{d.client_name}</span>}</span>
                <span className="text-xs font-semibold">{dueLabel(d.due_date, today, fmtDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <H2>Tareas</H2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="num text-2xl">{s.tasks.pending}</p><p className="text-xs text-muted">Pendientes</p></div>
          <div><p className="num text-2xl">{s.tasks.doing}</p><p className="text-xs text-muted">En marcha</p></div>
          <div><p className="num text-2xl">{s.tasks.done}</p><p className="text-xs text-muted">Terminadas</p></div>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Clientes ---------------- */
const KIND_LABEL: Record<InteractionKind, string> = { mensaje: "Mensaje", llamada: "Llamada", email: "Email", reunion: "Reunión", otro: "Otro" };

function Clientes() {
  const { data, error, loading, reload } = useLoad(() => api.ryvClients(), []);
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const today = todayISO();
  const needle = q.trim().toLowerCase();
  const list = (data || []).filter((c) => !needle || `${c.name} ${c.company}`.toLowerCase().includes(needle));
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contacto…" aria-label="Buscar contacto" />
        <Btn onClick={() => setAdd(true)}>+ Contacto</Btn>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : list.length === 0 ? <Empty title="Sin contactos" hint="Agrega tu primer contacto." /> : (
        <Card className="!p-1"><ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id}><button onClick={() => setSel(c.id)} className="pv-press flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="block truncate text-xs text-muted">{c.company || "Sin empresa"}</span></span>
              <span className="flex flex-col items-end gap-1"><StageBadge stage={c.stage} />
                {c.next_step_date && <span className={`text-[11px] ${c.next_step_date <= today ? "font-semibold text-expense" : "text-muted"}`}>{fmtDate(c.next_step_date)}</span>}</span>
            </button></li>
          ))}
        </ul></Card>
      )}
      <Sheet open={add} title="Nuevo contacto" onClose={() => setAdd(false)}>
        {add && <ClientForm onDone={async () => { setAdd(false); await reload(); }} />}
      </Sheet>
      <Sheet open={sel !== null} title="Contacto" onClose={() => setSel(null)}>
        {sel !== null && <ClientDetailView key={sel} id={sel} onChanged={reload} onDeleted={async () => { setSel(null); await reload(); }} />}
      </Sheet>
    </>
  );
}

function ClientForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", source: "" });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try { await api.ryvCreateClient({ name: f.name.trim(), company: f.company.trim(), phone: f.phone.trim(), email: f.email.trim(), source: f.source.trim() }); toast("Contacto creado"); onDone(); }
    catch (err) { toast(errMsg(err), "err"); setBusy(false); }
  }
  return (
    <form onSubmit={save}>
      <Field label="Nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus /></Field>
      <Field label="Empresa"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} maxLength={120} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Teléfono"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Correo"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <Field label="Origen"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Referido, Instagram…" /></Field>
      <Btn type="submit" className="w-full" disabled={busy || !f.name.trim()}>Crear contacto</Btn>
    </form>
  );
}

function ClientDetailView({ id, onChanged, onDeleted }: { id: number; onChanged: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { data: c, error, reload } = useLoad(() => api.ryvClient(id), [id]);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [kind, setKind] = useState<InteractionKind>("mensaje");
  const [summary, setSummary] = useState("");
  if (!c) return <><ErrorBox message={error} onRetry={reload} />{!error && <Skeleton className="h-40" />}</>;
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); await reload(); onChanged(); return true; }
    catch (err) { toast(errMsg(err), "err"); return false; } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.ryvDeleteClient(id); toast("Contacto eliminado"); onDeleted(); }
    catch (err) { toast(errMsg(err), "err"); setDel(false); } finally { setBusy(false); }
  }
  const idx = stageIndex(c.stage);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><Avatar name={c.name} />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.name}</p><p className="truncate text-xs text-muted">{c.company || "Sin empresa"}{c.phone ? ` · ${c.phone}` : ""}</p></div>
        <StageBadge stage={c.stage} />
      </div>
      <div role="group" aria-label="Etapa" className="mb-3 grid grid-cols-4 gap-1">
        {STAGES.map((k, i) => (
          <button key={k} type="button" disabled={busy} aria-pressed={c.stage === k} onClick={() => k !== c.stage && run(() => api.ryvUpdateClient(id, { stage: k }))} className="pv-press min-h-11 text-center">
            <span className="block h-1.5 rounded-full" style={{ background: i <= idx ? `rgb(${STAGE_TINT[k]})` : "var(--soft, rgba(128,128,128,.25))" }} />
            <span className={`mt-1 block text-[11px] font-semibold ${i === idx ? "text-ink" : "text-muted"}`}>{STAGE_LABEL[k]}</span>
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Kpi label="Valor abierto"><Money cents={c.open_value_cents} /></Kpi>
        <Kpi label="Por cobrar"><Money cents={c.receivable_cents} /></Kpi>
      </div>
      <ClientEdit key={`${c.next_step}|${c.next_step_date}|${c.source}|${c.notes}`} c={c} busy={busy} onSave={(b) => run(() => api.ryvUpdateClient(id, b), "Guardado")} />
      <H2>Interacciones</H2>
      <form className="mb-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!summary.trim()) return; if (await run(() => api.ryvAddInteraction(id, { kind, summary: summary.trim() }))) setSummary(""); }}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)} className="!w-28 shrink-0" aria-label="Tipo de interacción">
          {(Object.keys(KIND_LABEL) as InteractionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Resumen…" aria-label="Resumen de la interacción" maxLength={500} />
        <Btn type="submit" disabled={busy || !summary.trim()}>+ Interacción</Btn>
      </form>
      {c.interactions.length === 0 ? <Muted className="mb-3">Sin interacciones.</Muted> : (
        <ol className="mb-3 border-l border-line pl-4">
          {c.interactions.map((i) => (
            <li key={i.id} className="relative mb-3"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ink" />
              <p className="text-xs text-muted">{KIND_LABEL[i.kind]} · {fmtDate(i.happened_on)}</p><p className="text-sm">{i.summary}</p></li>
          ))}
        </ol>
      )}
      <H2>Proyectos</H2>
      {c.projects.length === 0 ? <Muted className="mb-3">Sin proyectos.</Muted> : (
        <ul className="mb-3 divide-y divide-line">{c.projects.map((p) => <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 text-sm"><span className="truncate">{p.name}</span><Money cents={p.amount_cents} className="text-muted" /></li>)}</ul>
      )}
      <Btn variant="danger" onClick={() => setDel(true)} disabled={busy}>Eliminar contacto</Btn>
      <Confirm open={del} title="Eliminar contacto" message={`¿Eliminar «${c.name}»? Sólo es posible si no tiene proyectos ni cobros.`} confirmLabel="Eliminar" danger busy={busy} onConfirm={remove} onClose={() => setDel(false)} />
    </div>
  );
}

function ClientEdit({ c, busy, onSave }: { c: ClientDetail; busy: boolean; onSave: (b: { next_step: string; next_step_date: string | null; source: string; notes: string }) => void }) {
  const [f, setF] = useState({ next_step: c.next_step, date: c.next_step_date || "", source: c.source, notes: c.notes });
  return (
    <form className="mb-4" onSubmit={(e) => { e.preventDefault(); onSave({ next_step: f.next_step.trim(), next_step_date: f.date || null, source: f.source.trim(), notes: f.notes.trim() }); }}>
      <div className="grid grid-cols-[1fr_9rem] gap-2">
        <Field label="Siguiente paso"><Input value={f.next_step} onChange={(e) => setF({ ...f, next_step: e.target.value })} maxLength={200} /></Field>
        <Field label="Fecha"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <Field label="Origen"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
      <Field label="Notas"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Btn type="submit" variant="secondary" disabled={busy}>Guardar cambios</Btn>
    </form>
  );
}

/* ---------------- Proyectos ---------------- */
const PCOLS: { st: ProjectStatus; label: string }[] = [
  { st: "pendiente", label: "Pendiente" }, { st: "en_marcha", label: "En marcha" }, { st: "terminado", label: "Terminado" },
];

function Proyectos() {
  const toast = useToast();
  const today = todayISO();
  const { data, error, loading, reload } = useLoad(() => api.ryvProjects(), []);
  const [sheet, setSheet] = useState<{ edit: Project | null } | null>(null);
  const [recv, setRecv] = useState<Project | null>(null);
  const [del, setDel] = useState<Project | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const projects = (data || []).filter((p) => p.status !== "cancelado");

  async function move(p: Project, st: ProjectStatus) {
    setBusy(true);
    try { await api.ryvUpdateProject(p.id, { status: st }); setSel(null); await reload(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.ryvDeleteProject(del.id); toast("Proyecto eliminado"); setDel(null); await reload(); }
    catch (e) { toast(errMsg(e), "err"); setDel(null); } finally { setBusy(false); }
  }
  const act = "pv-press min-h-9 rounded-full bg-soft px-3 text-xs font-semibold ring-1 ring-line disabled:opacity-50";
  return (
    <>
      <Btn className="mb-3 w-full" onClick={() => setSheet({ edit: null })}>+ Proyecto</Btn>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : (
        <div className="hide-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
          {PCOLS.map((c, ci) => {
            const items = projects.filter((p) => p.status === c.st);
            return (
              <section key={c.st} aria-label={c.label} className="w-[82%] shrink-0 snap-start rounded-[28px] bg-surface p-3 ring-1 ring-line sm:w-80 lg:w-auto">
                <h3 className="mb-2 flex items-center justify-between px-1 font-sans text-xs font-semibold uppercase tracking-[.14em] text-muted"><span>{c.label}</span><span>{items.length}</span></h3>
                <ul className="space-y-2">
                  {items.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSel(sel === p.id ? null : p.id)} aria-expanded={sel === p.id} className={`pv-press w-full rounded-[20px] bg-soft p-3 text-left ring-1 ring-line ${c.st === "terminado" ? "opacity-70" : ""}`}>
                        <span className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span>{p.client_name && <span className="block truncate text-xs text-muted">{p.client_name}</span>}</span>
                          <Money cents={p.amount_cents} className="shrink-0 text-sm font-semibold" /></span>
                        {p.due_date && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${p.due_date < today && c.st !== "terminado" ? "text-expense ring-expense/40" : p.due_date === today ? "ring-ink/40" : "text-muted ring-line"}`}>{dueLabel(p.due_date, today, (d) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`)))}</span>}
                        <span className="mt-2 block"><span className="mb-1 flex justify-between text-[11px] text-muted"><span>Tareas {p.tasks_done}/{p.tasks_total}</span></span><Progress value={pct(p.tasks_done, p.tasks_total)} label={`Tareas de ${p.name}`} /></span>
                        <span className="mt-2 block"><span className="mb-1 flex justify-between text-[11px] text-muted"><span>Cobrado</span><span><Money cents={p.collected_cents} /> / <Money cents={p.amount_cents} /></span></span><Progress value={pct(p.collected_cents, p.amount_cents)} label={`Cobro de ${p.name}`} /></span>
                      </button>
                      {sel === p.id && (
                        <div className="pv-in mt-1 flex flex-wrap gap-2 px-1">
                          {ci > 0 && <button className={act} disabled={busy} onClick={() => move(p, PCOLS[ci - 1].st)}>← {PCOLS[ci - 1].label}</button>}
                          {ci < 2 && <button className={act} disabled={busy} onClick={() => move(p, PCOLS[ci + 1].st)}>{PCOLS[ci + 1].label} →</button>}
                          <button className={act} onClick={() => setSheet({ edit: p })}>Editar</button>
                          <button className={act} onClick={() => setRecv(p)}>+ Cobro</button>
                          <button className={`${act} text-expense`} onClick={() => setDel(p)}>Eliminar</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <Sheet open={!!sheet} title={sheet?.edit ? "Editar proyecto" : "Nuevo proyecto"} onClose={() => setSheet(null)}>
        {sheet && <ProjectForm key={sheet.edit?.id ?? 0} p={sheet.edit} onDone={async () => { setSheet(null); setSel(null); await reload(); }} />}
      </Sheet>
      <Sheet open={!!recv} title="Nuevo cobro" onClose={() => setRecv(null)}>
        {recv && <ReceivableForm key={recv.id} project={recv} onDone={async () => { setRecv(null); toast("Cobro creado"); await reload(); }} />}
      </Sheet>
      <Confirm open={!!del} title="Eliminar proyecto" message={del ? `¿Eliminar «${del.name}»? Sólo es posible si no tiene cobros.` : ""} confirmLabel="Eliminar" danger busy={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}

function ProjectForm({ p, onDone }: { p: Project | null; onDone: () => void }) {
  const toast = useToast();
  const clients = useLoad(() => api.ryvClients().catch(() => [] as Client[]), []);
  const [f, setF] = useState({ name: p?.name || "", client: p?.client_id ? String(p.client_id) : "", amount: p ? centsToInput(p.amount_cents) : "", due: p?.due_date || "" });
  const [busy, setBusy] = useState(false);
  const cents = f.amount.trim() === "" ? 0 : parseToCentsAllowZero(f.amount);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    if (cents === null) { toast("Monto inválido", "err"); return; }
    setBusy(true);
    const body = { name: f.name.trim(), client_id: f.client ? Number(f.client) : null, amount_cents: cents, due_date: f.due || null };
    try { await (p ? api.ryvUpdateProject(p.id, body) : api.ryvCreateProject(body)); toast(p ? "Proyecto actualizado" : "Proyecto creado"); onDone(); }
    catch (err) { toast(errMsg(err), "err"); setBusy(false); }
  }
  return (
    <form onSubmit={save}>
      <Field label="Nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} autoFocus /></Field>
      <Field label="Cliente"><Select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">Sin cliente</option>{(clients.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Monto"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Entrega"><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      </div>
      <Btn type="submit" className="w-full" disabled={busy || !f.name.trim() || cents === null}>{p ? "Guardar" : "Crear proyecto"}</Btn>
    </form>
  );
}

/* ---------------- Cobros ---------------- */
function ReceivableForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const toast = useToast();
  const projects = useLoad(() => api.ryvProjects().catch(() => [] as Project[]), []);
  const clients = useLoad(() => api.ryvClients().catch(() => [] as Client[]), []);
  const [f, setF] = useState({ desc: project ? `Cobro ${project.name}` : "", amount: "", project: project ? String(project.id) : "", client: project?.client_id ? String(project.client_id) : "", due: "" });
  const [busy, setBusy] = useState(false);
  const cents = parseToCents(f.amount);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.desc.trim() || cents === null || busy) return;
    setBusy(true);
    try { await api.ryvCreateReceivable({ description: f.desc.trim(), amount_cents: cents, project_id: f.project ? Number(f.project) : null, client_id: f.client ? Number(f.client) : null, due_date: f.due || null }); onDone(); }
    catch (err) { toast(errMsg(err), "err"); setBusy(false); }
  }
  return (
    <form onSubmit={save}>
      <Field label="Descripción"><Input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} maxLength={200} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Monto"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Vence"><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      </div>
      <Field label="Proyecto"><Select value={f.project} onChange={(e) => {
        const pr = (projects.data || []).find((x) => String(x.id) === e.target.value);
        setF({ ...f, project: e.target.value, client: pr?.client_id ? String(pr.client_id) : f.client });
      }}><option value="">Sin proyecto</option>{(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Cliente"><Select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">Sin cliente</option>{(clients.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Btn type="submit" className="w-full" disabled={busy || !f.desc.trim() || cents === null}>Crear cobro</Btn>
    </form>
  );
}

function CollectForm({ r, onDone }: { r: Receivable; onDone: () => void }) {
  const toast = useToast();
  const accts = useLoad(() => api.accounts("asset"), []);
  const [acct, setAcct] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const list = (accts.data || []).filter((a) => !a.is_system);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!acct || busy) return;
    setBusy(true);
    try { await api.ryvCollect(r.id, { account_id: Number(acct), occurred_on: date }); toast("Cobro registrado"); onDone(); }
    catch (err) { toast(errMsg(err), "err"); setBusy(false); }
  }
  return (
    <form onSubmit={save}>
      <p className="mb-3 text-sm">{r.description} · <Money cents={r.amount_cents} className="font-semibold" /></p>
      <ErrorBox message={accts.error} onRetry={accts.reload} />
      <Field label="Cuenta que recibe"><Select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Cuenta que recibe"><option value="">Elige una cuenta</option>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Btn type="submit" className="w-full" disabled={busy || !acct || !date}>Cobrar</Btn>
    </form>
  );
}

function Cobros() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.ryvReceivables(), []);
  const [add, setAdd] = useState(false);
  const [col, setCol] = useState<Receivable | null>(null);
  const [del, setDel] = useState<Receivable | null>(null);
  const [busy, setBusy] = useState(false);
  const all = data || [];
  const open = all.filter((r) => r.status === "por_cobrar").sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const done = all.filter((r) => r.status === "cobrado");
  const sum = (l: Receivable[]) => l.reduce((n, r) => n + r.amount_cents, 0);
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.ryvDeleteReceivable(del.id); toast("Cobro eliminado"); setDel(null); await reload(); }
    catch (e) { toast(errMsg(e), "err"); setDel(null); } finally { setBusy(false); }
  }
  const row = (r: Receivable) => (
    <li key={r.id} className={`flex items-center gap-2 px-3 py-2 ${r.overdue ? "bg-expense/10" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{r.description}</p>
        <p className="truncate text-xs text-muted">{[r.project_name, r.client_name].filter(Boolean).join(" · ") || "Sin proyecto"}</p>
        <p className={`text-xs ${r.overdue ? "font-semibold text-expense" : "text-muted"}`}>
          {r.status === "cobrado" ? `Cobrado ${r.collected_on ? fmtDate(r.collected_on) : ""}` : r.due_date ? `${r.overdue ? "Vencido · " : "Vence "}${fmtDate(r.due_date)}` : "Sin fecha"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Money cents={r.amount_cents} className="text-sm font-semibold" />
        {r.status === "por_cobrar" && <div className="flex gap-1">
          <button className="pv-press min-h-9 rounded-full btn-accent px-3 text-xs font-semibold" onClick={() => setCol(r)}>Cobrar</button>
          <button className="pv-press min-h-9 rounded-full px-2 text-xs text-muted" aria-label={`Eliminar ${r.description}`} onClick={() => setDel(r)}>🗑</button>
        </div>}
      </div>
    </li>
  );
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Kpi label="Por cobrar"><Money cents={sum(open)} /></Kpi>
        <Kpi label="Cobrados"><Money cents={sum(done)} /></Kpi>
      </div>
      <Btn className="mb-3 w-full" onClick={() => setAdd(true)}>+ Cobro</Btn>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : all.length === 0 ? <Empty title="Sin cobros" hint="Crea el primero con + Cobro." /> : (
        <>
          <h2 className="t-kicker mb-1">Por cobrar · {open.length}</h2>
          <Card className="mb-4 overflow-hidden !p-0">{open.length === 0 ? <p className="p-4 text-sm text-muted">Nada pendiente.</p> : <ul className="divide-y divide-line">{open.map(row)}</ul>}</Card>
          <h2 className="t-kicker mb-1">Cobrados · {done.length}</h2>
          <Card className="overflow-hidden !p-0">{done.length === 0 ? <p className="p-4 text-sm text-muted">Aún sin cobros.</p> : <ul className="divide-y divide-line">{done.map(row)}</ul>}</Card>
        </>
      )}
      <Sheet open={add} title="Nuevo cobro" onClose={() => setAdd(false)}>{add && <ReceivableForm onDone={async () => { setAdd(false); toast("Cobro creado"); await reload(); }} />}</Sheet>
      <Sheet open={!!col} title="Cobrar" onClose={() => setCol(null)}>{col && <CollectForm r={col} onDone={async () => { setCol(null); await reload(); }} />}</Sheet>
      <Confirm open={!!del} title="Eliminar cobro" message={del ? `¿Eliminar «${del.description}»?` : ""} confirmLabel="Eliminar" danger busy={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}
