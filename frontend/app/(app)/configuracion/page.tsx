"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, clearToken, setToken, type IntegrityReport, type Me } from "@/lib/api";
import { addReminder, parseReminders, removeReminder } from "@/lib/reminders";
import { errMsg, getPref, setPref, useLoad } from "@/lib/useLoad";
import { Btn, Card, Confirm, ErrorBox, Field, H2, Input, Loading, Muted, PageTitle, useToast } from "@/components/ui";

const MIN_PASSWORD = 10;

function Perfil({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(me.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await api.updateMe(name.trim() || null); toast("Perfil actualizado"); onSaved(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Card className="mb-4">
      <form onSubmit={save} noValidate>
        <ErrorBox message={error} />
        <Field label="Nombre" hint="Es el nombre del saludo en Inicio."><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" /></Field>
        <Muted className="mb-1">Correo: {me.email}</Muted>
        <Muted className="mb-3">Moneda: {me.currency}</Muted>
        <Btn type="submit" className="w-full" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Btn>
      </form>
    </Card>
  );
}

function Seguridad() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!current) return setError("Escribe tu contraseña actual.");
    if (next.length < MIN_PASSWORD) return setError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (next !== repeat) return setError("Las contraseñas nuevas no coinciden.");
    setBusy(true); setError(null);
    try {
      setToken((await api.changePassword(current, next)).access_token);
      setCurrent(""); setNext(""); setRepeat("");
      toast("Contraseña cambiada. Se cerraron las demás sesiones.");
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  async function logoutOthers() {
    setBusy(true); setError(null);
    try { setToken((await api.logoutAll()).access_token); toast("Se cerraron las demás sesiones"); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); setConfirmAll(false); }
  }
  return (
    <Card className="mb-4">
      <form onSubmit={change} noValidate>
        <ErrorBox message={error} />
        <Field label="Contraseña actual"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label={`Contraseña nueva (mínimo ${MIN_PASSWORD} caracteres)`}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Repite la contraseña nueva"><Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>
        <Btn type="submit" className="w-full" disabled={busy}>{busy ? "Guardando…" : "Cambiar contraseña"}</Btn>
      </form>
      <Btn variant="secondary" className="mt-3 w-full" disabled={busy} onClick={() => setConfirmAll(true)}>Cerrar sesión en los demás dispositivos</Btn>
      <Confirm open={confirmAll} title="Cerrar las demás sesiones" confirmLabel="Cerrar sesiones" busy={busy} onConfirm={logoutOthers} onClose={() => setConfirmAll(false)}
        message="Tus otros dispositivos tendrán que iniciar sesión de nuevo. Este seguirá dentro." />
    </Card>
  );
}

function Recordatorios() {
  const [list, setList] = useState(() => parseReminders(getPref("reminders") || null));
  const [text, setText] = useState("");
  const [showQuote, setShowQuote] = useState(() => getPref("hide_quote") !== "1");
  const update = (l: string[]) => { setList(l); setPref("reminders", JSON.stringify(l)); };
  function add(e: React.FormEvent) {
    e.preventDefault();
    update(addReminder(list, text));
    setText("");
  }
  return (
    <Card className="mb-4">
      <Muted className="mb-3">Aparecen en Inicio. Se guardan sólo en este dispositivo.</Muted>
      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={showQuote} onChange={(e) => { setShowQuote(e.target.checked); setPref("hide_quote", e.target.checked ? "" : "1"); }} />
        Mostrar la frase del día
      </label>
      {list.length === 0 ? <Muted className="mb-3">Sin recordatorios.</Muted> : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {list.map((r) => (
            <li key={r} className="flex min-h-11 items-center gap-1 rounded-full bg-soft py-1 pl-3 pr-1 text-sm">
              <span>{r}</span>
              <button type="button" aria-label={`Quitar ${r}`} onClick={() => update(removeReminder(list, r))} className="-my-1 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-ink">×</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="Nuevo recordatorio" placeholder="Nuevo recordatorio" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} />
        <Btn type="submit" disabled={!text.trim()}>Añadir</Btn>
      </form>
    </Card>
  );
}

function Datos() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function check() {
    setBusy(true); setError(null); setReport(null);
    try { setReport(await api.integrity()); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  }
  const problems = report ? report.unbalanced_transactions.length + report.voided_without_reversal.length + report.reversals_not_mirrored.length + report.archived_with_balance.length : 0;
  const link = "pv-press flex min-h-11 items-center rounded-full bg-soft px-4 text-sm font-semibold";
  return (
    <Card className="mb-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Link className={link} href="/carga-inicial/">Carga inicial</Link>
        <Link className={link} href="/importar/">Importar estado</Link>
        <Link className={link} href="/exportar/">Exportar respaldo</Link>
      </div>
      <ErrorBox message={error} />
      <Btn variant="secondary" className="w-full" disabled={busy} onClick={check}>{busy ? "Revisando…" : "Verificar que el libro cuadre"}</Btn>
      {report && (
        <p role="status" className={`mt-3 text-sm font-semibold ${report.ok ? "text-income" : "text-expense"}`}>
          {report.ok ? `Todo cuadra: ${report.checked_transactions} operaciones revisadas.` : `Se encontraron ${problems} problemas en ${report.checked_transactions} operaciones. Exporta un respaldo y revísalo antes de seguir registrando.`}
        </p>
      )}
    </Card>
  );
}

export default function Configuracion() {
  const router = useRouter();
  const me = useLoad(() => api.me(), []);
  return (
    <>
      <PageTitle>Configuración</PageTitle>
      <ErrorBox message={me.error} onRetry={me.reload} />
      <H2>Perfil</H2>
      {me.loading && !me.data ? <Loading /> : me.data && <Perfil key={me.data.id} me={me.data} onSaved={me.reload} />}
      <H2>Seguridad</H2>
      <Seguridad />
      <H2>Recordatorios</H2>
      <Recordatorios />
      <H2>Datos</H2>
      <Datos />
      <Btn variant="secondary" className="w-full" onClick={() => { clearToken(); router.replace("/login/"); }}>Cerrar sesión</Btn>
    </>
  );
}
