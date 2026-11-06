"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { clearToken, getToken } from "@/lib/api";
import { NAV_GROUPS, groupHasPath, isNavItemActive, type NavItem } from "@/components/nav";
import { useIndicator, useRouteDirection } from "@/components/motion";

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
  const dir = useRouteDirection(path);
  const tabsRef = useRef<HTMLUListElement>(null);
  // -1 hasta que la barra existe (antes de `ready` no se pinta): así se vuelve a medir al aparecer.
  const tabIndicator = useIndicator(tabsRef, ready ? TABS.findIndex((t) => isActive(path, t.href)) : -1, TABS.length);
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
        <Link href={to(t.href)} aria-label={t.label} aria-current={active ? "page" : undefined} data-ind-item
          className={`pv-press relative z-[1] flex min-h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${active ? "text-ink" : "text-muted"}`}>
          <Icon d={t.d} />
          <span className="text-[11px] font-semibold leading-none">{t.label}</span>
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
        <main key={path} data-dir={dir} className="pv-page px-4 pb-36 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Barra inferior (móvil) */}
      {/* Barra inferior: opaca sobre una banda que desvanece el contenido, para que nada se vea "a través" ni choque. */}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[var(--base)] from-40% to-transparent" />
        <ul ref={tabsRef} className="glass glass-solid relative mx-auto flex max-w-md items-center rounded-[28px] px-1.5 py-1.5 ring-1 ring-line">
          <span aria-hidden="true" className="pv-indicator absolute bottom-1.5 left-0 top-1.5 rounded-[22px] bg-soft ring-1 ring-line" style={tabIndicator} />
          {left.map(tab)}
          <li className="flex w-16 justify-center">
            {!onRegister && (
              <Link href="/registrar/" aria-label="Registrar movimiento"
                className="pv-press flex h-12 w-12 items-center justify-center rounded-full btn-accent text-3xl font-light leading-none">
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
