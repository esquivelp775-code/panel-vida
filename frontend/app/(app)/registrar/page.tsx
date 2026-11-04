"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, todayISO, type Account, type TxCreate } from "@/lib/api";
import { formatCents, parseToCents, parseToCentsAllowZero } from "@/lib/money";
import { errMsg, getPref, setPref, useLoad } from "@/lib/useLoad";
import { Btn, Card, Empty, ErrorBox, Field, Input, Loading, PageTitle, Segmented, Select, useToast } from "@/components/ui";

type Mode = "expense" | "income" | "transfer" | "card_payment" | "loan_payment";
const MODES: { value: Mode; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
  { value: "card_payment", label: "Pago de tarjeta" },
  { value: "loan_payment", label: "Pago de préstamo" },
];

function newKey(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16); c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const SPENDING_ORDER = ["cash", "checking", "credit_card", "savings", "investment"];
const bySpendingOrder = (a: Account, b: Account) =>
  SPENDING_ORDER.indexOf(a.subtype) - SPENDING_ORDER.indexOf(b.subtype) || a.name.localeCompare(b.name, "es");

/** Select de cuentas que recuerda la última elección por clave. */
function useRemembered(key: string, options: Account[]) {
  const [val, setVal] = useState("");
  useEffect(() => {
    const saved = getPref(key);
    setVal((cur) => (cur && options.some((o) => String(o.id) === cur) ? cur : options.some((o) => String(o.id) === saved) ? saved : options[0] ? String(options[0].id) : ""));
  }, [key, options]);
  return [val, (v: string) => { setVal(v); if (v) setPref(key, v); }] as const;
}

