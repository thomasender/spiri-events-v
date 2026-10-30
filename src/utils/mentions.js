// Pure helpers for @mentions in the Lagerfeuer and the Kerzenräume (docs/chat.md).
// No Firebase here.
//
// A message stores plain text ("Hallo @Anna Maria") plus `mentions: { [uid]: name }`.
// The map says unambiguously which person a name means (names contain spaces and
// can repeat); an "@Name" without an entry in the map stays ordinary text.

// Upper bound per message. Every mention costs the server one notification
// document, so the cap keeps one message from pinging half the community.
// Keep in sync with MENTION_MAX in functions/src/chatLogic.ts and the rules.
export const MENTION_MAX = 10;
export const MENTION_QUERY_MAX = 40;
const MENTION_NAME_MAX = 80;
const WORD_CHAR = '[\\p{L}\\p{N}_]';

// Lower case, no accents, single spaces: "Zoë  Müller" -> "zoe muller". The search
// field `mentionName` on the public profile is built with the same function.
export function foldName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// The "@que" before the caret, or null. The @ must start a word, so an e-mail
// address ("a@b.at") never opens the list. Up to three words, because names have spaces.
export function findMentionToken(text, caret = String(text ?? '').length) {
  const before = String(text ?? '').slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length === 0 || query.length > MENTION_QUERY_MAX) return null;
  if (/^\s|[\n@]|\s{2}/.test(query)) return null;
  if (query.trim().split(' ').length > 3) return null;
  return { start: at, end: caret, query };
}

// What the search compares with `mentionName`: folded, a trailing space kept
// so that "anna " no longer matches once a finished name is followed by a space.
export function foldQuery(query) {
  const folded = foldName(query);
  return /\s$/.test(String(query ?? '')) && folded ? `${folded} ` : folded;
}

// Replaces the "@que" with "@Name " and returns the new text and caret.
export function replaceMentionToken(text, token, name) {
  const insert = `@${name} `;
  const next = `${text.slice(0, token.start)}${insert}${text.slice(token.end)}`;
  return { text: next, caret: token.start + insert.length };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cleans a `mentions` map from storage or from the composer: strings only,
// trimmed, at most MENTION_MAX entries.
export function sanitizeMentions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [uid, value] of Object.entries(raw)) {
    if (Object.keys(clean).length >= MENTION_MAX) break;
    if (!uid || uid.length > 128 || typeof value !== 'string') continue;
    const name = value.trim();
    if (name && name.length <= MENTION_NAME_MAX) clean[uid] = name;
  }
  return clean;
}

function mentionRegExp(names) {
  const alternatives = [...new Set(names)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@(${alternatives.join('|')})(?!${WORD_CHAR})`, 'gu');
}

// The entries of `picked` (uid -> name) whose "@Name" is still in the text.
// Deleting the name from the draft drops the mention.
export function mentionsInText(text, picked) {
  const candidates = sanitizeMentions(picked);
  const names = Object.values(candidates);
  if (names.length === 0) return {};
  const found = new Set();
  const re = mentionRegExp(names);
  for (const match of String(text ?? '').matchAll(re)) found.add(match[2]);
  const result = {};
  for (const [uid, name] of Object.entries(candidates)) {
    if (found.has(name)) result[uid] = name;
  }
  return result;
}

// Splits a text into plain and mention parts for rendering:
// [{ type: 'text', value }, { type: 'mention', value: '@Anna', uid }].
export function splitMentions(text, mentions) {
  const value = String(text ?? '');
  const clean = sanitizeMentions(mentions);
  const entries = Object.entries(clean);
  if (entries.length === 0) return [{ type: 'text', value }];
  const uidByName = new Map();
  for (const [uid, name] of entries) if (!uidByName.has(name)) uidByName.set(name, uid);
  const parts = [];
  let cursor = 0;
  for (const match of value.matchAll(mentionRegExp(entries.map(([, name]) => name)))) {
    const start = match.index + match[1].length;
    if (start > cursor) parts.push({ type: 'text', value: value.slice(cursor, start) });
    parts.push({ type: 'mention', value: `@${match[2]}`, uid: uidByName.get(match[2]) });
    cursor = start + match[2].length + 1;
  }
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) });
  return parts;
}

// Where a mention notification leads: the message in the Lagerfeuer or in the
// Kerzenraum at the bottom of the event page.
export function mentionLink(mention) {
  if (mention?.kind === 'donation') return '/admin';
  if (mention?.kind === 'event') {
    const slug = mention.eventSlug || mention.eventId;
    return slug ? `/event/${slug}#msg-${mention.messageId}` : '/';
  }
  return `/chat#msg-${mention?.messageId}`;
}

// "Anna hat dich im Lagerfeuer erwähnt" / "... im Kerzenraum von «Yoga»".
export function describeMention(mention, roomName) {
  if (mention?.kind === 'donation') return mention.excerpt || 'Neue Spende';
  const who = mention?.fromName || 'Jemand';
  if (mention?.kind === 'event') {
    return mention.eventTitle
      ? `${who} hat dich im ${roomName} von „${mention.eventTitle}“ erwähnt`
      : `${who} hat dich in einem ${roomName} erwähnt`;
  }
  return `${who} hat dich im Lagerfeuer erwähnt`;
}
