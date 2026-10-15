// An organizer can call off a whole event (`cancelled: true`) or single dates
// of a series (`cancelledDates: ['YYYY-MM-DD', ...]`). Unlike `exceptionDates`
// (date removed from the series), a cancelled date stays visible and is shown
// with an "Abgesagt" label.

export function isEventCancelled(event) {
  return event?.cancelled === true;
}

export function getCancelledDates(event) {
  return Array.isArray(event?.cancelledDates)
    ? event.cancelledDates.filter((d) => typeof d === 'string' && d.length > 0)
    : [];
}

// `date` is the start date of the occurrence.
export function isOccurrenceCancelled(event, date) {
  if (!event) return false;
  if (isEventCancelled(event)) return true;
  return Boolean(date) && getCancelledDates(event).includes(date);
}

// For entries rendered in lists and the calendar: expanded occurrences carry
// `isCancelled` (computed from the occurrence's start date); plain event docs
// (e.g. favorites, similar events) fall back to their own `date`.
export function isEntryCancelled(entry) {
  if (!entry) return false;
  if (typeof entry.isCancelled === 'boolean') return entry.isCancelled;
  return isOccurrenceCancelled(entry, entry.date);
}