export default function Registrar() {
  const toast = useToast();
  const { data: accounts, error: loadErr, loading, reload } = useLoad(() => api.accounts(), []);
  const [mode, setMode] = useState<Mode>("expense");
  useEffect(() => { const m = getPref("last_mode") as Mode; if (MODES.some((x) => x.value === m)) setMode(m); }, []);
  const changeMode = (m: Mode) => { setMode(m); setPref("last_mode", m); setError(null); };

  const all = useMemo(() => (accounts || []).filter((a) => !a.is_system && !a.archived_at), [accounts]);
  // Cuentas de uso diario primero: el valor por defecto de un gasto no debe ser el ahorro.
  const assets = useMemo(() => all.filter((a) => a.account_class === "asset").sort(bySpendingOrder), [all]);
  const payable = useMemo(() => all.filter((a) => a.account_class === "asset" || a.subtype === "credit_card").sort(bySpendingOrder), [all]);
  const cards = useMemo(() => all.filter((a) => a.subtype === "credit_card"), [all]);
  const loans = useMemo(() => all.filter((a) => a.subtype === "loan" || a.subtype === "other_liability"), [all]);
  const transferTo = useMemo(() => all.filter((a) => a.account_class === "asset" || a.account_class === "liability"), [all]);
  const expCats = useMemo(() => all.filter((a) => a.subtype === "expense"), [all]);
  const incCats = useMemo(() => all.filter((a) => a.subtype === "income"), [all]);

  const [expAcc, setExpAcc] = useRemembered("acc_expense", payable);
  const [expCat, setExpCat] = useRemembered("cat_expense", expCats);
  const [incAcc, setIncAcc] = useRemembered("acc_income", assets);
  const [incCat, setIncCat] = useRemembered("cat_income", incCats);
  const [trFrom, setTrFrom] = useRemembered("tr_from", assets);
  const [trTo, setTrTo] = useRemembered("tr_to", transferTo);
  const [cpFrom, setCpFrom] = useRemembered("cp_from", assets);
  const [cpCard, setCpCard] = useRemembered("cp_card", cards);
  const [lpFrom, setLpFrom] = useRemembered("lp_from", assets);
  const [lpLoan, setLpLoan] = useRemembered("lp_loan", loans);
  const [lpIntCat, setLpIntCat] = useRemembered("lp_intcat", expCats);

  const [amount, setAmount] = useState("");
  const [interest, setInterest] = useState("");
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { amountRef.current?.focus(); }, [loading, mode]);

  const cents = parseToCents(amount);
  const name = (id: string) => all.find((a) => String(a.id) === id)?.name || "";

  function build(): TxCreate | string {
    if (!date) return "Indica la fecha.";
    const base = { occurred_on: date };
    const fallback = (s: string) => desc.trim() || s;
    if (mode === "loan_payment") {
      const p = parseToCents(amount);
      if (p === null) return "Capital inválido. Usa números con máximo 2 decimales.";
      const i = interest.trim() === "" ? 0 : parseToCentsAllowZero(interest);
      if (i === null) return "Interés inválido. Usa números con máximo 2 decimales.";
      if (!lpFrom || !lpLoan) return "Elige cuenta de origen y préstamo.";
      if (i > 0 && !lpIntCat) return "Elige la categoría del interés.";
      return { kind: "loan_payment", ...base, description: fallback("Pago de préstamo"), from_account_id: Number(lpFrom), loan_account_id: Number(lpLoan), principal_cents: p, interest_cents: i, ...(i > 0 ? { interest_category_id: Number(lpIntCat) } : {}) };
    }
    if (cents === null) return "Monto inválido. Usa números positivos con máximo 2 decimales (ej. 1,234.50).";
    if (mode === "expense") {
      if (!expAcc || !expCat) return "Elige cuenta y categoría.";
      return { kind: "expense", ...base, description: fallback(name(expCat)), account_id: Number(expAcc), category_id: Number(expCat), amount_cents: cents };
    }
    if (mode === "income") {
      if (!incAcc || !incCat) return "Elige cuenta y categoría.";
      return { kind: "income", ...base, description: fallback(name(incCat)), account_id: Number(incAcc), category_id: Number(incCat), amount_cents: cents };
    }
    if (mode === "transfer") {
      if (!trFrom || !trTo) return "Elige origen y destino.";
      if (trFrom === trTo) return "El origen y el destino deben ser distintos.";
      return { kind: "transfer", ...base, description: fallback("Transferencia"), from_account_id: Number(trFrom), to_account_id: Number(trTo), amount_cents: cents };
    }
    if (!cpFrom || !cpCard) return "Elige cuenta de origen y tarjeta.";
    return { kind: "card_payment", ...base, description: fallback("Pago de tarjeta"), from_account_id: Number(cpFrom), card_account_id: Number(cpCard), amount_cents: cents };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const payload = build();
    if (typeof payload === "string") { setError(payload); return; }
    setError(null); setBusy(true);
    // Misma clave mientras el cuerpo no cambie (reintento seguro); cuerpo distinto => clave nueva.
    const sig = JSON.stringify(payload);
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, key: newKey() };
    try {
      const tx = await api.createTransaction(payload, attempt.current.key);
      attempt.current = null;
      toast(`Registrado: ${formatCents(tx.amount_cents)}`);
      setAmount(""); setInterest(""); setDesc("");
      amountRef.current?.focus();
      reload();
    } catch (err) { setError(errMsg(err) + " Puedes reintentar: no se duplicará."); }
    finally { setBusy(false); }
  }

  const sel = (opts: Account[], v: string, set: (v: string) => void) => (
    <Select value={v} onChange={(e) => set(e.target.value)}>
      {opts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </Select>
  );

  if (loading && !accounts) return <Loading />;
  if (loadErr && !accounts) return <ErrorBox message={loadErr} onRetry={reload} />;

  const needs: string[] = [];
  if (mode === "expense") { if (!payable.length) needs.push("una cuenta"); if (!expCats.length) needs.push("una categoría de gasto"); }
  if (mode === "income") { if (!assets.length) needs.push("una cuenta"); if (!incCats.length) needs.push("una categoría de ingreso"); }
  if (mode === "transfer" && assets.length < 1) needs.push("cuentas");
  if (mode === "card_payment") { if (!assets.length) needs.push("una cuenta de origen"); if (!cards.length) needs.push("una tarjeta"); }
  if (mode === "loan_payment") { if (!assets.length) needs.push("una cuenta de origen"); if (!loans.length) needs.push("un préstamo"); }

  return (
    <>
      <PageTitle right={<Link href="/" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Cerrar</Link>}>Registrar</PageTitle>
      <Segmented value={mode} onChange={changeMode} options={MODES} />
      {needs.length > 0 ? (
        <Empty title={`Primero crea ${needs.join(" y ")}`} hint="Se hace una sola vez en Cuentas." action={<Link href="/cuentas/" className="font-semibold text-emerald-700 underline">Ir a Cuentas</Link>} />
      ) : (
        <form onSubmit={submit} noValidate>
          <Card>
            <ErrorBox message={error} />
            <Field label={mode === "loan_payment" ? "Capital (monto)" : "Monto"}>
              <Input ref={amountRef} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-2xl font-bold" aria-invalid={amount !== "" && cents === null} />
            </Field>
            {mode === "loan_payment" && (
              <Field label="Interés (opcional)"><Input inputMode="decimal" placeholder="0.00" value={interest} onChange={(e) => setInterest(e.target.value)} /></Field>
            )}
            {mode === "expense" && (<>
              <Field label="Cuenta o tarjeta">{sel(payable, expAcc, setExpAcc)}</Field>
              <Field label="Categoría">{sel(expCats, expCat, setExpCat)}</Field>
            </>)}
            {mode === "income" && (<>
              <Field label="Cuenta destino">{sel(assets, incAcc, setIncAcc)}</Field>
              <Field label="Categoría">{sel(incCats, incCat, setIncCat)}</Field>
            </>)}
            {mode === "transfer" && (<>
              <Field label="Desde">{sel(assets, trFrom, setTrFrom)}</Field>
              <Field label="Hacia" hint="Si el destino es una tarjeta o préstamo, el servidor lo registra como pago.">{sel(transferTo, trTo, setTrTo)}</Field>
            </>)}
            {mode === "card_payment" && (<>
              <Field label="Pagar desde">{sel(assets, cpFrom, setCpFrom)}</Field>
              <Field label="Tarjeta">{sel(cards, cpCard, setCpCard)}</Field>
            </>)}
            {mode === "loan_payment" && (<>
              <Field label="Pagar desde">{sel(assets, lpFrom, setLpFrom)}</Field>
              <Field label="Préstamo">{sel(loans, lpLoan, setLpLoan)}</Field>
              {parseToCentsAllowZero(interest) ? <Field label="Categoría del interés">{sel(expCats, lpIntCat, setLpIntCat)}</Field> : null}
            </>)}
            <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Descripción (opcional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} /></Field>
            <Btn type="submit" className="w-full text-base" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Btn>
          </Card>
        </form>
      )}
    </>
  );
}
