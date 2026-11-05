/* Ayudas puras del módulo Ryventis (sin dependencias de React). */
export const STAGES = ["nuevo", "charla", "propuesta", "cliente"] as const;
export const STAGE_LABEL: Record<string, string> = { nuevo: "Nuevo", charla: "Charla", propuesta: "Propuesta", cliente: "Cliente", perdido: "Perdido" };
/** Un tinte suave por etapa (RGB) sobre el vidrio gris. */
export const STAGE_TINT: Record<string, string> = {
  nuevo: "148,163,184", charla: "125,160,220", propuesta: "230,180,90", cliente: "74,222,128", perdido: "248,113,113",
};

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
/** Índice de la etapa en la barra de progreso (-1 si es "perdido" o desconocida). */
export function stageIndex(stage: string): number {
  return (STAGES as readonly string[]).indexOf(stage);
}
/** Porcentaje entero 0-100 acotado; total 0 => 0. */
export function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((done * 100) / total)));
}
/** Etiqueta de entrega: "Entrega hoy" / "Vencida" / fecha corta. */
export function dueLabel(due: string, today: string, fmt: (iso: string) => string): string {
  if (due === today) return "Entrega hoy";
  if (due < today) return "Vencida · " + fmt(due);
  return fmt(due);
}
