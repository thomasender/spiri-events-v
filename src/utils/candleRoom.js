// Pure helpers of the "Kerzenraum": one small chat room per event (docs/chat.md).
// No Firebase here.
import { CHAT_RETENTION_DAYS } from './chat';

// Working title ("Event Chat" for the test phase): rename it here and nowhere else.
export const CANDLE_ROOM_NAME = 'Event Chat';

export const CANDLE_ROOM_COLLECTION = 'event_chats';
export const CANDLE_ROOM_PAGE_SIZE = 50;
const SEEN_KEY_PREFIX = 'candleRoomSeen:';

// Who may read a room under the chat flag. Mirrors candleRoomReadable() in
// firestore.rules: no login needed when the chat is open for all.
export function canReadCandleRoom({ mode, isAdmin }) {
  if (mode === 'all') return true;
  if (mode === 'admins') return Boolean(isAdmin);
  return false;
}

// Writing needs what the Lagerfeuer needs: login and a verified e-mail.
export function canWriteCandleRoom({ mode, isAdmin, user }) {
  return Boolean(user?.emailVerified) && canReadCandleRoom({ mode, isAdmin });
}

// Rooms with a message younger than this are "active" (older ones are purged).
export function candleRoomActiveSince(nowMs = Date.now()) {
  return nowMs - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// When this browser last looked at the room (ms), 0 if never.
export function readCandleRoomSeen(eventId) {
  try {
    const value = Number(storage()?.getItem(SEEN_KEY_PREFIX + eventId));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function markCandleRoomSeen(eventId, atMs) {
  if (!eventId || !atMs) return;
  try {
    if (atMs > readCandleRoomSeen(eventId)) {
      storage()?.setItem(SEEN_KEY_PREFIX + eventId, String(atMs));
    }
  } catch {
    // Private mode: the candle just keeps showing.
  }
}

// The room has news when its last message is newer than the last visit.
export function hasNewCandleMessages(lastMessageAtMs, seenMs) {
  return typeof lastMessageAtMs === 'number' && lastMessageAtMs > (seenMs || 0);
}

// Event ids from { [eventId]: lastMessageAtMs } that have news for this browser.
export function candleNewsIds(activity, readSeen = readCandleRoomSeen) {
  const ids = new Set();
  Object.entries(activity ?? {}).forEach(([eventId, at]) => {
    if (hasNewCandleMessages(at, readSeen(eventId))) ids.add(eventId);
  });
  return ids;
}

// Inside the room: did someone else write after `sinceMs`?
export function hasNewForeignMessages(messages, uid, sinceMs) {
  return (messages ?? []).some(
    (m) => m.authorUid !== uid && typeof m.createdAt === 'number' && m.createdAt > (sinceMs || 0)
  );
}

export function candleRoomHint() {
  return `Neue Nachrichten im ${CANDLE_ROOM_NAME}: Hier tauschen sich Teilnehmende aus, z. B. für Mitfahrgelegenheiten.`;
}
