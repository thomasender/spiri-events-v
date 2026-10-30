#!/usr/bin/env node
// Builds the static region register data from the product owner's list
// (scripts/data/regions-countries.csv: country, region, Bezirk) plus the
// German Landkreise (scripts/data/de-kreise.json). Writes
//   src/data/regionData.js          (client)
//   functions/src/regionData.ts     (Cloud Functions copy; functions/ cannot import src/)
// Run after changing a CSV or the metadata below:  node scripts/build-region-data.mjs
// tests/lib/functionsRegions.spec.ts guards that both copies stay identical.
//
// Germany: the CSV only lists cities, so the Bezirk level there ("Landkreis")
// comes from the official Kreis list (Destatis GV-ISys via the npm package
// `landkreise-deutschland`, CC-BY-4.0, status 31.12.2018, Eisenach removed:
// merged into the Wartburgkreis in 2021). Names of kreisfreie Staedte lose their
// suffix ("Koeln, Stadt" -> "Koeln"); a city and a Landkreis with the same name
// become "X (Stadt)" / "X (Landkreis)".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');

// slug, name, + wording. Missing inPhrase -> "in <name>", missing forPhrase ->
// <name>. `demonym` is the complete token for "Dein <demonym> Kalender".
// Order = register order (Austria as before, then Germany, then Switzerland).
const META = {
  // Austria (unchanged wording)
  Vorarlberg: { slug: 'vorarlberg', demonym: 'Vorarlberger' },
  Tirol: { slug: 'tirol', demonym: 'Tiroler' },
  Salzburg: { slug: 'salzburg', demonym: 'Salzburger' },
  Kärnten: { slug: 'kaernten', demonym: 'Kärntner' },
  Steiermark: {
    slug: 'steiermark',
    demonym: 'steirischer',
    inPhrase: 'in der Steiermark',
    forPhrase: 'die Steiermark',
  },
  Oberösterreich: { slug: 'oberoesterreich', demonym: 'oberösterreichischer' },
  Niederösterreich: { slug: 'niederoesterreich', demonym: 'niederösterreichischer' },
  Wien: { slug: 'wien', demonym: 'Wiener' },
  Burgenland: {
    slug: 'burgenland',
    demonym: 'burgenländischer',
    inPhrase: 'im Burgenland',
    forPhrase: 'das Burgenland',
  },
  // Germany
  'Baden-Württemberg': { slug: 'baden-wuerttemberg', demonym: 'baden-württembergischer' },
  Bayern: { slug: 'bayern', demonym: 'bayerischer' },
  Berlin: { slug: 'berlin', demonym: 'Berliner' },
  Brandenburg: { slug: 'brandenburg', demonym: 'brandenburgischer' },
  Bremen: { slug: 'bremen', demonym: 'Bremer' },
  Hamburg: { slug: 'hamburg', demonym: 'Hamburger' },
  Hessen: { slug: 'hessen', demonym: 'hessischer' },
  'Mecklenburg-Vorpommern': {
    slug: 'mecklenburg-vorpommern',
    demonym: 'mecklenburg-vorpommerscher',
  },
  Niedersachsen: { slug: 'niedersachsen', demonym: 'niedersächsischer' },
  'Nordrhein-Westfalen': { slug: 'nordrhein-westfalen', demonym: 'nordrhein-westfälischer' },
  'Rheinland-Pfalz': { slug: 'rheinland-pfalz', demonym: 'rheinland-pfälzischer' },
  Saarland: {
    slug: 'saarland',
    demonym: 'saarländischer',
    inPhrase: 'im Saarland',
    forPhrase: 'das Saarland',
  },
  Sachsen: { slug: 'sachsen', demonym: 'sächsischer' },
  'Sachsen-Anhalt': { slug: 'sachsen-anhalt', demonym: 'sachsen-anhaltischer' },
  'Schleswig-Holstein': { slug: 'schleswig-holstein', demonym: 'schleswig-holsteinischer' },
  Thüringen: { slug: 'thueringen', demonym: 'Thüringer' },
  // Switzerland
  Zürich: { slug: 'zuerich', demonym: 'Zürcher' },
  Bern: { slug: 'bern', demonym: 'Berner' },
  Luzern: { slug: 'luzern', demonym: 'Luzerner' },
  Uri: { slug: 'uri', demonym: 'Urner' },
  Schwyz: { slug: 'schwyz', demonym: 'Schwyzer' },
  Obwalden: { slug: 'obwalden', demonym: 'Obwaldner' },
  Nidwalden: { slug: 'nidwalden', demonym: 'Nidwaldner' },
  Glarus: { slug: 'glarus', demonym: 'Glarner' },
  Zug: { slug: 'zug', demonym: 'Zuger' },
  Freiburg: { slug: 'freiburg', demonym: 'Freiburger' },
  Solothurn: { slug: 'solothurn', demonym: 'Solothurner' },
  'Basel-Stadt': { slug: 'basel-stadt', demonym: 'Basler' },
  'Basel-Landschaft': { slug: 'basel-landschaft', demonym: 'Baselbieter' },
  Schaffhausen: { slug: 'schaffhausen', demonym: 'Schaffhauser' },
  'Appenzell Ausserrhoden': { slug: 'appenzell-ausserrhoden', demonym: 'Ausserrhoder' },
  'Appenzell Innerrhoden': { slug: 'appenzell-innerrhoden', demonym: 'Innerrhoder' },
  'St. Gallen': { slug: 'st-gallen', demonym: 'St. Galler' },
  Graubünden: { slug: 'graubuenden', demonym: 'Bündner' },
  Aargau: { slug: 'aargau', demonym: 'Aargauer', inPhrase: 'im Aargau', forPhrase: 'den Aargau' },
  Thurgau: {
    slug: 'thurgau',
    demonym: 'Thurgauer',
    inPhrase: 'im Thurgau',
    forPhrase: 'den Thurgau',
  },
  Tessin: { slug: 'tessin', demonym: 'Tessiner', inPhrase: 'im Tessin', forPhrase: 'das Tessin' },
  Waadt: {
    slug: 'waadt',
    demonym: 'Waadtländer',
    inPhrase: 'in der Waadt',
    forPhrase: 'die Waadt',
  },
  Wallis: { slug: 'wallis', demonym: 'Walliser', inPhrase: 'im Wallis', forPhrase: 'das Wallis' },
  Neuenburg: { slug: 'neuenburg', demonym: 'Neuenburger' },
  Genf: { slug: 'genf', demonym: 'Genfer' },
  Jura: { slug: 'jura', demonym: 'Jurassischer', inPhrase: 'im Jura', forPhrase: 'den Jura' },
};

