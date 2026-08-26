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
    const dates = (event.customDates || [])
      .filter((d) => !event.exceptionDates || !event.exceptionDates.includes(d))
      .sort();
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
    return (event.customDates || []).filter((d) => {
      if (d < todayIso) return false;
      if (event.exceptionDates && event.exceptionDates.includes(d)) return false;
      return true;
    }).length;
  }
  return getEventOccurrences(event, { mode: 'list' }).length;
}

// Returns a short human-readable recurrence label, e.g. "Jeden Donnerstag" or
// "Jeden zweiten Donnerstag". Returns null for non-recurring events.
export function getRecurrenceLabel(event) {
  if (!event || !event.recurrence || event.recurrence === 'none') return null;

  if (event.recurrence === 'custom') {
    return 'An einzelnen Terminen';
  }

  const weekdayNames = [
    'Sonntag',
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];
  const date = new Date(event.date + 'T12:00:00');
  const weekday = weekdayNames[date.getDay()];

  switch (event.recurrence) {
    case 'weekly':
      return `Jeden ${weekday}`;
    case 'biweekly':
      return `Jeden zweiten ${weekday}`;
    case 'monthly':
      return 'Jeden Monat';
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
  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);
  let cursor = new Date(monthCursor);
  while (cursor <= lastMonthStart) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const entryStart = cursor < start ? start : cursor;
    const entryEnd = monthEnd < end ? monthEnd : end;
    entries.push({
      ...event,
      date: formatDate(entryStart.getFullYear(), entryStart.getMonth(), entryStart.getDate()),
      isMultiDayStart: entryStart.getTime() === start.getTime(),
      isMultiDayEnd: entryEnd.getTime() === end.getTime(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return entries;
}

function expandNonRecurring(event, mode) {
  if (!event) return [];
  const start = new Date(event.date + 'T12:00:00');
  const end = event.endDate ? new Date(event.endDate + 'T12:00:00') : start;

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
      },
    ];
  }

  return collapseToMonthEntries(event, start, end);
}

function expandCustom(event, mode) {
  const customDates = Array.isArray(event.customDates) ? event.customDates : [];
  if (customDates.length === 0) return [];

  const exceptionDates = event.exceptionDates || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedDates = [...customDates].sort();

  const eventDays = event.endDate
    ? Math.ceil(
        (new Date(event.endDate + 'T12:00:00') - new Date(event.date + 'T12:00:00')) /
          (1000 * 60 * 60 * 24)
      ) + 1
    : 1;

  const occurrences = [];
  for (const occurrenceStart of sortedDates) {
    if (exceptionDates.includes(occurrenceStart)) continue;
    const occDate = new Date(occurrenceStart + 'T12:00:00');
    if (occDate < today) continue;

    if (mode === 'calendar' && eventDays > 1) {
      for (let d = 0; d < eventDays; d++) {
        const dayDate = new Date(occDate);
        dayDate.setDate(dayDate.getDate() + d);
        occurrences.push({
          ...event,
          date: formatDate(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()),
          isMultiDayStart: d === 0,
          isMultiDayEnd: d === eventDays - 1,
        });
      }
    } else {
      occurrences.push({
        ...event,
        date: occurrenceStart,
        isMultiDayStart: true,
        isMultiDayEnd: true,
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
    if (event.recurrence === 'monthly') {
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
      interval = 0;
      break;
    default:
      return expandNonRecurring(event, mode);
  }

  const current = new Date(startDate);
  const exceptionDates = event.exceptionDates || [];
  const eventDays = event.endDate
    ? Math.ceil((new Date(event.endDate + 'T12:00:00') - startDate) / (1000 * 60 * 60 * 24)) + 1
    : 1;

  while (current <= effectiveEnd) {
    if (current >= today) {
      const occurrenceStart = formatDate(
        current.getFullYear(),
        current.getMonth(),
        current.getDate()
      );
      if (exceptionDates.includes(occurrenceStart)) {
        if (interval === 0) {
          current.setMonth(current.getMonth() + 1);
        } else {
          current.setDate(current.getDate() + interval * 7);
        }
        continue;
      }

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
            });
          }
        } else {
          occurrences.push({
            ...event,
            date: occurrenceStart,
            isMultiDayStart: true,
            isMultiDayEnd: true,
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
          });
        }
      }
    }

    if (interval === 0) {
      current.setMonth(current.getMonth() + 1);
    } else {
      current.setDate(current.getDate() + interval * 7);
    }
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
