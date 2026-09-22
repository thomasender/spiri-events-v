// Mirrors the slug/date logic in src/lib/slug-helpers.js so tests don't hardcode
// dates that go stale as the seed data shifts relative to "today".

import { generateEventSlug } from '../../src/lib/slug-helpers.js';

export function makeSeedDate(dayOffset: number, monthOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setMonth(d.getMonth() + monthOffset);
  return d.toISOString().split('T')[0];
}

// Mirrors the new event URL format `{titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}`
// used in the app and seed scripts. Each integration spec calls this with the
// same (title, category, bezirk, dayOffset) the corresponding seed fixture uses,
// so the resulting constant matches the `slug` field written to Firestore.
export function generateSlug(
  title: string,
  category: string,
  bezirk: string,
  dayOffset: number
): string {
  return generateEventSlug(title, category, bezirk, makeSeedDate(dayOffset));
}
