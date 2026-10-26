import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { becameEnabled, regionIdFromAccountDocId } from './instagram/instagramRegionAccounts';
import { resolveCredentialsForRegion, runRegionBackfill } from './instagramRegionStore';
import { sanitizeError } from './instagram/instagramPublish';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

// Not read here (regional accounts use their own credentials), but the shared
// publish deps and the admin callable declare the same secrets.
const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

/**
 * When Thomas switches a regional account on (enabled false/missing -> true with
 * userId and token), publish the region's already approved, consented and not
 * yet past events once. Bounded to one batch per run; the admin callable
 * adminBackfillInstagramRegion continues with the rest. Idempotent via the
 * instagram_posts dedupe docs.
 */
export const onInstagramRegionAccountEnabled = onDocumentWritten(
  {
    region: 'europe-west3',
    // The wildcard must be a whole path segment, so this also fires for
    // instagram_private/token; the handler exits at once for those.
    document: 'instagram_private/{docId}',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async (event) => {
    const docId = typeof event.params.docId === 'string' ? event.params.docId : '';
    const regionId = regionIdFromAccountDocId(docId);
    if (!regionId || regionId === 'vorarlberg') return;
    if (!becameEnabled(event.data?.before.data(), event.data?.after.data(), regionId)) return;
    const db = getFirestore();
    try {
      const credentials = await resolveCredentialsForRegion(db, regionId, {
        accessToken: '',
        userId: '',
      });
      if (!credentials) {
        logger.info('Instagram backfill skipped: no usable credentials', { regionId });
        return;
      }
      await runRegionBackfill(db, regionId, credentials);
    } catch (err) {
      logger.error('Instagram region backfill crashed', { regionId, error: sanitizeError(err) });
    }
  }
);
