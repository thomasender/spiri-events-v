import { getCustomSeriesDates } from './eventOccurrences';

// Builds the Firestore update payload to remove a single occurrence from an
// event with `recurrence: 'custom'`. The initial `event.date` belongs to the
// series too but cannot be removed from `customDates`, so it is added to
// `exceptionDates` instead.
export function buildCustomDeleteOccurrenceUpdate(event, dateToDelete) {
  const customDates = Array.isArray(event?.customDates) ? event.customDates : [];
  const exceptionDates = Array.isArray(event?.exceptionDates) ? event.exceptionDates : [];
  const update = {
    customDates: customDates.filter((d) => d !== dateToDelete),
  };
  if (event?.date === dateToDelete && !exceptionDates.includes(dateToDelete)) {
    update.exceptionDates = [...exceptionDates, dateToDelete];
  }
  return withCustomTimes(update, event, (d) => d === dateToDelete);
}

// Builds the Firestore update payload to remove an occurrence and all later
// occurrences from an event with `recurrence: 'custom'`.
export function buildCustomDeleteFromDateUpdate(event, fromDate) {
  const customDates = Array.isArray(event?.customDates) ? event.customDates : [];
  const exceptionDates = Array.isArray(event?.exceptionDates) ? event.exceptionDates : [];
  const update = {
    customDates: customDates.filter((d) => d < fromDate),
  };
  const removedImplicit = getCustomSeriesDates(event).filter(
    (d) => d >= fromDate && !customDates.includes(d)
  );
  const newExceptions = removedImplicit.filter((d) => !exceptionDates.includes(d));
  if (newExceptions.length > 0) {
    update.exceptionDates = [...exceptionDates, ...newExceptions];
  }
  return withCustomTimes(update, event, (d) => d >= fromDate);
}

// Own times of single dates of a `custom` series (Trello 6afd86b4): the map
// `customTimes` { 'YYYY-MM-DD': { time, endTime } } keeps only the dates whose
// time differs from the event's time; every other date has the time from above.
// An entry always overrides both values (an empty endTime means "no end").

const isTimeEntry = (entry) => entry != null && typeof entry === 'object';

// Map of own times without the given dates (a deleted date takes its time with it).
function customTimesWithout(event, isRemoved) {
  const customTimes = isTimeEntry(event?.customTimes) ? event.customTimes : {};
  return Object.fromEntries(Object.entries(customTimes).filter(([date]) => !isRemoved(date)));
}

// Deleting one date or all dates from a date on also drops their own times;
// `customTimes` is only written when the event has some.
function withCustomTimes(update, event, isRemoved) {
  if (!isTimeEntry(event?.customTimes) || Object.keys(event.customTimes).length === 0) {
    return update;
  }
  return { ...update, customTimes: customTimesWithout(event, isRemoved) };
}

// --- Form state ---------------------------------------------------------
// In the form an entry may hold only `time` or only `endTime`: the other value
// still follows the field above, so changing the time above moves every date
// that was never touched.

// What a date row shows: its own value, else the one from above.
export function formCustomTime(customTimes, date, defaults) {
  const entry = isTimeEntry(customTimes?.[date]) ? customTimes[date] : {};
  return {
    time: entry.time ?? defaults?.time ?? '',
    endTime: entry.endTime ?? defaults?.endTime ?? '',
  };
}

// Sets `time` or `endTime` of one date row.
export function setFormCustomTime(customTimes, date, field, value) {
  const current = isTimeEntry(customTimes?.[date]) ? customTimes[date] : {};
  return { ...(customTimes || {}), [date]: { ...current, [field]: value } };
}

// A date row got another date: its own time goes along, unless another row
// still has the old date or the new date already has its own time.
export function moveFormCustomTime(customTimes, from, to, dates = []) {
  if (!customTimes || !(from in customTimes) || from === to) return customTimes || {};
  const next = { ...customTimes };
  const entry = next[from];
  if (!dates.includes(from)) delete next[from];
  if (to && !(to in next)) next[to] = entry;
  return next;
}

// Rows whose end lies before their start (only for single-day events).
export function invalidCustomTimeDates(customTimes, dates, defaults) {
  return dates.filter((date) => {
    const { time, endTime } = formCustomTime(customTimes, date, defaults);
    return Boolean(time && endTime && endTime <= time);
  });
}

// What is saved: complete entries for the dates of the series whose time
// differs from the one above. Entries of dates no longer in the series fall away.
export function buildCustomTimesPayload(customTimes, dates, defaults) {
  const payload = {};
  const time = defaults?.time || '';
  const endTime = defaults?.endTime || '';
  for (const date of [...new Set(dates)].sort()) {
    if (!date || !isTimeEntry(customTimes?.[date])) continue;
    const own = formCustomTime(customTimes, date, { time, endTime });
    if (own.time === time && own.endTime === endTime) continue;
    payload[date] = { time: own.time, endTime: own.endTime };
  }
  return payload;
}
