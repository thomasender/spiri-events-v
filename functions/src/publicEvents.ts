import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  EVENTS_VERSION_DOC,
  changesPublicList,
  nextVersion,
  parseVersionParam,
  toPublicEvent,
} from './publicEventsLogic';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

// A version's content never changes, so its URL can stay in the CDN and the
// browser; the cap only bounds how long the CDN keeps rarely used versions.
const CACHE_VERSIONED = 'public, max-age=3600, s-maxage=86400';
// A request for an outdated version still gets the current list, but must not
// be pinned to that old URL for long.
const CACHE_OUTDATED = 'public, max-age=60, s-maxage=60';

let snapshot: { version: number; body: string } | null = null;

async function currentVersion(): Promise<number | null> {
  const snap = await getFirestore().doc(EVENTS_VERSION_DOC).get();
  const version = snap.get('version');
  return typeof version === 'number' ? version : null;
}

/**
 * GET /api/events.json?v=<version> (Hosting rewrite in firebase.json): all
 * approved events as JSON. The CDN cache key includes `v`, and the trigger
 * below bumps the version whenever the public list changes, so visitors get
 * fresh data right after a change and no Firestore reads in between.
 */
export const publicEvents = onRequest(
  { region: REGION, memory: '256MiB', timeoutSeconds: 30, maxInstances: 5, cors: false },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD').status(405).send('Method Not Allowed');
      return;
    }
    const requested = parseVersionParam(req.query as Record<string, unknown>);
    if (requested === null) {
      res.set('Cache-Control', 'no-store').status(400).send('Bad Request');
      return;
    }

    try {
      let cacheControl = CACHE_VERSIONED;
      if (snapshot?.version !== requested) {
        const current = await currentVersion();
        if (current === null || requested > current) {
          res.set('Cache-Control', 'no-store').status(404).send('Unknown version');
          return;
        }
        if (requested < current) cacheControl = CACHE_OUTDATED;
        if (snapshot?.version !== current) {
          const snap = await getFirestore()
            .collection('events')
            .where('status', '==', 'approved')
            .get();
          const events = snap.docs.map((doc) => toPublicEvent(doc.id, doc.data()));
          snapshot = { version: current, body: JSON.stringify(events) };
        }
      }
      res
        .set('Content-Type', 'application/json; charset=utf-8')
        .set('Cache-Control', cacheControl)
        .status(200)
        .send(req.method === 'HEAD' ? undefined : snapshot?.body);
    } catch (err) {
      logger.error('publicEvents failed', err);
      res.set('Cache-Control', 'no-store').status(500).send('Internal error');
    }
  }
);

/** Publishes a new version whenever a write changes what the public list shows. */
export const onEventWriteBumpEventsVersion = onDocumentWritten(
  { region: REGION, document: 'events/{eventId}' },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    if (!changesPublicList(eventId, event.data?.before.data(), event.data?.after.data())) {
      return;
    }
    const db = getFirestore();
    const ref = db.doc(EVENTS_VERSION_DOC);
    await db.runTransaction(async (tx) => {
      const previous = (await tx.get(ref)).get('version');
      tx.set(ref, {
        version: nextVersion(typeof previous === 'number' ? previous : undefined, Date.now()),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
);
