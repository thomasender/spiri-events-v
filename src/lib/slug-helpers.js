// Pure slug helpers — no Firebase, no DOM, no env. Safe to import from Node
// scripts (seed/reset/migrate) as well as the browser app.
//
// The event URL format is: {titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}
// Example: "Lasst uns singen" / "Singkreis" / "Dornbirn" / 2026-11-02
//   => "lasst-uns-singen-singkreis-in-dornbirn-20261102"

const CHAR_REPLACEMENTS = [
  [/Ä/g, 'Ae'],
  [/Ö/g, 'Oe'],
  [/Ü/g, 'Ue'],
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/&/g, ' und '],
];

export function slugify(input) {
  if (input == null) return '';
  let str = String(input);
  for (const [pattern, replacement] of CHAR_REPLACEMENTS) {
    str = str.replace(pattern, replacement);
  }
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Fallbacks used when category/bezirk are missing. These keep the URL structure
// `{titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}` parseable and stable.
const CATEGORY_FALLBACK_SLUG = 'sonstiges';
const BEZIRK_FALLBACK_SLUG = 'online';

function slugPart(value, fallback) {
  const s = slugify(value);
  return s || fallback;
}

function dateSlug(date) {
  if (!date) return '';
  return String(date).replace(/-/g, '');
}

// Build the canonical event URL slug from the new inputs (title, category,
// bezirk, date). Always appends the date suffix so each event occurrence has a
// stable, unique URL — matches the format `Lasst-uns-singen-Singkreis-in-dornbirn-20261102`.
export function generateEventSlug(title, category, bezirk, date) {
  const parts = [
    slugify(title),
    slugPart(category, CATEGORY_FALLBACK_SLUG),
    'in',
    slugPart(bezirk, BEZIRK_FALLBACK_SLUG),
    dateSlug(date),
  ].filter(Boolean);
  return parts.join('-');
}

// Pure helper for organizers — kept here so profile/legacy paths stay in sync.
export function slugifyName(name) {
  return slugify(name);
}
