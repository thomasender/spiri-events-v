import { normalizeLink } from './link';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

export const REGISTRATION_MAX_LENGTH = 300;
// Kontakt shares one line with the organizer name in the detail box.
export const KONTAKT_MAX_LENGTH = 40;

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

// Messengers a visitor can reach the organizer with, in display order (Trello
// 6af6d067). Stored as `kontaktMessenger` on the event: a list of these ids.
export const CONTACT_MESSENGERS = Object.freeze([
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'signal', label: 'Signal' },
]);

const MESSENGER_IDS = CONTACT_MESSENGERS.map((m) => m.id);

// E.164 allows at most 15 digits; shorter than 8 is no reachable mobile number.
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

/**
 * Turns a typed phone number into international form (`+436765550000`), or
 * null when it is none. Blanks, brackets, dashes, dots and slashes are dropped,
 * `00` becomes `+`, a leading `0` means Austria (`+43`). Without either prefix
 * the country is unknown: null. A trunk zero after +43 / +49 / +41 is dropped.
 */
export function toInternationalPhone(value) {
  if (typeof value !== 'string') return null;
  // "+43 (0) 676 ..." : the bracketed trunk zero is not dialled from abroad.
  const compact = value
    .trim()
    .replace(/\(0\)/g, '')
    .replace(/[\s()\-./]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits;
  if (compact.startsWith('+')) digits = compact.slice(1);
  else if (compact.startsWith('00')) digits = compact.slice(2);
  else if (compact.startsWith('0')) digits = `43${compact.slice(1)}`;
  else return null;
  // "+43 0676 ..." : a trunk zero typed after the country code (AT, DE, CH).
  digits = digits.replace(/^(43|49|41)0/, '$1');
  if (digits.startsWith('0')) return null;
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  return `+${digits}`;
}

/** The first phone number in the contact text, in international form, or null. */
export function contactPhone(kontakt) {
  const phone = parseContactText(typeof kontakt === 'string' ? kontakt : '').find(
    (segment) => segment.type === 'phone'
  );
  return phone ? toInternationalPhone(phone.value) : null;
}

/** Known messenger ids only, without duplicates, in display order. */
export function normalizeMessengerSelection(selected) {
  if (!Array.isArray(selected)) return [];
  return MESSENGER_IDS.filter((id) => selected.includes(id));
}

/**
 * Links to open a chat with `phone` in the chosen messengers, in display
 * order. Empty when the number cannot be put into international form.
 */
export function messengerLinks(phone, selected) {
  const international = toInternationalPhone(phone);
  if (!international) return [];
  const digits = international.slice(1);
  const hrefs = {
    whatsapp: `https://wa.me/${digits}`,
    telegram: `https://t.me/+${digits}`,
    signal: `https://signal.me/#p/+${digits}`,
  };
  const chosen = normalizeMessengerSelection(selected);
  return CONTACT_MESSENGERS.filter((m) => chosen.includes(m.id)).map((m) => ({
    ...m,
    href: hrefs[m.id],
  }));
}
