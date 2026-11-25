import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runWeeklyCarousels } from './instagram/instagramCarousel';
import { INSTAGRAM_SCHEDULED_REGION_IDS, runForRegions } from './instagram/instagramRegionConfig';
import { buildCarouselDeps, memoizedEventLister } from './instagramDeps';
import { resolveCredentialsForRegion } from './instagramRegionStore';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

// Sunday 10:00 Vienna (same wall clock as Berlin): one carousel per Bezirk of
// every scheduled region (Vorarlberg first, then Bodensee), each with its own
// account. Regions run one after the other within the 1800 s timeout; a region
// without a usable account is skipped, a failing one does not stop the next.
export const instagramWeeklyCarousel = onSchedule(
  {
    schedule: '0 10 * * 0',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
    timeoutSeconds: 1800,
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

    // Every region reads the same approved events: query them once per run.
    const listEvents = memoizedEventLister(db);
    const outcome = await runForRegions(
      INSTAGRAM_SCHEDULED_REGION_IDS,
      async (regionId) => {
        const credentials = await resolveCredentialsForRegion(db, regionId, {
          accessToken: IG_ACCESS_TOKEN.value(),
          userId: IG_USER_ID.value(),
        });
        if (!credentials) return null;
        return {
          ...buildCarouselDeps(db, credentials.accessToken, credentials.userId),
          listEvents,
        };
      },
      (deps, regionId) => runWeeklyCarousels(deps, regionId),
      (message, data) => logger.warn(message, data)
    );
    logger.info('Instagram weekly carousels processed', { regions: outcome });
  }
);
