"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, fmtDate, todayISO, type Account, type AccountUpdate, type ReconcileResult } from "@/lib/api";
import { centsToInput, formatCents, parseToCents, parseToCentsAllowZero } from "@/lib/money";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, ErrorBox, Field, H2, Input, Loading, Modal, Money, Muted, PageTitle, SUBTYPE_LABEL, useToast } from "@/components/ui";

function dayOk(v: string): number | null {
  if (!/^\d{1,2}$/.test(v.trim())) return null;
  const n = Number(v);
  return n >= 1 && n <= 31 ? n : null;
}

function EditForm({ a, onDone }: { a: Account; onDone: () => void }) {
  const toast = useToast();
  const isCard = a.subtype === "credit_card";
  const [name, setName] = useState(a.name);
  const [limit, setLimit] = useState(a.credit_limit_cents != null ? centsToInput(a.credit_limit_cents) : "");
  const [st, setSt] = useState(a.statement_day != null ? String(a.statement_day) : "");
  const [due, setDue] = useState(a.due_day != null ? String(a.due_day) : "");
  const [rate, setRate] = useState(a.interest_rate_bps != null ? centsToInput(a.interest_rate_bps) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Escribe un nombre.");
    const body: AccountUpdate = { name: name.trim() };
    if (isCard) {
      const l = parseToCents(limit); if (l === null) return setError("Límite de crédito inválido.");
      const s = dayOk(st); if (s === null) return setError("Día de corte: número de 1 a 31.");
      const d = dayOk(due); if (d === null) return setError("Día de pago: número de 1 a 31.");
      body.credit_limit_cents = l; body.statement_day = s; body.due_day = d;
    }
    if ((a.subtype === "loan" || isCard) && rate.trim() === "" && a.interest_rate_bps != null) body.interest_rate_bps = null;
    if ((a.subtype === "loan" || isCard) && rate.trim() !== "") {
      const r = parseToCents(rate); // "12.5" % -> 1250 puntos base, sin floats
      if (r === null) return setError("Tasa inválida.");
      body.interest_rate_bps = r;
    }
    setBusy(true); setError(null);
    try { await api.updateAccount(a.id, body); toast("Cuenta actualizada"); onDone(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate>
      <ErrorBox message={error} />
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      {isCard && (<>
        <Field label="Límite de crédito"><Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Día de corte"><Input inputMode="numeric" value={st} onChange={(e) => setSt(e.target.value)} /></Field>
          <Field label="Día de pago"><Input inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      </>)}
      {(a.subtype === "loan" || isCard) && <Field label="Tasa anual % (opcional)"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>}
      <Muted className="mb-3">El tipo y el saldo no se pueden cambiar.</Muted>
      <div className="flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={onDone} disabled={busy}>Cancelar</Btn>
        <Btn type="submit" className="flex-1" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Btn>
      </div>
    </form>
  );
}

function Detail() {
  const id = Number(useSearchParams().get("id"));
  const router = useRouter();
  const toast = useToast();
  const { data: a, error, loading, reload } = useLoad(() => api.account(id), [id]);
  const [stmt, setStmt] = useState("");
  const [asOf, setAsOf] = useState(todayISO());
  const [adjust, setAdjust] = useState(false);
  const [res, setRes] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isCardAcc = a?.subtype === "credit_card";
  const plans = useLoad(() => (isCardAcc ? api.installments(id) : Promise.resolve([])), [id, isCardAcc]);

  async function reconcile(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // El saldo del estado de cuenta puede ser 0; el signo no se admite (perspectiva natural).
    const c = parseToCentsAllowZero(stmt);
    if (c === null) return setErr("Saldo del estado de cuenta inválido (positivo, máximo 2 decimales).");
    setBusy(true); setErr(null);
    try {
      const r = await api.reconcile(id, c, asOf, adjust);
      setRes(r);
      if (r.adjustment_transaction_id) { toast("Ajuste creado"); reload(); }
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true); setErr(null);
    try { await api.archiveAccount(id); toast("Cuenta archivada"); router.replace("/cuentas/"); }
    catch (x) { setErr(errMsg(x)); setArchiveOpen(false); } finally { setBusy(false); }
  }

  if (!id) return <ErrorBox message="Falta la cuenta a mostrar." />;
  if (loading && !a) return <Loading />;
  if (error && !a) return <ErrorBox message={error} onRetry={reload} />;
  if (!a) return null;
  const reconcilable = a.account_class === "asset" || a.account_class === "liability";

  return (
    <>
      <PageTitle right={<Link href="/cuentas/" className="text-sm font-semibold text-income">Volver</Link>}>{a.name}</PageTitle>
      <Card className="mb-3">
        <p className="text-sm text-muted">{SUBTYPE_LABEL[a.subtype] || a.subtype}{a.archived_at ? " · archivada" : ""}</p>
        <p className="text-2xl font-bold"><Money cents={a.balance_cents} /></p>
        <Muted>{a.account_class === "liability" ? "Lo que debes" : "Saldo según el libro"}</Muted>
        {a.subtype === "credit_card" && (
          <Muted className="mt-1">Límite {a.credit_limit_cents != null ? formatCents(a.credit_limit_cents) : "—"} · corte día {a.statement_day ?? "—"} · pago día {a.due_day ?? "—"}</Muted>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={`/movimientos/?account=${a.id}`} className="text-sm font-semibold text-ink underline">Ver movimientos</Link>
          {reconcilable && !a.archived_at && <Link href={`/importar/?account=${a.id}`} className="text-sm font-semibold text-ink underline">Importar estado</Link>}
          {!a.archived_at && !a.is_system && <button type="button" onClick={() => setEditOpen(true)} className="min-h-11 text-sm font-semibold text-ink underline">Editar</button>}
        </div>
      </Card>
      {isCardAcc && (<>
        <H2>Meses sin intereses</H2>
        {plans.error ? <ErrorBox message={plans.error} onRetry={plans.reload} /> : !plans.data || plans.data.length === 0 ? (
          <Muted className="mb-4">Sin planes de MSI vigentes.</Muted>
        ) : (
          <ul className="mb-4 space-y-2">
            {plans.data.map((p) => (
              <li key={p.plan_id}>
                <Card>
                  <div className="flex justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{p.description || "Compra a meses"}</p>
                    <p className="shrink-0 font-semibold"><Money cents={p.total_cents} /></p>
                  </div>
                  <p className="text-xs text-muted">{p.billed_count} de {p.months} mensualidades · {formatCents(p.installment_cents)} c/u</p>
                  <p className="text-xs text-muted">Restan {formatCents(p.remaining_cents)}{p.next_closing ? ` · próximo corte ${fmtDate(p.next_closing)}` : ""}</p>
                  <Link href={`/movimientos/detalle/?id=${p.transaction_id}`} className="text-xs font-semibold text-ink underline">Ver compra</Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </>)}
      <ErrorBox message={err} />
      {reconcilable && !a.archived_at && (<>
        <H2>Conciliar con estado de cuenta</H2>
        <Card className="mb-4">
          <form onSubmit={reconcile} noValidate>
            <Field label={a.account_class === "liability" ? "Saldo adeudado según el estado de cuenta" : "Saldo según el estado de cuenta"}>
              <Input inputMode="decimal" value={stmt} onChange={(e) => { setStmt(e.target.value); setRes(null); }} placeholder="0.00" />
            </Field>
            <Field label="Fecha del estado de cuenta"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
              Crear ajuste por la diferencia
            </label>
            <Btn type="submit" className="w-full" disabled={busy}>{busy ? "Calculando…" : adjust ? "Conciliar y ajustar" : "Comparar"}</Btn>
          </form>
          {res && (
            <div className="mt-3 rounded-[20px] bg-soft p-3 text-sm">
              <p>Libro: <b>{formatCents(res.ledger_balance_cents)}</b></p>
              <p>Estado de cuenta: <b>{formatCents(res.statement_balance_cents)}</b></p>
              <p className={res.difference_cents === 0 ? "font-semibold text-ink" : "font-semibold text-expense"}>
                Diferencia: {formatCents(res.difference_cents)} {res.difference_cents === 0 ? "· conciliada" : ""}
              </p>
              {res.adjustment_transaction_id && <p>Se creó el ajuste <Link className="underline" href={`/movimientos/detalle/?id=${res.adjustment_transaction_id}`}>#{res.adjustment_transaction_id}</Link>.</p>}
            </div>
          )}
        </Card>
      </>)}
      {!a.archived_at && !a.is_system && (
        <>
          <Btn variant="secondary" className="w-full" onClick={() => setArchiveOpen(true)}>Archivar cuenta</Btn>
          <Muted className="mt-1">Sólo se puede archivar con saldo en cero. No se borra información.</Muted>
        </>
      )}
      <Modal open={editOpen} title="Editar cuenta" onClose={() => setEditOpen(false)}>
        <div className="max-h-[75vh] overflow-y-auto">{editOpen && <EditForm a={a} onDone={() => { setEditOpen(false); reload(); }} />}</div>
      </Modal>
      <Confirm open={archiveOpen} title="Archivar cuenta" confirmLabel="Archivar" busy={busy} onConfirm={archive} onClose={() => setArchiveOpen(false)}
        message={`¿Archivar “${a.name}”? Dejará de aparecer en las listas; su historial se conserva.`} />
    </>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Detail /></Suspense>; }
