import { normalizeLink } from './link';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

export const REGISTRATION_MAX_LENGTH = 300;

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

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

/**
 * Splits the free text of the "Anmeldung" field into text, link, email and phone
 * segments. Links are `http(s)://` or `www.` addresses (trailing punctuation is
 * not part of the link); e-mail and phone numbers reuse parseContactText.
 * Link segments carry `href` (always https) next to the displayed `value`.
 */
export function parseRegistrationText(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return [];

  const segments = [];
  let lastIndex = 0;
  // parseContactText trims its input; keep the blanks around links readable.
  const pushText = (chunk) => {
    if (!chunk.trim()) {
      if (chunk && segments.length) segments.push({ type: 'text', value: ' ' });
      return;
    }
    const parsed = parseContactText(chunk);
    if (/^\s/.test(chunk) && segments.length) {
      if (parsed[0].type === 'text') parsed[0] = { ...parsed[0], value: ` ${parsed[0].value}` };
      else parsed.unshift({ type: 'text', value: ' ' });
    }
    if (/\s$/.test(chunk)) {
      const last = parsed[parsed.length - 1];
      if (last.type === 'text') parsed[parsed.length - 1] = { ...last, value: `${last.value} ` };
      else parsed.push({ type: 'text', value: ' ' });
    }
    segments.push(...parsed);
  };

  for (const match of trimmed.matchAll(URL_REGEX)) {
    const value = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
    if (!value) continue;
    pushText(trimmed.slice(lastIndex, match.index));
    segments.push({ type: 'link', value, href: normalizeLink(value) });
    lastIndex = match.index + value.length;
  }
  pushText(trimmed.slice(lastIndex));

  return segments;
}
