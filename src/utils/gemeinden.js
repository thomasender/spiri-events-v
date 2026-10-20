// Vorarlberger Gemeinden with their Bezirk. The create-event form lets the
// organizer pick the Gemeinde; the Bezirk (used for filters, URLs, Instagram)
// is derived from it so the two can never contradict each other.
// Source: Wikipedia "Liste der Gemeinden in Vorarlberg" (96 Gemeinden).
import { bezirkLabel } from './regions.js';

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

export const OUTSIDE_BEZIRK = 'Grenznahe';

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

/**
 * "Altach (Bez. Feldkirch)"; "Lindau (Lkr. Lindau)" in Germany; outside
 * Vorarlberg "Ruggell (Umgebung)"; just the Bezirk for events without a city.
 * A city that is its own district (kreisfreie Stadt) is not repeated.
 */
export function formatCityWithBezirk(city, bezirk, subdivisionLabel = 'Bezirk') {
  const name = (city || '').trim();
  if (!name) return bezirkLabel(bezirk) || '';
  if (!bezirk || norm(name) === norm(bezirk)) return name;
  if (bezirk === OUTSIDE_BEZIRK) return `${name} (${bezirkLabel(bezirk)})`;
  return `${name} (${subdivisionLabel === 'Landkreis' ? 'Lkr.' : 'Bez.'} ${bezirk})`;
}

/** Error message for the Ort field of an in-person event, or null when it is valid. */
export function validateCity(city, bezirk) {
  if (!(city || '').trim()) return 'Bitte Ort angeben oder als Online-Event markieren';
  if (findGemeinde(city) || bezirk === OUTSIDE_BEZIRK) return null;
  return 'Bitte wähle eine Gemeinde aus der Liste oder markiere den Ort als außerhalb von Vorarlberg';
}

/** Canonical spelling of a typed Gemeinde, otherwise the trimmed text. */
export function canonicalCity(city) {
  return findGemeinde(city)?.name || (city || '').trim();
}
