/**
 * Occurrences of an event inside a date window, for the weekly carousel.
 *
 * Mirrors the website's getEventOccurrences (src/utils/eventOccurrences.js):
 * weekly / biweekly / monthly series and custom dates are expanded, exception
 * dates removed, and a series without recurrenceEndDate stops after the same
 * default horizon (3 months, 12 for monthly / monthlyWeekday). Working purely on YYYY-MM-DD
 * strings at noon UTC keeps it independent of the server's timezone.
 */

export interface DateWindow {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

export interface SeriesFields {
  date?: unknown;
  endDate?: unknown;
  recurrence?: unknown;
  recurrenceEndDate?: unknown;
  customDates?: unknown;
  exceptionDates?: unknown;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Day of month of the n-th `weekday` (0 = Sunday) in the given month (`month`
 * is 0-based), or null if there is none. `ordinal` is 1-5, or -1 for the last
 * one. Mirror of nthWeekdayOfMonth in src/utils/eventOccurrences.js.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: number
): number | null {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (ordinal === -1) {
    const lastWeekday = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
    return daysInMonth - ((lastWeekday - weekday + 7) % 7);
  }
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7;
  return day <= daysInMonth ? day : null;
}

/** 1-4 for the first to fourth weekday of its month, -1 for a 5th one ("last"). */
export function getNthWeekdayOrdinal(iso: string): number {
  const day = Number(iso.split('-')[2]);
  const nth = Math.floor((day - 1) / 7) + 1;
  return nth >= 5 ? -1 : nth;
}

/** The occurrence of a monthly / monthlyWeekday series `monthsAhead` months after the start. */
function monthlyOccurrence(startIso: string, recurrence: string, monthsAhead: number): string {
  const [year, month, day] = startIso.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + monthsAhead, 1, 12));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let targetDay = Math.min(day, daysInMonth);
  if (recurrence === 'monthlyWeekday') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    targetDay = nthWeekdayOfMonth(y, m, weekday, getNthWeekdayOrdinal(startIso)) ?? targetDay;
  }
  return toIso(new Date(Date.UTC(y, m, targetDay, 12)));
}

function daysBetween(fromIso: string, toIsoDay: string): number {
  return Math.round((toDate(toIsoDay).getTime() - toDate(fromIso).getTime()) / 86_400_000);
}

function seriesDates(event: SeriesFields, date: string, recurrence: string, window: DateWindow) {
  if (recurrence === 'custom') {
    return [...new Set([...strings(event.customDates), date])].filter((d) => ISO_DAY.test(d));
  }

  const start = toDate(date);
  const explicitEnd = str(event.recurrenceEndDate);
  let seriesEnd: string;
  if (ISO_DAY.test(explicitEnd)) {
    seriesEnd = explicitEnd;
  } else {
    const fallback = new Date(start);
    if (recurrence === 'monthly' || recurrence === 'monthlyWeekday')
      fallback.setUTCFullYear(fallback.getUTCFullYear() + 1);
    else fallback.setUTCMonth(fallback.getUTCMonth() + 3);
    seriesEnd = toIso(fallback);
  }
  const last = seriesEnd < window.end ? seriesEnd : window.end;

  const dates: string[] = [];
  if (recurrence === 'monthly' || recurrence === 'monthlyWeekday') {
    for (let i = 0; ; i++) {
      const occurrence = monthlyOccurrence(date, recurrence, i);
      if (occurrence > last) break;
      dates.push(occurrence);
    }
    return dates;
  }
  const cursor = new Date(start);
  while (toIso(cursor) <= last) {
    dates.push(toIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + (recurrence === 'biweekly' ? 14 : 7));
  }
  return dates;
}

/**
 * Copies of `event` (one per occurrence that starts inside the window), each
 * with `date` set to that occurrence. For multi-day events `endDate` moves
 * along so the length stays the same. Events that began before the window
 * and are still running are not included: the carousel announces starts.
 */
export function expandOccurrencesInWindow<T extends SeriesFields>(
  event: T,
  window: DateWindow
): T[] {
  const date = str(event.date);
  if (!ISO_DAY.test(date)) return [];

  const recurrence = str(event.recurrence) || 'none';
  const isSeries =
    recurrence === 'custom' ||
    recurrence === 'weekly' ||
    recurrence === 'biweekly' ||
    recurrence === 'monthly' ||
    recurrence === 'monthlyWeekday';

  const candidates = isSeries ? seriesDates(event, date, recurrence, window) : [date];
  const exceptions = new Set(isSeries ? strings(event.exceptionDates) : []);
  const endDate = str(event.endDate);
  const length = ISO_DAY.test(endDate) && endDate > date ? daysBetween(date, endDate) : 0;

  return candidates
    .filter((d) => d >= window.start && d <= window.end && !exceptions.has(d))
    .sort()
    .map((d) => {
      if (d === date || length === 0) return { ...event, date: d };
      const shifted = toDate(d);
      shifted.setUTCDate(shifted.getUTCDate() + length);
      return { ...event, date: d, endDate: toIso(shifted) };
    });
}
