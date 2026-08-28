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
  return update;
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
  return update;
}
