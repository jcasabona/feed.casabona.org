import { TIMEZONE } from '../config/sources';

const parts = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;

/** "Sep 30, 2026 · 9:14 AM" in America/New_York */
export function formatStamp(d: Date): string {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(d);
  return `${date} · ${time}`;
}

/** Slug from the date-time, e.g. 2026-09-30-0914 */
export function dateSlug(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

/**
 * Dates typed into the CMS are wall-clock times with no zone (2026-09-30T09:14).
 * Treat them as America/New_York. Values that carry an explicit offset are kept as-is.
 */
export function cmsDate(v: Date | string): Date {
  let wall: number;
  if (typeof v === 'string') {
    if (/(Z|[+-]\d\d:?\d\d)$/.test(v) && v.includes('T')) return new Date(v);
    wall = Date.parse(v.replace(' ', 'T') + 'Z');
  } else {
    wall = v.getTime(); // YAML parses zoneless timestamps as UTC, so its UTC fields are the wall clock
  }
  // Find the instant whose New York wall clock equals `wall`.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += wall - shown;
  }
  return new Date(guess);
}
