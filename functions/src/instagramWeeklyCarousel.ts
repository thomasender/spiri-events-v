import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runWeeklyCarousels } from './instagram/instagramCarousel';
import { buildCarouselDeps, resolveInstagramAccessToken } from './instagramDeps';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

export const instagramWeeklyCarousel = onSchedule(
  {
    schedule: '0 10 * * 0',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async () => {
    const db = getFirestore();

    // Respect the kill switch before touching secrets or the network.
    const settings = await db.doc('app_settings/instagram').get();
    if (!(settings.exists && settings.get('enabled') === true)) {
      logger.info('Instagram posting disabled via app_settings/instagram; skipping carousels');
      return;
    }

    const accessToken = await resolveInstagramAccessToken(db, IG_ACCESS_TOKEN.value());
    const userId = IG_USER_ID.value();
    if (!accessToken || !userId) {
      logger.warn('IG_ACCESS_TOKEN or IG_USER_ID is not configured; skipping carousels');
      return;
    }

    const outcome = await runWeeklyCarousels(buildCarouselDeps(db, accessToken, userId));
    logger.info('Instagram weekly carousels processed', outcome);
  }
);
