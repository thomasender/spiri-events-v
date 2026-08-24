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