// Cultural regions of Germany (ticket 516 of the product owner). They start EMPTY:
// the 16 Bundeslaender above hold all Landkreise at first (the "backend structure",
// `home: true`); regions and districts are defined only in code. A region without
// Landkreise is hidden everywhere.
// `macro` = the six Grossregionen of the map page (ticket 518). The slugs share the
// top-level URL space with profiles (username.js reserves them).
const MACRO_OF_STATE = {
  Berlin: 'Osten',
  Brandenburg: 'Osten',
  Bremen: 'Norden',
  Hamburg: 'Norden',
  'Mecklenburg-Vorpommern': 'Norden',
  Niedersachsen: 'Norden',
  'Schleswig-Holstein': 'Norden',
  'Nordrhein-Westfalen': 'Westen',
  Hessen: 'Mitte',
  Thüringen: 'Mitte',
  Sachsen: 'Osten',
  'Sachsen-Anhalt': 'Osten',
  'Baden-Württemberg': 'Südwesten',
  'Rheinland-Pfalz': 'Südwesten',
  Saarland: 'Südwesten',
  Bayern: 'Südosten',
};
const CULTURE_REGIONS = [
  // Baden-Wuerttemberg
  { slug: 'schwaben-wuerttemberg', name: 'Schwaben / Württemberg', macro: 'Südwesten', demonym: 'schwäbischer' },
  { slug: 'kurpfalz', name: 'Kurpfalz', macro: 'Südwesten', demonym: 'Kurpfälzer', inPhrase: 'in der Kurpfalz', forPhrase: 'die Kurpfalz' },
  { slug: 'suedbaden-markgraeflerland', name: 'Südbaden / Markgräflerland', macro: 'Südwesten', demonym: 'südbadischer' },
  { slug: 'schwarzwald', name: 'Schwarzwald', macro: 'Südwesten', demonym: 'Schwarzwälder', inPhrase: 'im Schwarzwald', forPhrase: 'den Schwarzwald' },
  { slug: 'oberschwaben', name: 'Oberschwaben', macro: 'Südwesten', demonym: 'oberschwäbischer' },
  { slug: 'tauberfranken', name: 'Tauberfranken', macro: 'Südwesten', demonym: 'tauberfränkischer' },
  // Bayern
  { slug: 'oberbayern', name: 'Oberbayern', macro: 'Südosten', demonym: 'oberbayerischer' },
  { slug: 'niederbayern', name: 'Niederbayern', macro: 'Südosten', demonym: 'niederbayerischer' },
  { slug: 'oberpfalz', name: 'Oberpfalz', macro: 'Südosten', demonym: 'Oberpfälzer', inPhrase: 'in der Oberpfalz', forPhrase: 'die Oberpfalz' },
  { slug: 'franken', name: 'Franken', macro: 'Südosten', demonym: 'fränkischer' },
  { slug: 'bayerisch-schwaben-allgaeu', name: 'Bayerisch-Schwaben / Allgäu', macro: 'Südosten', demonym: 'Allgäuer' },
  // Nordrhein-Westfalen
  { slug: 'niederrhein', name: 'Niederrhein', macro: 'Westen', demonym: 'niederrheinischer', inPhrase: 'am Niederrhein', forPhrase: 'den Niederrhein' },
  { slug: 'koeln-bonn-eifel', name: 'Köln/Bonn & Eifel', macro: 'Westen', demonym: 'Köln-Bonner' },
  { slug: 'bergisches-land', name: 'Bergisches Land', macro: 'Westen', demonym: 'bergischer', inPhrase: 'im Bergischen Land', forPhrase: 'das Bergische Land' },
  { slug: 'ruhrgebiet', name: 'Ruhrgebiet', macro: 'Westen', demonym: 'Ruhrpott', inPhrase: 'im Ruhrgebiet', forPhrase: 'das Ruhrgebiet' },
  { slug: 'muensterland', name: 'Münsterland', macro: 'Westen', demonym: 'Münsterländer' },
  { slug: 'sauerland-siegerland', name: 'Sauerland / Siegerland', macro: 'Westen', demonym: 'Sauerländer' },
  { slug: 'ostwestfalen-lippe', name: 'Ostwestfalen-Lippe', macro: 'Westen', demonym: 'ostwestfälischer' },
  // Niedersachsen
  { slug: 'ostfriesland', name: 'Ostfriesland', macro: 'Norden', demonym: 'ostfriesischer' },
  { slug: 'oldenburger-land-emsland', name: 'Oldenburger Land / Emsland', macro: 'Norden', demonym: 'Oldenburger' },
  { slug: 'lueneburger-heide', name: 'Lüneburger Heide', macro: 'Norden', demonym: 'Heide', inPhrase: 'in der Lüneburger Heide', forPhrase: 'die Lüneburger Heide' },
  { slug: 'weserbergland', name: 'Weserbergland', macro: 'Mitte', demonym: 'Weserbergland' },
  { slug: 'region-hannover', name: 'Region Hannover', macro: 'Mitte', demonym: 'Hannoveraner', inPhrase: 'in der Region Hannover', forPhrase: 'die Region Hannover' },
  { slug: 'braunschweiger-land-harz', name: 'Braunschweiger Land & Harz', macro: 'Mitte', demonym: 'Braunschweiger' },
  // Hessen
  { slug: 'nordhessen', name: 'Nordhessen', macro: 'Mitte', demonym: 'nordhessischer' },
  { slug: 'mittelhessen', name: 'Mittelhessen', macro: 'Mitte', demonym: 'mittelhessischer' },
  { slug: 'odenwald-rhoen', name: 'Odenwald / Rhön', macro: 'Mitte', demonym: 'Odenwald-Rhöner' },
  { slug: 'rhein-main-gebiet', name: 'Rhein-Main-Gebiet', macro: 'Mitte', demonym: 'Rhein-Main', inPhrase: 'im Rhein-Main-Gebiet', forPhrase: 'das Rhein-Main-Gebiet' },
  { slug: 'rheingau', name: 'Rheingau', macro: 'Mitte', demonym: 'Rheingauer', inPhrase: 'im Rheingau', forPhrase: 'den Rheingau' },
  // Sachsen
  { slug: 'erzgebirge', name: 'Erzgebirge', macro: 'Osten', demonym: 'Erzgebirgs', inPhrase: 'im Erzgebirge', forPhrase: 'das Erzgebirge' },
  { slug: 'vogtland', name: 'Vogtland', macro: 'Osten', demonym: 'Vogtländer' },
  { slug: 'leipzig-region', name: 'Leipzig & Region', macro: 'Osten', demonym: 'Leipziger' },
  { slug: 'dresden-elbland', name: 'Dresden & Elbland', macro: 'Osten', demonym: 'Dresdner' },
  { slug: 'oberlausitz', name: 'Oberlausitz', macro: 'Osten', demonym: 'Oberlausitzer', inPhrase: 'in der Oberlausitz', forPhrase: 'die Oberlausitz' },
  // Rheinland-Pfalz
  { slug: 'pfalz', name: 'Pfalz', macro: 'Südwesten', demonym: 'Pfälzer', inPhrase: 'in der Pfalz', forPhrase: 'die Pfalz' },
  { slug: 'rheinhessen', name: 'Rheinhessen', macro: 'Südwesten', demonym: 'rheinhessischer' },
  { slug: 'mosel-saar-ruwer', name: 'Mosel-Saar-Ruwer', macro: 'Südwesten', demonym: 'Mosel' , inPhrase: 'an Mosel, Saar und Ruwer', forPhrase: 'Mosel-Saar-Ruwer' },
  { slug: 'eifel-westerwald', name: 'Eifel & Westerwald', macro: 'Südwesten', demonym: 'Eifel-Westerwälder' },
  { slug: 'hunsrueck', name: 'Hunsrück', macro: 'Südwesten', demonym: 'Hunsrücker', inPhrase: 'im Hunsrück', forPhrase: 'den Hunsrück' },
  // Thueringen
  { slug: 'thueringer-wald-rennsteig', name: 'Thüringer Wald / Rennsteig', macro: 'Mitte', demonym: 'Thüringer-Wald' },
  { slug: 'suedthueringen', name: 'Südthüringen', macro: 'Mitte', demonym: 'südthüringer' },
  { slug: 'klassikerregion', name: 'Klassikerregion', macro: 'Mitte', demonym: 'Klassikerregions', inPhrase: 'in der Klassikerregion', forPhrase: 'die Klassikerregion' },
  { slug: 'eichsfeld', name: 'Eichsfeld', macro: 'Mitte', demonym: 'Eichsfelder', inPhrase: 'im Eichsfeld', forPhrase: 'das Eichsfeld' },
  // Schleswig-Holstein
  { slug: 'nordfriesland', name: 'Nordfriesland', macro: 'Norden', demonym: 'nordfriesischer' },
  { slug: 'dithmarschen', name: 'Dithmarschen', macro: 'Norden', demonym: 'Dithmarscher' },
  { slug: 'schleswig-angeln', name: 'Schleswig / Angeln', macro: 'Norden', demonym: 'Schleswiger' },
  { slug: 'holstein', name: 'Holstein', macro: 'Norden', demonym: 'Holsteiner' },
  // Brandenburg
  { slug: 'prignitz-uckermark', name: 'Prignitz & Uckermark', macro: 'Norden', demonym: 'Prignitz-Uckermärker' },
  { slug: 'havelland-potsdam', name: 'Havelland & Potsdam', macro: 'Osten', demonym: 'Potsdamer' },
  { slug: 'spreewald', name: 'Spreewald', macro: 'Osten', demonym: 'Spreewälder', inPhrase: 'im Spreewald', forPhrase: 'den Spreewald' },
  { slug: 'niederlausitz', name: 'Niederlausitz', macro: 'Osten', demonym: 'Niederlausitzer', inPhrase: 'in der Niederlausitz', forPhrase: 'die Niederlausitz' },
  // Mecklenburg-Vorpommern
  { slug: 'mecklenburg', name: 'Mecklenburg', macro: 'Norden', demonym: 'mecklenburgischer' },
  { slug: 'vorpommern', name: 'Vorpommern', macro: 'Norden', demonym: 'vorpommerscher' },
  // Sachsen-Anhalt
  { slug: 'altmark', name: 'Altmark', macro: 'Norden', demonym: 'Altmärker', inPhrase: 'in der Altmark', forPhrase: 'die Altmark' },
  { slug: 'harz-harzvorland', name: 'Harz & Harzvorland', macro: 'Mitte', demonym: 'Harzer' },
  { slug: 'anhalt-dessau', name: 'Anhalt-Dessau', macro: 'Osten', demonym: 'Anhalter' },
  { slug: 'saale-unstrut', name: 'Saale-Unstrut', macro: 'Osten', demonym: 'Saale-Unstrut' , inPhrase: 'an Saale und Unstrut', forPhrase: 'Saale-Unstrut' },
  // Saarland
  { slug: 'saarlouis-umgebung', name: 'Saarlouis & Umgebung', macro: 'Südwesten', demonym: 'Saarlouiser' },
  { slug: 'saarbruecken-warndt', name: 'Saarbrücken & Warndt', macro: 'Südwesten', demonym: 'Saarbrücker' },
  { slug: 'hochwald-bliesgau', name: 'Hochwald / Bliesgau', macro: 'Südwesten', demonym: 'Hochwälder' },
];

