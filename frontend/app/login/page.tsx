"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import { Btn, ErrorBox, Field, Input } from "@/components/ui";
import { errMsg } from "@/lib/useLoad";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (getToken()) router.replace("/"); }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api.login(email.trim(), password);
      setToken(r.access_token);
      router.replace("/");
    } catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-4xl font-bold tracking-tight">Panel de Vida</h1>
      <p className="mb-6 text-sm text-muted">Inicia sesión para ver tus finanzas.</p>
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        <Field label="Correo electrónico"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contraseña"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Btn type="submit" className="mt-2 w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Btn>
      </form>
    </main>
  );
}
