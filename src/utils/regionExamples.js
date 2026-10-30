// Example texts ("z.B. ...") shown as placeholders in the event form, per region.
// Stored optionally on `regions/{id}.texts.examples` (plain text, set by the
// region's moderators in Verwaltung). Pure module: no React, no Firebase.
//
// Shape of `texts` (more keys can be added next to `examples` later):
//   { examples: { place, organizer, address, contact } }

export const EXAMPLE_KEYS = Object.freeze(['place', 'organizer', 'address', 'contact']);
export const EXAMPLE_MAX_LENGTH = 120;

// Neutral wording for regions that have no text of their own yet.
export const NEUTRAL_EXAMPLES = Object.freeze({
  place: 'z.B. Ortsname',
  organizer: 'z.B. Yoga Studio Mitte',
  address: 'z.B. Yogastudio Mitte, Musterstraße 12, PLZ Ort',
  contact: 'z.B. kontakt@email.de',
});

// What the form showed before regions existed. Kept byte-identical while only
// Vorarlberg is active (dark launch) and as Vorarlberg's default afterwards.
export const LEGACY_EXAMPLES = Object.freeze({
  place: 'z.B. Lindau',
  organizer: 'z.B. Peter Mathis oder Yoga Studio Dornbirn',
  address: 'z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz',
  contact: 'z.B. 0676 1234567 oder kontakt@email.de',
});

const LINE_BREAKS = new RegExp('[\\r\\n' + String.fromCharCode(0x2028, 0x2029) + ']+', 'g');

const clean = (v) =>
  typeof v === 'string'
    ? v.replace(LINE_BREAKS, ' ').trim().slice(0, EXAMPLE_MAX_LENGTH).trim()
    : '';

/** Known keys only, plain trimmed single-line strings; empty ones dropped. Returns undefined if nothing is left. */
export function sanitizeTexts(texts) {
  const examples = texts && typeof texts === 'object' ? texts.examples : null;
  if (!examples || typeof examples !== 'object') return undefined;
  const out = {};
  for (const key of EXAMPLE_KEYS) {
    const value = clean(examples[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? { examples: out } : undefined;
}

/** Text of one example field a region stores ('' if none). */
export const customExample = (region, key) => sanitizeTexts(region?.texts)?.examples[key] ?? '';

const withPrefix = (text) => `z.B. ${text}`;

/**
 * Placeholders for the event form of `region`. `regionSpecific` is true when the
 * form works region-aware (two or more active regions); otherwise the legacy
 * Vorarlberg strings stay untouched, whatever is stored.
 * Order per field: stored text of the region > (Ort only) first Bezirk /
 * Landkreis > neutral text (Vorarlberg: the legacy text).
 */
export function formExamples(region, { regionSpecific = false } = {}) {
  if (!regionSpecific) return { ...LEGACY_EXAMPLES };
  const fallback = !region || region.id === 'vorarlberg' ? LEGACY_EXAMPLES : NEUTRAL_EXAMPLES;
  const out = {};
  for (const key of EXAMPLE_KEYS) {
    const custom = customExample(region, key);
    out[key] = custom ? withPrefix(custom) : fallback[key];
  }
  if (!customExample(region, 'place') && fallback === NEUTRAL_EXAMPLES) {
    const first = Array.isArray(region?.bezirke) ? region.bezirke[0] : null;
    // "Innsbruck (Stadt)" -> "Innsbruck", "1. Innere Stadt" -> "Innere Stadt": an Ort, not a Bezirk.
    const name =
      typeof first === 'string'
        ? first
            .replace(/\s*\((Stadt|Landkreis)\)$/, '')
            .replace(/^\d+\.\s*/, '')
            .trim()
        : '';
    if (name) out.place = withPrefix(name);
  }
  return out;
}
