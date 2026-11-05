export type NavItem = { href: string; label: string; d: string; action?: "logout" };
export type NavGroup = { id: string; label: string; open: boolean; items: NavItem[] };

// Pestaña por defecto de las páginas con ?tab=; las demás páginas ignoran el parámetro.
const DEFAULT_TAB: Record<string, string> = { "/vida": "tasks", "/ryventis": "resumen" };

const trimPath = (p: string) => p.replace(/\/+$/, "") || "/";

export function isNavItemActive(path: string, tab: string | null, href: string): boolean {
  const [hrefPath, hrefQuery] = href.split("?");
  const base = trimPath(hrefPath);
  if (trimPath(path) !== base) return false;
  const defaultTab = DEFAULT_TAB[base];
  if (!defaultTab) return true;
  const want = hrefQuery ? new URLSearchParams(hrefQuery).get("tab") : null;
  return want ? tab === want : !tab || tab === defaultTab;
}

/** ¿La página actual pertenece a este grupo? Sirve para no esconder el elemento activo en un grupo plegado. */
export function groupHasPath(group: NavGroup, path: string): boolean {
  const current = trimPath(path);
  return group.items.some((i) => !i.action && trimPath(i.href.split("?")[0]) === current);
}

export const NAV_GROUPS: NavGroup[] = [
  { id: "inicio", label: "Inicio", open: true, items: [
    { href: "/", label: "Hoy", d: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
    { href: "/calendario/", label: "Calendario", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  ] },
  { id: "finanzas", label: "Finanzas", open: true, items: [
    { href: "/finanzas/", label: "Resumen", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
    { href: "/movimientos/", label: "Movimientos", d: "M4 6h16M4 12h16M4 18h10" },
    { href: "/cuentas/", label: "Cuentas", d: "M3 7h18v12H3zM3 11h18M7 15h3" },
    { href: "/deudas/", label: "Deudas", d: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" },
    { href: "/presupuestos/", label: "Presupuestos", d: "M12 3a9 9 0 109 9h-9z" },
    { href: "/flujo/", label: "Flujo", d: "M3 17l6-6 4 4 8-8" },
    { href: "/importar/", label: "Importar", d: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" },
    { href: "/carga-inicial/", label: "Carga inicial", d: "M4 4h16v6H4zM4 14h16v6H4z" },
    { href: "/exportar/", label: "Exportar", d: "M12 15V3m0 0L8 7m4-4l4 4M4 21h16" },
  ] },
  { id: "vida", label: "Vida", open: false, items: [
    { href: "/vida/", label: "Pendientes", d: "M5 12l4 4 10-10" },
    { href: "/vida/?tab=habitos", label: "Hábitos", d: "M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z" },
  ] },
  { id: "ryventis", label: "Ryventis", open: true, items: [
    { href: "/ryventis/", label: "Resumen", d: "M4 5h6v14H4zM14 5h6v8h-6z" },
    { href: "/ryventis/?tab=clientes", label: "Clientes", d: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0" },
    { href: "/ryventis/?tab=proyectos", label: "Proyectos", d: "M3 7h7l2 2h9v10H3z" },
    { href: "/ryventis/?tab=cobros", label: "Cobros", d: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" },
    { href: "/ryventis/?tab=pendientes", label: "Pendientes", d: "M5 12l4 4 10-10" },
  ] },
  { id: "otros", label: "Otros", open: true, items: [
    { href: "/configuracion/", label: "Configuración", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
    { href: "#logout", label: "Cerrar sesión", d: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10", action: "logout" },
  ] },
];
