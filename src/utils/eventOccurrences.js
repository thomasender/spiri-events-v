// Returns the set of all occurrences for an event:
// - For non-recurring events, one entry per day in the [date, endDate] span.
// - For recurring events, one entry per recurrence occurrence, with `isMultiDayStart`
//   / `isMultiDayEnd` flags preserved for multi-day recurring events.
//
// The returned occurrences share the original event's fields but each has its own
// `date` set to that occurrence's date. This is used by both the calendar sidebar
// and the card/list view, which previously disagreed on whether recurring events
// should appear on every future matching date.

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expandEventToDays(event) {
  if (!event) return [];
  const days = [];
  const start = new Date(event.date + 'T12:00:00');
  const end = event.endDate ? new Date(event.endDate + 'T12:00:00') : start;

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

export function getEventOccurrences(event) {
  if (!event || event.recurrence === 'none' || !event.recurrence) {
    return expandEventToDays(event);
  }

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
      return expandEventToDays(event);
  }

  const current = new Date(startDate);
  const exceptionDates = event.exceptionDates || [];

  while (current <= effectiveEnd) {
    if (current >= today) {
      const occurrenceDate = formatDate(
        current.getFullYear(),
        current.getMonth(),
        current.getDate()
      );
      if (exceptionDates.includes(occurrenceDate)) {
        if (interval === 0) {
          current.setMonth(current.getMonth() + 1);
        } else {
          current.setDate(current.getDate() + interval * 7);
        }
        continue;
      }
      const baseOccurrence = {
        ...event,
        date: occurrenceDate,
      };
      if (event.endDate) {
        const start = new Date(event.date + 'T12:00:00');
        const eventDays =
          Math.ceil((new Date(event.endDate + 'T12:00:00') - start) / (1000 * 60 * 60 * 24)) + 1;
        for (let d = 0; d < eventDays; d++) {
          const dayDate = new Date(current);
          dayDate.setDate(dayDate.getDate() + d);
          occurrences.push({
            ...baseOccurrence,
            date: formatDate(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()),
            isMultiDayStart: d === 0,
            isMultiDayEnd: d === eventDays - 1,
          });
        }
      } else {
        occurrences.push({ ...baseOccurrence, isMultiDayStart: true, isMultiDayEnd: true });
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
