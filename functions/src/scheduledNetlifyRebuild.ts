import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

// Same secret as onEventWriteTriggerNetlifyBuild — both call the same hook.
const NETLIFY_BUILD_HOOK = defineSecret('NETLIFY_BUILD_HOOK');

const REGION = 'europe-west3';

// Safety-net rebuild every 6 hours. The primary trigger is the Firestore
// `onDocumentWritten` handler in triggerNetlifyBuild.ts, which catches every
// approved-event write within ~1 second and posts the Netlify build hook.
// This scheduled function exists to recover from cases the primary trigger
// might miss: a Cloud Function cold-start crash, a transient secret lookup
// failure, a debounce edge case where a POST was lost, or anything else
// weird in the underlying infrastructure. Rebuilding on a 6-hour cadence
// means the worst-case staleness for any event page is bounded even if the
// event-driven path silently broke.
//
// The build is idempotent — it always reads the live Firestore snapshot
// (Admin SDK in the prerender) and writes the same HTML when nothing has
// changed — so the only cost of an unnecessary run is a few minutes of
// Netlify build time.
export const scheduledNetlifyRebuild = onSchedule(
  {
    region: REGION,
    schedule: 'every 6 hours',
    secrets: [NETLIFY_BUILD_HOOK],
    timeZone: 'Europe/Vienna',
  },
  async () => {
    const hookUrl = NETLIFY_BUILD_HOOK.value();
    if (!hookUrl) {
      logger.warn('NETLIFY_BUILD_HOOK is not configured; skipping scheduled rebuild');
      return;
    }
    try {
      const response = await fetch(hookUrl, { method: 'POST' });
      const status = response.status;
      if (status >= 200 && status < 300) {
        logger.info('Triggered scheduled Netlify rebuild', { status });
      } else {
        logger.error('Scheduled Netlify rebuild returned non-2xx', {
          status,
          statusText: response.statusText,
        });
      }
    } catch (err) {
      logger.error('Failed to trigger scheduled Netlify rebuild', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
