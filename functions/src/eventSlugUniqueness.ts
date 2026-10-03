import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { findFreeSlug } from './eventSlug';

const REGION = 'europe-west3';

/**
 * Server-side guarantee that two events never share one URL.
 *
 * The client picks a slug that is free among approved events and the
 * creator's own events, but it cannot see other users' drafts or pending
 * submissions. When a freshly created event's slug is already used by any
 * other event, the new event (the newcomer) is moved to the next free "-N"
 * variant. Existing events — and so already-published URLs — are never
 * touched. Runs in a transaction so the check and the rename are atomic.
 */
export const onEventCreatedEnsureUniqueSlug = onDocumentCreated(
  { region: REGION, document: 'events/{eventId}' },
  async (event) => {
    const eventId = event.params.eventId;
    const slug = event.data?.get('slug');
    if (typeof slug !== 'string' || !slug) return;

    const db = getFirestore();
    const events = db.collection('events');
    const ref = events.doc(eventId);

    const renamedTo = await db.runTransaction(async (tx) => {
      const isTaken = async (candidate: string) => {
        const snap = await tx.get(events.where('slug', '==', candidate));
        return snap.docs.some((d) => d.id !== eventId);
      };
      const free = await findFreeSlug(slug, isTaken);
      if (free === slug) return null;
      tx.update(ref, { slug: free });
      return free;
    });

    if (renamedTo) {
      logger.info('Event slug already in use, assigned a unique one', {
        eventId,
        from: slug,
        to: renamedTo,
      });
    }
  }
);
