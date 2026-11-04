"use client";
import { useState } from "react";
import { api, fmtDate, todayISO, type Account, type Obligation, type ObligationCreate } from "@/lib/api";
import { centsToInput, formatCents, parseToCents } from "@/lib/money";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, Empty, ErrorBox, Field, H2, Input, Loading, Modal, Money, Muted, PageTitle, Select, SUBTYPE_LABEL, useToast } from "@/components/ui";

const KIND_ES: Record<string, string> = { bill: "Recibo / servicio", loan_installment: "Cuota de préstamo", card_payment: "Pago de tarjeta", income_expected: "Ingreso esperado", other: "Otro" };
const REC_ES: Record<string, string> = { none: "Una vez", monthly: "Mensual", yearly: "Anual" };

function ObligationForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Obligation["kind"]>("bill");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(todayISO());
  const [rec, setRec] = useState<Obligation["recurrence"]>("none");
  const [payFrom, setPayFrom] = useState("");
  const [target, setTarget] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflow = kind === "income_expected";
  const assets = accounts.filter((a) => a.account_class === "asset");
  const targets = accounts.filter((a) => (kind === "card_payment" ? a.subtype === "credit_card" : a.subtype === "loan"));
  const cats = accounts.filter((a) => a.subtype === (inflow ? "income" : "expense"));
  const needsTarget = kind === "card_payment" || kind === "loan_installment";
  const needsCat = kind === "bill" || kind === "other" || inflow;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const c = parseToCents(amount);
    if (!name.trim()) return setError("Escribe un nombre.");
    if (c === null) return setError("Monto inválido (positivo, máximo 2 decimales).");
    if (!due) return setError("Indica la fecha de vencimiento.");
    const body: ObligationCreate = { name: name.trim(), kind, direction: inflow ? "inflow" : "outflow", amount_cents: c, due_date: due, recurrence: rec };
    if (payFrom) body.pay_from_account_id = Number(payFrom);
    if (needsTarget && target) body.target_account_id = Number(target);
    if (needsCat && cat) body.category_id = Number(cat);
    setBusy(true); setError(null);
    try { await api.createObligation(body); toast("Vencimiento creado"); onDone(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate>
      <ErrorBox message={error} />
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="Tipo"><Select value={kind} onChange={(e) => { setKind(e.target.value as Obligation["kind"]); setTarget(""); setCat(""); }}>{Object.entries(KIND_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Monto"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Vence"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Repetición"><Select value={rec} onChange={(e) => setRec(e.target.value as Obligation["recurrence"])}>{Object.entries(REC_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
      <Field label={inflow ? "Cuenta donde entrará" : "Pagar desde (opcional)"}>
        <Select value={payFrom} onChange={(e) => setPayFrom(e.target.value)}><option value="">—</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </Field>
      {needsTarget && <Field label={kind === "card_payment" ? "Tarjeta" : "Préstamo"}><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">—</option>{targets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
      {needsCat && <Field label="Categoría"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">—</option>{cats.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
      <div className="flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={onDone} disabled={busy}>Cancelar</Btn>
        <Btn type="submit" className="flex-1" disabled={busy}>{busy ? "Guardando…" : "Crear"}</Btn>
      </div>
    </form>
  );
}

export default function Deudas() {
  const toast = useToast();
  const accs = useLoad(() => api.accounts(), []);
  const obl = useLoad(() => api.obligations("pending"), []);
  const up = useLoad(() => api.upcoming(30), []);
  const [create, setCreate] = useState(false);
  const [settle, setSettle] = useState<Obligation | null>(null);
  const [sAcc, setSAcc] = useState("");
  const [sAmt, setSAmt] = useState("");
  const [sDate, setSDate] = useState(todayISO());
  const [cancel, setCancel] = useState<Obligation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const all = (accs.data || []).filter((a) => !a.is_system && !a.archived_at);
  const assets = all.filter((a) => a.account_class === "asset");
  const liabs = all.filter((a) => a.account_class === "liability");
  const reloadAll = () => { obl.reload(); up.reload(); accs.reload(); };

  function openSettle(o: Obligation) {
    setErr(null); setSettle(o); setSAcc(String(o.pay_from_account_id ?? assets[0]?.id ?? "")); setSAmt(centsToInput(o.amount_cents)); setSDate(todayISO());
  }
  async function doSettle() {
    if (!settle || busy) return;
    const c = parseToCents(sAmt);
    if (c === null) return setErr("Monto inválido.");
    if (!sAcc) return setErr("Elige la cuenta.");
    setBusy(true); setErr(null);
    try {
      await api.settleObligation(settle.id, { account_id: Number(sAcc), ...(c !== settle.amount_cents ? { amount_cents: c } : {}), occurred_on: sDate });
      toast(settle.direction === "inflow" ? "Cobro registrado" : "Pago registrado"); setSettle(null); reloadAll();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  async function doCancel() {
    if (!cancel) return;
    setBusy(true); setErr(null);
    try { await api.cancelObligation(cancel.id); toast("Vencimiento cancelado"); setCancel(null); reloadAll(); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  if ((accs.loading && !accs.data) || (obl.loading && !obl.data)) return <Loading />;
  return (
    <>
      <PageTitle right={<Btn onClick={() => setCreate(true)}>Nuevo</Btn>}>Deudas y vencimientos</PageTitle>
      <ErrorBox message={accs.error || obl.error || up.error} onRetry={reloadAll} />

      <H2>Lo que debes</H2>
      {liabs.length === 0 ? <Empty title="Sin deudas registradas" hint="Tarjetas y préstamos aparecerán aquí." /> : (
        <Card className="mb-4">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {liabs.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-slate-500">{SUBTYPE_LABEL[a.subtype]}</p></div>
                <p className="font-semibold"><Money cents={a.balance_cents} /></p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <H2>Próximos 30 días</H2>
      {!up.data || up.data.length === 0 ? <Empty title="Nada por vencer" /> : (
        <Card className="mb-4">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {up.data.map((u, i) => (
              <li key={`${u.source}-${u.ref_id}-${i}`} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{u.name}{u.source === "card" ? " (tarjeta)" : ""}</p>
                  <p className={`text-xs ${u.overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>{u.overdue ? "Vencido · " : ""}{fmtDate(u.due_date)}</p>
                </div>
                <p className="text-sm font-semibold">{u.direction === "inflow" ? "+" : "−"}<Money cents={u.amount_cents} /></p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <H2>Obligaciones pendientes</H2>
      {!obl.data || obl.data.length === 0 ? <Empty title="Sin obligaciones" hint="Registra recibos, cuotas o ingresos esperados." action={<Btn onClick={() => setCreate(true)}>Crear</Btn>} /> : (
        <ul className="space-y-2">
          {obl.data.map((o) => (
            <li key={o.id}>
              <Card>
                <div className="flex justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-medium">{o.name}</p><p className="text-xs text-slate-500">{KIND_ES[o.kind]} · {fmtDate(o.due_date)} · {REC_ES[o.recurrence]}</p></div>
                  <p className="shrink-0 font-semibold">{o.direction === "inflow" ? "+" : "−"}<Money cents={o.amount_cents} /></p>
                </div>
                <div className="mt-2 flex gap-2">
                  <Btn className="flex-1" onClick={() => openSettle(o)}>{o.direction === "inflow" ? "Cobrar" : "Pagar"}</Btn>
                  <Btn variant="secondary" className="flex-1" onClick={() => { setErr(null); setCancel(o); }}>Cancelar</Btn>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Muted className="mt-2">Al liquidar se crea el movimiento y, si es recurrente, la siguiente obligación.</Muted>

      <Modal open={create} title="Nueva obligación" onClose={() => setCreate(false)}>
        <div className="max-h-[75vh] overflow-y-auto"><ObligationForm accounts={all} onDone={() => { setCreate(false); reloadAll(); }} /></div>
      </Modal>
      <Confirm open={!!settle} title={settle?.direction === "inflow" ? "Registrar cobro" : "Registrar pago"} confirmLabel="Confirmar" busy={busy} onConfirm={doSettle} onClose={() => setSettle(null)}
        message={settle ? `${settle.name} · ${formatCents(settle.amount_cents)}. Se creará el movimiento y se marcará como pagada.` : undefined}>
        <ErrorBox message={err} />
        <Field label="Cuenta"><Select value={sAcc} onChange={(e) => setSAcc(e.target.value)}>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Monto"><Input inputMode="decimal" value={sAmt} onChange={(e) => setSAmt(e.target.value)} /></Field>
        <Field label="Fecha"><Input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} /></Field>
      </Confirm>
      <Confirm open={!!cancel} title="Cancelar obligación" danger confirmLabel="Cancelar obligación" busy={busy} onConfirm={doCancel} onClose={() => setCancel(null)}
        message={cancel ? `¿Cancelar “${cancel.name}”? No se crea ningún movimiento.` : undefined}><ErrorBox message={err} /></Confirm>
    </>
  );
}
