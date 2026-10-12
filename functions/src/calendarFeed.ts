import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { viennaToday } from './instagram/instagramPublish';
import { buildCalendar, type IcsEvent } from './calendar/icsBuilder';
import {
  parseCalendarRequest,
  selectFeedEvents,
  selectSingleEvent,
  type PublicEvent,
} from './calendar/calendarRoutes';

if (getApps().length === 0) {
  initializeApp();
}

const FEED_NAME = 'Events Vorarlberg – thetribe.at';
const CACHE_OK = 'public, max-age=600, s-maxage=3600';
const CACHE_ERROR = 'public, max-age=60, s-maxage=300';
// Instances are reused, so these small in-memory caches spare Firestore reads
// when the CDN cache has just expired on several URLs at once.
const MEMORY_TTL_MS = 5 * 60 * 1000;

let eventsCache: { at: number; events: PublicEvent[] } | null = null;
let categoriesCache: { at: number; names: Set<string> } | null = null;

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
 * Public, read-only iCalendar endpoints behind Hosting rewrites
 * (firebase.json): /calendar/feed.ics and /calendar/event/<slug>.ics.
 * Responses are cached by the Hosting CDN (s-maxage) so the number of
 * Firestore reads does not grow with the number of subscribers.
 */
export const calendarFeed = onRequest(
  { region: 'europe-west3', memory: '256MiB', timeoutSeconds: 30, maxInstances: 5, cors: false },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD').status(405).send('Method Not Allowed');
      return;
    }

    try {
      const route = parseCalendarRequest(
        req.path,
        req.query as Record<string, unknown>,
        req.path.endsWith('feed.ics') ? await loadCategoryNames() : new Set<string>()
      );
      if (route.kind === 'error') {
        res.set('Cache-Control', CACHE_ERROR).status(route.status).send(route.message);
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
