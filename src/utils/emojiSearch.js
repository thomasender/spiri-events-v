// Emoji search for the chat: German names/keywords and :shortcodes. The index
// (src/data/emojiIndex.json, built by scripts/build-emoji-data.mjs) is loaded
// on first use so it stays out of the main bundle.

export const MAX_EMOJI_RESULTS = 60;
export const MAX_EMOJI_SUGGESTIONS = 6;

let indexPromise = null;

// "Süß" -> "suss", "Gebet" -> "gebet", "zusammengelegte_handflachen" -> "zusammengelegte handflachen"
export function normalizeSearch(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function buildEmojiIndex(rows) {
  return rows.map(([emoji, label, tags, codes]) => ({
    emoji,
    label,
    codes,
    normLabel: normalizeSearch(label),
    normTags: tags.map(normalizeSearch),
    normCodes: codes.map(normalizeSearch),
  }));
}

export function loadEmojiIndex() {
  if (!indexPromise) {
    indexPromise = import('../data/emojiIndex.json')
      .then((mod) => buildEmojiIndex(mod.default))
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

const startsWord = (text, q) => text === q || text.startsWith(`${q}`) || text.includes(` ${q}`);

// Lower is better, null = no match.
function score(entry, q) {
  if (entry.normCodes.includes(q)) return 0;
  if (entry.normLabel === q || entry.normTags.includes(q)) return 1;
  if (entry.normCodes.some((c) => c.startsWith(q))) return 2;
  if (entry.normLabel.startsWith(q)) return 3;
  if (entry.normTags.some((t) => t.startsWith(q))) return 4;
  if (startsWord(entry.normLabel, q)) return 5;
  if (entry.normLabel.includes(q) || entry.normTags.some((t) => t.includes(q))) return 6;
  return null;
}

// Every word of the query must match; the worst word decides the rank.
export function searchEmojis(index, query, limit = MAX_EMOJI_RESULTS) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!index || words.length === 0) return [];
  const hits = [];
  index.forEach((entry, position) => {
    let worst = 0;
    for (const w of words) {
      const s = score(entry, w);
      if (s === null) return;
      worst = Math.max(worst, s);
    }
    hits.push({ entry, worst, position });
  });
  hits.sort((a, b) => a.worst - b.worst || a.position - b.position);
  return hits.slice(0, limit).map((h) => h.entry);
}

// ":fire" right before the caret (start of text or after whitespace), at least
// two characters. Returns { start, end, query, closed } or null; `closed` is
// true for ":fire:".
const TOKEN_RE = /(^|\s):([\p{L}\p{N}_+-]{2,})(:?)$/u;

export function findShortcodeToken(text, caret = text.length) {
  const before = String(text ?? '').slice(0, caret);
  const match = before.match(TOKEN_RE);
  if (!match) return null;
  const whole = match[0].slice(match[1].length);
  return {
    start: caret - whole.length,
    end: caret,
    query: match[2],
    closed: match[3] === ':',
  };
}

// The emoji whose shortcode equals `name` exactly, for ":fire:" auto-replace.
export function exactShortcode(index, name) {
  const q = normalizeSearch(name);
  return index?.find((e) => e.normCodes.includes(q)) ?? null;
}

export function replaceToken(text, token, emoji) {
  return `${text.slice(0, token.start)}${emoji}${text.slice(token.end)}`;
}
