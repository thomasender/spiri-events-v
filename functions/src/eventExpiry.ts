// Past events are deleted RETENTION_DAYS after their last date. Series are
// deleted that long after their last occurrence. Mirror of
// src/utils/eventExpiry.js (the app shows the same date to the organizer) —
// keep both in sync.

export const RETENTION_DAYS = 30;

interface ExpiryEvent {
  date?: string;
  endDate?: string;
  recurrence?: string;
  recurrenceEndDate?: string;
  customDates?: string[];
  exceptionDates?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Last date (YYYY-MM-DD) on which the event or series takes place, or null. */
export function getEventLastDate(event: ExpiryEvent | null | undefined): string | null {
  if (!event?.date) return null;
  const recurrence = event.recurrence ?? 'none';

  if (recurrence === 'none') {
    return event.endDate && event.endDate > event.date ? event.endDate : event.date;
  }

  if (recurrence === 'custom') {
    const exceptions = event.exceptionDates ?? [];
    const dates = [...(event.customDates ?? []), event.date].filter(
      (d) => d && !exceptions.includes(d)
    );
    return dates.length > 0 ? dates.sort()[dates.length - 1] : event.date;
  }

  if (event.recurrenceEndDate) return event.recurrenceEndDate;
  // No explicit end: the app only expands the series for 3 months (monthly: 1 year).
  const implicitEnd = parseIso(event.date);
  if (recurrence === 'monthly' || recurrence === 'monthlyWeekday')
    implicitEnd.setUTCFullYear(implicitEnd.getUTCFullYear() + 1);
  else implicitEnd.setUTCMonth(implicitEnd.getUTCMonth() + 3);
  return toIso(implicitEnd);
}

/** Date (YYYY-MM-DD) on which the event is deleted, or null if it never is. */
export function getEventPurgeDate(event: ExpiryEvent | null | undefined): string | null {
  const last = getEventLastDate(event);
  if (!last) return null;
  return toIso(new Date(parseIso(last).getTime() + RETENTION_DAYS * DAY_MS));
}

/** True once today (YYYY-MM-DD) is past the purge date. */
export function isEventExpired(event: ExpiryEvent | null | undefined, todayIso: string): boolean {
  const purge = getEventPurgeDate(event);
  return purge !== null && todayIso > purge;
}
