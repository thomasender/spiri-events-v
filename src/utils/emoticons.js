// Classic text emoticons (":)", "<3") turned into emoji while typing.
// Only whole words count, so URLs like "https://" or times like "12:30" stay untouched.

const GROUPS = [
  ['🙂', [':)', ':-)', '(:']],
  ['😀', [':D', ':-D']],
  ['😆', ['xD', 'XD']],
  ['😉', [';)', ';-)']],
  ['🙁', [':(', ':-(']],
  ['😢', [":'(", ":'-("]],
  ['😛', [':P', ':p', ':-P', ':-p']],
  ['😮', [':O', ':o', ':-O', ':-o']],
  ['😘', [':*', ':-*']],
  ['😕', [':/', ':-/']],
  ['😐', [':|', ':-|']],
  ['😎', ['8)', 'B)', '8-)', 'B-)']],
  ['😇', ['O:)', 'O:-)']],
  ['😠', ['>:(', '>:-(']],
  ['😊', ['^^']],
  ['❤️', ['<3']],
  ['💔', ['</3']],
];

export const EMOTICONS = new Map(
  GROUPS.flatMap(([emoji, codes]) => codes.map((code) => [code, emoji]))
);

// Longest first, so "</3" is not read as "<3" and ":-)" not as ":)".
const ALTERNATIVES = [...EMOTICONS.keys()]
  .sort((a, b) => b.length - a.length)
  .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const AFTER_SPACE_RE = new RegExp(`(^|\\s)(${ALTERNATIVES})(\\s)$`);
const AT_END_RE = new RegExp(`(^|\\s)(${ALTERNATIVES})$`);

// The user just typed a space/newline after an emoticon, right before the caret.
// Returns { text, caret, original } with the emoticon replaced, or null.
export function replaceEmoticonBeforeCaret(text, caret = text.length) {
  const before = String(text ?? '').slice(0, caret);
  const match = before.match(AFTER_SPACE_RE);
  if (!match) return null;
  const code = match[2];
  const start = caret - code.length - match[3].length;
  const emoji = EMOTICONS.get(code);
  return {
    text: `${text.slice(0, start)}${emoji}${match[3]}${text.slice(caret)}`,
    caret: start + emoji.length + match[3].length,
    original: `${code}${match[3]}`,
    replacedLength: emoji.length + match[3].length,
    start,
  };
}

// A message ending in an emoticon ("Danke :)") is converted when it is sent.
export function replaceTrailingEmoticon(text) {
  const match = String(text ?? '').match(AT_END_RE);
  if (!match) return text;
  return `${text.slice(0, text.length - match[2].length)}${EMOTICONS.get(match[2])}`;
}
