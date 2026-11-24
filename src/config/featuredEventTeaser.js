// Event teaser on the coming-soon page of one region (Trello 6b046602): the
// opening celebration of the Bodensee region. Hard-wired on purpose. Remove
// this file (and the teaser in RegionComingSoonPage) after the event; until
// then the teaser hides itself once `endDate` has passed.
export const FEATURED_EVENT_TEASER = {
  regionId: 'bodensee',
  slug: 'tribe-bodensee-wild-spirit-dance-tanz-in-argenbuehl-20261127',
  eyebrow: 'Eröffnungsfeier',
  // Last day (yyyy-mm-dd, local date) on which the teaser is shown.
  endDate: '2026-11-27',
};

export function localIsoDate(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** The teaser config for a region, or null (other region or past its end date). */
export function featuredEventTeaserFor(regionId, now = new Date()) {
  const cfg = FEATURED_EVENT_TEASER;
  if (!regionId || regionId !== cfg.regionId) return null;
  return cfg.endDate >= localIsoDate(now) ? cfg : null;
}

/** True while the event itself (its last day) is not over yet. */
export function isEventUpcoming(event, now = new Date()) {
  const last = event?.endDate || event?.date;
  return Boolean(last) && last >= localIsoDate(now);
}
