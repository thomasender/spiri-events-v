import { isOccurrenceCancelled } from './eventCancellation';

// For events with `recurrence: 'custom'` the initial event date is part of the
// series as well, even if it was never added to `customDates` explicitly.
// Returns a sorted, de-duplicated list of all dates of the series with
// exception dates removed.
export function getCustomSeriesDates(event) {
  if (!event) return [];
  const customDates = Array.isArray(event.customDates) ? event.customDates : [];
  const exceptionDates = Array.isArray(event.exceptionDates) ? event.exceptionDates : [];
  const all = new Set(customDates.filter((d) => d && d.length > 0));
  if (event.date) all.add(event.date);
  return [...all].filter((d) => !exceptionDates.includes(d)).sort();
}

// Returns the sorted, de-duplicated list of dates to show on the event detail
// page for any recurring event. For `custom` series this is the full series
// (past + future, including the implicit `event.date`). For `weekly`,
// `biweekly`, `monthly` and `monthlyWeekday` series this is the future-only occurrences that
// `getEventOccurrences` already bounds by the recurrence end date / default
// look-ahead horizon. For non-recurring events it returns an empty array.
export function getRecurrenceDatesForDetail(event) {
  if (!event) return [];
  if (!event.recurrence || event.recurrence === 'none') return [];

  if (event.recurrence === 'custom') {
    return getCustomSeriesDates(event);
  }

  const occurrences = getEventOccurrences(event, { mode: 'list' });
  const dates = [...new Set(occurrences.map((occ) => occ.date).filter(Boolean))];
  return dates.sort();
}

// Returns the next upcoming occurrence for an event, or event.date as fallback.
export function getNextUpcomingOccurrence(event) {
  if (!event) return null;

  if (!event.recurrence || event.recurrence === 'none') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(event.date + 'T12:00:00');
    return eventDate >= today ? event.date : null;
  }

  if (event.recurrence === 'custom') {
    const dates = getCustomSeriesDates(event);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().split('T')[0];
    const next = dates.find((d) => d >= todayIso);
    return next || null;
  }

  const occurrences = getEventOccurrences(event, { mode: 'list' });
  if (occurrences.length === 0) {
    return event.date;
  }
  return occurrences[0].date;
}

// Returns the total number of occurrences for a recurring event (future only).
export function getOccurrenceCount(event) {
  if (!event || !event.recurrence || event.recurrence === 'none') {
    return event?.date ? 1 : 0;
  }
  if (event.recurrence === 'custom') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().split('T')[0];
    return getCustomSeriesDates(event).filter((d) => d >= todayIso).length;
  }
  return getEventOccurrences(event, { mode: 'list' }).length;
}

const WEEKDAY_NAMES = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

// Ordinal -1 stands for "the last <weekday> of the month".
const ORDINAL_WORDS = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', [-1]: 'letzten' };

// Day of month (1-31) of the n-th `weekday` (0 = Sunday) in the given month
// (`month` is 0-based), or null if there is none. `ordinal` is 1-5, or -1 for
// the last one. Pure calendar arithmetic on year/month/day (no time zones).
export function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (ordinal === -1) {
    const lastWeekday = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
    return daysInMonth - ((lastWeekday - weekday + 7) % 7);
  }
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7;
  return day <= daysInMonth ? day : null;
}

function parseYmd(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return { year, month: month - 1, day };
}

// Which weekday of its month a date is: 1-4 for the first to fourth, -1 for a
// 5th one (shown as "last"; a 5th weekday is always the last of its month).
export function getNthWeekdayOrdinal(iso) {
  if (!iso) return null;
  const { day } = parseYmd(iso);
  if (!Number.isFinite(day)) return null;
  const nth = Math.floor((day - 1) / 7) + 1;
  return nth >= 5 ? -1 : nth;
}

// "ersten Montag" / "letzten Freitag" for the weekday the date falls on.
export function getMonthlyWeekdayPhrase(iso) {
  const ordinal = getNthWeekdayOrdinal(iso);
  if (ordinal === null) return '';
  const { year, month, day } = parseYmd(iso);
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return `${ORDINAL_WORDS[ordinal]} ${WEEKDAY_NAMES[weekday]}`;
}

