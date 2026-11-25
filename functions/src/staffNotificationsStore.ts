/**
 * Firestore side of moderator applications and team notes (Trello 6afc59ed).
 * The decisions (who gets what, when a reminder is due) are pure and live in
 * staffNotifications.ts; this file only reads and writes.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore, type WriteBatch } from 'firebase-admin/firestore';
import { isRegionId } from './regions';
import {
  APPLICATIONS_COLLECTION,
  STAFF_NOTIFICATIONS_COLLECTION,
  parseApplicationStatus,
  type ApplicationRecord,
  type StaffDocEntry,
  type StaffNotificationInput,
} from './staffNotifications';

if (getApps().length === 0) {
  initializeApp();
}

function millis(value: unknown): number | null {
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return typeof value === 'number' ? value : null;
}

export function toApplicationRecord(data: Record<string, unknown>): ApplicationRecord {
  return {
    name: typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : '',
    message: typeof data.message === 'string' ? data.message : '',
    regionId: typeof data.regionId === 'string' && isRegionId(data.regionId) ? data.regionId : null,
    hasPhoto: data.hasPhoto === true,
    status: parseApplicationStatus(data.status),
    createdAtMs: millis(data.createdAt) ?? 0,
    reminderSentAtMs: millis(data.reminderSentAt),
  };
}

export async function loadStaffDocs(): Promise<StaffDocEntry[]> {
  const snap = await getFirestore().collection('admin_users').get();
  return snap.docs.map((d) => ({ uid: d.id, data: d.data() }));
}

/** Adds one `staff_notifications` doc per input to the batch. */
export function addStaffNotificationsToBatch(
  batch: WriteBatch,
  notifications: readonly StaffNotificationInput[]
): void {
  const col = getFirestore().collection(STAFF_NOTIFICATIONS_COLLECTION);
  for (const n of notifications) {
    batch.set(col.doc(), { ...n, createdAt: FieldValue.serverTimestamp(), readAt: null });
  }
}

export async function writeStaffNotifications(
  notifications: readonly StaffNotificationInput[]
): Promise<void> {
  if (notifications.length === 0) return;
  const batch = getFirestore().batch();
  addStaffNotificationsToBatch(batch, notifications);
  await batch.commit();
}

export async function getApplication(id: string): Promise<ApplicationRecord | null> {
  const snap = await getFirestore().collection(APPLICATIONS_COLLECTION).doc(id).get();
  return snap.exists ? toApplicationRecord(snap.data() ?? {}) : null;
}

export async function markApplicationInvited(
  id: string,
  data: { invitedBy: string; inviteId: string; regionId: string }
): Promise<void> {
  await getFirestore().collection(APPLICATIONS_COLLECTION).doc(id).update({
    status: 'invited',
    invitedAt: FieldValue.serverTimestamp(),
    invitedBy: data.invitedBy,
    inviteId: data.inviteId,
    regionId: data.regionId,
  });
}

/**
 * Closes the not yet finished applications of this address (also when the
 * invitation came from the tab "Moderation"). Returns their ids, newest first.
 */
export async function closeApplicationsFor(email: string, uid: string): Promise<string[]> {
  const db = getFirestore();
  const snap = await db.collection(APPLICATIONS_COLLECTION).where('email', '==', email).get();
  const open = snap.docs
    .filter((d) => parseApplicationStatus(d.data().status) !== 'done')
    .sort((a, b) => (millis(b.data().createdAt) ?? 0) - (millis(a.data().createdAt) ?? 0));
  if (open.length === 0) return [];
  const batch = db.batch();
  for (const d of open) {
    batch.update(d.ref, { status: 'done', doneAt: FieldValue.serverTimestamp(), acceptedUid: uid });
  }
  await batch.commit();
  return open.map((d) => d.id);
}
