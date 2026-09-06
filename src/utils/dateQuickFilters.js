const MS_PER_DAY = 86400000;

export const DATE_FILTER_IDS = {
  HEUTE: 'heute',
  WOCHENENDE: 'wochenende',
  AKTUELLE_WOCHE: 'aktuelleWoche',
};

export const DATE_FILTER_OPTIONS = [
  { id: DATE_FILTER_IDS.HEUTE, label: 'Heute' },
  { id: DATE_FILTER_IDS.WOCHENENDE, label: 'Wochenende' },
  { id: DATE_FILTER_IDS.AKTUELLE_WOCHE, label: 'Aktuelle Woche' },
];

export function isoDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns the upcoming weekend (Fri-Sun) relative to the reference date.
// If today is Mon-Thu → next Fri-Sun.
// If today is Fri/Sat/Sun → the Fri-Sun that contains today.
export function getWeekendRange(reference = new Date()) {
  const today = startOfDay(reference);
  const day = today.getDay();
  let daysFromFriday;
  if (day === 5) daysFromFriday = 0;
  else if (day === 6) daysFromFriday = -1;
  else if (day === 0) daysFromFriday = -2;
  else daysFromFriday = 5 - day;

  const friday = new Date(today);
  friday.setDate(today.getDate() + daysFromFriday);
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  return { start: friday, end: sunday };
}

// Returns the calendar week (Mon-Sun) containing the reference date.
export function getCurrentWeekRange(reference = new Date()) {
  const today = startOfDay(reference);
  const day = today.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

// Returns true if the given ISO date (YYYY-MM-DD) is a Friday, Saturday or Sunday.
export function isWeekendIso(isoDateString) {
  const day = new Date(isoDateString + 'T12:00:00').getDay();
  return day === 5 || day === 6 || day === 0;
}

// Returns the month key (YYYY-MM) for the given reference date.
export function monthKeyForReference(reference) {
  return isoDate(reference).slice(0, 7);
}

// Returns true if the occurrence's first day falls inside the [startIso, endIso] range.
// Multi-day occurrences are matched by their start day; callers that need end-aware
// matching for multi-day events should extend this contract.
export function occurrenceMatchesRange(occurrence, startIso, endIso) {
  const occurrenceIso = occurrence.date;
  return occurrenceIso >= startIso && occurrenceIso <= endIso;
}

// Returns the filtered occurrences for the given dateFilter id.
// Occurrences whose first day does not fall within the filter's window are excluded.
export function applyDateFilter(occurrences, dateFilterId, reference = new Date()) {
  if (!dateFilterId) return occurrences;
  const todayIso = isoDate(reference);

  if (dateFilterId === DATE_FILTER_IDS.HEUTE) {
    return occurrences.filter((occurrence) => occurrence.date === todayIso);
  }

  if (dateFilterId === DATE_FILTER_IDS.WOCHENENDE) {
    const range = getWeekendRange(reference);
    const startIso = isoDate(range.start);
    const endIso = isoDate(range.end);
    return occurrences.filter((occurrence) => occurrenceMatchesRange(occurrence, startIso, endIso));
  }

  if (dateFilterId === DATE_FILTER_IDS.AKTUELLE_WOCHE) {
    const range = getCurrentWeekRange(reference);
    const startIso = isoDate(range.start);
    const endIso = isoDate(range.end);
    return occurrences.filter((occurrence) => occurrenceMatchesRange(occurrence, startIso, endIso));
  }

  return occurrences;
}

// Returns the month key that should be active when the given dateFilter id is
// activated. Used to keep the calendar sidebar in sync with the filter.
export function getDateFilterMonthKey(dateFilterId, reference = new Date()) {
  if (!dateFilterId) return null;
  if (dateFilterId === DATE_FILTER_IDS.WOCHENENDE) {
    const range = getWeekendRange(reference);
    return monthKeyForReference(range.start);
  }
  return monthKeyForReference(reference);
}

export function isValidDateFilterId(value) {
  return (
    value === DATE_FILTER_IDS.HEUTE ||
    value === DATE_FILTER_IDS.WOCHENENDE ||
    value === DATE_FILTER_IDS.AKTUELLE_WOCHE
  );
}

export function __testHelpers() {
  return { MS_PER_DAY };
}
