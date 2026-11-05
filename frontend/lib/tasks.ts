/* Agrupación pura de pendientes. */
export interface TaskLike { id: number; due_date: string | null; status: "pending" | "done"; priority: "low" | "normal" | "high" }
export interface TaskGroups<T> { overdue: T[]; today: T[]; upcoming: T[]; nodate: T[]; done: T[] }

const PRI = { high: 0, normal: 1, low: 2 } as const;

export function groupTasks<T extends TaskLike>(tasks: T[], today: string): TaskGroups<T> {
  const g: TaskGroups<T> = { overdue: [], today: [], upcoming: [], nodate: [], done: [] };
  for (const t of tasks) {
    if (t.status === "done") g.done.push(t);
    else if (!t.due_date) g.nodate.push(t);
    else if (t.due_date < today) g.overdue.push(t);
    else if (t.due_date === today) g.today.push(t);
    else g.upcoming.push(t);
  }
  const cmp = (a: T, b: T) => (a.due_date || "9").localeCompare(b.due_date || "9") || PRI[a.priority] - PRI[b.priority] || a.id - b.id;
  g.overdue.sort(cmp); g.today.sort(cmp); g.upcoming.sort(cmp); g.nodate.sort(cmp);
  return g;
}

export const AREAS = ["finanzas", "personal", "trabajo", "casa", "salud", "otro"] as const;
export const AREA_LABEL: Record<string, string> = { finanzas: "Finanzas", personal: "Personal", trabajo: "Trabajo", casa: "Casa", salud: "Salud", otro: "Otro" };
export const AREA_COLOR: Record<string, string> = {
  finanzas: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  personal: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  trabajo: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  casa: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  salud: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  otro: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
