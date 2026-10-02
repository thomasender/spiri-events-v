// Sort order for events shown in the user's "Meine Events", the admin
// "Review" tab and the public calendar list.
//
// Primary key: ISO date string (`event.date`, "YYYY-MM-DD"), ascending so
// the earliest upcoming event comes first. Secondary key: `event.time`
// ("HH:MM", from <input type="time>), also ascending, so an 18:00 event
// sits below a 10:00 event on the same day.
//
// Events without a time are placed *after* timed events on the same day —
// matches the convention that all-day / "keine Uhrzeit angegeben" entries
// are the trailing block of a day's list.

function compareNullableStrings(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null || a === '') return 1;
  if (b === undefined || b === null || b === '') return -1;
  return a > b ? 1 : a < b ? -1 : 0;
}

export function compareEventsByDateTime(a, b) {
  const dateCmp = compareNullableStrings(a?.date, b?.date);
  if (dateCmp !== 0) return dateCmp;
  return compareNullableStrings(a?.time, b?.time);
}