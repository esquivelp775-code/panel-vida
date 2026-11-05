"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { clearToken, getToken } from "@/lib/api";
import { NAV_GROUPS, groupHasPath, isNavItemActive, type NavItem } from "@/components/nav";

const TABS = [
  { href: "/", label: "Inicio", d: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/finanzas", label: "Finanzas", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/calendario", label: "Calendario", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/vida", label: "Vida", d: "M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z" },
  { href: "/mas", label: "Más", d: "M5 12h.01M12 12h.01M19 12h.01" },
];
function isActive(path: string, href: string, mobile = true) {
  const p = path.replace(/\/+$/, "") || "/";
  if (href === "/") return p === "/";
  if (href === "/finanzas" && mobile) return ["/finanzas", "/movimientos", "/cuentas", "/importar", "/deudas", "/presupuestos", "/flujo", "/exportar", "/carga-inicial"].some((x) => p.startsWith(x));
  return p.startsWith(href);
}
const to = (h: string) => (h === "/" ? "/" : `${h}/`);
const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// Usa useSearchParams: en el export estático debe renderizarse dentro de <Suspense>.
function SideLink({ item, open, className }: { item: NavItem; open: boolean; className: string }) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const active = isNavItemActive(path, tab, item.href);
  return (
    <Link href={item.href} tabIndex={open ? 0 : -1} aria-current={active ? "page" : undefined}
      className={`${className} ${active ? "bg-accent text-onaccent" : "text-muted hover:bg-soft hover:text-ink"}`}>
      <Icon d={item.d} />{item.label}
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setOpenG(JSON.parse(localStorage.getItem("pv_nav_groups") || "{}")); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const mv = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
        document.documentElement.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", mv, { passive: true });
    return () => { window.removeEventListener("pointermove", mv); cancelAnimationFrame(raf); };
  }, []);
  const toggle = (id: string, cur: boolean) => {
    const n = { ...openG, [id]: !cur };
    setOpenG(n);
    try { localStorage.setItem("pv_nav_groups", JSON.stringify(n)); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!getToken()) router.replace("/login/");
    else setReady(true);
  }, [router]);

  if (!ready) return <p className="p-8 text-center text-sm text-muted">Cargando…</p>;
  const onRegister = path.startsWith("/registrar");
  const left = TABS.slice(0, 2), right = TABS.slice(2);

  const tab = (t: (typeof TABS)[number]) => {
    const active = isActive(path, t.href);
    return (
      <li key={t.href} className="flex-1">
        <Link href={to(t.href)} aria-label={t.label} aria-current={active ? "page" : undefined}
          className={`pv-press relative flex min-h-14 flex-col items-center justify-center gap-1 transition-colors ${active ? "text-ink" : "text-muted"}`}>
          <Icon d={t.d} />
          <span className="sr-only">{t.label}</span>
          <span aria-hidden="true" className={`h-1 w-1 rounded-full bg-accent transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`} />
        </Link>
      </li>
    );
  };

  return (
    <div className="relative min-h-screen lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 lg:flex">
        <div className="flex h-full flex-col rounded-[28px] bg-surface p-4 ring-1 ring-line">
          <p className="mb-5 px-3 pt-2 text-xl font-bold">Panel de <span className="serif text-2xl">Vida</span></p>
          <nav aria-label="Navegación lateral" className="flex-1 space-y-2 overflow-y-auto">
            {NAV_GROUPS.map((g) => {
              // Un grupo plegado por defecto se abre si la página actual está en él (el elemento activo debe verse).
              const open = openG[g.id] ?? (g.open || groupHasPath(g, path));
              return (
                <div key={g.id}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(g.id, open)}
                    className="t-kicker flex min-h-9 w-full items-center justify-between rounded-full px-4 hover:text-ink">
                    {g.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <div className="nav-grp" data-open={open}>
                    <div className="space-y-1">
                      {g.items.map((t) => {
                        const cls = "pv-press flex min-h-11 w-full items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors";
                        if (t.action === "logout")
                          return <button key={t.href} type="button" tabIndex={open ? 0 : -1} onClick={() => { clearToken(); router.replace("/login/"); }} className={`${cls} text-muted hover:bg-soft hover:text-ink`}><Icon d={t.d} />{t.label}</button>;
                        return <Suspense key={t.href} fallback={null}><SideLink item={t} open={open} className={cls} /></Suspense>;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
          {!onRegister && (
            <Link href="/registrar/" className="pv-press mt-3 flex min-h-11 items-center justify-center rounded-full btn-accent px-4 text-sm font-semibold">+ Registrar</Link>
          )}
        </div>
      </aside>

      <div className="mx-auto w-full max-w-xl lg:max-w-5xl lg:flex-1">
        <main key={path} className="pv-page px-4 pb-40 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Barra inferior (móvil) */}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <ul className="mx-auto flex max-w-md items-center rounded-[28px] bg-surface px-2 ring-1 ring-line">
          {left.map(tab)}
          <li className="flex w-16 justify-center">
            {!onRegister && (
              <Link href="/registrar/" aria-label="Registrar movimiento"
                className="pv-press -mt-7 flex h-14 w-14 items-center justify-center rounded-full btn-accent text-3xl font-light leading-none ring-4 ring-white/10">
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