const COUNTRY_SETTINGS = {
  AT: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Vienna' },
  DE: { subdivisionLabel: 'Landkreis', timezone: 'Europe/Berlin' },
  CH: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Zurich' },
};

// Vorarlberg and Steiermark keep their historic order of Bezirke.
const BEZIRKE_OVERRIDE = {
  Vorarlberg: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'],
  Steiermark: [
    'Graz',
    'Graz-Umgebung',
    'Bruck-Mürzzuschlag',
    'Deutschlandsberg',
    'Hartberg-Fürstenfeld',
    'Leibnitz',
    'Leoben',
    'Liezen',
    'Murau',
    'Murtal',
    'Südoststeiermark',
    'Voitsberg',
    'Weiz',
  ],
};

const DE_STATE_BY_PREFIX = {
  '01': 'Schleswig-Holstein',
  '02': 'Hamburg',
  '03': 'Niedersachsen',
  '04': 'Bremen',
  '05': 'Nordrhein-Westfalen',
  '06': 'Hessen',
  '07': 'Rheinland-Pfalz',
  '08': 'Baden-Württemberg',
  '09': 'Bayern',
  10: 'Saarland',
  11: 'Berlin',
  12: 'Brandenburg',
  13: 'Mecklenburg-Vorpommern',
  14: 'Sachsen',
  15: 'Sachsen-Anhalt',
  16: 'Thüringen',
};

