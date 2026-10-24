import { COUNTRY_LABELS, bezirkLabel } from './regions';

// Search as you type over the region register: finds a region by its own name
// or by one of its Bezirke / Landkreise ("München" -> Bayern). Pure and free of
// Firebase so it can be unit tested; the register passed in is the merged one
// (`useRegion().allRegions`), so Firestore overrides of `bezirke` are searched.

export const MAX_SEARCH_RESULTS = 8;

/**
 * Case, accent and umlaut insensitive form used on both sides of the match:
 * "Zürich", "Zuerich" and "zurich" all become "zurich"; "ß" becomes "ss".
 */
export function foldSearchText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae|oe|ue/g, (m) => m[0])
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * One entry per region and per Bezirk / Landkreis. A Bezirk that is named like
 * its region (Wien) adds nothing and is skipped, as is the legacy "Grenznahe".
 * `regions`: [{ slug, name, country, bezirke, subdivisionLabel }].
 */
export function buildRegionSearchIndex(regions) {
  const entries = [];
  for (const region of regions ?? []) {
    const regionKey = foldSearchText(region.name);
    entries.push({
      kind: 'region',
      slug: region.slug,
      label: region.name,
      detail: COUNTRY_LABELS[region.country] ?? '',
      key: regionKey,
      order: region.order ?? 0,
    });
    const seen = new Set([regionKey]);
    for (const bezirk of region.bezirke ?? []) {
      if (bezirk === 'Grenznahe') continue;
      const key = foldSearchText(bezirk);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        kind: 'bezirk',
        slug: region.slug,
        label: bezirkLabel(bezirk),
        detail: `${region.subdivisionLabel ?? 'Bezirk'} in ${region.name}`,
        key,
        order: region.order ?? 0,
      });
    }
  }
  return entries;
}

// 0 exact, 1 starts with, 2 a later word starts with, 3 contains; null = no match.
function rank(key, q) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(` ${q}`)) return 2;
  if (key.includes(q)) return 3;
  return null;
}

/**
 * Best matches first: better match type, then regions before districts, then
 * register order, then name. A district hit is dropped when its own region
 * already matches at least as well (typing "Tirol" lists Tirol, not every
 * "... in Tirol").
 */
export function searchRegions(index, query, limit = MAX_SEARCH_RESULTS) {
  const q = foldSearchText(query);
  if (!q) return [];
  const hits = [];
  for (const entry of index) {
    const r = rank(entry.key, q);
    if (r !== null) hits.push({ entry, r });
  }
  hits.sort(
    (a, b) =>
      a.r - b.r ||
      (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === 'region' ? -1 : 1) ||
      a.entry.order - b.entry.order ||
      a.entry.label.localeCompare(b.entry.label, 'de')
  );
  const regionRank = new Map(
    hits.filter((h) => h.entry.kind === 'region').map((h) => [h.entry.slug, h.r])
  );
  return hits
    .filter((h) => h.entry.kind === 'region' || !(regionRank.get(h.entry.slug) <= h.r))
    .slice(0, limit)
    .map((h) => h.entry);
}
