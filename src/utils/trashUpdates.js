import { serverTimestamp } from 'firebase/firestore';

// Firestore update that moves an event to the trash. `trashReason` is only set
// when an admin deletes another user's event; the notification function puts
// it into the owner's "Dein Event wurde gelöscht" email. `trashKind: null`
// clears a 'rejected' left over from an earlier rejection.
export function buildTrashUpdate(uid, reason) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  return {
    status: 'trashed',
    trashedAt: serverTimestamp(),
    trashedBy: uid ?? null,
    trashReason: trimmed || null,
    trashKind: null,
    updatedAt: serverTimestamp(),
  };
}

// Staff rejects a pending event (Review tab): it goes to the owner's trash
// like a delete, but `trashKind: 'rejected'` makes onEventStatusChanged send
// "Dein Event wurde abgelehnt" (with `reason`, taken from the staff message)
// instead of "Dein Event wurde gelöscht".
export function buildRejectUpdate(uid, reason) {
  return { ...buildTrashUpdate(uid, reason), trashKind: 'rejected' };
}

export function buildRestoreUpdate() {
  return {
    status: 'draft',
    trashedAt: null,
    trashedBy: null,
    trashReason: null,
    trashKind: null,
    updatedAt: serverTimestamp(),
  };
}
