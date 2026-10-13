import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { viennaToday } from './instagram/instagramPublish';
import { buildCalendar, type IcsEvent } from './calendar/icsBuilder';
import {
  isValidCalendarToken,
  parseCalendarRequest,
  selectFeedEvents,
  selectSingleEvent,
  type PublicEvent,
} from './calendar/calendarRoutes';
import { CALENDAR_TOKENS_COLLECTION } from './calendarFeedToken';

if (getApps().length === 0) {
  initializeApp();
}

const FEED_NAME = 'Events Vorarlberg – thetribe.at';
const CACHE_OK = 'public, max-age=600, s-maxage=3600';
const CACHE_ERROR = 'public, max-age=60, s-maxage=300';
// Denials must never be cached, neither by the CDN nor by the browser.
const CACHE_DENIED = 'no-store';
// Instances are reused, so these small in-memory caches spare Firestore reads
// when the CDN cache has just expired on several URLs at once.
const MEMORY_TTL_MS = 5 * 60 * 1000;

let eventsCache: { at: number; events: PublicEvent[] } | null = null;
let categoriesCache: { at: number; names: Set<string> } | null = null;
// token -> time it was confirmed. Positive results only; bounded so a flood
// of different valid tokens cannot grow the instance's memory.
const tokenCache = new Map<string, number>();
const MAX_CACHED_TOKENS = 500;

/** True when the token belongs to an existing, enabled account. */
async function isKnownToken(token: string): Promise<boolean> {
  const cachedAt = tokenCache.get(token);
  if (cachedAt !== undefined && Date.now() - cachedAt < MEMORY_TTL_MS) return true;
  tokenCache.delete(token);

  const snap = await getFirestore()
    .collection(CALENDAR_TOKENS_COLLECTION)
    .where('token', '==', token)
    .limit(1)
    .get();
  if (snap.empty) return false;

  // A token whose account was deleted or disabled no longer opens the feed,
  // even if deleting the token doc itself failed.
  try {
    const user = await getAuth().getUser(snap.docs[0].id);
    if (user.disabled) return false;
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/user-not-found') return false;
    throw err;
  }

  if (tokenCache.size >= MAX_CACHED_TOKENS) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  tokenCache.set(token, Date.now());
  return true;
}

async function loadApprovedEvents(): Promise<PublicEvent[]> {
  if (eventsCache && Date.now() - eventsCache.at < MEMORY_TTL_MS) return eventsCache.events;
  const snap = await getFirestore().collection('events').where('status', '==', 'approved').get();
  const events = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PublicEvent);
  eventsCache = { at: Date.now(), events };
  return events;
}

async function loadCategoryNames(): Promise<Set<string>> {
  if (categoriesCache && Date.now() - categoriesCache.at < MEMORY_TTL_MS) {
    return categoriesCache.names;
  }
  const snap = await getFirestore().collection('categories').get();
  const names = new Set<string>();
  snap.forEach((doc) => {
    const name = doc.get('name');
    if (typeof name === 'string') names.add(name);
  });
  categoriesCache = { at: Date.now(), names };
  return names;
}

/**
 * Read-only iCalendar endpoints for signed-in users, behind Hosting rewrites
 * (firebase.json): /calendar/feed.ics and /calendar/event/<slug>.ics.
 * Every request needs `?token=` with the user's personal feed token
 * (calendarFeedToken.ts); without a known token the answer is an uncached 401.
 *
 * Successful responses are cached by the Hosting CDN (s-maxage) so the number
 * of Firestore reads does not grow with the number of subscribers. The CDN
 * cache key includes the query string, so the token is part of it: a cached
 * copy is only served to someone who has the same token. A revoked or
 * replaced token can therefore still be served from cache for up to
 * s-maxage (1 h). The content is public event data either way.
 */
export const calendarFeed = onRequest(
  { region: 'europe-west3', memory: '256MiB', timeoutSeconds: 30, maxInstances: 5, cors: false },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD').status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Check the token before anything else touches Firestore.
      const token = req.query.token;
      if (!isValidCalendarToken(token) || !(await isKnownToken(token))) {
        res.set('Cache-Control', CACHE_DENIED).status(401).send('Unauthorized');
        return;
      }

      const route = parseCalendarRequest(
        req.path,
        req.query as Record<string, unknown>,
        req.path.endsWith('feed.ics') ? await loadCategoryNames() : new Set<string>()
      );
      if (route.kind === 'error') {
        res
          .set('Cache-Control', route.status === 401 ? CACHE_DENIED : CACHE_ERROR)
          .status(route.status)
          .send(route.message);
        return;
      }

      const today = viennaToday(new Date());
      let events: IcsEvent[];
      let filename: string;
      let disposition: string;

      if (route.kind === 'feed') {
        events = selectFeedEvents(await loadApprovedEvents(), today, route) as never;
        filename = 'events.ics';
        disposition = 'inline';
      } else {
        const all = await loadApprovedEvents();
        const found =
          all.find((e) => e.slug === route.slug) ?? all.find((e) => e.id === route.slug);
        events = found ? (selectSingleEvent(found, today) as never) : [];
        if (events.length === 0) {
          res.set('Cache-Control', CACHE_ERROR).status(404).send('Not found');
          return;
        }
        filename = `${route.slug}.ics`;
        disposition = 'attachment';
      }

      res
        .set('Content-Type', 'text/calendar; charset=utf-8')
        .set('Content-Disposition', `${disposition}; filename="${filename}"`)
        .set('Cache-Control', CACHE_OK)
        .status(200)
        .send(req.method === 'HEAD' ? undefined : buildCalendar(events, FEED_NAME));
    } catch (err) {
      logger.error('calendarFeed failed', err);
      res.set('Cache-Control', 'no-store').status(500).send('Internal error');
    }
  }
);
