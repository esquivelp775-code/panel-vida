"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, fmtDate, type Account } from "@/lib/api";
import {
  MAX_CSV_BYTES, applyCategoryBulk, buildCommitRows, descKey, initialState, isClassified,
  type CommitResult, type PreviewResult, type PreviewRow, type RowState,
} from "@/lib/importer";
import { errMsg, getPref, setPref, useLoad } from "@/lib/useLoad";
import { Btn, Card, ErrorBox, Field, H2, Loading, Money, Muted, PageTitle, Select } from "@/components/ui";

const TRANSFER = "__transfer";

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(new Error("No se pudo leer el archivo."));
    fr.readAsText(file);
  });
}

function Importar() {
  const presel = Number(useSearchParams().get("account")) || 0;
  const accs = useLoad(() => api.accounts(), []);
  const [accId, setAccId] = useState<string>(presel ? String(presel) : "");
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState("");
  const [posTouched, setPosTouched] = useState(false);
  const [posVal, setPosVal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [states, setStates] = useState<Record<number, RowState>>({});
  const [bulkOut, setBulkOut] = useState("");
  const [bulkIn, setBulkIn] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  const all = useMemo(() => (accs.data || []).filter((a) => !a.is_system && !a.archived_at), [accs.data]);
  const importable = all.filter((a) => a.account_class === "asset" || a.account_class === "liability");
  const account: Account | undefined = importable.find((a) => String(a.id) === accId);
  const isCard = account?.subtype === "credit_card";
  const posDefault = isCard;
  const posChecked = posTouched ? posVal : posDefault;
  const expenseCats = all.filter((a) => a.account_class === "expense");
  const incomeCats = all.filter((a) => a.account_class === "income");
  const counters = importable.filter((a) => String(a.id) !== accId);
  const inflowCats = account?.account_class === "asset" ? incomeCats : expenseCats;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null); setCsv(""); setFile(null);
    if (!f) return;
    if (f.size > MAX_CSV_BYTES) { setError("El archivo pesa más de 1 MB. Divídelo en partes más pequeñas."); e.target.value = ""; return; }
    try { setCsv(await readText(f)); setFile(f); } catch (x) { setError(errMsg(x)); }
  }

  async function doPreview() {
    if (busy || !account) return;
    if (!csv.trim()) return setError("Elige un archivo CSV.");
    setBusy(true); setError(null);
    try {
      const p = await api.importPreview(account.id, csv, posChecked !== posDefault ? posChecked : undefined);
      const st: Record<number, RowState> = {};
      for (const r of p.rows) {
        const k = descKey(r.description);
        st[r.row] = initialState(r, r.status === "new" && k ? getPref(k) : null);
      }
      setPreview(p); setStates(st); setResult(null);
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }

  const patch = (row: number, v: Partial<RowState>) => setStates((s) => ({ ...s, [row]: { ...s[row], ...v } }));
  const catsFor = (r: PreviewRow) => (r.direction === "outflow" ? expenseCats : inflowCats);
  const selectedRows = preview ? preview.rows.filter((r) => states[r.row]?.selected) : [];
  const pending = (dir: "outflow" | "inflow") => selectedRows.filter((r) => r.direction === dir && !isClassified(states[r.row])).length;

  async function doCommit() {
    if (busy || !preview || !account) return;
    const b = buildCommitRows(preview.rows, states);
    if (b.error) return setError(b.error);
    if (b.rows.length === 0) return setError("Selecciona al menos un movimiento.");
    setBusy(true); setError(null);
    try {
      const res = await api.importCommit(account.id, b.rows);
      for (const r of b.rows) {
        const k = descKey(r.description);
        if (k && r.category_id !== undefined) setPref(k, String(r.category_id));
      }
      setResult(res);
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }

  if (accs.loading && !accs.data) return <Loading />;

  if (result) {
    return (
      <>
        <PageTitle>Importación lista</PageTitle>
        <Card>
          <p className="text-lg font-bold">{result.created} movimientos creados</p>
          <Muted>{result.skipped_existing} omitidos por ya existir</Muted>
          <div className="mt-3 flex gap-2">
            <Link href={`/movimientos/${account ? `?account=${account.id}` : ""}`} className="font-semibold text-emerald-700 underline dark:text-emerald-400">Ver movimientos</Link>
          </div>
          <Btn variant="secondary" className="mt-3 w-full" onClick={() => { setResult(null); setPreview(null); setFile(null); setCsv(""); }}>Importar otro archivo</Btn>
        </Card>
      </>
    );
  }

  if (!preview) {
    return (
      <>
        <PageTitle>Importar estado de cuenta</PageTitle>
        <ErrorBox message={accs.error} onRetry={accs.reload} />
        <ErrorBox message={error} />
        <Card>
          <Field label="Cuenta">
            <Select value={accId} onChange={(e) => { setAccId(e.target.value); setPosTouched(false); }}>
              <option value="">Elige una cuenta…</option>
              {importable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Archivo CSV (máx. 1 MB)">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-sm" />
          </Field>
          {file && <Muted className="mb-2">{file.name}</Muted>}
          <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={posChecked} onChange={(e) => { setPosTouched(true); setPosVal(e.target.checked); }} />
            En este archivo los cargos son positivos
          </label>
          <Muted className="mb-3">
            Columnas aceptadas: Fecha, Descripción o Concepto, y Monto (o bien Cargo y Abono). Fechas DD/MM/AAAA o AAAA-MM-DD; punto decimal.
          </Muted>
          <Btn className="w-full" disabled={busy || !account || !csv} onClick={doPreview}>{busy ? "Analizando…" : "Revisar archivo"}</Btn>
        </Card>
      </>
    );
  }

  const s = preview.summary;
  const bulkSel = (v: string, set: (x: string) => void, cats: Account[], dir: "outflow" | "inflow", label: string) => {
    const n = pending(dir);
    if (n === 0 && !v) return null;
    return (
      <div className="mb-2">
        <Field label={label}>
          <Select value={v} onChange={(e) => set(e.target.value)}>
            <option value="">Categoría…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Btn variant="secondary" className="w-full" disabled={!v || n === 0} onClick={() => setStates((st) => applyCategoryBulk(preview.rows, st, dir, v))}>Aplicar a {n} sin clasificar</Btn>
      </div>
    );
  };

  return (
    <>
      <PageTitle right={<button type="button" className="min-h-11 text-sm font-semibold text-emerald-700 dark:text-emerald-400" onClick={() => { setPreview(null); setError(null); }}>Cambiar archivo</button>}>Revisar importación</PageTitle>
      <p className="mb-2 text-sm text-slate-500">{account?.name} · fechas leídas como {preview.date_order === "mdy" ? "mes/día/año" : "día/mes/año"}</p>
      <Card className="mb-3">
        <div className="grid grid-cols-4 gap-1 text-center text-xs">
          <div><p className="text-lg font-bold">{s.total}</p>total</div>
          <div><p className="text-lg font-bold">{s.new}</p>nuevas</div>
          <div><p className="text-lg font-bold">{s.duplicates}</p>posibles duplicados</div>
          <div><p className="text-lg font-bold">{s.imported}</p>ya importadas</div>
        </div>
      </Card>
      <ErrorBox message={error} />
      <Card className="mb-3">
        <H2>Clasificar en bloque</H2>
        {bulkSel(bulkOut, setBulkOut, expenseCats, "outflow", "Cargos: categoría de gasto")}
        {bulkSel(bulkIn, setBulkIn, inflowCats, "inflow", isCard ? "Abonos: categoría (devolución)" : "Abonos: categoría de ingreso")}
        {pending("outflow") === 0 && pending("inflow") === 0 && <Muted>Todas las seleccionadas están clasificadas.</Muted>}
      </Card>
      <ul className="mb-3 space-y-2">
        {preview.rows.map((r) => {
          const st = states[r.row];
          const locked = r.status === "imported";
          return (
            <li key={r.row}>
              <Card className={locked ? "opacity-50" : ""}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={locked} checked={!!st?.selected} onChange={(e) => patch(r.row, { selected: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.description}</span>
                    <span className="block text-xs text-slate-500">{fmtDate(r.occurred_on)} · fila {r.row}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold ${r.direction === "inflow" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                    {r.direction === "inflow" ? "+" : "−"}<Money cents={r.amount_cents} />
                  </span>
                </label>
                {locked && <p className="mt-1 text-xs text-slate-500">Ya importada</p>}
                {r.status === "installment" && (
                  <p className="mt-1 text-xs">
                    <span className="rounded-full bg-sky-600 px-2 py-0.5 font-semibold text-white">Mensualidad MSI</span>{" "}
                    Parece la mensualidad de una compra a meses ya registrada completa; importarla duplicaría el gasto.
                  </p>
                )}
                {r.status === "duplicate" && (
                  <p className="mt-1 text-xs">
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 font-semibold text-white">Posible duplicado</span>{" "}
                    {r.duplicate_of != null && <Link href={`/movimientos/detalle/?id=${r.duplicate_of}`} className="font-semibold text-emerald-700 underline dark:text-emerald-400">Ver movimiento</Link>}
                  </p>
                )}
                {st?.selected && !locked && (
                  <div className="mt-2 space-y-2">
                    <Select aria-label="Categoría" value={st.mode === "transfer" ? TRANSFER : st.categoryId}
                      onChange={(e) => e.target.value === TRANSFER ? patch(r.row, { mode: "transfer" }) : patch(r.row, { mode: "category", categoryId: e.target.value })}>
                      <option value="">Categoría…</option>
                      {catsFor(r).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value={TRANSFER}>Es transferencia / pago</option>
                    </Select>
                    {st.mode === "transfer" && (
                      <Select aria-label="Contracuenta" value={st.counterId} onChange={(e) => patch(r.row, { counterId: e.target.value })}>
                        <option value="">Contracuenta…</option>
                        {counters.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <Btn className="w-full" disabled={busy || selectedRows.length === 0} onClick={doCommit}>
        {busy ? "Importando…" : `Importar ${selectedRows.length} movimientos`}
      </Btn>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Importar /></Suspense>;
}
