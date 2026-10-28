// Red dots for staff (vX7TgrWN). Pure logic, no Firebase imports.
//
// Hierarchy: avatar (header) -> "Verwaltung" -> tab group -> tab. Every level
// shows the sum of the level below, so a dot always leads somewhere that has one.
//
// Review is a queue, not an inbox: its dot counts what is NEW since the account
// last opened the tab (`users/{uid}/seen/review`), not everything that waits.

/** Millis of a Firestore Timestamp / Date / number, or null. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * Pending event ids that count for the Review dot.
 * - a pending event this account has not seen in Review yet, or
 * - an unread "organizer changed it" alert that arrived after the last visit.
 * `seen` is `{ eventIds: string[], atMs: number | null }` or null (never opened).
 */
export function newReviewEventIds(pendingIds, seen, unreadAlerts = {}) {
  const seenIds = new Set(Array.isArray(seen?.eventIds) ? seen.eventIds : []);
  const seenAt = typeof seen?.atMs === 'number' ? seen.atMs : null;
  return pendingIds.filter((id) => {
    if (!seenIds.has(id)) return true;
    const alert = unreadAlerts[id];
    if (!alert) return false;
    // An alert without a time (old data) counts until the next visit.
    return seenAt == null || alert.atMs == null || alert.atMs > seenAt;
  });
}

/**
 * The staff member a conversation belongs to: whoever wrote the first staff
 * message ("In Klärung mit ..."). Null when no staff member has written yet.
 */
export function responsibleStaffUid(messages) {
  const staff = messages
    .filter((m) => m && m.authorRole === 'Admin' && typeof m.authorUid === 'string')
    .map((m, i) => ({ uid: m.authorUid, at: toMillis(m.createdAt) ?? Infinity, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  return staff.length > 0 ? staff[0].uid : null;
}

/**
 * Whether one message counts as unread for the viewer.
 * - the event owner (organizer): every message by someone else, as before
 * - staff on someone else's event: only the organizer's messages, and only for
 *   the staff member responsible for the conversation (or everyone while no
 *   staff member has answered yet). Colleagues' messages are meant for the
 *   organizer, not for other staff.
 */
export function messageIsUnreadFor(message, { viewerUid, viewerIsOwner, responsibleUid }) {
  if (!message || message.authorUid === viewerUid || message.readByRecipient === true) {
    return false;
  }
  if (viewerIsOwner) return true;
  if (message.authorRole === 'Admin') return false;
  return responsibleUid == null || responsibleUid === viewerUid;
}
