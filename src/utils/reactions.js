// Emoji reactions on chat and private messages (docs/chat.md, docs/messenger.md).
// The set is fixed; firestore.rules has the same list (keep both in sync).
// Stored on the message itself as `reactions: { [uid]: emoji }`, so one
// reaction per person and message, and it disappears with the message.

export const REACTIONS = [
  { emoji: '👍', label: 'Daumen hoch' },
  { emoji: '❤️', label: 'Herz' },
  { emoji: '😂', label: 'Lachen' },
  { emoji: '😮', label: 'Staunen' },
  { emoji: '🙏', label: 'Danke' },
];

export const REACTION_EMOJIS = REACTIONS.map((r) => r.emoji);

// Double-tap / double-click sets this one.
export const QUICK_REACTION = '❤️';

export function reactionLabel(emoji) {
  return REACTIONS.find((r) => r.emoji === emoji)?.label ?? emoji;
}

// Only whitelisted values survive; anything else in the data is ignored.
export function sanitizeReactions(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([uid, emoji]) => {
    if (REACTION_EMOJIS.includes(emoji)) out[uid] = emoji;
  });
  return out;
}

// Pills under a bubble: one per used emoji, in the fixed order.
export function summarizeReactions(reactions, me) {
  const counts = new Map();
  Object.values(reactions ?? {}).forEach((emoji) => {
    if (REACTION_EMOJIS.includes(emoji)) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  });
  const mine = me ? reactions?.[me] : undefined;
  return REACTION_EMOJIS.filter((emoji) => counts.has(emoji)).map((emoji) => ({
    emoji,
    count: counts.get(emoji),
    mine: mine === emoji,
  }));
}

// Choosing the emoji you already have removes it (null); anything else replaces it.
export function nextReaction(current, chosen) {
  return current === chosen ? null : chosen;
}
