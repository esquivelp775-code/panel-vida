/* Dirección de las transiciones: el contenido entra desde el lado hacia el que se movió el usuario. */
export type Direction = "forward" | "back" | "none";

const FINANZAS = ["/finanzas", "/movimientos", "/cuentas", "/deudas", "/presupuestos", "/flujo", "/importar", "/exportar", "/carga-inicial"];
// Profundidad dentro de la sección: el hub es 0, sus pantallas 1 y los detalles 2.
const DEPTH: Record<string, number> = { "/finanzas": 0, "/registrar": 9 };

const trim = (p: string) => p.replace(/\/+$/, "") || "/";

/** Índice de la pestaña de la barra inferior (Inicio, Finanzas, Calendario, Vida, Más) a la que pertenece la ruta. */
export function sectionOf(path: string): number {
  const p = trim(path);
  if (p === "/") return 0;
  if (FINANZAS.some((x) => p === x || p.startsWith(`${x}/`))) return 1;
  if (p.startsWith("/calendario")) return 2;
  if (p.startsWith("/vida")) return 3;
  return 4;
}

function depth(path: string): number {
  const p = trim(path);
  const root = `/${p.split("/")[1] || ""}`;
  if (root in DEPTH) return DEPTH[root];
  return p.split("/").filter(Boolean).length;
}

export function routeDirection(from: string, to: string): Direction {
  if (trim(from) === trim(to)) return "none";
  const dTo = depth(to), dFrom = depth(from);
  // Registrar es una pantalla "encima" de todo: abre hacia adelante y cerrarla regresa.
  if (dTo === 9 || dFrom === 9) return dTo > dFrom ? "forward" : "back";
  const a = sectionOf(from), b = sectionOf(to);
  if (a !== b) return b > a ? "forward" : "back";
  return dTo === dFrom ? "none" : dTo > dFrom ? "forward" : "back";
}

export function indexDirection(from: number, to: number): Direction {
  if (from < 0 || to < 0 || from === to) return "none";
  return to > from ? "forward" : "back";
}
