import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const GH_DISPATCH_TOKEN = defineSecret('GH_DISPATCH_TOKEN');
const GH_DISPATCH_REPO = defineSecret('GH_DISPATCH_REPO');

const REGION = 'europe-west3';
const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;

const LAST_BUILD_DOC_PATH = 'app_settings/last_build';

export const onEventWriteTriggerBuild = onDocumentWritten(
  {
    region: REGION,
    document: 'events/{eventId}',
    secrets: [GH_DISPATCH_TOKEN, GH_DISPATCH_REPO],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const beforeStatus = readStatus(event.data?.before.data());
    const afterStatus = readStatus(event.data?.after.data());

    const touchedApprovedState = beforeStatus === 'approved' || afterStatus === 'approved';
    if (!touchedApprovedState) {
      logger.debug('Skipping build: event has no approved state', {
        eventId,
        beforeStatus,
        afterStatus,
      });
      return;
    }

    const token = GH_DISPATCH_TOKEN.value();
    const repo = GH_DISPATCH_REPO.value();
    if (!token || !repo) {
      logger.warn(
        'GH_DISPATCH_TOKEN or GH_DISPATCH_REPO is not configured; skipping build trigger',
        {
          eventId,
        }
      );
      return;
    }

    const db = getFirestore();
    const lastBuildDoc = db.doc(LAST_BUILD_DOC_PATH);
    const lastSnap = await lastBuildDoc.get();
    const lastBuildAt = lastSnap.exists ? (lastSnap.get('buildAt')?.toMillis?.() ?? 0) : 0;
    const elapsedMs = Date.now() - lastBuildAt;
    if (elapsedMs < DEBOUNCE_WINDOW_MS) {
      const remainingSec = Math.max(0, Math.round((DEBOUNCE_WINDOW_MS - elapsedMs) / 1000));
      logger.debug('Skipping build: within debounce window', {
        eventId,
        lastBuildAt,
        elapsedMs,
        remainingSec,
      });
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
          client_payload: { source: 'firestore-trigger', eventId },
        }),
      });
      const status = response.status;
      if (status >= 200 && status < 300) {
        await lastBuildDoc.set({ buildAt: FieldValue.serverTimestamp() }, { merge: true });
        logger.info('Triggered build via GitHub repository_dispatch', {
          eventId,
          beforeStatus,
          afterStatus,
          status,
        });
      } else {
        logger.error('GitHub repository_dispatch returned non-2xx', {
          eventId,
          beforeStatus,
          afterStatus,
          status,
          statusText: response.statusText,
        });
      }
    } catch (err) {
      logger.error('Failed to trigger build via GitHub repository_dispatch', {
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