// Date (YYYY-MM-DD) of the occurrence of a monthly series in the month that is
// `monthsAhead` months after the start date's month. `monthly` keeps the day of
// month and is clamped to the last day of shorter months (31st -> 30th/28th/29th)
// instead of overflowing into the next month; `monthlyWeekday` keeps the n-th
// weekday ("last" if the start is a 5th weekday).
function monthlyOccurrenceYmd(startIso, recurrence, monthsAhead) {
  const { year, month, day } = parseYmd(startIso);
  const target = new Date(Date.UTC(year, month + monthsAhead, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (recurrence === 'monthlyWeekday') {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    return formatDate(y, m, nthWeekdayOfMonth(y, m, weekday, getNthWeekdayOrdinal(startIso)));
  }
  return formatDate(y, m, Math.min(day, daysInMonth));
}

function isMonthlyRecurrence(recurrence) {
  return recurrence === 'monthly' || recurrence === 'monthlyWeekday';
}

// Returns a short human-readable recurrence label, e.g. "Jeden Donnerstag" or
// "Jeden zweiten Donnerstag". Returns null for non-recurring events.
export function getRecurrenceLabel(event) {
  if (!event || !event.recurrence || event.recurrence === 'none') return null;

  if (event.recurrence === 'custom') {
    return 'An einzelnen Terminen';
  }

  const date = new Date(event.date + 'T12:00:00');
  const weekday = WEEKDAY_NAMES[date.getDay()];

  switch (event.recurrence) {
    case 'weekly':
      return `Jeden ${weekday}`;
    case 'biweekly':
      return `Jeden zweiten ${weekday}`;
    case 'monthly':
      return 'Jeden Monat';
    case 'monthlyWeekday':
      return `Jeden ${getMonthlyWeekdayPhrase(event.date)} im Monat`;
    default:
      return null;
  }
}

// `mode: 'list'` (default): produces ONE entry per month the event spans, suitable
// for the list/card view where multi-day retreats should not be duplicated for
// every day. Each entry's `date` is set to the first day of the event in that
// month so month-based filtering/sorting keeps working.
//
// `mode: 'calendar'`: produces one entry per day (the original behavior). The
// sidebar calendar uses this to render a dot on every day an event spans.

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function collapseToMonthEntries(event, start, end) {
  const entries = [];
  const isCancelled = isOccurrenceCancelled(
    event,
    formatDate(start.getFullYear(), start.getMonth(), start.getDate())
  );
  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);
  let cursor = new Date(monthCursor);
  while (cursor <= lastMonthStart) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const entryStart = cursor < start ? start : cursor;
    // `monthEnd` is at 00:00 local while `start`/`end` are at 12:00 local
    // (they're parsed with `T12:00:00`), so a plain timestamp comparison would
    // wrongly cap an in-month end at `monthEnd`. Compare by year+month instead.
    const endIsInThisMonth =
      end.getFullYear() === cursor.getFullYear() && end.getMonth() === cursor.getMonth();
    const entryEnd = endIsInThisMonth ? end : monthEnd;
    entries.push({
      ...event,
      date: formatDate(entryStart.getFullYear(), entryStart.getMonth(), entryStart.getDate()),
      isMultiDayStart: entryStart.getTime() === start.getTime(),
      isMultiDayEnd: entryEnd.getTime() === end.getTime(),
      isCancelled,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return entries;
}

function expandNonRecurring(event, mode) {
  if (!event) return [];
  const start = new Date(event.date + 'T12:00:00');
  const end = event.endDate ? new Date(event.endDate + 'T12:00:00') : start;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Hide events that have already ended. For single-day events `end === start`,
  // so this is equivalent to `event.date < today`. Multi-day events stay
  // visible until their last day ends.
  if (end < today) return [];
  const isCancelled = isOccurrenceCancelled(event, event.date);

  if (mode === 'calendar') {
    const days = [];
    const current = new Date(start);
    while (current <= end) {
      const dateStr = formatDate(current.getFullYear(), current.getMonth(), current.getDate());
      days.push({
        ...event,
        date: dateStr,
        isMultiDayStart: current.getTime() === start.getTime(),
        isMultiDayEnd: current.getTime() === end.getTime(),
        isCancelled,
      });
      current.setDate(current.getDate() + 1);
    }
    return days;
  }

  // list mode
  if (start.getTime() === end.getTime() || !event.endDate) {
    return [
      {
        ...event,
        date: event.date,
        isMultiDayStart: true,
        isMultiDayEnd: true,
        isCancelled,
      },
    ];
  }

  return collapseToMonthEntries(event, start, end);
}

function expandCustom(event, mode) {
  const sortedDates = getCustomSeriesDates(event);
  if (sortedDates.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDays = event.endDate
    ? Math.round(
        (new Date(event.endDate + 'T12:00:00') - new Date(event.date + 'T12:00:00')) /
          (1000 * 60 * 60 * 24)
      ) + 1
    : 1;

  const occurrences = [];
  for (const occurrenceStart of sortedDates) {
    const occDate = new Date(occurrenceStart + 'T12:00:00');
    // For multi-day occurrences, the occurrence is still visible until its
    // last day ends (e.g. an Aug 30 - Sep 2 event is still shown on Sep 2).
    const lastDay =
      eventDays > 1 ? new Date(occDate.getTime() + (eventDays - 1) * 86400000) : occDate;
    if (lastDay < today) continue;
    const isCancelled = isOccurrenceCancelled(event, occurrenceStart);

    if (mode === 'calendar' && eventDays > 1) {
      for (let d = 0; d < eventDays; d++) {
        const dayDate = new Date(occDate);
        dayDate.setDate(dayDate.getDate() + d);
        occurrences.push({
          ...event,
          date: formatDate(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()),
          isMultiDayStart: d === 0,
          isMultiDayEnd: d === eventDays - 1,
          isCancelled,
        });
      }
    } else {
      occurrences.push({
        ...event,
        date: occurrenceStart,
        isMultiDayStart: true,
        isMultiDayEnd: true,
        isCancelled,
      });
    }
  }

  return occurrences;
}

function expandRecurring(event, mode) {
  const occurrences = [];
  const startDate = new Date(event.date + 'T12:00:00');
  const endDate = event.recurrenceEndDate
    ? new Date(event.recurrenceEndDate + 'T12:00:00')
    : new Date(startDate);
  if (!event.recurrenceEndDate) {
    if (isMonthlyRecurrence(event.recurrence)) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 3);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  const effectiveEnd = endDate < maxDate ? endDate : maxDate;

  let interval;
  switch (event.recurrence) {
    case 'weekly':
      interval = 1;
      break;
    case 'biweekly':
      interval = 2;
      break;
    case 'monthly':
    case 'monthlyWeekday':
      interval = 0;
      break;
    default:
      return expandNonRecurring(event, mode);
  }

  const current = new Date(startDate);
  // Monthly series are recomputed from the start date for every month (so a
  // 31st or a "last Friday" never drifts); weekly ones just add days.
  let monthsAhead = 0;
  const advance = () => {
    if (interval === 0) {
      monthsAhead += 1;
      const { year, month, day } = parseYmd(
        monthlyOccurrenceYmd(event.date, event.recurrence, monthsAhead)
      );
      current.setTime(new Date(year, month, day, 12).getTime());
    } else {
      current.setDate(current.getDate() + interval * 7);
    }
  };
  const exceptionDates = event.exceptionDates || [];
  const eventDays = event.endDate
    ? Math.round((new Date(event.endDate + 'T12:00:00') - startDate) / (1000 * 60 * 60 * 24)) + 1
    : 1;

  while (current <= effectiveEnd) {
    const occurrenceLastDay =
      eventDays > 1 ? new Date(current.getTime() + (eventDays - 1) * 86400000) : current;
    if (occurrenceLastDay >= today) {
      const occurrenceStart = formatDate(
        current.getFullYear(),
        current.getMonth(),
        current.getDate()
      );
      if (exceptionDates.includes(occurrenceStart)) {
        advance();
        continue;
      }
      const isCancelled = isOccurrenceCancelled(event, occurrenceStart);

      if (mode === 'calendar') {
        if (event.endDate) {
          for (let d = 0; d < eventDays; d++) {
            const dayDate = new Date(current);
            dayDate.setDate(dayDate.getDate() + d);
            occurrences.push({
              ...event,
              date: formatDate(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()),
              isMultiDayStart: d === 0,
              isMultiDayEnd: d === eventDays - 1,
              isCancelled,
            });
          }
        } else {
          occurrences.push({
            ...event,
            date: occurrenceStart,
            isMultiDayStart: true,
            isMultiDayEnd: true,
            isCancelled,
          });
        }
      } else {
        // list mode: emit one entry per month the occurrence spans
        if (event.endDate) {
          const occStart = new Date(current);
          const occEnd = new Date(current);
          occEnd.setDate(occEnd.getDate() + eventDays - 1);
          for (const entry of collapseToMonthEntries(event, occStart, occEnd)) {
            occurrences.push(entry);
          }
        } else {
          occurrences.push({
            ...event,
            date: occurrenceStart,
            isMultiDayStart: true,
            isMultiDayEnd: true,
            isCancelled,
          });
        }
      }
    }

    advance();
  }

  return occurrences;
}

export function getEventOccurrences(event, { mode = 'list' } = {}) {
  if (!event) return [];

  if (!event.recurrence || event.recurrence === 'none') {
    return expandNonRecurring(event, mode);
  }

  if (event.recurrence === 'custom') {
    return expandCustom(event, mode);
  }

  return expandRecurring(event, mode);
}
