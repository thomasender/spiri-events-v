import { getNextUpcomingOccurrence } from './eventOccurrences';
import { compareEventsByDateTime } from './eventSort';

// Events (series) the user favorited, each shown at its next upcoming date.
// Ids that no longer resolve to an approved, upcoming event (deleted, trashed,
// unpublished, over) are skipped silently.
export function buildFavoriteEvents(events, favoriteIds) {
  return events
    .filter((event) => favoriteIds.has(event.id))
    .map((event) => {
      const date = getNextUpcomingOccurrence(event);
      return date ? { ...event, date } : null;
    })
    .filter(Boolean)
    .sort(compareEventsByDateTime);
}
