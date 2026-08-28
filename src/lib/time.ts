/** Timezone-aware helpers built on Intl, so there is no tz database to ship. */

export function parseHhMm(value: string, fallback = { hour: 7, minute: 0 }) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? "");
  if (!m) return fallback;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** The wall-clock parts of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== "literal") parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some locales/engines.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/** Minutes since local midnight, in the given zone. */
export function minutesOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * True when `date` falls inside a quiet-hours window that may wrap midnight
 * (21:30 → 06:30 is the default, and that is the wrapping case).
 */
export function isQuietHours(date: Date, timeZone: string, start: string, end: string): boolean {
  const now = minutesOfDay(date, timeZone);
  const s = parseHhMm(start, { hour: 21, minute: 30 });
  const e = parseHhMm(end, { hour: 6, minute: 30 });
  const from = s.hour * 60 + s.minute;
  const to = e.hour * 60 + e.minute;
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

/** Did the local wall clock cross HH:mm somewhere in the last `windowMinutes`? */
export function crossedLocalTime(now: Date, timeZone: string, hhmm: string, windowMinutes: number): boolean {
  const target = parseHhMm(hhmm);
  const nowMin = minutesOfDay(now, timeZone);
  const targetMin = target.hour * 60 + target.minute;
  const diff = (nowMin - targetMin + 1440) % 1440;
  return diff < windowMinutes;
}

export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  // Walk back from the current instant to the same instant at local 00:00.
  const minutesIn = p.hour * 60 + p.minute;
  const d = new Date(date.getTime() - minutesIn * 60_000);
  d.setSeconds(0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 864e5);
}

/** "in 2 days", "3 hours ago" — short, for cards. */
export function relativeLabel(target: Date, now = new Date()): string {
  const diffMs = target.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  const sign = diffMs < 0 ? -1 : 1;

  if (mins < 1) return "now";
  if (mins < 60) return rtf.format(sign * mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(sign * hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(sign * days, "day");
  return rtf.format(sign * Math.round(days / 30), "month");
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
