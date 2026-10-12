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
  | { kind: 'feed'; bezirk: string | null; kategorie: string | null }
  | { kind: 'event'; slug: string }
  | { kind: 'error'; status: 400 | 404; message: string };

function one(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return null;
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

    const bezirk = query.bezirk === undefined ? null : one(query.bezirk);
    if (query.bezirk !== undefined && (bezirk === null || !REGION_FILTERS.includes(bezirk))) {
      return { kind: 'error', status: 400, message: 'Unknown bezirk' };
    }
    const kategorie = query.kategorie === undefined ? null : one(query.kategorie);
    if (query.kategorie !== undefined && (kategorie === null || !knownCategories.has(kategorie))) {
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

export interface FeedFilters {
  bezirk: string | null;
  kategorie: string | null;
}

/** The feed: approved, upcoming, filtered, sorted, capped at MAX_FEED_EVENTS. */
export function selectFeedEvents<T extends PublicEvent>(
  events: T[],
  today: string,
  filters: FeedFilters
): T[] {
  const matches = (event: T) => {
    if (filters.bezirk === ONLINE) {
      if (!isOnline(event)) return false;
    } else if (filters.bezirk) {
      if (isOnline(event) || event.bezirk !== filters.bezirk) return false;
    }
    if (filters.kategorie && event.category !== filters.kategorie) return false;
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
