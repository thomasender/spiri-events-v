// Pure slug helpers — no Firebase, no DOM, no env. Safe to import from Node
// scripts (seed/reset/migrate) as well as the browser app.
//
// The event URL format is: {titleSlug}-{categorySlug}-in-{ortSlug}-{yyyymmdd}
// Example: "Lasst uns singen" / "Singkreis" / "Hohenems" / 2026-11-02
//   => "lasst-uns-singen-singkreis-in-hohenems-20261102"
// The place is the event's Ort (`city`); events without one fall back to the
// Bezirk, online events to "online" (see `eventSlugPlace`). The category
// "Sonstiges" (or none) is written as "veranstaltung".
//
// Slugs are generated once, when an event is created. Events created before a
// format change keep their URL (it may have been shared, e.g. on Instagram),
// so nothing here may be used to rewrite an existing slug.

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

// Fallbacks used when category/place are missing. These keep the URL structure
// `{titleSlug}-{categorySlug}-in-{placeSlug}-{yyyymmdd}` parseable and stable.
const CATEGORY_FALLBACK_SLUG = 'veranstaltung';
const PLACE_FALLBACK_SLUG = 'online';

function slugPart(value, fallback) {
  const s = slugify(value);
  return s || fallback;
}

function categorySlug(category) {
  const s = slugify(category);
  return !s || s === 'sonstiges' ? CATEGORY_FALLBACK_SLUG : s;
}

/** Place shown in the event URL: the Ort, else the Bezirk; '' for online events. */
export function eventSlugPlace(event) {
  if (!event || event.isOnline) return '';
  return String(event.city || '').trim() || event.bezirk || '';
}

function dateSlug(date) {
  if (!date) return '';
  return String(date).replace(/-/g, '');
}

// Build the canonical event URL slug from title, category, place (Ort, see
// `eventSlugPlace`) and date. Always appends the date suffix so each event
// occurrence has a stable, unique URL.
export function generateEventSlug(title, category, place, date) {
  const parts = [
    slugify(title),
    categorySlug(category),
    'in',
    slugPart(place, PLACE_FALLBACK_SLUG),
    dateSlug(date),
  ].filter(Boolean);
  return parts.join('-');
}

// Pure helper for organizers — kept here so profile/legacy paths stay in sync.
export function slugifyName(name) {
  return slugify(name);
}

/**
 * Slugs for events that have none yet. Events that already carry a slug are
 * never touched: their URL may already be shared. New slugs get a "-2", "-3",
 * … counter when another event already uses them.
 *
 * @param {{ id: string, data: object }[]} events
 * @returns {{ id: string, slug: string }[]}
 */
export function planMissingEventSlugs(events) {
  const taken = new Set(events.map((e) => e.data?.slug).filter(Boolean));
  const result = [];
  for (const { id, data = {} } of events) {
    if (data.slug) continue;
    const category =
      data.category || (Array.isArray(data.categories) ? data.categories[0] : '') || '';
    const base = generateEventSlug(
      data.title || '',
      category,
      eventSlugPlace(data),
      data.date || ''
    );
    if (!base) continue;
    let slug = base;
    let counter = 2;
    while (taken.has(slug)) slug = `${base}-${counter++}`;
    taken.add(slug);
    result.push({ id, slug });
  }
  return result;
}
