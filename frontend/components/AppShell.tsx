"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getToken } from "@/lib/api";

const TABS = [
  { href: "/", label: "Inicio", d: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/movimientos", label: "Movimientos", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/cuentas", label: "Cuentas", d: "M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2" },
  { href: "/mas", label: "Más", d: "M5 12h.01M12 12h.01M19 12h.01" },
];

function isActive(path: string, href: string) {
  const p = path.replace(/\/+$/, "") || "/";
  if (href === "/") return p === "/";
  if (href === "/mas") return ["/mas", "/deudas", "/presupuestos", "/flujo", "/exportar"].some((x) => p.startsWith(x));
  return p.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login/");
    else setReady(true);
  }, [router]);

  if (!ready) return <p className="p-8 text-center text-sm text-slate-500">Cargando…</p>;
  const onRegister = path.startsWith("/registrar");

  return (
    <div className="mx-auto min-h-screen max-w-xl">
      <main className="px-4 pb-40 pt-4">{children}</main>
      {!onRegister && (
        <Link href="/registrar/" aria-label="Registrar movimiento"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl font-light text-white shadow-lg hover:bg-emerald-700 sm:right-[calc(50%-18rem)]">
          +
        </Link>
      )}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
        <ul className="mx-auto flex max-w-xl">
          {TABS.map((t) => {
            const active = isActive(path, t.href);
            return (
              <li key={t.href} className="flex-1">
                <Link href={t.href === "/" ? "/" : `${t.href}/`} aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.d} /></svg>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
