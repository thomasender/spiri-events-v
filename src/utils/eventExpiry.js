// Past events are deleted RETENTION_DAYS after their last date. Series are
// deleted that long after their last occurrence. Mirror of
// functions/src/eventExpiry.ts (the nightly cleanup job) — keep both in sync.

export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const parseIso = (iso) => new Date(`${iso}T12:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

/** Last date (YYYY-MM-DD) on which the event or series takes place, or null. */
export function getEventLastDate(event) {
  if (!event?.date) return null;
  const recurrence = event.recurrence || 'none';

  if (recurrence === 'none') {
    return event.endDate && event.endDate > event.date ? event.endDate : event.date;
  }

  if (recurrence === 'custom') {
    const exceptions = event.exceptionDates || [];
    const dates = [...(event.customDates || []), event.date].filter(
      (d) => d && !exceptions.includes(d)
    );
    return dates.length > 0 ? dates.sort()[dates.length - 1] : event.date;
  }

  if (event.recurrenceEndDate) return event.recurrenceEndDate;
  // No explicit end: the app only expands the series for 3 months (monthly: 1 year).
  const implicitEnd = parseIso(event.date);
  if (recurrence === 'monthly') implicitEnd.setUTCFullYear(implicitEnd.getUTCFullYear() + 1);
  else implicitEnd.setUTCMonth(implicitEnd.getUTCMonth() + 3);
  return toIso(implicitEnd);
}

/** Date (YYYY-MM-DD) on which the event is deleted, or null. */
export function getEventPurgeDate(event) {
  const last = getEventLastDate(event);
  if (!last) return null;
  return toIso(new Date(parseIso(last).getTime() + RETENTION_DAYS * DAY_MS));
}

/**
 * Hint for the organizer's event list, e.g. "Wird am 12. Nov. 2026 automatisch gelöscht",
 * only once the event/series is over; null while it is still running.
 */
export function getExpiryHint(event, todayIso = toIso(new Date())) {
  const last = getEventLastDate(event);
  const purge = getEventPurgeDate(event);
  if (!last || !purge || last >= todayIso) return null;
  const label = parseIso(purge).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Vergangen – wird am ${label} automatisch gelöscht`;
}
