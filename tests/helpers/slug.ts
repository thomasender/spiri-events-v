// Mirrors the slug/date logic in scripts/seed-test-events.mjs so tests don't
// hardcode dates that go stale as the seed data shifts relative to "today".

export function makeSeedDate(dayOffset: number, monthOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setMonth(d.getMonth() + monthOffset);
  return d.toISOString().split('T')[0];
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSlug(title: string, place: string, dayOffset: number): string {
  const date = makeSeedDate(dayOffset);
  const titleSlug = normalize(title);
  const placeSlug = normalize(place);
  const dateSlug = date.replace(/-/g, '');

  return [titleSlug, placeSlug, dateSlug].filter(Boolean).join('-');
}
