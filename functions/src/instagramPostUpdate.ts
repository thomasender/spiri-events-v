import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { handleEventUpdate, type FeedPostState } from './instagram/instagramPostUpdate';
import { lookupTagHandles } from './instagramDeps';
import { resolveCredentialsForRegion } from './instagramRegionStore';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

// Marks a published feed post as outdated when its event is edited (new caption
// for the manual edit in the review tab) and comments under the post when the
// date, time or place changes or the event is cancelled. Logic and tests:
// instagram/instagramPostUpdate.ts, tests/lib/instagramPostUpdate.spec.ts.
export const onEventUpdatedInstagramPostUpdate = onDocumentUpdated(
  {
    region: 'europe-west3',
    document: 'events/{eventId}',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!eventId || !before || !after) return;
    const db = getFirestore();
    const posts = db.collection('instagram_posts');

    const outcome = await handleEventUpdate(
      {
        async getPost(postId) {
          const snap = await posts.doc(postId).get();
          return snap.exists ? ((snap.data() ?? {}) as FeedPostState) : null;
        },
        async updatePost(postId, patch) {
          await posts.doc(postId).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
        },
        claimCommentKey(postId, key) {
          return db.runTransaction(async (tx) => {
            const ref = posts.doc(postId);
            const snap = await tx.get(ref);
            if (snap.get('lastUpdateCommentKey') === key) return false;
            tx.update(ref, {
              lastUpdateCommentKey: key,
              lastUpdateCommentAt: FieldValue.serverTimestamp(),
            });
            return true;
          });
        },
        async isEnabled() {
          const snap = await db.doc('app_settings/instagram').get();
          return snap.exists && snap.get('enabled') === true;
        },
        resolveCredentials: (regionId) =>
          resolveCredentialsForRegion(db, regionId, {
            accessToken: IG_ACCESS_TOKEN.value(),
            userId: IG_USER_ID.value(),
          }),
        getTagHandles: (ev) => lookupTagHandles(db, ev),
        fetch,
        log: (message, data) => logger.info(message, data),
      },
      eventId,
      before,
      after
    );
    if (outcome !== 'ignored' && outcome !== 'no-post') {
      logger.info('Instagram post update processed', { eventId, outcome });
    }
  }
);
