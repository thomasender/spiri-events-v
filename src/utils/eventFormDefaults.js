// "Remember my last answers" of the create-event wizard (Trello 6afd8505): after a save the
// organizer, contact, place, category and fee are kept on the own profile doc
// (`users/{uid}.eventFormDefaults`) and earlier venues in `users/{uid}.savedVenues`, so the
// next new event starts pre-filled. Everything stays editable. Title, date, time,
// description, images, recurrence, Instagram choice and region are never remembered.

export const SAVED_VENUES_MAX = 10;

const TEXT_MAX = 300;

const LOCATION_KEYS = ['place', 'city', 'bezirk', 'cityPicked', 'placeRegionId', 'isOnline'];

const text = (value, max = TEXT_MAX) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

// One venue as the wizard stores it: place = "Adresse / Veranstaltungsort", city = Ort.
export function venueFrom(source) {
  if (!source || typeof source !== 'object') return null;
  const city = text(source.city, 120);
  if (!city) return null;
  return {
    place: text(source.place),
    city,
    bezirk: text(source.bezirk, 120),
    placeRegionId: text(source.placeRegionId, 60),
    cityPicked: true,
  };
}

// Only a venue whose Ort was chosen from the list is worth keeping (validatePlaceChoice).
export function isRememberableVenue(formData) {
  if (!formData || formData.isOnline) return false;
  if (!text(formData.city, 120)) return false;
  return Boolean(formData.cityPicked || formData.placeRegionId);
}

const venueKey = (v) => `${v.city.toLowerCase()}|${v.place.toLowerCase()}`;

// The list with `venue` first (latest used first), duplicates by Ort + Adresse removed, at
// most SAVED_VENUES_MAX entries. An invalid venue leaves the list as it is.
export function mergeVenue(list, venue) {
  const current = (Array.isArray(list) ? list : []).map(venueFrom).filter(Boolean);
  const next = venueFrom(venue);
  if (!next) return current.slice(0, SAVED_VENUES_MAX);
  return [next, ...current.filter((v) => venueKey(v) !== venueKey(next))].slice(
    0,
    SAVED_VENUES_MAX
  );
}

// Venues of the profile, cleaned; with two or more active regions only those of
// `regionId` (a venue without a region belongs to `defaultRegionId`).
export function venuesForRegion(list, { regionId = '', defaultRegionId = '' } = {}) {
  const venues = (Array.isArray(list) ? list : []).map(venueFrom).filter(Boolean);
  if (!regionId) return venues;
  return venues.filter((v) => (v.placeRegionId || defaultRegionId) === regionId);
}

export function venueLabel(venue) {
  return venue.place ? `${venue.place}, ${venue.city}` : venue.city;
}

// What is remembered from the form on a save (submit or draft). `previous` = the defaults
// stored so far: an online event without a place leaves the remembered place untouched.
export function pickDefaults(formData, previous = {}) {
  const f = formData || {};
  const out = {
    organizerName: text(f.organizer?.name, 120),
    kontakt: text(f.kontakt),
    kontaktMessenger: Array.isArray(f.kontaktMessenger)
      ? f.kontaktMessenger.filter((m) => typeof m === 'string').slice(0, 10)
      : [],
    registration: text(f.registration, 500),
    link: text(f.link, 500),
    category: text(f.category, 60),
    contribution: f.contribution === 'fee' ? 'fee' : 'free',
    fee: f.contribution === 'fee' && f.fee !== '' && f.fee != null ? Number(f.fee) : null,
    feeMax:
      f.contribution === 'fee' && f.feeMax !== '' && f.feeMax != null ? Number(f.feeMax) : null,
    priceCurrency: text(f.priceCurrency, 5),
    feeNote: text(f.feeNote, 12),
    firstSessionFree: f.contribution === 'fee' && f.firstSessionFree === true,
  };
  for (const key of ['fee', 'feeMax']) {
    if (!Number.isFinite(out[key])) out[key] = null;
  }
  if (f.isOnline && !text(f.city, 120) && !text(f.place)) {
    // Online without a place: keep the earlier place, do not remember "online".
    for (const key of LOCATION_KEYS) {
      if (previous && previous[key] !== undefined) out[key] = previous[key];
    }
  } else {
    out.place = text(f.place);
    out.city = text(f.city, 120);
    out.bezirk = text(f.bezirk, 120);
    out.placeRegionId = text(f.placeRegionId, 60);
    out.cityPicked = Boolean(f.cityPicked || f.placeRegionId);
    out.isOnline = Boolean(f.isOnline);
  }
  return out;
}

// The category as the registry spells it, '' when it no longer exists.
export function knownCategory(category, categories) {
  const wanted = text(category, 60).toLowerCase();
  if (!wanted) return '';
  return (categories || []).find((c) => c.toLowerCase() === wanted) || '';
}

const isEmpty = (value) => value === '' || value == null || (Array.isArray(value) && !value.length);

// Fills the still-empty fields of a NEW event's form with the remembered values (what the
// person already typed, or a draft, wins). `organizerDefaults` (names) / `kontaktDefault` = the
// profile defaults of Veranstalter and Kontakt, replaced by the remembered ones. Category is applied separately (it needs the
// category list, see knownCategory). `placeAllowed(placeRegionId)` may veto the place.
export function applyEventFormDefaults(
  formData,
  defaults,
  { organizerDefaults = [], kontaktDefault = '', placeAllowed = () => true } = {}
) {
  if (!defaults || typeof defaults !== 'object') return formData;
  const next = { ...formData, organizer: { ...formData.organizer } };
  const fill = (key, value) => {
    if (isEmpty(next[key]) && !isEmpty(value)) next[key] = value;
  };
  const org = text(defaults.organizerName, 120);
  if (org && (!next.organizer.name.trim() || organizerDefaults.includes(next.organizer.name))) {
    next.organizer.name = org;
  }
  if (text(defaults.kontakt) && (isEmpty(next.kontakt) || next.kontakt === kontaktDefault)) {
    next.kontakt = text(defaults.kontakt);
  }
  fill(
    'kontaktMessenger',
    Array.isArray(defaults.kontaktMessenger) ? defaults.kontaktMessenger : []
  );
  fill('registration', text(defaults.registration, 500));
  fill('link', text(defaults.link, 500));

  const noPlaceYet = isEmpty(next.city) && isEmpty(next.place) && !next.isOnline;
  const city = text(defaults.city, 120);
  if (noPlaceYet && !defaults.isOnline && city && placeAllowed(text(defaults.placeRegionId, 60))) {
    next.place = text(defaults.place);
    next.city = city;
    next.bezirk = text(defaults.bezirk, 120);
    next.placeRegionId = text(defaults.placeRegionId, 60);
    next.cityPicked = defaults.cityPicked === true;
  }

  if (next.contribution === 'free' && defaults.contribution === 'fee') {
    next.contribution = 'fee';
    next.fee = Number.isFinite(defaults.fee) ? String(defaults.fee) : '';
    next.feeMax = Number.isFinite(defaults.feeMax) ? String(defaults.feeMax) : '';
    if (text(defaults.priceCurrency, 5)) next.priceCurrency = text(defaults.priceCurrency, 5);
    next.feeNote = text(defaults.feeNote, 12);
    next.firstSessionFree = defaults.firstSessionFree === true;
  }
  return next;
}