function germanLandkreise() {
  const kreise = JSON.parse(read('scripts/data/de-kreise.json'));
  const isCity = (k) => k.type === 'Kreisfreie Stadt' || k.type === 'Stadtkreis';
  const plain = (k) => (isCity(k) ? k.name.split(',')[0].trim() : k.name);
  const cityNames = new Set(kreise.filter(isCity).map(plain));
  const landNames = new Set(kreise.filter((k) => !isCity(k)).map(plain));
  const clash = new Set([...cityNames].filter((n) => landNames.has(n)));
  const byState = {};
  for (const k of kreise) {
    const state = DE_STATE_BY_PREFIX[k.ags.slice(0, 2)];
    let name = plain(k);
    if (clash.has(name)) name += isCity(k) ? ' (Stadt)' : ' (Landkreis)';
    (byState[state] ??= []).push(name);
  }
  for (const list of Object.values(byState)) list.sort((a, b) => a.localeCompare(b, 'de'));
  return byState;
}

// CSV rows -> { country -> [region -> Bezirke] } in file order.
const rows = read('scripts/data/regions-countries.csv')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((l) => l.split(','));
const csv = {};
for (const [code, , region, bezirk] of rows) {
  ((csv[code] ??= {})[region] ??= []).push(bezirk);
}
const deOrder = Object.hasOwn(csv, 'DE') ? Object.keys(csv.DE) : [];
csv.DE = germanLandkreise();

