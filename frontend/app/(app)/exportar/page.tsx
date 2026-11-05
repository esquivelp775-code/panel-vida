"use client";
import { useState } from "react";
import { api, todayISO } from "@/lib/api";
import { errMsg } from "@/lib/useLoad";
import { Btn, Card, ErrorBox, Field, H2, Input, Muted, PageTitle, useToast } from "@/components/ui";

export default function Exportar() {
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "csv" | "json") {
    setBusy(kind); setError(null);
    try {
      if (kind === "csv") await api.download("/export/transactions.csv", { date_from: from, date_to: to }, `movimientos-${todayISO()}.csv`);
      else await api.download("/export/full.json", undefined, `panel-vida-respaldo-${todayISO()}.json`);
      toast("Descarga lista");
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }
  return (
    <>
      <PageTitle>Exportar</PageTitle>
      <ErrorBox message={error} />
      <H2>Movimientos (CSV)</H2>
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Muted className="mb-3">Sin fechas se exportan todos los movimientos.</Muted>
        <Btn className="w-full" disabled={!!busy} onClick={() => run("csv")}>{busy === "csv" ? "Descargando…" : "Descargar CSV"}</Btn>
      </Card>
      <H2>Respaldo completo (JSON)</H2>
      <Card>
        <Muted className="mb-3">Incluye cuentas, movimientos, asientos, obligaciones, presupuestos, meses sin intereses, pendientes, hábitos y Ryventis. Contiene datos financieros: guárdalo en un lugar seguro.</Muted>
        <Btn className="w-full" disabled={!!busy} onClick={() => run("json")}>{busy === "json" ? "Descargando…" : "Descargar respaldo"}</Btn>
      </Card>
    </>
  );
}
