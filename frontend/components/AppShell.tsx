"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getToken } from "@/lib/api";

const TABS = [
  { href: "/", label: "Inicio", d: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/movimientos", label: "Movimientos", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/calendario", label: "Calendario", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/vida", label: "Vida", d: "M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z" },
  { href: "/mas", label: "Más", d: "M5 12h.01M12 12h.01M19 12h.01" },
];
/* Accesos extra sólo en la barra lateral de escritorio. */
const EXTRA = [
  { href: "/cuentas", label: "Cuentas", d: "M3 7h18v12H3zM3 11h18M7 15h3" },
  { href: "/deudas", label: "Deudas", d: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" },
  { href: "/presupuestos", label: "Presupuestos", d: "M12 3a9 9 0 109 9h-9z" },
  { href: "/flujo", label: "Flujo", d: "M3 17l6-6 4 4 8-8" },
  { href: "/importar", label: "Importar", d: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" },
  { href: "/exportar", label: "Exportar", d: "M12 15V3m0 0L8 7m4-4l4 4M4 21h16" },
];

function isActive(path: string, href: string, mobile = true) {
  const p = path.replace(/\/+$/, "") || "/";
  if (href === "/") return p === "/";
  if (href === "/mas" && mobile) return ["/mas", "/cuentas", "/importar", "/deudas", "/presupuestos", "/flujo", "/exportar"].some((x) => p.startsWith(x));
  return p.startsWith(href);
}
const to = (h: string) => (h === "/" ? "/" : `${h}/`);
const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login/");
    else setReady(true);
  }, [router]);

  if (!ready) return <p className="p-8 text-center text-sm text-muted">Cargando…</p>;
  const onRegister = path.startsWith("/registrar");
  const side = [...TABS.filter((t) => t.href !== "/mas"), ...EXTRA];
  const left = TABS.slice(0, 2), right = TABS.slice(2);

  const tab = (t: (typeof TABS)[number]) => {
    const active = isActive(path, t.href);
    return (
      <li key={t.href} className="flex-1">
        <Link href={to(t.href)} aria-label={t.label} aria-current={active ? "page" : undefined}
          className={`pv-press relative flex min-h-14 flex-col items-center justify-center gap-1 transition-colors ${active ? "text-ink" : "text-muted"}`}>
          <Icon d={t.d} />
          <span className="sr-only">{t.label}</span>
          <span aria-hidden="true" className={`h-1 w-1 rounded-full bg-ink transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`} />
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-screen lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 lg:flex">
        <div className="flex h-full flex-col rounded-[28px] bg-surface p-4 shadow-soft ring-1 ring-line">
          <p className="mb-5 px-3 pt-2 text-lg font-bold tracking-tight">Panel de Vida</p>
          <nav aria-label="Navegación lateral" className="flex-1 space-y-1 overflow-y-auto">
            {side.map((t) => {
              const active = isActive(path, t.href, false);
              return (
                <Link key={t.href} href={to(t.href)} aria-current={active ? "page" : undefined}
                  className={`pv-press flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors ${active ? "bg-ink text-onink" : "text-muted hover:bg-soft hover:text-ink"}`}>
                  <Icon d={t.d} />{t.label}
                </Link>
              );
            })}
          </nav>
          {!onRegister && (
            <Link href="/registrar/" className="pv-press mt-3 flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-onink">+ Registrar</Link>
          )}
        </div>
      </aside>

      <div className="mx-auto w-full max-w-xl lg:max-w-5xl lg:flex-1">
        <main key={path} className="pv-page px-4 pb-40 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Barra inferior (móvil) */}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <ul className="mx-auto flex max-w-md items-center rounded-[28px] bg-surface px-2 shadow-soft ring-1 ring-line">
          {left.map(tab)}
          <li className="flex w-16 justify-center">
            {!onRegister && (
              <Link href="/registrar/" aria-label="Registrar movimiento"
                className="pv-press -mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-3xl font-light leading-none text-onink shadow-soft ring-4 ring-[var(--canvas)]">
                +
              </Link>
            )}
          </li>
          {right.map(tab)}
        </ul>
      </nav>
    </div>
  );
}
