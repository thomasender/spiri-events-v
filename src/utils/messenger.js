// Pure helpers of the private messenger "Postfach" (docs/messenger.md). No Firebase here.

export const DM_MAX_LENGTH = 1000;
export const DM_RETENTION_DAYS = 90;
export const DM_COOLDOWN_MS = 2000;
export const DM_PAGE_SIZE = 50;
export const DM_MAX_LOADED = 500;
export const DM_SNIPPET_LENGTH = 120;
export const DM_REPORT_MESSAGES = 6;

// A conversation is 1:1; its id is the two uids, sorted and joined by "_".
// KEEP IN SYNC with the dm_threads rules in firestore.rules.
export function threadIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

export function otherUid(threadOrId, me) {
  const ids = Array.isArray(threadOrId?.participants)
    ? threadOrId.participants
    : String(threadOrId ?? '').split('_');
  return ids.find((id) => id && id !== me) ?? null;
}

// Single line for the conversation list: line breaks become spaces, long text is cut.
export function dmSnippet(text) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(flat);
  return chars.length > DM_SNIPPET_LENGTH
    ? `${chars.slice(0, DM_SNIPPET_LENGTH - 1).join('')}…`
    : flat;
}

// Unread = the last message is from the other person and newer than my "read until".
export function isThreadUnread(thread, me) {
  if (!thread || !thread.lastMessageAt || thread.lastMessageBy === me) return false;
  const readAt = thread.readAt?.[me] ?? 0;
  return thread.lastMessageAt > readAt;
}

export function countUnreadThreads(threads, me) {
  return threads.filter((t) => isThreadUnread(t, me)).length;
}

// Plain text for the admins: who wrote what, oldest first.
export function buildReportExcerpt(messages, nameOf, limit = DM_REPORT_MESSAGES) {
  return messages
    .slice(-limit)
    .map((m) => `${nameOf(m.authorUid)}: ${String(m.text).slice(0, 400)}`)
    .join('\n')
    .slice(0, 3000);
}
