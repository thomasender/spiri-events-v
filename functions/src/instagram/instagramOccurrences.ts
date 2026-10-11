/**
 * Occurrences of an event inside a date window, for the weekly carousel.
 *
 * Mirrors the website's getEventOccurrences (src/utils/eventOccurrences.js):
 * weekly / biweekly / monthly series and custom dates are expanded, exception
 * dates removed, and a series without recurrenceEndDate stops after the same
 * default horizon (3 months, 12 for monthly). Working purely on YYYY-MM-DD
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
    if (recurrence === 'monthly') fallback.setUTCFullYear(fallback.getUTCFullYear() + 1);
    else fallback.setUTCMonth(fallback.getUTCMonth() + 3);
    seriesEnd = toIso(fallback);
  }
  const last = seriesEnd < window.end ? seriesEnd : window.end;

  const dates: string[] = [];
  const cursor = new Date(start);
  while (toIso(cursor) <= last) {
    dates.push(toIso(cursor));
    if (recurrence === 'monthly') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (recurrence === 'biweekly' ? 14 : 7));
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
    recurrence === 'monthly';

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
