"use client";
import { useState } from "react";
import { api, fmtMonth, monthISO, shiftMonth, type Budget } from "@/lib/api";
import { formatCents, parseToCents } from "@/lib/money";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Bar, Btn, Card, Confirm, Empty, ErrorBox, Field, H2, Input, Loading, Money, Muted, PageTitle, pctOf, Select, useToast } from "@/components/ui";

export default function Presupuestos() {
  const toast = useToast();
  const [month, setMonth] = useState(monthISO());
  const budgets = useLoad(() => api.budgets(month), [month]);
  const accs = useLoad(() => api.accounts(), []);
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState<Budget | null>(null);

  const cats = (accs.data || []).filter((a) => a.subtype === "expense" && !a.is_system && !a.archived_at);
  const catId = cat || (cats[0] ? String(cats[0].id) : "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const c = parseToCents(amount);
    if (c === null) return setError("Monto inválido (positivo, máximo 2 decimales).");
    if (!catId) return setError("Elige una categoría.");
    setBusy(true); setError(null);
    try { await api.upsertBudget(Number(catId), month, c); toast("Presupuesto guardado"); setAmount(""); budgets.reload(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.deleteBudget(del.id); toast("Presupuesto eliminado"); setDel(null); budgets.reload(); }
    catch (x) { setError(errMsg(x)); setDel(null); } finally { setBusy(false); }
  }

  return (
    <>
      <PageTitle>Presupuestos</PageTitle>
      <div className="mb-3 flex items-center justify-between">
        <Btn variant="secondary" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Btn>
        <p className="font-semibold capitalize">{fmtMonth(month)}</p>
        <Btn variant="secondary" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}>›</Btn>
      </div>
      <ErrorBox message={budgets.error} onRetry={budgets.reload} />
      {budgets.loading && !budgets.data ? <Loading /> : !budgets.data || budgets.data.length === 0 ? (
        <Empty title="Sin presupuestos este mes" hint="Define un tope por categoría abajo." />
      ) : (
        <ul className="mb-4 space-y-2">
          {budgets.data.map((b) => {
            const over = b.remaining_cents < 0;
            return (
              <li key={b.id}>
                <Card>
                  <div className="flex justify-between"><p className="font-medium">{b.category_name}</p><button className="text-xs text-red-600 underline" onClick={() => setDel(b)}>Eliminar</button></div>
                  <div className="my-2"><Bar pct={pctOf(b.spent_cents, b.amount_cents)} over={over} label={`Gastado de ${b.category_name}`} /></div>
                  <p className="text-sm">Gastado <b>{formatCents(b.spent_cents)}</b> de {formatCents(b.amount_cents)}</p>
                  <p className={`text-sm font-semibold ${over ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>{over ? "Excedido por " : "Restan "}<Money cents={Math.abs(b.remaining_cents)} /></p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <H2>Definir presupuesto</H2>
      <Card>
        <form onSubmit={save} noValidate>
          <ErrorBox message={error} />
          {cats.length === 0 ? <Muted>Crea una categoría de gasto en Cuentas primero.</Muted> : (<>
            <Field label="Categoría"><Select value={catId} onChange={(e) => setCat(e.target.value)}>{cats.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="Monto para el mes" hint="Si ya existe, se actualiza."><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
            <Btn type="submit" className="w-full" disabled={busy}>Guardar</Btn>
          </>)}
        </form>
      </Card>
      <Confirm open={!!del} title="Eliminar presupuesto" danger confirmLabel="Eliminar" busy={busy} onConfirm={remove} onClose={() => setDel(null)}
        message={del ? `¿Eliminar el presupuesto de ${del.category_name}? Es sólo un plan: no afecta tus movimientos.` : undefined} />
    </>
  );
}
