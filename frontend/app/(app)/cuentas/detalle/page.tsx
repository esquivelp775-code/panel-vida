"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, todayISO, type ReconcileResult } from "@/lib/api";
import { formatCents, parseToCentsAllowZero } from "@/lib/money";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, ErrorBox, Field, H2, Input, Loading, Money, Muted, PageTitle, SUBTYPE_LABEL, useToast } from "@/components/ui";

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
      <PageTitle right={<Link href="/cuentas/" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Volver</Link>}>{a.name}</PageTitle>
      <Card className="mb-3">
        <p className="text-sm text-slate-500">{SUBTYPE_LABEL[a.subtype] || a.subtype}{a.archived_at ? " · archivada" : ""}</p>
        <p className="text-2xl font-bold"><Money cents={a.balance_cents} /></p>
        <Muted>{a.account_class === "liability" ? "Lo que debes" : "Saldo según el libro"}</Muted>
        {a.subtype === "credit_card" && (
          <Muted className="mt-1">Límite {a.credit_limit_cents != null ? formatCents(a.credit_limit_cents) : "—"} · corte día {a.statement_day ?? "—"} · pago día {a.due_day ?? "—"}</Muted>
        )}
        <Link href={`/movimientos/?account=${a.id}`} className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline dark:text-emerald-400">Ver movimientos</Link>
      </Card>
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
            <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <p>Libro: <b>{formatCents(res.ledger_balance_cents)}</b></p>
              <p>Estado de cuenta: <b>{formatCents(res.statement_balance_cents)}</b></p>
              <p className={res.difference_cents === 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
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
      <Confirm open={archiveOpen} title="Archivar cuenta" confirmLabel="Archivar" busy={busy} onConfirm={archive} onClose={() => setArchiveOpen(false)}
        message={`¿Archivar “${a.name}”? Dejará de aparecer en las listas; su historial se conserva.`} />
    </>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Detail /></Suspense>; }
