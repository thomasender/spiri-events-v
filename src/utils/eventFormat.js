import { formatCityWithBezirk } from './gemeinden';
import { bezirkLabel, getSubdivisionLabel, resolveRegionId } from './regions';

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
  if (organizer.name && organizer.name.trim()) return organizer.name.trim();
  return [organizer.firstName, organizer.lastName].filter(Boolean).join(' ');
}

export function getPrimaryCategory(event) {
  return event.category || null;
}

// Returns the human-readable location label for an event: "Altach (Bez.
// Feldkirch)" for in-person events (just the district for older events without
// a city), the literal string "Online" for online events, and an empty string
// when neither is set.
export function getEventLocationLabel(event) {
  if (!event) return '';
  if (event.isOnline) return 'Online';
  return formatCityWithBezirk(
    event.city,
    event.bezirk,
    getSubdivisionLabel(resolveRegionId(event))
  );
}

// Short location for event cards and list rows: just the Ort ("Altach"),
// without the Bezirk. Older events without a city fall back to the Bezirk.
export function getEventCityLabel(event) {
  if (!event) return '';
  if (event.isOnline) return 'Online';
  return (event.city || '').trim() || bezirkLabel(event.bezirk) || '';
}

// District the DistrictBadge shows for an event: "Online" for online events, else the stored Bezirk
// / Landkreis (empty when none).
export function getEventDistrict(event) {
  if (!event) return '';
  if (event.isOnline) return 'Online';
  return event.bezirk || '';
}

// The Ort that goes next to the district badge; empty for online events and when it would only
// repeat the district.
export function getEventCityName(event) {
  if (!event || event.isOnline) return '';
  const city = (event.city || '').trim();
  return city && city !== bezirkLabel(event.bezirk) ? city : '';
}

// "Bezirk" / "Landkreis" for the coloured badge on the event page and in the event modal, so it is
// clear which kind of district is meant. Empty for online events and the "Umgebung" catch-all.
export function getEventDistrictPrefix(event) {
  if (!event || event.isOnline || !event.bezirk || event.bezirk === 'Grenznahe') return '';
  return getSubdivisionLabel(resolveRegionId(event)) === 'Landkreis' ? 'Landkreis' : 'Bezirk';
}
