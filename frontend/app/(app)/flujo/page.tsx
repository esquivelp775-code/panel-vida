"use client";
import { useMemo } from "react";
import { api, fmtDate, fmtMonth, monthISO, monthRange, shiftMonth } from "@/lib/api";
import { formatCents } from "@/lib/money";
import { useLoad } from "@/lib/useLoad";
import { Card, Empty, ErrorBox, H2, Loading, Money, Muted, PageTitle, pctOf } from "@/components/ui";

export default function Flujo() {
  const cur = monthISO();
  const range = useMemo(() => [monthRange(shiftMonth(cur, -5))[0], monthRange(cur)[1]] as const, [cur]);
  const cash = useLoad(() => api.cashflow(range[0], range[1]), [range]);
  const proj = useLoad(() => api.projection(90), []);
  const cats = useLoad(() => api.byCategory(...monthRange(cur)), [cur]);

  const months = cash.data?.months || [];
  const maxM = months.reduce((m, x) => Math.max(m, x.income_cents, x.expense_cents), 0);
  const maxC = (cats.data || []).reduce((m, x) => Math.max(m, x.total_cents), 0);

  return (
    <>
      <PageTitle>Flujo</PageTitle>

      <H2>Por mes (últimos 6)</H2>
      <ErrorBox message={cash.error} onRetry={cash.reload} />
      {cash.loading && !cash.data ? <Loading /> : months.length === 0 ? <Empty title="Sin datos de flujo" /> : (
        <Card className="mb-2">
          <ul className="space-y-4">
            {months.map((m) => (
              <li key={m.month}>
                <p className="mb-1 text-sm font-semibold">{fmtMonth(m.month)}</p>
                <div className="space-y-1" aria-hidden="true">
                  <div className="h-2.5 rounded-full bg-ink" style={{ width: `${Math.max(1, pctOf(m.income_cents, maxM))}%` }} />
                  <div className="h-2.5 rounded-full bg-expense" style={{ width: `${Math.max(1, pctOf(m.expense_cents, maxM))}%` }} />
                </div>
                <dl className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
                  <dt className="text-muted">Ingresos</dt><dd className="text-right"><Money cents={m.income_cents} /></dd>
                  <dt className="text-muted">Gastos</dt><dd className="text-right"><Money cents={m.expense_cents} /></dd>
                  <dt className="text-muted">Neto (ingresos − gastos)</dt><dd className="text-right font-semibold"><Money cents={m.net_cents} tone /></dd>
                  <dt className="text-muted">Cambio en dinero disponible</dt><dd className="text-right font-semibold"><Money cents={m.liquid_change_cents} tone /></dd>
                </dl>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Muted className="mb-4">El neto cuenta las compras con tarjeta cuando las haces; el cambio en dinero disponible refleja el efectivo real, así que ahí aparece el pago de la tarjeta y no la compra.</Muted>

      <H2>Proyección a 90 días</H2>
      <ErrorBox message={proj.error} onRetry={proj.reload} />
      {proj.loading && !proj.data ? <Loading /> : proj.data && (
        <Card className="mb-4">
          <p className="text-sm text-muted">Disponible hoy</p>
          <p className="text-xl font-bold"><Money cents={proj.data.starting_available_cents} /></p>
          <div className={`mt-2 rounded-xl p-3 ${proj.data.min_balance_cents < 0 ? "bg-expense/10 text-expense ring-1 ring-expense/20" : "bg-warn/15 text-ink"}`}>
            <p className="text-xs font-semibold uppercase">Saldo mínimo proyectado</p>
            <p className="text-lg font-bold">{formatCents(proj.data.min_balance_cents)}</p>
            {proj.data.min_balance_date && <p className="text-xs">el {fmtDate(proj.data.min_balance_date)}</p>}
          </div>
          {proj.data.points.length === 0 ? <Muted className="mt-2">No hay eventos pendientes en el horizonte.</Muted> : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {proj.data.points.map((p, i) => (
                <li key={i} className={`flex items-center justify-between gap-2 py-2 ${p.date === proj.data!.min_balance_date && p.balance_cents === proj.data!.min_balance_cents ? "font-bold" : ""}`}>
                  <div className="min-w-0"><p className="truncate">{p.event}</p><p className="text-xs text-muted">{fmtDate(p.date)}</p></div>
                  <div className="shrink-0 text-right"><Money cents={p.amount_cents} tone /><p className="text-xs text-muted">→ {formatCents(p.balance_cents)}</p></div>
                </li>
              ))}
            </ul>
          )}
          <Muted className="mt-2">Es una estimación; no crea movimientos.</Muted>
        </Card>
      )}

      <H2>Gasto por categoría (este mes)</H2>
      <ErrorBox message={cats.error} onRetry={cats.reload} />
      {cats.loading && !cats.data ? <Loading /> : !cats.data || cats.data.length === 0 ? <Empty title="Sin gastos este mes" /> : (
        <Card>
          <ul className="space-y-3">
            {cats.data.map((c) => (
              <li key={c.category_id}>
                <div className="flex justify-between text-sm"><span>{c.name}</span><Money cents={c.total_cents} /></div>
                <div className="mt-1 h-2 rounded-full bg-soft"><div className="h-2 rounded-full bg-expense" style={{ width: `${Math.max(1, pctOf(c.total_cents, maxC))}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
