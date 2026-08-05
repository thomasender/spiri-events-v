const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

export function parseContactText(text) {
  if (!text) return [];

  const trimmed = text.trim();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return [{ type: 'email', value: trimmed }];
  }

  if (/^\+?[\d\s\-()/]+$/.test(trimmed) && /\d{3,}/.test(trimmed)) {
    return [{ type: 'phone', value: trimmed.replace(/\s/g, '') }];
  }

  const segments = [];
  let lastIndex = 0;
  const emailMatches = [...trimmed.matchAll(EMAIL_REGEX)];
  const phoneMatches = [...trimmed.matchAll(PHONE_REGEX)];

  const allMatches = [
    ...emailMatches.map((m) => ({ ...m, matchType: 'email' })),
    ...phoneMatches.map((m) => ({ ...m, matchType: 'phone' })),
  ].sort((a, b) => a.index - b.index);

  const filteredMatches = [];
  for (const match of allMatches) {
    const isDuplicate = filteredMatches.some(
      (existing) =>
        match.index >= existing.index && match.index < existing.index + existing[0].length
    );
    if (!isDuplicate) {
      filteredMatches.push(match);
    }
  }

  for (const match of filteredMatches) {
    if (match.index > lastIndex) {
      const textBefore = trimmed.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        segments.push({ type: 'text', value: textBefore });
      }
    }

    const value = match[0];
    if (match.matchType === 'email') {
      segments.push({ type: 'email', value });
    } else {
      segments.push({ type: 'phone', value: value.replace(/\s/g, '') });
    }

    lastIndex = match.index + value.length;
  }

  if (lastIndex < trimmed.length) {
    const textAfter = trimmed.slice(lastIndex);
    if (textAfter.trim()) {
      segments.push({ type: 'text', value: textAfter });
    }
  }

  if (segments.length === 0) {
    return [{ type: 'text', value: trimmed }];
  }

  return segments;
}
