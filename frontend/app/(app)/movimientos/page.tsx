"use client";
import Link from "next/link";
import { useState } from "react";
import { api, fmtDate, type Account } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { Btn, Card, Empty, ErrorBox, Field, Input, KIND_LABEL, Loading, Money, PageTitle, Select } from "@/components/ui";

const PAGE = 20;
const KINDS = ["income", "expense", "card_purchase", "transfer", "card_payment", "loan_payment", "loan_disbursement", "adjustment", "refund"];

export default function Movimientos() {
  // AppShell sólo renderiza tras montar, así que leer la URL aquí no rompe la hidratación.
  const [f, setF] = useState(() => ({ account_id: new URLSearchParams(window.location.search).get("account") || "", kind: "", date_from: "", date_to: "", q: "" }));
  const [applied, setApplied] = useState(f);
  const [offset, setOffset] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const accounts = useLoad(() => api.accounts(), []);
  const tx = useLoad(() => api.transactions({ ...applied, include_voided: true, limit: PAGE, offset }), [applied, offset]);
  const accs: Account[] = (accounts.data || []).filter((a) => !a.is_system && (a.account_class === "asset" || a.account_class === "liability"));
  const total = tx.data?.total ?? 0;
  const activeFilters = Object.values(applied).filter(Boolean).length;

  return (
    <>
      <PageTitle right={<Btn variant="ghost" onClick={() => setShowFilters((s) => !s)}>Filtros{activeFilters ? ` (${activeFilters})` : ""}</Btn>}>Movimientos</PageTitle>
      {showFilters && (
        <Card className="mb-3">
          <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(f); }}>
            <Field label="Búsqueda"><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Descripción" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cuenta">
                <Select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
                  <option value="">Todas</option>
                  {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                  <option value="">Todos</option>
                  {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </Select>
              </Field>
              <Field label="Desde"><Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field>
              <Field label="Hasta"><Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Btn type="submit" className="flex-1">Aplicar</Btn>
              <Btn variant="secondary" className="flex-1" onClick={() => { const e = { account_id: "", kind: "", date_from: "", date_to: "", q: "" }; setF(e); setApplied(e); setOffset(0); }}>Limpiar</Btn>
            </div>
          </form>
        </Card>
      )}
      <ErrorBox message={tx.error} onRetry={tx.reload} />
      {tx.loading && !tx.data ? <Loading /> : tx.data && tx.data.items.length === 0 ? (
        <Empty title="Sin movimientos" hint={activeFilters ? "Prueba quitando filtros." : "Registra tu primer gasto con el botón +."} />
      ) : (
        <ul className="space-y-2">
          {tx.data?.items.map((t) => {
            const out = ["expense", "card_purchase", "card_payment", "loan_payment"].includes(t.kind);
            return (
              <li key={t.id}>
                <Link href={`/movimientos/detalle/?id=${t.id}`} className="block">
                  <Card className={t.voided_at ? "opacity-60" : ""}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${t.voided_at ? "line-through" : ""}`}>{t.description || KIND_LABEL[t.kind] || t.kind}</p>
                        <p className="text-xs text-slate-500">{fmtDate(t.occurred_on)} · {KIND_LABEL[t.kind] || t.kind}{t.voided_at ? " · ANULADA" : ""}{t.reverses_id ? " · reversión" : ""}</p>
                      </div>
                      <p className={`shrink-0 font-semibold ${t.kind === "income" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        {t.kind === "income" ? "+" : out ? "−" : ""}<Money cents={t.amount_cents} />
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between">
          <Btn variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</Btn>
          <span className="text-sm text-slate-500">{offset + 1}–{Math.min(offset + PAGE, total)} de {total}</span>
          <Btn variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Siguiente</Btn>
        </div>
      )}
    </>
  );
}
