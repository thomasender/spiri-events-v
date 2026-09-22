// Mirrors the slug/date logic in scripts/seed-test-events.mjs so tests don't
// hardcode dates that go stale as the seed data shifts relative to "today".

export function makeSeedDate(dayOffset: number, monthOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setMonth(d.getMonth() + monthOffset);
  return d.toISOString().split('T')[0];
}

const CHAR_REPLACEMENTS: [RegExp, string][] = [
  [/Ä/g, 'Ae'],
  [/Ö/g, 'Oe'],
  [/Ü/g, 'Ue'],
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/&/g, ' und '],
];

function slugify(input: string | null | undefined): string {
  if (input == null) return '';
  let s = String(input);
  for (const [pattern, replacement] of CHAR_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSlug(title: string, place: string, dayOffset: number): string {
  const date = makeSeedDate(dayOffset);
  const titleSlug = slugify(title);
  const placeSlug = slugify(place);
  const dateSlug = date.replace(/-/g, '');

  return [titleSlug, placeSlug, dateSlug].filter(Boolean).join('-');
}
