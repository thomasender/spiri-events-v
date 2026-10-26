import { loadPlaceIndex } from './placeData';
import { eventPosition } from '../utils/placeSearch';

// Fields an event write carries so the radius filter can place it: `lat` / `lng` derived from
// the event's Ort and Bezirk (Gemeinde accuracy) with the bundled place list, null when the
// event has none (online) or nothing matches. Never blocks a save: when the list cannot be
// loaded the fields are left out and the event stays on the region filter until a backfill.
export const POSITION_SOURCE_FIELDS = ['city', 'bezirk', 'isOnline', 'regionId'];

export async function positionFields(event, regions) {
  try {
    const index = await loadPlaceIndex();
    const pos = eventPosition(event, index, regions);
    return { lat: pos?.lat ?? null, lng: pos?.lng ?? null };
  } catch {
    return {};
  }
}
