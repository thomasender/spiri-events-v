/**
 * Running total of event approvals, kept in `app_settings/approvedEventsCounter`
 * as `{ count }`. Nothing displays it yet; it only collects the history.
 *
 * Counts every transition into `approved` (pending -> approved, and events
 * created already approved). An event that is sent back to review and approved
 * again counts again. `scripts/backfill-approved-events-counter.mjs` seeds the
 * value with the events that are approved today.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isApprovalTransition } from './instagram/instagramPublish';

if (getApps().length === 0) {
  initializeApp();
}

export const onEventApprovedCount = onDocumentWritten(
  { region: 'europe-west3', document: 'events/{eventId}' },
  async (event) => {
    if (!isApprovalTransition(event.data?.before.data(), event.data?.after.data())) return;
    await getFirestore()
      .collection('app_settings')
      .doc('approvedEventsCounter')
      .set(
        { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
  }
);
