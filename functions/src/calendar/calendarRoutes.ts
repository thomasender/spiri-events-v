/**
 * Request parsing and event selection for the calendar endpoints
 * (functions/src/calendarFeed.ts). Pure, so every limit is unit-tested.
 *
 *   /calendar/feed.ics?bezirk=Dornbirn&kategorie=Yoga&token=…   subscribable feed
 *   /calendar/event/<slug>.ics?token=…                          one event (download)
 *
 * Both are for signed-in users only. Calendar apps cannot send a Firebase
 * login, so every URL carries the user's secret feed token
 * (calendarFeedTokens/{uid}, issued by the getCalendarFeedToken callable);
 * the token format is checked here, its existence in calendarFeed.ts.
 *
 * The other limits exist because calendar apps fetch without a browser, so
 * App Check cannot be used: only approved upcoming events, a fixed horizon,
 * a hard cap, no unknown query parameters (they would be cheap
 * cache-busters) and filter values that must come from a known list.
 */

import { expandOccurrencesInWindow, type SeriesFields } from '../instagram/instagramOccurrences';
import {
  DEFAULT_REGION_ID,
  combinedViewBezirke,
  filterEventsForRegion,
  getCombinedView,
  isRegionId,
  STATIC_REGION_BEZIRKE,
} from '../regions';
import { onlineEventVisibleIn } from '../onlineEventEligibility';

export const FEED_HORIZON_DAYS = 180;
export const SINGLE_EVENT_HORIZON_DAYS = 365;
export const MAX_FEED_EVENTS = 300;
export const MAX_SINGLE_EVENT_OCCURRENCES = 60;

const ONLINE = 'Online';
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_FEED_BEZIRKE: Readonly<Record<string, readonly string[]>> = {
  ...STATIC_REGION_BEZIRKE,
  ...combinedViewBezirke(),
};

export type CalendarRoute =
  | { kind: 'feed'; token: string; region: string; bezirk: string[]; kategorie: string[] }
  | { kind: 'event'; token: string; slug: string }
  | { kind: 'error'; status: 400 | 401 | 404; message: string };

/** 32 random bytes as base64url (43 characters), see generateCalendarFeedToken. */
export const CALENDAR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Format check only, so garbage never reaches Firestore. */
export function isValidCalendarToken(value: unknown): value is string {
  return typeof value === 'string' && CALENDAR_TOKEN_PATTERN.test(value);
}

const UNAUTHORIZED = { kind: 'error', status: 401, message: 'Unauthorized' } as const;

export const MAX_FILTER_VALUES = 20;

/** A query parameter as list: absent -> [], repeated -> all values, any non-string -> null. */
function many(value: unknown): string[] | null {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_FILTER_VALUES || !list.every((v) => typeof v === 'string')) return null;
  return [...new Set(list as string[])];
}

/**
 * `regionBezirke`: Bezirke per region id (the handler passes the merged
 * register, plus entries for the combined-view slugs); defaults to the static
 * register. `?region=<slug>` is optional, absent = Vorarlberg. A slug that is
 * neither one of the ten region ids nor a combined view (`oesterreich`,
 * `deutschland`, `schweiz`, `alle-tribes`) is a 400 (like an unknown bezirk); a
 * known but inactive region is valid (the handler answers with an empty feed).
 */
export function parseCalendarRequest(
  path: string,
  query: Record<string, unknown>,
  knownCategories: ReadonlySet<string>,
  regionBezirke: Readonly<Record<string, readonly string[]>> = DEFAULT_FEED_BEZIRKE
): CalendarRoute {
  const clean = path.replace(/\/+$/, '');

  if (clean === '/calendar/feed.ics') {
    const token = query.token;
    if (!isValidCalendarToken(token)) return UNAUTHORIZED;
    const unknown = Object.keys(query).filter(
      (k) => k !== 'bezirk' && k !== 'kategorie' && k !== 'token' && k !== 'region'
    );
    if (unknown.length > 0) return { kind: 'error', status: 400, message: 'Unknown parameter' };

    const region = query.region === undefined ? DEFAULT_REGION_ID : query.region;
    if (typeof region !== 'string' || (!isRegionId(region) && !getCombinedView(region))) {
      return { kind: 'error', status: 400, message: 'Unknown region' };
    }
    const allowedOrte: readonly string[] = [...(regionBezirke[region] ?? []), ONLINE];

    const bezirk = many(query.bezirk);
    if (bezirk === null || !bezirk.every((b) => allowedOrte.includes(b))) {
      return { kind: 'error', status: 400, message: 'Unknown bezirk' };
    }
    const kategorie = many(query.kategorie);
    if (kategorie === null || !kategorie.every((k) => knownCategories.has(k))) {
      return { kind: 'error', status: 400, message: 'Unknown kategorie' };
    }
    return { kind: 'feed', token, region, bezirk, kategorie };
  }

  const single = /^\/calendar\/event\/([^/]+)\.ics$/.exec(clean);
  if (single) {
    const token = query.token;
    if (!isValidCalendarToken(token)) return UNAUTHORIZED;
    if (Object.keys(query).some((k) => k !== 'token')) {
      return { kind: 'error', status: 400, message: 'Unknown parameter' };
    }
    let slug = single[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      return { kind: 'error', status: 404, message: 'Not found' };
    }
    if (!SLUG.test(slug)) return { kind: 'error', status: 404, message: 'Not found' };
    return { kind: 'event', token, slug };
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
  city?: unknown;
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
  /**
   * Region feed: only events visible there (own region + online) and only if
   * the region is active (`activeRegionIds`), otherwise empty. Omitted = no
   * region restriction.
   */
  regionId?: string;
  activeRegionIds?: readonly string[];
  /**
   * Combined view feed: every event of these (active) regions, online events
   * included via their own regionId. Wins over `regionId`; an empty list = empty feed.
   */
  combinedRegionIds?: readonly string[];
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

  let inRegion: T[] = events;
  if (filters.combinedRegionIds) {
    const scope = filters.combinedRegionIds;
    inRegion = filterEventsForRegion(events, {
      isNational: true,
      activeRegionIds: scope,
    }).filter((event) => onlineEventVisibleIn(event, scope));
  } else if (filters.regionId) {
    const regionId = filters.regionId;
    inRegion = filters.activeRegionIds?.includes(regionId)
      ? filterEventsForRegion(events, {
          regionId,
          activeRegionIds: filters.activeRegionIds,
        }).filter((event) => onlineEventVisibleIn(event, [regionId]))
      : [];
  }

  return inRegion
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
