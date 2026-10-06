import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { refreshInstagramToken, type StoredToken } from './instagram/instagramToken';
import { sanitizeError } from './instagram/instagramPublish';
import { notifyAdmins, ADMIN_MAIL_SECRETS } from './adminNotify';
import { readStoredInstagramToken } from './instagramTokenStore';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');

const REGION = 'europe-west3';

export const refreshInstagramTokenJob = onSchedule(
  {
    region: REGION,
    // Weekly check; the token is only refreshed once < 30 days are left.
    schedule: 'every monday 04:00',
    timeZone: 'Europe/Vienna',
    secrets: [IG_ACCESS_TOKEN, ...ADMIN_MAIL_SECRETS],
  },
  async () => {
    const db = getFirestore();
    const secretToken = IG_ACCESS_TOKEN.value();
    try {
      const outcome = await refreshInstagramToken({
        fetch,
        secretToken,
        readStoredToken: () => readStoredInstagramToken(db),
        async saveToken(token: StoredToken) {
          await db.doc('instagram_private/token').set({
            accessToken: token.accessToken,
            expiresAt: Timestamp.fromDate(token.expiresAt),
            refreshedAt: token.refreshedAt ? Timestamp.fromDate(token.refreshedAt) : null,
          });
        },
        async writeStatus(patch) {
          const data: Record<string, unknown> = {};
          if (patch.tokenExpiresAt) data.tokenExpiresAt = Timestamp.fromDate(patch.tokenExpiresAt);
          if (patch.tokenRefreshedAt) {
            data.tokenRefreshedAt = Timestamp.fromDate(patch.tokenRefreshedAt);
          }
          if (patch.tokenRefreshError !== undefined) {
            data.tokenRefreshError = patch.tokenRefreshError;
          }
          await db.doc('app_settings/instagram').set(data, { merge: true });
        },
        notifyAdmins,
        log: (message, data) => logger.info(message, data),
      });
      logger.info('Instagram token refresh job finished', { outcome });
    } catch (err) {
      logger.error('Instagram token refresh job crashed', {
        error: sanitizeError(err, [secretToken]),
      });
    }
  }
);
