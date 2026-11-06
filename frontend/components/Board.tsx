"use client";
import { useState } from "react";
import { api, fmtDate, todayISO, type Task } from "@/lib/api";
import { errMsg, useLoad } from "@/lib/useLoad";
import { ErrorBox, Input, Select, useToast } from "@/components/ui";
import { Skeleton } from "@/components/anim";

type St = "pending" | "doing" | "done";
const COLS: { st: St; label: string }[] = [
  { st: "pending", label: "Pendiente" }, { st: "doing", label: "En marcha" }, { st: "done", label: "Terminado" },
];

/** Tablero Kanban de Ryventis: toca una tarjeta para ver sus acciones de movimiento. */
export default function Board() {
  const toast = useToast();
  const today = todayISO();
  const { data, error, loading, reload } = useLoad(() => api.tasks(undefined, "ryventis"), []);
  const projs = useLoad(() => api.ryvProjects().catch(() => []), []);
  const [projectId, setProjectId] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const tasks = (data || []).filter((t) => t.area === "ryventis");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); setSel(null); await reload(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    await run(() => api.createTask({ title: title.trim(), area: "ryventis", project_id: projectId ? Number(projectId) : null }));
    setTitle("");
  }
  const act = "pv-press min-h-11 rounded-full bg-soft px-3 text-xs font-semibold ring-1 ring-line disabled:opacity-50";

  return (
    <>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : (
        <div className="hide-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
          {COLS.map((c) => {
            const items = tasks.filter((t) => t.status === c.st);
            return (
              <section key={c.st} aria-label={c.label} className="w-[78%] shrink-0 snap-start rounded-[28px] bg-surface p-3 ring-1 ring-line sm:w-72 lg:w-auto">
                <h3 className="mb-2 flex items-center justify-between px-1 font-sans text-xs font-semibold uppercase tracking-[.14em] text-muted"><span>{c.label}</span><span>{items.length}</span></h3>
                <ul className="space-y-2">
                  {items.map((t: Task) => {
                    const hot = c.st === "doing";
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => setSel(sel === t.id ? null : t.id)} aria-expanded={sel === t.id}
                          className={`pv-press w-full rounded-[20px] p-3 text-left ring-1 ${hot ? "text-[#2A1308] ring-transparent" : "bg-soft ring-line"} ${c.st === "done" ? "opacity-60" : ""}`}
                          style={hot ? { background: "linear-gradient(135deg,#FFB596,#FF9E7A)" } : undefined}>
                          <p className={`text-sm font-semibold ${c.st === "done" ? "line-through" : ""}`}>{t.title}</p>
                          {t.due_date && <p className={`text-xs ${hot ? "opacity-70" : t.due_date < today && c.st !== "done" ? "text-expense" : "text-muted"}`}>{fmtDate(t.due_date)}</p>}
                        </button>
                        {sel === t.id && (
                          <div className="pv-in mt-1 flex flex-wrap gap-2 px-1">
                            {t.status === "pending" && <button className={act} disabled={busy} onClick={() => run(() => api.startTask(t.id))}>Iniciar</button>}
                            {t.status !== "done" && <button className={act} disabled={busy} onClick={() => run(() => api.completeTask(t.id))}>Terminar</button>}
                            {t.status !== "pending" && <button className={act} disabled={busy} onClick={() => run(() => api.setTaskStatus(t.id, "pending"))}>Regresar</button>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {c.st === "pending" && (
                  <form onSubmit={add} className="mt-2">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Nueva tarea…" maxLength={200} aria-label="Nueva tarea de Ryventis" />
                    <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-2 !min-h-11 !py-1 !text-xs" aria-label="Proyecto (opcional)">
                      <option value="">Sin proyecto</option>
                      {(projs.data || []).filter((p) => p.status !== "cancelado").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