const regions = [];
const order = [
  ...Object.keys(META).filter((n) => Object.hasOwn(csv.AT, n)),
  ...deOrder,
  ...Object.keys(csv.CH),
];
for (const name of order) {
  const country = Object.hasOwn(csv.AT, name)
    ? 'AT'
    : Object.hasOwn(csv.CH, name) && !Object.hasOwn(csv.DE, name)
      ? 'CH'
      : 'DE';
  const meta = META[name];
  if (!meta) throw new Error(`No metadata for region "${name}"`);
  const settings = COUNTRY_SETTINGS[country];
  const bezirke = BEZIRKE_OVERRIDE[name] ?? csv[country][name];
  regions.push({
    slug: meta.slug,
    name,
    inPhrase: meta.inPhrase ?? `in ${name}`,
    forPhrase: meta.forPhrase ?? name,
    demonym: meta.demonym,
    country,
    subdivisionLabel: settings.subdivisionLabel,
    timezone: settings.timezone,
    bezirke,
    home: true,
    ...(country === 'DE' ? { macro: MACRO_OF_STATE[name] } : {}),
  });
}
// Cultural regions come last so the `order` (array index) of the 51 above does not change.
for (const c of CULTURE_REGIONS) {
  regions.push({
    slug: c.slug,
    name: c.name,
    inPhrase: c.inPhrase ?? `in ${c.name}`,
    forPhrase: c.forPhrase ?? c.name,
    demonym: c.demonym,
    country: 'DE',
    subdivisionLabel: COUNTRY_SETTINGS.DE.subdivisionLabel,
    timezone: COUNTRY_SETTINGS.DE.timezone,
    bezirke: [],
    home: false,
    macro: c.macro,
  });
}

