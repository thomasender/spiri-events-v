import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { generateAndStoreEventImage } from './instagram/instagramImage';
import {
  publishApprovedEvent,
  isApprovalTransition,
  type PublishDeps,
} from './instagram/instagramPublish';
import { normalizeInstagramHandle } from './instagram/instagramContent';
import { getInstagramAccessToken } from './instagram/instagramToken';
import { readStoredInstagramToken } from './instagramTokenStore';
import { notifyAdmins, ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

const REGION = 'europe-west3';

export const onEventApprovedPostToInstagram = onDocumentWritten(
  {
    region: REGION,
    document: 'events/{eventId}',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const db = getFirestore();

    const deps: PublishDeps = {
      fetch,
      accessToken: '',
      userId: IG_USER_ID.value(),
      async isEnabled() {
        const snap = await db.doc('app_settings/instagram').get();
        return snap.exists && snap.get('enabled') === true;
      },
      async createPost(id, record) {
        try {
          await db
            .collection('instagram_posts')
            .doc(id)
            .create({
              ...record,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          return true;
        } catch (err) {
          // gRPC ALREADY_EXISTS
          if ((err as { code?: unknown }).code === 6) return false;
          throw err;
        }
      },
      async updatePost(id, patch) {
        await db
          .collection('instagram_posts')
          .doc(id)
          .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
      },
      async getOrganizerHandle(ev) {
        const uid = typeof ev.createdBy === 'string' ? ev.createdBy : '';
        if (!uid) return null;
        const snap = await db.doc(`users/${uid}`).get();
        return normalizeInstagramHandle(snap.get('socialMedia.instagram'));
      },
      async generateImage(id, ev) {
        const colors: Record<string, string> = {};
        const categories = await db.collection('categories').get();
        categories.forEach((doc) => {
          const color = doc.get('color');
          const name = doc.get('name');
          if (typeof color === 'string' && typeof name === 'string') colors[name] = color;
        });
        return generateAndStoreEventImage(
          getStorage().bucket() as never,
          `feed_${id}`,
          ev,
          'feed',
          {
            categoryColors: colors,
          }
        );
      },
      notifyAdmins,
      log: (message, data) => logger.info(message, data),
    };

    // Cheap gates first so unrelated event writes never touch secrets or the
    // network; the full decision (kill switch, dedupe, date) lives in the
    // tested logic module.
    if (!isApprovalTransition(before, after)) return;
    // No consent: skip before touching secrets. Writes no instagram_posts doc,
    // so approving again after the organizer opted in can still post.
    if (after?.instagramConsent !== true) {
      logger.info('Instagram feed post skipped: no organizer consent', {
        eventId,
        outcome: 'no-consent',
      });
      return;
    }

    // The secret stays the fallback until the refresh job has stored a newer
    // token in instagram_private/token.
    deps.accessToken = await getInstagramAccessToken({
      secretToken: IG_ACCESS_TOKEN.value(),
      readStoredToken: () => readStoredInstagramToken(db),
      log: (message, data) => logger.info(message, data),
    });
    if (!deps.accessToken || !deps.userId) {
      logger.warn('IG_ACCESS_TOKEN or IG_USER_ID is not configured; skipping Instagram post', {
        eventId,
      });
      return;
    }

    const outcome = await publishApprovedEvent(deps, eventId, before, after);
    if (outcome !== 'ignored') logger.info('Instagram feed post processed', { eventId, outcome });
  }
);
