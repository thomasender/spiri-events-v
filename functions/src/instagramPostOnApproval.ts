import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  publishApprovedEvent,
  isApprovalTransition,
  type PublishDeps,
} from './instagram/instagramPublish';
import { buildPublishDeps, resolveInstagramAccessToken } from './instagramDeps';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

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

    const deps: PublishDeps = buildPublishDeps(db, IG_USER_ID.value());

    // Cheap gates first so unrelated event writes never touch secrets or the
    // network; the full decision (kill switch, dedupe, date) lives in the
    // tested logic module.
    if (!isApprovalTransition(before, after)) return;

    // The secret stays the fallback until the refresh job has stored a newer
    // token in instagram_private/token.
    deps.accessToken = await resolveInstagramAccessToken(db, IG_ACCESS_TOKEN.value());
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
