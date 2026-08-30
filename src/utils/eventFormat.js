export function parseEventDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return new Date(year, month - 1, day);
}

export function formatWeekdayShort(dateStr) {
  return parseEventDate(dateStr).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
}

export function formatDayNumber(dateStr) {
  return parseEventDate(dateStr).getDate();
}

export function formatMonthShort(dateStr) {
  return parseEventDate(dateStr).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
}

export function formatEventDateLabel(dateStr) {
  return parseEventDate(dateStr).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Formats a multi-day event's range as "Di, 1. Sept - So, 6. Sept" using the
// short German weekday/day/month format. Returns null when the event has no
// real endDate (single-day or not set), so callers can fall back to other
// formatters for single-day events.
export function formatEventDateRangeLabel(startDateStr, endDateStr) {
  if (!endDateStr || !startDateStr || endDateStr === startDateStr) return null;
  const start = parseEventDate(startDateStr);
  const end = parseEventDate(endDateStr);
  const fmt = (d) =>
    d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmt(start)} - ${fmt(end)}`;
}

// Returns true when the event has an endDate strictly after its date, i.e. it
// spans more than one calendar day.
export function isMultiDayEvent(event) {
  if (!event || !event.date || !event.endDate) return false;
  return event.endDate > event.date;
}

export function formatEventDateShort(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

export function getOrganizerName(event) {
  const organizer = event.organizer;
  if (!organizer) return '';
  return [organizer.firstName, organizer.lastName].filter(Boolean).join(' ');
}

export function getPrimaryCategory(event) {
  return event.category || null;
}

// Returns the human-readable location label for an event: the district for
// in-person events, the literal string "Online" for online events, and an
// empty string when neither is set.
export function getEventLocationLabel(event) {
  if (!event) return '';
  if (event.isOnline) return 'Online';
  return event.bezirk || '';
}
