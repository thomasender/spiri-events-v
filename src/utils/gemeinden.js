// Vorarlberger Gemeinden with their Bezirk. The create-event form lets the
// organizer pick the Gemeinde; the Bezirk (used for filters, URLs, Instagram)
// is derived from it so the two can never contradict each other.
// Source: Wikipedia "Liste der Gemeinden in Vorarlberg" (96 Gemeinden).
import { LEGACY_OUTSIDE_BEZIRK, bezirkLabel, districtNameHasKind } from './regions.js';

const BY_BEZIRK = {
  Bludenz: [
    'Bartholomäberg',
    'Blons',
    'Bludenz',
    'Bludesch',
    'Brand',
    'Bürs',
    'Bürserberg',
    'Dalaas',
    'Fontanella',
    'Gaschurn',
    'Innerbraz',
    'Klösterle',
    'Lech',
    'Lorüns',
    'Ludesch',
    'Nenzing',
    'Nüziders',
    'Raggal',
    'St. Anton im Montafon',
    'St. Gallenkirch',
    'St. Gerold',
    'Schruns',
    'Silbertal',
    'Sonntag',
    'Stallehr',
    'Thüringen',
    'Thüringerberg',
    'Tschagguns',
    'Vandans',
  ],
  Bregenz: [
    'Alberschwende',
    'Andelsbuch',
    'Au',
    'Bezau',
    'Bildstein',
    'Bizau',
    'Bregenz',
    'Buch',
    'Damüls',
    'Doren',
    'Egg',
    'Eichenberg',
    'Fußach',
    'Gaißau',
    'Hard',
    'Hittisau',
    'Höchst',
    'Hörbranz',
    'Hohenweiler',
    'Kennelbach',
    'Krumbach',
    'Langen bei Bregenz',
    'Langenegg',
    'Lauterach',
    'Lingenau',
    'Lochau',
    'Mellau',
    'Mittelberg',
    'Möggers',
    'Reuthe',
    'Riefensberg',
    'Schnepfau',
    'Schoppernau',
    'Schröcken',
    'Schwarzach',
    'Schwarzenberg',
    'Sibratsgfäll',
    'Sulzberg',
    'Warth',
    'Wolfurt',
  ],
  Dornbirn: ['Dornbirn', 'Hohenems', 'Lustenau'],
  Feldkirch: [
    'Altach',
    'Düns',
    'Dünserberg',
    'Feldkirch',
    'Frastanz',
    'Fraxern',
    'Göfis',
    'Götzis',
    'Klaus',
    'Koblach',
    'Laterns',
    'Mäder',
    'Meiningen',
    'Rankweil',
    'Röns',
    'Röthis',
    'Satteins',
    'Schlins',
    'Schnifis',
    'Sulz',
    'Übersaxen',
    'Viktorsberg',
    'Weiler',
    'Zwischenwasser',
  ],
};

export const GEMEINDEN = Object.entries(BY_BEZIRK)
  .flatMap(([bezirk, names]) => names.map((name) => ({ name, bezirk })))
  .sort((a, b) => a.name.localeCompare(b.name, 'de'));

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\bsankt\b/g, 'st.')
    .replace(/\s+/g, ' ');

const BY_NAME = new Map(GEMEINDEN.map((g) => [norm(g.name), g]));

/** The canonical Gemeinde for typed text (case/"Sankt" tolerant), or null. */
export function findGemeinde(text) {
  return BY_NAME.get(norm(text)) || null;
}

const SUBDIVISION_ABBREVIATIONS = { Bezirk: 'Bez.', Landkreis: 'Lkr.' };

// "Kempten (Allgäu)" and "Kempten" are the same place.
const plainName = (s) => norm(String(s).replace(/\([^)]*\)/g, ' '));

/**
 * "Altach (Bez. Feldkirch)"; "Vaduz (Landesteil Oberland)" in Liechtenstein; old events with the
 * legacy "Grenznahe" "Ruggell (Umgebung)"; a place without Bezirk just its name; just the
 * Bezirk for events without a city.
 * Germany (district names carry their kind): "Garching (Lkr. München)" for "Landkreis München",
 * "Waiblingen (Rems-Murr-Kreis)", "Jever (Lkr. Friesland)"; a kreisfreie Stadt is not repeated
 * ("München" in "Stadt München", "Kempten" in "Stadt Kempten (Allgäu)").
 */
export function formatCityWithBezirk(city, bezirk, subdivisionLabel = 'Bezirk') {
  const name = (city || '').trim();
  if (!name) return bezirkLabel(bezirk) || '';
  if (!bezirk || norm(name) === norm(bezirk)) return name;
  if (bezirk === LEGACY_OUTSIDE_BEZIRK) return `${name} (${bezirkLabel(bezirk)})`;
  if (subdivisionLabel === 'Landkreis') {
    const stadt = bezirk.match(/^Stadt (.+)$/);
    if (stadt && plainName(stadt[1]) === plainName(name)) return name;
    const landkreis = bezirk.match(/^Landkreis (.+)$/);
    if (landkreis) return `${name} (Lkr. ${landkreis[1]})`;
    if (districtNameHasKind(bezirk)) return `${name} (${bezirk})`;
  }
  const prefix = SUBDIVISION_ABBREVIATIONS[subdivisionLabel] ?? subdivisionLabel;
  return `${name} (${prefix} ${bezirk})`;
}

/**
 * Error message for the Ort field of an in-person event, or null when it is valid. Any place
 * counts: a Gemeinde, a place of the place list (its Bezirk / Landkreis and region follow from
 * it) or free text that is not in any list (Liechtenstein, outside DACH: no Bezirk, the event
 * stays in the current region).
 */
export function validateCity(city) {
  if (!(city || '').trim()) return 'Bitte Ort angeben oder als Online-Event markieren';
  return null;
}

/** Canonical spelling of a typed Gemeinde, otherwise the trimmed text. */
export function canonicalCity(city) {
  return findGemeinde(city)?.name || (city || '').trim();
}
