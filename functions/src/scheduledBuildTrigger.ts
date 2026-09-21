import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

const GH_DISPATCH_TOKEN = defineSecret('GH_DISPATCH_TOKEN');
const GH_DISPATCH_REPO = defineSecret('GH_DISPATCH_REPO');

const REGION = 'europe-west3';

export const scheduledBuildTrigger = onSchedule(
  {
    region: REGION,
    schedule: 'every 6 hours',
    secrets: [GH_DISPATCH_TOKEN, GH_DISPATCH_REPO],
    timeZone: 'Europe/Vienna',
  },
  async () => {
    const token = GH_DISPATCH_TOKEN.value();
    const repo = GH_DISPATCH_REPO.value();
    if (!token || !repo) {
      logger.warn(
        'GH_DISPATCH_TOKEN or GH_DISPATCH_REPO is not configured; skipping scheduled build trigger'
      );
      return;
    }
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'firebase-functions',
        },
        body: JSON.stringify({
          event_type: 'firestore-build',
          client_payload: { source: 'scheduler' },
        }),
      });
      const status = response.status;
      if (status >= 200 && status < 300) {
        logger.info('Triggered scheduled build via GitHub repository_dispatch', { status });
      } else {
        logger.error('GitHub repository_dispatch returned non-2xx', {
          status,
          statusText: response.statusText,
        });
      }
    } catch (err) {
      logger.error('Failed to trigger scheduled build via GitHub repository_dispatch', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
