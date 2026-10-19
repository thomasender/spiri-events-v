const pad = (n) => String(n).padStart(2, '0');

// True when an occurrence has already started, to the minute. Multi-day
// occurrences stay visible until their last day is over; occurrences without a
// start time stay visible for the whole day.
export function isOccurrencePast(occurrence, now = new Date()) {
  if (!occurrence?.date) return false;
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const lastDay =
    occurrence.endDate && occurrence.endDate > occurrence.date
      ? occurrence.endDate
      : occurrence.date;
  if (lastDay < todayIso) return true;
  if (lastDay > todayIso || occurrence.date > todayIso) return false;
  if (!occurrence.time) return false;
  return occurrence.time < `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
