import { serverTimestamp } from 'firebase/firestore';

// Firestore update that moves an event to the trash. `trashReason` is only set
// when an admin deletes another user's event; the notification function puts
// it into the owner's "Dein Event wurde gelöscht" email.
export function buildTrashUpdate(uid, reason) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  return {
    status: 'trashed',
    trashedAt: serverTimestamp(),
    trashedBy: uid ?? null,
    trashReason: trimmed || null,
    updatedAt: serverTimestamp(),
  };
}

export function buildRestoreUpdate() {
  return {
    status: 'draft',
    trashedAt: null,
    trashedBy: null,
    trashReason: null,
    updatedAt: serverTimestamp(),
  };
}
