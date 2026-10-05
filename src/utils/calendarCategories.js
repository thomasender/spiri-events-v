import { getEventOccurrences } from './eventOccurrences';

// Which categories the calendar offers as filter chips / legend entries.
//
// The registry is shared by the calendar, the event form and the directory,
// so it contains categories that only make sense for some of them (e.g.
// "Therapie" is mostly a directory category). The calendar therefore only
// lists a category while at least one approved event in it is still ahead
// (or running); `getEventOccurrences` already drops events that have ended.
// Event creation keeps offering the full registry, so the first event in a
// category makes its chip show up automatically.
export function getCategoriesWithUpcomingEvents(events) {
  const names = new Set();
  for (const event of events || []) {
    if (!event?.category || names.has(event.category)) continue;
    if (getEventOccurrences(event).length > 0) names.add(event.category);
  }
  return names;
}

// Registry order is kept. A category the user has currently selected stays
// listed even when it has no events (any more) so it can still be switched
// off — otherwise a filter restored from localStorage could never be cleared.
export function getCalendarCategories(registryNames, events, selectedCategories = []) {
  const withEvents = getCategoriesWithUpcomingEvents(events);
  return registryNames.filter((name) => withEvents.has(name) || selectedCategories.includes(name));
}
