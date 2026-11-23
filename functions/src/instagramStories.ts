import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runDailyStories } from './instagram/instagramStory';
import {
  INSTAGRAM_SCHEDULED_REGION_IDS,
  carouselBezirkeFor,
  runForRegions,
} from './instagram/instagramRegionConfig';
import { buildStoryDeps, memoizedEventLister } from './instagramDeps';
import { resolveCredentialsForRegion } from './instagramRegionStore';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

/** Kill switch first, so a disabled account never touches secrets or the network. */
async function isInstagramEnabled(): Promise<boolean> {
  const settings = await getFirestore().doc('app_settings/instagram').get();
  return settings.exists && settings.get('enabled') === true;
}

// Retired (Trello gOparsqS): the per-event story about two hours before each
// event is no longer wanted; only the 05:00 overview below posts stories. The
// export stays as a no-op because the CI deploy runs `--non-interactive`
// without `--force` and would abort on a function that exists in the cloud but
// not in main. To remove it for good, run
// `firebase functions:delete instagramEventStories --region europe-west3`
// first, then delete this export and the one in index.ts.
export const instagramEventStories = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
  },
  async () => {
    logger.debug('instagramEventStories is retired; nothing to do');
  }
);

// 05:00 every day: one "Heute in <Bezirk>" overview per Bezirk with at least
// two events today. Since the per-event story was retired (gOparsqS), a Bezirk
// with a single event gets no story. Runs for every scheduled region in turn
// (Vorarlberg first), each with its own account; a region without a usable
// account is skipped, a failing one does not stop the next.
export const instagramMorningStories = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async () => {
    if (!(await isInstagramEnabled())) {
      logger.info(
        'Instagram posting disabled via app_settings/instagram; skipping overview stories'
      );
      return;
    }
    const db = getFirestore();
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
          ...buildStoryDeps(db, credentials.accessToken, credentials.userId),
          listEvents,
        };
      },
      (deps, regionId) =>
        runDailyStories(deps, carouselBezirkeFor(regionId), { minEvents: 2, regionId }),
      (message, data) => logger.warn(message, data)
    );
    logger.info('Instagram overview stories processed', { regions: outcome });
  }
);
