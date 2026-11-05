"use client";
import Link from "next/link";
import { api, fmtDate } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { Bar, Card, Empty, ErrorBox, H2, Loading, Money, Muted, PageTitle, pctOf } from "@/components/ui";
import { formatCents } from "@/lib/money";

function Stat({ label, cents, tone }: { label: string; cents: number; tone?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold"><Money cents={cents} tone={tone} /></p>
    </div>
  );
}

export default function Inicio() {
  const { data, error, loading, reload } = useLoad(() => api.dashboard(), []);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const d = data;
  return (
    <>
      <PageTitle>Inicio</PageTitle>
      <ErrorBox message={error} onRetry={reload} />
      <Card className="mb-3">
        <p className="text-sm text-slate-500">Dinero disponible</p>
        <p className="text-3xl font-bold"><Money cents={d.available_cents} tone /></p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Deuda total" cents={d.total_debt_cents} />
          <Stat label="Patrimonio" cents={d.net_worth_cents} tone />
        </div>
      </Card>

      <Card className="mb-3">
        <H2>Este mes</H2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Ingresos" cents={d.month.income_cents} />
          <Stat label="Gastos" cents={d.month.expense_cents} />
          <Stat label="Neto" cents={d.month.net_cents} tone />
        </div>
      </Card>

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

      <H2>Próximos vencimientos</H2>
      {d.upcoming.length === 0 ? <Empty title="Nada por vencer" hint="No hay pagos ni cobros pendientes próximos." /> : (
        <Card className="mb-3">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.upcoming.map((u, i) => (
              <li key={`${u.source}-${u.ref_id}-${u.due_date}-${i}`} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className={`text-xs ${u.overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>{u.overdue ? "Vencido · " : ""}{fmtDate(u.due_date)}</p>
                </div>
                <p className={`text-sm font-semibold ${u.direction === "inflow" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                  {u.direction === "inflow" ? "+" : "−"}<Money cents={u.amount_cents} />
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
