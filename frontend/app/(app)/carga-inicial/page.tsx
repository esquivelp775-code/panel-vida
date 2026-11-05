"use client";
import { useState } from "react";
import { api, type BulkResult } from "@/lib/api";
import { errMsg } from "@/lib/useLoad";
import { formatCents } from "@/lib/money";
import { Btn, Card, ErrorBox, H2, Muted, PageTitle, useToast } from "@/components/ui";

type Row = Record<string, unknown>;
type Setup = { accounts: Row[]; categories: Row[]; obligations: Row[]; transactions: Row[]; tasks: Row[] };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const cents = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? formatCents(v) : "");

function parse(text: string): Setup {
  const j = JSON.parse(text);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("El archivo debe ser un objeto JSON.");
  const arr = (k: string): Row[] => {
    const v = (j as Record<string, unknown>)[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`"${k}" debe ser una lista.`);
    return v as Row[];
  };
  return { accounts: arr("accounts"), categories: arr("categories"), obligations: arr("obligations"), transactions: arr("transactions"), tasks: arr("tasks") };
}

function Table({ title, rows, amount }: { title: string; rows: { name: string; type: string; amount: string }[]; amount: boolean }) {
  return (
    <Card className="mb-3">
      <H2>{title} ({rows.length})</H2>
      {rows.length === 0 ? <Muted>Sin elementos.</Muted> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 pr-2 font-medium">Nombre</th><th className="py-1 pr-2 font-medium">Tipo</th>{amount && <th className="py-1 text-right font-medium">Monto</th>}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2">{r.name}</td><td className="py-1.5 pr-2 text-muted">{r.type}</td>
                  {amount && <td className="py-1.5 text-right tabular-nums">{r.amount}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function CargaInicial() {
  const toast = useToast();
  const [data, setData] = useState<Setup | null>(null);
  const [check, setCheck] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onFile(f: File | undefined) {
    setData(null); setCheck(null); setError(null); setDone(false);
    if (!f) return;
    setBusy(true);
    try {
      const d = parse(await f.text());
      setData(d);
      setCheck(await api.setupBulk({ dry_run: true, ...d }));
    } catch (e) {
      setError(e instanceof SyntaxError ? "El archivo no es un JSON válido." : errMsg(e));
    } finally { setBusy(false); }
  }
  async function load() {
    if (!data) return;
    setBusy(true); setError(null);
    try {
      const r = await api.setupBulk({ dry_run: false, ...data });
      setCheck(r); setDone(true); toast("Carga completada");
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  const acc = (data?.accounts || []).map((a) => ({ name: str(a.name), type: str(a.subtype), amount: cents(a.opening_balance_cents) }));
  const cat = (data?.categories || []).map((a) => ({ name: str(a.name), type: str(a.subtype), amount: "" }));
  const txs = (data?.transactions || []).map((a) => ({ name: `${str(a.occurred_on)} · ${str(a.description)}`, type: str(a.category), amount: cents(a.amount_cents) }));
  const tks = (data?.tasks || []).map((a) => ({ name: str(a.title), type: str(a.area), amount: "" }));
  const obl = (data?.obligations || []).map((a) => ({ name: str(a.name), type: `${str(a.kind)} · ${str(a.recurrence)}`, amount: cents(a.amount_cents) }));
  const errors = check?.errors || [];

  return (
    <>
      <PageTitle>Carga inicial</PageTitle>
      <Muted className="mb-4">Sube un archivo .json con tus cuentas, categorías, pagos programados, gastos y pendientes. Primero se valida sin guardar nada; lo que ya exista se omite.</Muted>
      <ErrorBox message={error} />
      <Card className="mb-4">
        <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
      </Card>
      {data && (
        <>
          <Table title="Cuentas" rows={acc} amount />
          <Table title="Categorías" rows={cat} amount={false} />
          <Table title="Pagos programados" rows={obl} amount />
          {txs.length > 0 && <Table title="Gastos registrados" rows={txs} amount />}
          {tks.length > 0 && <Table title="Pendientes" rows={tks} amount={false} />}
        </>
      )}
      {check && (
        <Card className="mb-4">
          <H2>{done ? "Resultado" : "Validación"}</H2>
          <p className="text-sm">{done ? "Se crearon" : "Se crearán"}: {check.created.accounts} cuentas, {check.created.categories} categorías, {check.created.obligations} pagos programados{check.created.transactions ? `, ${check.created.transactions} gastos` : ""}{check.created.tasks ? ` y ${check.created.tasks} pendientes` : ""}.</p>
          {check.skipped.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-muted">{check.skipped.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {(check.warnings || []).length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-warn">{(check.warnings || []).map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {errors.length > 0 && <ul role="alert" className="mt-2 list-disc pl-5 text-sm text-expense">{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </Card>
      )}
      {data && check && !done && (
        <Btn className="w-full" disabled={busy || errors.length > 0} onClick={load}>{busy ? "Cargando…" : "Cargar todo"}</Btn>
      )}
    </>
  );
}
