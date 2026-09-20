import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// URL of the Netlify build hook created in Netlify's dashboard
// (Site settings → Build & deploy → Build hooks → Add build hook).
// The hook must be set as a Firebase Functions secret via:
//   firebase functions:secrets:set NETLIFY_BUILD_HOOK
const NETLIFY_BUILD_HOOK = defineSecret('NETLIFY_BUILD_HOOK');

const REGION = 'europe-west3';
const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;

// Single doc whose `buildAt` timestamp records when this function last
// successfully POSTed the Netlify build hook. Read on every event write
// to enforce a debounce window so a burst of rapid edits (one publish +
// several image tweaks) only fires one build, not N.
const LAST_BUILD_DOC_PATH = 'app_settings/last_netlify_build';

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
// Within a DEBOUNCE_WINDOW_MS window, only the first event write triggers a
// build. Subsequent writes inside that window are silently coalesced into
// the same build. This is safe because one Netlify build regenerates ALL
// event pages from the live Firestore snapshot, so the user-visible result
// after the build finishes is the same whether 1 or 50 events changed in
// the meantime — and it keeps the Netlify build queue from stacking up
// during bulk imports / onboarding bursts.
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

    const db = getFirestore();
    const lastBuildDoc = db.doc(LAST_BUILD_DOC_PATH);
    const lastSnap = await lastBuildDoc.get();
    const lastBuildAt = lastSnap.exists ? (lastSnap.get('buildAt')?.toMillis?.() ?? 0) : 0;
    const elapsedMs = Date.now() - lastBuildAt;
    if (elapsedMs < DEBOUNCE_WINDOW_MS) {
      const remainingSec = Math.max(0, Math.round((DEBOUNCE_WINDOW_MS - elapsedMs) / 1000));
      logger.debug('Skipping Netlify build: within debounce window', {
        eventId,
        lastBuildAt,
        elapsedMs,
        remainingSec,
      });
      return;
    }

    try {
      const response = await fetch(hookUrl, { method: 'POST' });
      const status = response.status;
      if (status >= 200 && status < 300) {
        // Stamp the timestamp only on success so a failed POST doesn't burn
        // the debounce window — the next event change retries immediately.
        await lastBuildDoc.set({ buildAt: FieldValue.serverTimestamp() }, { merge: true });
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
