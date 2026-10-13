// Regions an event or a directory listing can be assigned to. Kept free of
// Firebase imports so pure helpers (and their unit tests) can use it.
export const BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];

export const ONLINE_LOCATION = 'Online';

// The stored value 'Grenznahe' stays as is (existing events, filters and URLs
// depend on it); only what users read is "Umgebung".
const BEZIRK_LABELS = { Grenznahe: 'Umgebung' };

export function bezirkLabel(bezirk) {
  return BEZIRK_LABELS[bezirk] || bezirk;
}


// URL slugs of the nine Austrian Bundeslaender (ASCII, umlauts transliterated).
// Single source: username.js reserves them so no profile can shadow a future
// region address (`/tirol`, `/wien`, ...).
export const REGION_SLUGS = [
  'vorarlberg',
  'tirol',
  'salzburg',
  'kaernten',
  'steiermark',
  'oberoesterreich',
  'niederoesterreich',
  'wien',
  'burgenland',
];
