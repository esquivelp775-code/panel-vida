"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, fmtDate } from "@/lib/api";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, ErrorBox, Field, H2, KIND_LABEL, Loading, Money, Muted, PageTitle, Textarea, useToast } from "@/components/ui";

function Detail() {
  const id = Number(useSearchParams().get("id"));
  const toast = useToast();
  const { data: t, error, loading, reload } = useLoad(() => api.transaction(id), [id]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doVoid() {
    if (!reason.trim()) { setErr("Escribe el motivo de la anulación."); return; }
    setBusy(true); setErr(null);
    try {
      await api.voidTransaction(id, reason.trim());
      toast("Movimiento anulado");
      setOpen(false); setReason(""); reload();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (!id) return <ErrorBox message="Falta el movimiento a mostrar." />;
  if (loading && !t) return <Loading />;
  if (error && !t) return <ErrorBox message={error} onRetry={reload} />;
  if (!t) return null;
  const canVoid = !t.voided_at && !t.reverses_id && t.kind !== "reversal";

  return (
    <>
      <PageTitle right={<Link href="/movimientos/" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Volver</Link>}>Movimiento</PageTitle>
      <Card className="mb-3">
        <p className="text-sm text-slate-500">{KIND_LABEL[t.kind] || t.kind} · {fmtDate(t.occurred_on)}</p>
        <p className="text-2xl font-bold"><Money cents={t.amount_cents} /></p>
        <p className="mt-1">{t.description}</p>
        {t.notes && <Muted>{t.notes}</Muted>}
        {t.voided_at && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Anulada el {fmtDate(t.voided_at)}. Motivo: {t.void_reason || "—"}.{" "}
            {t.reversed_by_id && <Link className="underline" href={`/movimientos/detalle/?id=${t.reversed_by_id}`}>Ver reversión</Link>}
          </p>
        )}
        {t.reverses_id && <p className="mt-2 text-sm">Es la reversión del movimiento <Link className="underline" href={`/movimientos/detalle/?id=${t.reverses_id}`}>#{t.reverses_id}</Link>.</p>}
      </Card>
      <H2>Asientos</H2>
      <Card className="mb-4">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {t.entries.map((e, i) => (
            <li key={i} className="flex justify-between py-2 text-sm">
              <span>{e.account_name}</span>
              <Money cents={e.amount_cents} tone />
            </li>
          ))}
        </ul>
        <Muted className="mt-2">Positivo = débito, negativo = crédito (doble partida).</Muted>
      </Card>
      {canVoid && <Btn variant="danger" className="w-full" onClick={() => { setErr(null); setOpen(true); }}>Anular movimiento</Btn>}
      <Confirm open={open} title="Anular movimiento" danger confirmLabel="Anular" busy={busy} onConfirm={doVoid} onClose={() => setOpen(false)}
        message="No se borra nada: se crea una reversión que deja los saldos como antes. Esta acción no se puede deshacer.">
        <ErrorBox message={err} />
        <Field label="Motivo (obligatorio)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Confirm>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Detail /></Suspense>; }
