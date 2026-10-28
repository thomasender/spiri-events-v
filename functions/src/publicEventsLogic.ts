/**
 * Pure helpers for the cached public events list (functions/src/publicEvents.ts).
 *
 * The calendar used to open a Firestore listener on every approved event for
 * every visitor. Now the list is served as JSON under a versioned URL
 * (/api/events.json?v=<version>) that the Hosting CDN caches, and the browser
 * only watches the tiny app_settings/eventsVersion doc to learn when to fetch
 * a new version.
 */

export const EVENTS_VERSION_DOC = 'app_settings/eventsVersion';

const VERSION_PARAM = /^\d{1,16}$/;

/** The only accepted query string is `v=<digits>`; anything else would be a cheap cache-buster. */
export function parseVersionParam(query: Record<string, unknown>): number | null {
  const keys = Object.keys(query);
  if (keys.length !== 1 || keys[0] !== 'v') return null;
  const v = query.v;
  if (typeof v !== 'string' || !VERSION_PARAM.test(v)) return null;
  return Number(v);
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

function jsonSafe(value: unknown): unknown {
  if (isTimestampLike(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

/**
 * What the calendar and favorites pages need from an approved event: the
 * document without the owner's uid and the organizer's e-mail address,
 * timestamps as ISO strings so the JSON round-trips.
 */
export function toPublicEvent(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const { createdBy: _createdBy, ...rest } = jsonSafe(data) as Record<string, unknown>;
  const organizer = rest.organizer;
  if (typeof organizer === 'object' && organizer !== null) {
    const { email: _email, ...organizerRest } = organizer as Record<string, unknown>;
    rest.organizer = organizerRest;
  }
  return { ...rest, id };
}

/**
 * Whether a write to events/{id} changes what the public list shows. Only
 * approved events are listed, so writes on other states are ignored, and so
 * are writes that leave the public view of an approved event unchanged.
 */
export function changesPublicList(
  id: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  const wasListed = before?.status === 'approved';
  const isListed = after?.status === 'approved';
  if (!wasListed && !isListed) return false;
  if (wasListed !== isListed) return true;
  return (
    JSON.stringify(toPublicEvent(id, before ?? {})) !==
    JSON.stringify(toPublicEvent(id, after ?? {}))
  );
}

const LISTING_FIELDS = [
  'listedInDirectory',
  'directoryHidden',
  'directoryRegions',
  'directoryRegionIds',
] as const;

/**
 * Whether a write to users/{uid}/publicProfile/data changes a field that
 * decides where the organiser's online events show (Trello lVFp6Dvw).
 */
export function changesOnlineListing(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  return LISTING_FIELDS.some(
    (key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)
  );
}

/** Strictly increasing so a late trigger can never hand out an older version. */
export function nextVersion(previous: number | undefined, now: number): number {
  return Math.max(now, (previous ?? 0) + 1);
}
