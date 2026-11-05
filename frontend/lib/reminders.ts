/* Recordatorios de Inicio. Son una preferencia de este dispositivo: nada financiero. */
export const DEFAULT_REMINDERS = ["💧 Toma agua", "🧘 Respira 1 minuto", "🚶 Muévete 5 minutos", "📵 Descanso de pantalla"];
const MAX_ITEMS = 12;
const MAX_LEN = 60;

/** Lee la lista guardada. Sin datos o con datos corruptos usa la lista por defecto; una lista vacía se respeta. */
export function parseReminders(raw: string | null): string[] {
  if (!raw) return DEFAULT_REMINDERS;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return DEFAULT_REMINDERS;
    return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function addReminder(list: string[], text: string): string[] {
  const t = text.trim().slice(0, MAX_LEN);
  if (!t || list.length >= MAX_ITEMS || list.some((x) => x.toLowerCase() === t.toLowerCase())) return list;
  return [...list, t];
}

export function removeReminder(list: string[], text: string): string[] {
  return list.filter((x) => x !== text);
}
