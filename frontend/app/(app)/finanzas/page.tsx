"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtDate, fmtMonth, monthISO, monthRange, shiftMonth } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { Bar, Card, Empty, ErrorBox, Kicker, Money, Muted, Segmented, pctOf } from "@/components/ui";
import { CountMoney, DONUT_COLORS, Donut, Skeleton } from "@/components/anim";
import { formatCents } from "@/lib/money";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mlabel = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const TILES = [
  ["/movimientos/", "Movimientos"], ["/cuentas/", "Cuentas"], ["/deudas/", "Deudas"], ["/presupuestos/", "Presupuestos"],
  ["/flujo/", "Flujo"], ["/importar/", "Importar"], ["/exportar/", "Exportar"],
];

/** Gráfica de área/línea de la proyección de deuda; dibuja con trazo animado. Sólo geometría: los importes no se calculan. */
function DebtChart({ pts }: { pts: { month: string; remaining_cents: number }[] }) {
  const W = 300, H = 120, P = 6;
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts.map((p) => p.remaining_cents));
  const xy = pts.map((p, i) => [P + (i * (W - 2 * P)) / (pts.length - 1), P + (1 - p.remaining_cents / max) * (H - 2 * P - 4)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label="Deuda restante mes a mes">
      <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".45" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#dg)" className="pv-in" style={{ animationDelay: ".5s" }} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pv-draw" style={{ ["--len" as string]: 700 }} pathLength={700} />
    </svg>
  );
}

