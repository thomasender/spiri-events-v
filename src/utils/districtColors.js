import { LEGACY_OUTSIDE_BEZIRK, ONLINE_LOCATION } from './regions.js';

// Colour of a district marking (filter chip, badge on event cards ...). Kept free of Firebase
// imports so the pure helpers and their tests can use it. Docs: docs/design-tokens.md.
//
// Lookup order: 1) override in `app_settings/districtColors`, 2) the default below,
// 3) an automatic colour from `AUTO_PALETTE`. White text is always set on top.

export const DISTRICT_COLORS_DOC_PATH = ['app_settings', 'districtColors'];
export const DISTRICT_COLORS_MAX_KEYS = 300;

export const UMGEBUNG_KEY = 'Umgebung';
export const ONLINE_KEY = ONLINE_LOCATION;

export const DISTRICT_COLOR_DEFAULTS = Object.freeze({
  Bregenz: '#B97860',
  Dornbirn: '#BC9367',
  Feldkirch: '#B39A78',
  Bludenz: '#A68B73',
  [UMGEBUNG_KEY]: '#7D8B76',
  [ONLINE_KEY]: '#7C8792',
});

/** Umgebung and Online have one fixed colour each (no automatic one, no collision handling). */
const FIXED_KEYS = new Set([UMGEBUNG_KEY, ONLINE_KEY]);

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Warm sand / earth tones for districts added later. Every entry keeps a contrast of at least
// 3.5 against white text (guarded by tests/components/districtColors.spec.ts) and differs from
// the six defaults.
export const AUTO_PALETTE = Object.freeze([
  '#A47551',
  '#9A7B4F',
  '#8C7A5B',
  '#A0705A',
  '#8F6F4E',
  '#96805A',
  '#85704F',
  '#A5785A',
  '#917A63',
  '#8A7F5C',
  '#9C6F55',
  '#7F7156',
  '#A07C5E',
  '#8E6E5C',
  '#7C8466',
  '#967558',
]);

/** The key a stored district value is coloured under ("Grenznahe" is shown as "Umgebung"). */
export function districtColorKey(name) {
  return name === LEGACY_OUTSIDE_BEZIRK ? UMGEBUNG_KEY : name;
}

/** True for the districts whose colour is fixed in code (Umgebung, Online). */
export const isFixedDistrict = (name) => FIXED_KEYS.has(districtColorKey(name));

// FNV-1a: stable across sessions and engines.
function hashName(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const paletteStart = (name) => hashName(name) % AUTO_PALETTE.length;

/**
 * Automatic colours for a list of district names: the hash of the name picks a palette entry,
 * a name whose entry is taken by an earlier name (alphabetical order, so the result does not
 * depend on the input order) moves on to the next free one. With more names than palette
 * entries the colours repeat.
 */
export function autoDistrictColors(names) {
  const keys = [...new Set((names ?? []).map(districtColorKey))]
    .filter((n) => typeof n === 'string' && n && !(n in DISTRICT_COLOR_DEFAULTS))
    .sort((a, b) => a.localeCompare(b, 'de'));
  const taken = new Set();
  const result = {};
  for (const name of keys) {
    const start = paletteStart(name);
    let index = start;
    for (let step = 0; step < AUTO_PALETTE.length; step += 1) {
      const candidate = (start + step) % AUTO_PALETTE.length;
      if (!taken.has(candidate)) {
        index = candidate;
        break;
      }
    }
    taken.add(index);
    result[name] = AUTO_PALETTE[index];
  }
  return result;
}

/** Only well-formed `#RRGGBB` strings survive; everything else is dropped. */
export function sanitizeDistrictOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && HEX_COLOR_PATTERN.test(value)) out[key] = value;
  }
  return out;
}

/**
 * Colour for a district name.
 * @param {string} name stored district value (a Bezirk / Landkreis, "Grenznahe", "Online")
 * @param {Record<string,string>} [overrides] contents of app_settings/districtColors
 * @param {string[]} [activeNames] districts of the active regions; makes the automatic colours
 *   collision free inside that list
 */
export function getDistrictColor(name, overrides = {}, activeNames = []) {
  const key = districtColorKey(name);
  const override = overrides?.[key];
  if (typeof override === 'string' && HEX_COLOR_PATTERN.test(override)) return override;
  if (key in DISTRICT_COLOR_DEFAULTS) return DISTRICT_COLOR_DEFAULTS[key];
  if (typeof key !== 'string' || !key) return null;
  const auto = autoDistrictColors([...(activeNames ?? []), key]);
  return auto[key];
}
