export type NavItem = { href: string; label: string; d: string; action?: "logout" };
export type NavGroup = { id: string; label: string; open: boolean; items: NavItem[] };

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
    { href: "/vida/?tab=ryventis", label: "Tablero de proyectos", d: "M4 5h6v14H4zM14 5h6v8h-6z" },
  ] },
  { id: "otros", label: "Otros", open: false, items: [
    { href: "#logout", label: "Cerrar sesión", d: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10", action: "logout" },
  ] },
];
