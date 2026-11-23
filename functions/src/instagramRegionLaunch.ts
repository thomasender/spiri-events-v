import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { regionIdFromAccountDocId } from './instagram/instagramRegionAccounts';
import {
  LAUNCH_BUDGET_MS,
  isBeforeLaunch,
  parseLaunchPlan,
  parseLaunchProgress,
  runLaunchDrip,
} from './instagram/instagramRegionLaunch';
import { sanitizeError } from './instagram/instagramPublish';
import { buildLaunchDeps, resolveCredentialsForRegion } from './instagramRegionStore';
import { ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

// Not read here (regional accounts use their own credentials), but the shared
// publish deps declare the same secrets as the other Instagram functions.
const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

// Every 30 minutes: for each regional account with a running launch plan
// (instagram_private/region_{id}.launchStartAt), post the part of the backlog
// that is due by now (instagram/instagramRegionLaunch.ts). Outside the posting
// windows a run posts nothing; a missed run is caught up by the next one.
export const instagramRegionLaunchDrip = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async () => {
    const db = getFirestore();
    // Kill switch before reading anything else; a skipped run uses no slot.
    const settings = await db.doc('app_settings/instagram').get();
    if (!(settings.exists && settings.get('enabled') === true)) {
      logger.info('Instagram posting disabled via app_settings/instagram; skipping launch drip');
      return;
    }

    const started = Date.now();
    const snap = await db.collection('instagram_private').get();
    for (const doc of snap.docs) {
      const regionId = regionIdFromAccountDocId(doc.id);
      if (!regionId) continue;
      const plan = parseLaunchPlan(regionId, doc.data());
      if (!plan || parseLaunchProgress(doc.data()).finishedAt) continue;
      if (isBeforeLaunch(plan.startAt, new Date())) continue;
      const budgetMs = LAUNCH_BUDGET_MS - (Date.now() - started);
      if (budgetMs <= 0) break;
      try {
        const credentials = await resolveCredentialsForRegion(db, regionId, {
          accessToken: '',
          userId: '',
        });
        if (!credentials) {
          logger.info('Instagram launch drip skipped: no usable account', { regionId });
          continue;
        }
        const result = await runLaunchDrip(
          buildLaunchDeps(db, regionId, credentials),
          regionId,
          plan,
          { budgetMs }
        );
        logger.info('Instagram launch drip run', result);
      } catch (err) {
        logger.error('Instagram launch drip crashed', { regionId, error: sanitizeError(err) });
      }
    }
  }
);
