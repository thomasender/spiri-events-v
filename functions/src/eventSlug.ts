// Pure helpers for keeping event URLs (slugs) unique. No Firebase imports so
// they can be unit-tested directly.

/**
 * Strips a collision counter ("-2") that follows the yyyymmdd date suffix, so
 * a renamed slug becomes "…-20261102-3" instead of "…-20261102-2-2".
 */
export function slugBase(slug: string): string {
  return slug.replace(/(-\d{8})-\d+$/, '$1');
}

/**
 * Returns the first slug, starting with `slug` itself, for which `isTaken`
 * resolves false. Collisions get "-2", "-3", … appended to the slug base.
 */
export async function findFreeSlug(
  slug: string,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  if (!(await isTaken(slug))) return slug;
  const base = slugBase(slug);
  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (await isTaken(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

// ── Slug generation (copy of src/lib/slug-helpers.js, guarded by a drift test) ──
// Format: {title}-{category}-in-{ort}-{yyyymmdd}; "Sonstiges" or none is written
// as "veranstaltung". Used for events written by the backend (event import).

const CHAR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ä/g, 'Ae'],
  [/Ö/g, 'Oe'],
  [/Ü/g, 'Ue'],
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/&/g, ' und '],
];
const MAX_TITLE_SLUG_LENGTH = 80;

export function slugify(input: unknown): string {
  if (input == null) return '';
  let str = String(input);
  for (const [pattern, replacement] of CHAR_REPLACEMENTS) str = str.replace(pattern, replacement);
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function capSlugPart(slug: string, max = MAX_TITLE_SLUG_LENGTH): string {
  if (slug.length <= max) return slug;
  let cut = slug.slice(0, max);
  if (slug[max] !== '-' && cut.includes('-')) cut = cut.slice(0, cut.lastIndexOf('-'));
  return cut.replace(/-+$/, '');
}

/** Place shown in the event URL: the Ort, else the Bezirk; '' for online events. */
export function eventSlugPlace(event: {
  isOnline?: unknown;
  city?: unknown;
  bezirk?: unknown;
}): string {
  if (!event || event.isOnline) return '';
  return String(event.city || '').trim() || String(event.bezirk || '');
}

export function generateEventSlug(
  title: string,
  category: string,
  place: string,
  date: string
): string {
  const categorySlug = slugify(category);
  return [
    capSlugPart(slugify(title)),
    !categorySlug || categorySlug === 'sonstiges' ? 'veranstaltung' : categorySlug,
    'in',
    slugify(place) || 'online',
    String(date || '').replace(/-/g, ''),
  ]
    .filter(Boolean)
    .join('-');
}
