/**
 * Convierte una fecha UTC al wall-clock de una timezone IANA y devuelve
 * el día de la semana (0..6) y el minuto del día (0..1440).
 *
 * Usa Intl.DateTimeFormat — no necesita dependencias externas. Funciona
 * tanto en Node como en el browser.
 */
export function inTimezone(date: Date, timezone: string): {
  dayOfWeek: number;
  minuteOfDay: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const WEEKDAYS: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dayOfWeek: WEEKDAYS[weekday] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
}
