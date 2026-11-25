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
 * Pending event ids that still call for the reviewer's attention (JtOsYv7n).
 * An event "in Klärung" (a message thread exists) is already being handled, so
 * it drops out until the organizer answers (unread message) or edits it
 * (unread alert). `hasMessages` / `unreadMessages` are keyed by event id.
 */
export function reviewAttentionIds(
  pendingIds,
  hasMessages = {},
  unreadMessages = {},
  unreadAlerts = {}
) {
  return pendingIds.filter(
    (id) => !hasMessages[id] || (unreadMessages[id] || 0) > 0 || Boolean(unreadAlerts[id])
  );
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

// ── Team notes (`staff_notifications`, Trello 6afc59ed) ──────────────────
// Written by the functions (functions/src/staffNotifications.ts): a new
// moderator application, the three-day reminder, a new moderator.

export const TEAM_CHANNEL_HINT =
  'Denk daran, die neue Person in eure Team-Gruppe einzuladen, über die ihr euch austauscht (meist WhatsApp, Signal oder Telegram).';

/**
 * Region label of a note: null while fewer than two regions are active (dark
 * launch: no region names). `nameOf(id)` gives a region's name.
 */
export function staffNotificationRegionLabel(notification, { multiRegion, nameOf }) {
  if (!multiRegion) return null;
  const ids = Array.isArray(notification?.regionIds) ? notification.regionIds : [];
  if (ids.length === 0) return 'ohne bestimmte Region';
  return ids.map((id) => nameOf(id)).join(', ');
}

/** Title, text and hint of a note, in plain German. */
export function staffNotificationText(notification, regionLabel = null) {
  const name = notification?.name || 'Jemand';
  const suffix = regionLabel ? ` (${regionLabel})` : '';
  switch (notification?.kind) {
    case 'application':
      return {
        title: `${name} möchte Moderator:in werden${suffix}`,
        body: 'Neue Bewerbung. Meldet euch bei der Person und ladet sie ein, wenn es passt.',
        hint: TEAM_CHANNEL_HINT,
      };
    case 'applicationReminder':
      return {
        title: `Erinnerung: Die Bewerbung von ${name} ist seit drei Tagen offen${suffix}`,
        body: 'Bisher hat niemand aus dem Team die Person eingeladen.',
        hint: null,
      };
    case 'newModerator':
      return {
        title: regionLabel ? `Neue:r Moderator:in für ${regionLabel}` : 'Neue:r Moderator:in',
        body: `${name} hat die Einführung abgeschlossen und ist jetzt Moderator:in.`,
        hint: notification.audience === 'moderator' ? TEAM_CHANNEL_HINT : null,
      };
    default:
      return { title: name, body: '', hint: null };
  }
}

/**
 * The button "Jetzt <Name> als Moderator hinzufügen" of an application note.
 * `status` of `moderator_applications/{id}`: 'open' | 'invited' | 'done', or
 * null while it loads / cannot be read. Once the onboarding is done it stays
 * visible but inactive.
 */
export function applicantInviteButton(status, name) {
  const who = name || 'die Person';
  if (status === 'done') return { disabled: true, label: `${who} ist schon Moderator:in` };
  return { disabled: status == null, label: `Jetzt ${who} als Moderator hinzufügen` };
}

/** Plain German message for a failed inviteModeratorApplicant call. */
export function applicantInviteErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const message = String(err?.message || '');
  switch (code) {
    case 'failed-precondition':
      if (/already a moderator/i.test(message)) return 'Diese Person ist schon Moderator:in.';
      if (/own role/i.test(message)) return 'Du kannst dich nicht selbst einladen.';
      return 'Diese Person hat schon eine Rolle im Team und kann hier nicht eingeladen werden.';
    case 'invalid-argument':
      if (/region/i.test(message)) return 'Bitte wähle zuerst eine Region aus.';
      return 'Die Bewerbung konnte nicht gelesen werden. Bitte lade die Seite neu.';
    case 'permission-denied':
      return 'Du kannst nur Bewerbungen aus deiner eigenen Region bearbeiten.';
    case 'not-found':
      return 'Diese Bewerbung gibt es nicht mehr.';
    case 'resource-exhausted':
      return 'Das waren gerade sehr viele Einladungen. Bitte warte ein paar Minuten.';
    case 'unauthenticated':
      return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}
