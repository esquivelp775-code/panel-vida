"use client";
import Link from "next/link";
import { useState } from "react";
import { api, todayISO, type Account, type AccountCreate, type Subtype } from "@/lib/api";
import { formatCents, parseToCents, parseToCentsAllowZero } from "@/lib/money";
import { errMsg, useLoad } from "@/lib/useLoad";
import { Btn, Card, Empty, ErrorBox, Field, H2, Input, Loading, Modal, Money, Muted, PageTitle, Segmented, Select, SUBTYPE_LABEL, useToast } from "@/components/ui";

const CREATE_SUBTYPES: Subtype[] = ["cash", "checking", "savings", "investment", "credit_card", "loan", "other_liability"];

function dayOk(s: string): number | null {
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 31 ? n : null;
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [subtype, setSubtype] = useState<Subtype>("checking");
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [openDate, setOpenDate] = useState(todayISO());
  const [limit, setLimit] = useState("");
  const [stDay, setStDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCard = subtype === "credit_card";
  const isLiab = isCard || subtype === "loan" || subtype === "other_liability";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Escribe un nombre.");
    const body: AccountCreate = { name: name.trim(), subtype };
    if (opening.trim() !== "") {
      const o = parseToCentsAllowZero(opening);
      if (o === null) return setError("Saldo inicial inválido (positivo, máximo 2 decimales).");
      if (o > 0) { body.opening_balance_cents = o; body.opening_date = openDate; }
    }
    if (isCard) {
      const l = parseToCents(limit); if (l === null) return setError("Límite de crédito inválido.");
      const s = dayOk(stDay); if (s === null) return setError("Día de corte: número de 1 a 31.");
      const d = dayOk(dueDay); if (d === null) return setError("Día de pago: número de 1 a 31.");
      body.credit_limit_cents = l; body.statement_day = s; body.due_day = d;
    }
    if ((subtype === "loan" || isCard) && rate.trim() !== "") {
      const r = parseToCents(rate); // "12.5" -> 1250 puntos base, sin floats
      if (r === null) return setError("Tasa inválida.");
      body.interest_rate_bps = r;
    }
    setBusy(true); setError(null);
    try { await api.createAccount(body); toast("Cuenta creada"); onDone(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <ErrorBox message={error} />
      <Field label="Tipo">
        <Select value={subtype} onChange={(e) => setSubtype(e.target.value as Subtype)}>
          {CREATE_SUBTYPES.map((s) => <option key={s} value={s}>{SUBTYPE_LABEL[s]}</option>)}
        </Select>
      </Field>
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      {isCard && (<>
        <Field label="Límite de crédito"><Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Día de corte"><Input inputMode="numeric" value={stDay} onChange={(e) => setStDay(e.target.value)} /></Field>
          <Field label="Día de pago"><Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
        </div>
      </>)}
      {(subtype === "loan" || isCard) && <Field label="Tasa anual % (opcional)"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>}
      <Field label={isLiab ? "Saldo adeudado inicial (opcional)" : "Saldo inicial (opcional)"}><Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
      {opening.trim() !== "" && <Field label="Fecha del saldo inicial"><Input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></Field>}
      <div className="flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={onDone} disabled={busy}>Cancelar</Btn>
        <Btn type="submit" className="flex-1" disabled={busy}>{busy ? "Creando…" : "Crear"}</Btn>
      </div>
    </form>
  );
}

function Categories({ accounts, reload }: { accounts: Account[]; reload: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cats = accounts.filter((a) => a.subtype === type && !a.is_system);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    try { await api.createAccount({ name: name.trim(), subtype: type }); setName(""); toast("Categoría creada"); reload(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <Card>
      <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "Gastos" }, { value: "income", label: "Ingresos" }]} />
      {cats.length === 0 ? <Muted className="mb-3">Aún no hay categorías de {type === "expense" ? "gasto" : "ingreso"}.</Muted> : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {cats.map((c) => <li key={c.id} className="rounded-full bg-soft px-3 py-1 text-sm">{c.name}</li>)}
        </ul>
      )}
      <ErrorBox message={error} />
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="Nombre de la categoría" placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Btn type="submit" disabled={busy || !name.trim()}>Añadir</Btn>
      </form>
    </Card>
  );
}

function Row({ a }: { a: Account }) {
  return (
    <li>
      <Link href={`/cuentas/detalle/?id=${a.id}`} className="block">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.name}</p>
              <p className="text-xs text-muted">{SUBTYPE_LABEL[a.subtype] || a.subtype}{a.subtype === "credit_card" && a.credit_limit_cents ? ` · límite ${formatCents(a.credit_limit_cents)}` : ""}</p>
            </div>
            <p className="shrink-0 font-semibold"><Money cents={a.balance_cents} tone={a.account_class === "asset"} /></p>
          </div>
        </Card>
      </Link>
    </li>
  );
}

export default function Cuentas() {
  const { data, error, loading, reload } = useLoad(() => api.accounts(undefined, false), []);
  const [open, setOpen] = useState(false);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  const all = (data || []).filter((a) => !a.is_system && !a.archived_at);
  const assets = all.filter((a) => a.account_class === "asset");
  const liabs = all.filter((a) => a.account_class === "liability");
  return (
    <>
      <PageTitle right={<Btn onClick={() => setOpen(true)}>Nueva cuenta</Btn>}>Cuentas</PageTitle>
      <ErrorBox message={error} onRetry={reload} />
      <H2>Activos</H2>
      {assets.length === 0 ? <Empty title="Sin cuentas" hint="Crea tu primera cuenta (efectivo, cheques, ahorro…)." action={<Btn onClick={() => setOpen(true)}>Crear cuenta</Btn>} /> : <ul className="mb-4 space-y-2">{assets.map((a) => <Row key={a.id} a={a} />)}</ul>}
      <H2>Tarjetas y pasivos</H2>
      {liabs.length === 0 ? <Muted className="mb-4">Sin tarjetas ni deudas.</Muted> : <ul className="mb-4 space-y-2">{liabs.map((a) => <Row key={a.id} a={a} />)}</ul>}
      <H2>Categorías</H2>
      <Categories accounts={all} reload={reload} />
      <Modal open={open} title="Nueva cuenta" onClose={() => setOpen(false)}>
        <div className="max-h-[75vh] overflow-y-auto">
          <AccountForm onDone={() => { setOpen(false); reload(); }} />
        </div>
      </Modal>
    </>
  );
}
