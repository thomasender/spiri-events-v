// Pure helpers of the community chat "Lagerfeuer" (docs/chat.md). No Firebase here.

export const CHAT_ROOM_ID = 'lagerfeuer';
export const CHAT_MAX_LENGTH = 500;
export const CHAT_COOLDOWN_MS = 3000;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_MAX_LOADED = 500;
export const CHAT_RETENTION_DAYS = 10;
export const CHAT_MODES = ['off', 'admins', 'all'];

// Mutes/bans: `until` in the far future means permanent.
export const CHAT_PERMANENT_UNTIL_MS = Date.UTC(2999, 11, 31);

export const CHAT_BAN_DURATIONS = [
  { id: '1d', label: '1 Tag stumm', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 Tage stumm', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'permanent', label: 'Dauerhaft sperren', ms: null },
];

// Bidi overrides/isolates can make text read in a misleading order; zero-width
// characters and C0/C1 controls (except tab and newline) are invisible noise.
// ZWJ/ZWNJ (U+200C/D) stay: emoji sequences like family emoji need them.
const UNWANTED_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

export function normalizeChatText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(UNWANTED_CHARS, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Length as users count it: one emoji (even a family or a flag) is one character.
export function chatTextLength(text) {
  if (typeof text !== 'string' || text === '') return 0;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    let count = 0;
    for (const _segment of new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text)) {
      count += 1;
    }
    return count;
  }
  return Array.from(text).length;
}

// Returns { ok, text, error } for text the user wants to send.
export function validateChatText(raw, max = CHAT_MAX_LENGTH) {
  const text = normalizeChatText(raw);
  if (!text) return { ok: false, text, error: 'Die Nachricht ist leer.' };
  if (chatTextLength(text) > max) {
    return {
      ok: false,
      text,
      error: `Die Nachricht darf höchstens ${max} Zeichen lang sein.`,
    };
  }
  return { ok: true, text, error: null };
}

// Seconds the sender still has to wait, 0 when sending is allowed.
export function cooldownRemainingMs(lastSentAtMs, nowMs = Date.now()) {
  if (!lastSentAtMs) return 0;
  return Math.max(0, lastSentAtMs + CHAT_COOLDOWN_MS - nowMs);
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»”’]+$/;

// Splits plain text into [{ type: 'text'|'link', value, href? }]. Only http(s)
// links become links; everything else stays text (React escapes it on render).
export function splitChatLinks(text) {
  if (typeof text !== 'string' || text === '') return [];
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    if (trailing) url = url.slice(0, -trailing.length);
    let href = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') href = parsed.href;
    } catch {
      href = null;
    }
    if (!href) continue;
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    parts.push({ type: 'link', value: url, href });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

// 1-3 emoji and nothing else: shown larger, like in common messengers.
export function isEmojiOnly(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (!/\p{Extended_Pictographic}/u.test(trimmed)) return false;
  // Digits, # and * are Emoji_Component too, but are not emoji on their own.
  if (/[0-9#*]/.test(trimmed)) return false;
  const stripped = trimmed.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\s]/gu, '');
  if (stripped !== '') return false;
  return chatTextLength(trimmed.replace(/\s/g, '')) <= 3;
}

// "Not sent yet" (shown greyed out, no reactions) only while the create of a
// message is unconfirmed, i.e. its `createdAt` server timestamp is unresolved.
// Deliberately NOT `metadata.hasPendingWrites` alone: a reaction write also
// sets that flag, and since its server ack changes no data, Firestore raises
// no snapshot for it (metadata-only change), so the message would stay grey
// until something else in the room happened to change.
export function isUnsentMessage(docSnap) {
  return (
    Boolean(docSnap.metadata?.hasPendingWrites) &&
    docSnap.get('createdAt', { serverTimestamps: 'none' }) == null
  );
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  return null;
}

function viennaDayKey(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(date);
}

// "14:32" today, "Gestern 14:32", else "12.10. 14:32".
export function formatChatTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const time = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const day = viennaDayKey(date);
  if (day === viennaDayKey(now)) return time;
  if (day === viennaDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) {
    return `Gestern ${time}`;
  }
  const short = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  return `${short} ${time}`;
}

// A ban is active while `until` lies in the future.
export function isChatBanActive(ban, now = Date.now()) {
  const until = toDate(ban?.until);
  return Boolean(until) && until.getTime() > now;
}

export function describeChatBan(ban, now = Date.now()) {
  const until = toDate(ban?.until);
  if (!until || until.getTime() <= now) return '';
  if (until.getTime() >= CHAT_PERMANENT_UNTIL_MS - 24 * 60 * 60 * 1000) {
    return 'Du wurdest vom Chat ausgeschlossen.';
  }
  const date = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(until);
  return `Du bist im Chat bis ${date} Uhr stumm geschaltet.`;
}

// Whether the chat is open for this person under the feature flag. Mirrors
// chatAccessible() in firestore.rules (the rules are the real gate).
export function canEnterChat({ mode, isAdmin }) {
  if (mode === 'all') return true;
  if (mode === 'admins') return Boolean(isAdmin);
  return false;
}

export function chatAuthorName(profile, user) {
  const name = (profile?.displayName || user?.displayName || '').trim();
  return (name || 'Gast').slice(0, 80);
}

// Photo URLs the rules accept in a message (firestore.rules, chat_rooms/messages):
// Firebase Storage, Google profile photos and the local emulators. Anything else
// (e.g. a data: URL) is dropped, the chat then shows the initial letter instead.
const CHAT_PHOTO_URL_RE =
  /^(https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9-]+\.googleusercontent\.com)|http:\/\/(127\.0\.0\.1|localhost):[0-9]+)\/.*/;

export function chatPhotoUrl(url) {
  if (typeof url !== 'string' || url.length > 1000) return null;
  return CHAT_PHOTO_URL_RE.test(url) ? url : null;
}

// Presence: a person counts as "at the fire" while their heartbeat is younger
// than PRESENCE_ONLINE_MS. The chat page beats every PRESENCE_BEAT_MS while visible.
export const PRESENCE_BEAT_MS = 60 * 1000;
export const PRESENCE_ONLINE_MS = 2 * 60 * 1000;
export const PRESENCE_TICK_MS = 30 * 1000;

export function onlineMembers(entries, nowMs = Date.now()) {
  return (entries ?? [])
    .filter((e) => typeof e.lastSeenMs === 'number' && nowMs - e.lastSeenMs < PRESENCE_ONLINE_MS)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// "Mira", "Mira und Jonas", "Mira, Jonas und 3 weitere"
export function describeOnline(members, max = 2) {
  const names = members.map((m) => m.name);
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(names.length === 2 ? ' und ' : ', ');
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} und ${rest} weitere`;
}
