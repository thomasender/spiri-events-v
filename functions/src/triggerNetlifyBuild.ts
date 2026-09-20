import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

// URL of the Netlify build hook created in Netlify's dashboard
// (Site settings → Build & deploy → Build hooks → Add build hook).
// The hook must be set as a Firebase Functions secret via:
//   firebase functions:secrets:set NETLIFY_BUILD_HOOK
const NETLIFY_BUILD_HOOK = defineSecret('NETLIFY_BUILD_HOOK');

const REGION = 'europe-west3';

// Fires whenever an event doc is created, updated or deleted. Triggers a
// Netlify build so the prerendered /event/<slug>/index.html (and the index
// page) reflect the new state without waiting for someone to manually run
// `npm run prerender:refresh` and push.
//
// Skips events that are not and never were approved — drafts and pending
// submissions are not in the prerender anyway, so a build for them would be
// pure waste. The status check covers the four transitions that matter for
// OG previews:
//   - draft → approved (admin published a new event)
//   - approved → approved (any field edit: title, image, description, ...)
//   - approved → trashed or deleted (event disappears from the calendar)
//   - any → approved for the first time
//
// Rapid edits to the same event will queue multiple builds on Netlify; that
// is acceptable for the current volume and keeps the function simple.
// A future optimisation is a Cloud Tasks debounce in front of this trigger.
export const onEventWriteTriggerNetlifyBuild = onDocumentWritten(
  {
    region: REGION,
    document: 'events/{eventId}',
    secrets: [NETLIFY_BUILD_HOOK],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const beforeStatus = readStatus(event.data?.before.data());
    const afterStatus = readStatus(event.data?.after.data());

    const touchedApprovedState = beforeStatus === 'approved' || afterStatus === 'approved';
    if (!touchedApprovedState) {
      logger.debug('Skipping Netlify build: event has no approved state', {
        eventId,
        beforeStatus,
        afterStatus,
      });
      return;
    }

    const hookUrl = NETLIFY_BUILD_HOOK.value();
    if (!hookUrl) {
      logger.warn('NETLIFY_BUILD_HOOK is not configured; skipping build trigger', {
        eventId,
      });
      return;
    }

    try {
      const response = await fetch(hookUrl, { method: 'POST' });
      const status = response.status;
      if (status >= 200 && status < 300) {
        logger.info('Triggered Netlify build for event change', {
          eventId,
          beforeStatus,
          afterStatus,
          status,
        });
      } else {
        logger.error('Netlify build hook returned non-2xx', {
          eventId,
          beforeStatus,
          afterStatus,
          status,
          statusText: response.statusText,
        });
      }
    } catch (err) {
      logger.error('Failed to trigger Netlify build', {
        eventId,
        beforeStatus,
        afterStatus,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

function readStatus(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const status = (data as { status?: unknown }).status;
  return typeof status === 'string' ? status : null;
}
