/**
 * Request parsing and event selection for the public calendar endpoints
 * (functions/src/calendarFeed.ts). Pure, so every limit is unit-tested.
 *
 *   /calendar/feed.ics?bezirk=Dornbirn&kategorie=Yoga   subscribable feed
 *   /calendar/event/<slug>.ics                          one event (download)
 *
 * The limits exist because the feed is public and cannot use App Check
 * (calendar apps fetch it without a browser): only approved upcoming events,
 * a fixed horizon, a hard cap, no unknown query parameters (they would be
 * cheap cache-busters) and filter values that must come from a known list.
 */

import { expandOccurrencesInWindow, type SeriesFields } from '../instagram/instagramOccurrences';

export const FEED_HORIZON_DAYS = 180;
export const SINGLE_EVENT_HORIZON_DAYS = 365;
export const MAX_FEED_EVENTS = 300;
export const MAX_SINGLE_EVENT_OCCURRENCES = 60;

const BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'] as const;
const ONLINE = 'Online';
const REGION_FILTERS: readonly string[] = [...BEZIRKE, ONLINE];
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarRoute =
  | { kind: 'feed'; bezirk: string[]; kategorie: string[] }
  | { kind: 'event'; slug: string }
  | { kind: 'error'; status: 400 | 404; message: string };

export const MAX_FILTER_VALUES = 20;

/** A query parameter as list: absent -> [], repeated -> all values, any non-string -> null. */
function many(value: unknown): string[] | null {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_FILTER_VALUES || !list.every((v) => typeof v === 'string')) return null;
  return [...new Set(list as string[])];
}

export function parseCalendarRequest(
  path: string,
  query: Record<string, unknown>,
  knownCategories: ReadonlySet<string>
): CalendarRoute {
  const clean = path.replace(/\/+$/, '');

  if (clean === '/calendar/feed.ics') {
    const unknown = Object.keys(query).filter((k) => k !== 'bezirk' && k !== 'kategorie');
    if (unknown.length > 0) return { kind: 'error', status: 400, message: 'Unknown parameter' };

    const bezirk = many(query.bezirk);
    if (bezirk === null || !bezirk.every((b) => REGION_FILTERS.includes(b))) {
      return { kind: 'error', status: 400, message: 'Unknown bezirk' };
    }
    const kategorie = many(query.kategorie);
    if (kategorie === null || !kategorie.every((k) => knownCategories.has(k))) {
      return { kind: 'error', status: 400, message: 'Unknown kategorie' };
    }
    return { kind: 'feed', bezirk, kategorie };
  }

  const single = /^\/calendar\/event\/([^/]+)\.ics$/.exec(clean);
  if (single) {
    if (Object.keys(query).length > 0) {
      return { kind: 'error', status: 400, message: 'Unknown parameter' };
    }
    let slug = single[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      return { kind: 'error', status: 404, message: 'Not found' };
    }
    if (!SLUG.test(slug)) return { kind: 'error', status: 404, message: 'Not found' };
    return { kind: 'event', slug };
  }

  return { kind: 'error', status: 404, message: 'Not found' };
}

export interface PublicEvent extends SeriesFields {
  id: string;
  status?: unknown;
  bezirk?: unknown;
  isOnline?: unknown;
  category?: unknown;
  time?: unknown;
  slug?: unknown;
  title?: unknown;
  place?: unknown;
  description?: unknown;
  organizer?: unknown;
  kontakt?: unknown;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isOnline(event: PublicEvent): boolean {
  return event.isOnline === true || event.isOnline === 'true';
}

/** Occurrences of an approved event in [today, today + horizon]; multi-day events still running count. */
export function upcomingOccurrences<T extends PublicEvent>(
  event: T,
  today: string,
  horizonDays: number
): T[] {
  if (event.status !== 'approved') return [];
  const window = { start: today, end: addDays(today, horizonDays) };
  const found = expandOccurrencesInWindow(event, window);

  // A one-off multi-day event that began before today but is still running.
  const date = typeof event.date === 'string' ? event.date : '';
  const endDate = typeof event.endDate === 'string' ? event.endDate : '';
  const recurrence = typeof event.recurrence === 'string' ? event.recurrence : 'none';
  if (
    (recurrence === 'none' || recurrence === '') &&
    ISO_DAY.test(date) &&
    date < today &&
    ISO_DAY.test(endDate) &&
    endDate >= today
  ) {
    found.push({ ...event });
  }
  return found;
}

function sortKey(event: PublicEvent & { date: string }): string {
  const date = typeof event.date === 'string' ? event.date : '';
  const time = typeof event.time === 'string' ? event.time.padStart(5, '0') : '99:99';
  return `${date} ${time}`;
}

/** Empty list = no restriction; several values match if any one of them matches. */
export interface FeedFilters {
  bezirk: string[];
  kategorie: string[];
}

/** The feed: approved, upcoming, filtered, sorted, capped at MAX_FEED_EVENTS. */
export function selectFeedEvents<T extends PublicEvent>(
  events: T[],
  today: string,
  filters: FeedFilters
): T[] {
  const matches = (event: T) => {
    if (filters.bezirk.length > 0) {
      const inRegion = filters.bezirk.some((b) =>
        b === ONLINE ? isOnline(event) : !isOnline(event) && event.bezirk === b
      );
      if (!inRegion) return false;
    }
    if (filters.kategorie.length > 0 && !filters.kategorie.includes(event.category as string)) {
      return false;
    }
    return true;
  };

  return events
    .filter(matches)
    .flatMap((event) => upcomingOccurrences(event, today, FEED_HORIZON_DAYS))
    .sort((a, b) => (sortKey(a as never) < sortKey(b as never) ? -1 : 1))
    .slice(0, MAX_FEED_EVENTS);
}

/** One event (all upcoming occurrences of a series, capped). Empty when not public. */
export function selectSingleEvent<T extends PublicEvent>(event: T, today: string): T[] {
  return upcomingOccurrences(event, today, SINGLE_EVENT_HORIZON_DAYS)
    .sort((a, b) => (sortKey(a as never) < sortKey(b as never) ? -1 : 1))
    .slice(0, MAX_SINGLE_EVENT_OCCURRENCES);
}