const slugs = regions.map((r) => r.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('Duplicate region slug');
if (regions.filter((r) => r.home).length !== Object.keys(META).length) {
  throw new Error('Region/META mismatch');
}

// Legacy pseudo-Bezirke: no real district, never offered for new events, kept only so events
// stored with them stay readable and filterable (Vorarlberg's "Grenznahe", shown as "Umgebung",
// retired for new events by Trello dx8dCQJc). Appended to the region's list at runtime.
const LEGACY_BEZIRKE = { vorarlberg: ['Grenznahe'] };

const json = JSON.stringify(regions, null, 2);
const legacyJson = JSON.stringify(LEGACY_BEZIRKE, null, 2);
const legacyDoc = `// Legacy pseudo-Bezirke per region (stored on old events only, never offered for new ones).\n`;
const header = `// GENERATED by scripts/build-region-data.mjs from scripts/data/*. Do not edit by hand.\n`;
const out = (path, body) => {
  mkdirSync(dirname(root + path), { recursive: true });
  writeFileSync(root + path, body);
};
out(
  'src/data/regionData.js',
  `${header}// Static register entries (see src/utils/regions.js). Austria, Germany, Switzerland.\nexport const REGION_DATA = ${json};\n\n${legacyDoc}export const LEGACY_BEZIRKE = ${legacyJson};\n`
);
out(
  'functions/src/regionData.ts',
  `${header}export interface RegionDatum {\n  slug: string;\n  name: string;\n  inPhrase: string;\n  forPhrase: string;\n  demonym: string;\n  country: string;\n  subdivisionLabel: string;\n  timezone: string;\n  bezirke: string[];\n  /** true: Bundesland / Kanton (the backend structure); false: cultural region, starts empty. */\n  home: boolean;\n  /** Germany only: one of the six Grossregionen of the map page. */\n  macro?: string;\n}\n\nexport const REGION_DATA: readonly RegionDatum[] = ${json};\n\n${legacyDoc}export const LEGACY_BEZIRKE: Readonly<Record<string, readonly string[]>> = ${legacyJson};\n`
);
console.log(
  `${regions.length} regions, ${regions.reduce((n, r) => n + r.bezirke.length, 0)} districts`
);
