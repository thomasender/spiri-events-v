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

const COUNTRY_SETTINGS = {
  AT: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Vienna' },
  DE: { subdivisionLabel: 'Landkreis', timezone: 'Europe/Berlin' },
  CH: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Zurich' },
};

// Vorarlberg keeps "Grenznahe" for existing events (deprecated once South
// Germany / East Switzerland are live). Vorarlberg and Steiermark keep their
// historic order of Bezirke.
const BEZIRKE_OVERRIDE = {
  Vorarlberg: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
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
  });
}

const slugs = regions.map((r) => r.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('Duplicate region slug');
if (regions.length !== Object.keys(META).length) throw new Error('Region/META mismatch');

const json = JSON.stringify(regions, null, 2);
const header = `// GENERATED by scripts/build-region-data.mjs from scripts/data/*. Do not edit by hand.\n`;
const out = (path, body) => {
  mkdirSync(dirname(root + path), { recursive: true });
  writeFileSync(root + path, body);
};
out(
  'src/data/regionData.js',
  `${header}// Static register entries (see src/utils/regions.js). Austria, Germany, Switzerland.\nexport const REGION_DATA = ${json};\n`
);
out(
  'functions/src/regionData.ts',
  `${header}export interface RegionDatum {\n  slug: string;\n  name: string;\n  inPhrase: string;\n  forPhrase: string;\n  demonym: string;\n  country: string;\n  subdivisionLabel: string;\n  timezone: string;\n  bezirke: string[];\n}\n\nexport const REGION_DATA: readonly RegionDatum[] = ${json};\n`
);
console.log(
  `${regions.length} regions, ${regions.reduce((n, r) => n + r.bezirke.length, 0)} districts`
);
