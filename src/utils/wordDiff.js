// Small word-level diff (LCS) for the admin change history. Returns segments
// { type: 'same' | 'add' | 'del', text } so the UI can mark removed/added words.

const MAX_TOKENS = 1500;

function tokenize(text) {
  return String(text ?? '').match(/\s+|[^\s]+/g) || [];
}

function merge(segments) {
  const out = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

export function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  // Very long texts: skip the O(n*m) table and show a plain replacement.
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return merge([
      ...(before ? [{ type: 'del', text: String(before) }] : []),
      ...(after ? [{ type: 'add', text: String(after) }] : []),
    ]);
  }

  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      segments.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      segments.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      segments.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) segments.push({ type: 'del', text: a[i++] });
  while (j < b.length) segments.push({ type: 'add', text: b[j++] });
  return merge(segments);
}