function DebtPlanCard() {
  const [target, setTarget] = useState("2027-06");
  const { data, loading, error, reload } = useLoad(() => api.debtPlan(target), [target]);
  const payoffs = data?.debts.map((d) => d.projected_payoff_month) || [];
  // Sólo hay "ritmo actual" si TODAS las deudas tienen pagos que las liquidan; si no, se muestra la meta.
  const lastDebtMonth = payoffs.length && payoffs.every(Boolean) ? [...payoffs].sort().pop() : null;
  return (
    <Card>
      <Kicker>Plan de deudas</Kicker>
      <Segmented value={target} onChange={setTarget} options={[{ value: "2027-05", label: "May 2027" }, { value: "2027-06", label: "Jun 2027" }, { value: "2027-07", label: "Jul 2027" }]} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : data && (
        <>
          <p className="text-2xl font-bold leading-tight">
            {data.feasible ? <>Libre de deudas en <span className="serif text-3xl">{fmtMonth(data.target_month)}</span></> : lastDebtMonth ? <>Al ritmo actual: <span className="serif text-3xl">{fmtMonth(lastDebtMonth)}</span></> : <>Meta: <span className="serif text-3xl">{fmtMonth(data.target_month)}</span></>}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-[20px] bg-soft p-3 text-sm">
            <div><p className="text-xs text-muted">Necesario al mes</p><p className="num"><Money cents={data.total_monthly_needed_cents} /></p></div>
            <div className="text-right"><p className="text-xs text-muted">Neto promedio</p><p className="num"><Money cents={data.avg_monthly_net_cents} tone /></p></div>
          </div>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${data.feasible ? "bg-income/20 text-income" : "bg-expense/20 text-expense"}`}>{data.feasible ? "Factible" : "No alcanza al ritmo actual"}</span>
          <ul className="mt-3 space-y-3">
            {data.debts.map((d) => (
              <li key={d.account_id}>
                <div className="flex items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold">{d.name}</p><p className="num text-sm"><Money cents={d.owed_cents} /></p></div>
                <p className="mb-1 text-xs text-muted">Necesitas {formatCents(d.monthly_needed_cents)}/mes · programado {formatCents(d.scheduled_monthly_cents)}/mes{d.scheduled_once_cents > 0 ? ` + ${formatCents(d.scheduled_once_cents)} en pagos únicos` : ""}</p>
                <Bar pct={d.on_track ? 100 : pctOf(d.scheduled_monthly_cents, Math.max(1, d.monthly_needed_cents))} over={!d.on_track} label={`Avance ${d.name}`} />
              </li>
            ))}
          </ul>
          <div className="mt-4"><DebtChart key={target} pts={data.projection} /></div>
        </>
      )}
    </Card>
  );
}

export default function Finanzas() {
  const router = useRouter();
  const month = monthISO();
  const [mStart, mEnd] = monthRange(month);
  const dash = useLoad(() => api.dashboard(), []);
  const flow = useLoad(() => api.cashflow(`${shiftMonth(month, -5)}-01`, mEnd), []);
  const cats = useLoad(() => api.byCategory(mStart, mEnd), []);
  const months = flow.data?.months.slice(-6) || [];
  const maxBar = Math.max(1, ...months.flatMap((m) => [m.income_cents, m.expense_cents]));
  const slices = (cats.data || []).filter((c) => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents).slice(0, 8)
    .map((c) => ({ id: c.category_id, label: c.name, value: c.total_cents }));
  const catTotal = slices.reduce((a, s) => a + s.value, 0);
  const goCat = (id: number) => router.push(`/movimientos/?account_id=${id}&date_from=${mStart}`);
  const d = dash.data;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      <header className="lg:col-span-2">
        <h1 className="t-h1">Tus <span className="serif">finanzas</span></h1>
      </header>
      <ErrorBox message={dash.error} onRetry={dash.reload} />
      <Card className="lg:col-span-2">
        {!d ? <Skeleton className="h-28" /> : (
          <>
            <p className="text-sm text-muted">Dinero disponible</p>
            <p className="text-4xl font-bold min-[400px]:text-5xl"><CountMoney cents={d.available_cents} /></p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[20px] bg-soft p-3"><p className="text-xs text-muted">Deuda total</p><p className="num text-sm"><Money cents={d.total_debt_cents} /></p></div>
              <div className="rounded-[20px] bg-soft p-3"><p className="text-xs text-muted">Patrimonio</p><p className="num text-sm"><Money cents={d.net_worth_cents} tone /></p></div>
            </div>
          </>
        )}
      </Card>

      <div className="lg:col-span-2"><DebtPlanCard /></div>

      <Card>
        <Kicker>Gasto por categoría</Kicker>
        {cats.loading && !cats.data ? <Skeleton className="h-36" /> : slices.length === 0 ? <Muted>Sin gastos este mes.</Muted> : (
          <div className="flex items-center gap-3">
            <Donut slices={slices} onPick={goCat} />
            <ul className="min-w-0 flex-1 space-y-1">
              {slices.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => goCat(s.id)} className="flex min-h-11 w-full items-center gap-2 text-left text-xs">
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

      <Card>
        <Kicker>Ingresos vs gastos (6 meses)</Kicker>
        {flow.loading && !flow.data ? <Skeleton className="h-32" /> : months.length === 0 ? <Muted>Sin datos.</Muted> : (
          <>
            <div className="flex h-32 items-end justify-between gap-2">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <GrowBar pct={pctOf(m.income_cents, maxBar)} color="bg-accent" title={`Ingresos ${formatCents(m.income_cents)}`} />
                    <GrowBar pct={pctOf(m.expense_cents, maxBar)} color="bg-white/30" title={`Gastos ${formatCents(m.expense_cents)}`} />
                  </div>
                  <span className="text-xs uppercase text-muted">{mlabel(m.month)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted"><span className="text-accent">■</span> Ingresos · <span className="opacity-50">■</span> Gastos</p>
          </>
        )}
      </Card>

      <div className="lg:col-span-2">
        <Kicker>Tarjetas</Kicker>
        {!d ? null : d.cards.length === 0 ? (
          <Empty title="Sin tarjetas" hint="Agrega una tarjeta de crédito en Cuentas." action={<Link href="/cuentas/" className="font-semibold underline">Ir a Cuentas</Link>} />
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {d.cards.map((c) => (
              <Card key={c.id}>
                <div className="flex items-baseline justify-between gap-2"><p className="min-w-0 font-semibold">{c.name}{c.overdue && <span className="ml-2 inline-block rounded-full bg-expense/15 px-2 py-0.5 text-xs font-semibold text-expense ring-1 ring-expense/30">Vencido</span>}</p><p className="num shrink-0"><Money cents={c.owed_cents} /></p></div>
                {c.credit_limit_cents != null && (
                  <>
                    <div className="my-2"><Bar pct={pctOf(c.owed_cents, c.credit_limit_cents)} over={c.owed_cents > c.credit_limit_cents} label="Uso del límite" /></div>
                    <Muted>Límite {formatCents(c.credit_limit_cents)} · disponible {c.available_credit_cents != null ? formatCents(c.available_credit_cents) : "—"}</Muted>
                  </>
                )}
                {c.next_due_date && <Muted>Próximo pago: {fmtDate(c.next_due_date)}{c.statement_due_cents != null ? ` · para no generar intereses ${formatCents(c.statement_due_cents)}` : ""}</Muted>}
                {(c.minimum_due_cents ?? 0) > 0 && <p className="text-xs text-muted" title="Estimación: no incluye intereses ni IVA">Pago mínimo (estimado) {formatCents(c.minimum_due_cents ?? 0)} · Estimación: no incluye intereses ni IVA</p>}
                {(c.deferred_cents ?? 0) > 0 && <Muted>MSI por facturar {formatCents(c.deferred_cents ?? 0)}</Muted>}
              </Card>
            ))}
          </div>
        )}
      </div>

      <nav aria-label="Secciones de finanzas" className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
        {TILES.map(([href, label]) => (
          <Link key={href} href={href} className="pv-press flex min-h-20 items-end rounded-[24px] bg-surface p-4 text-base font-semibold ring-1 ring-line">{label}</Link>
        ))}
      </nav>
    </div>
  );
}

function GrowBar({ pct, color, title }: { pct: number; color: string; title: string }) {
  const [h, setH] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setH(pct))); return () => cancelAnimationFrame(id); }, [pct]);
  return <div title={title} className={`w-4 rounded-full ${color}`} style={{ height: `${Math.max(h, pct > 0 ? 2 : 0)}%`, transition: "height .8s cubic-bezier(.22,1,.36,1)" }} />;
}
