// Pure part of the region register generator (scripts/build-region-data.mjs): reads the three
// country CSVs in scripts/data/regions/ and turns them into the register entries. Imported by
// the generator and by tests/lib/regionRegisterCsv.spec.ts (which regenerates and compares).
//
// The CSVs are the ONLY source of regions and districts:
//   scripts/data/regions/<country file>.csv   UTF-8 (BOM allowed), `;`-separated,
//   header `Region;Bezirke`, one row per region, its districts comma-separated.
// The country comes from the file name (COUNTRY_FILES). Region order = file order of
// COUNTRY_FILES, then row order. District names are taken 1:1 (must be unique per country).
// Wording per region (id, inPhrase, forPhrase, demonym) lives in META below; a CSV region
// without META or a META entry without CSV row fails the build.
import { existsSync, readFileSync } from 'node:fs';

export const REGION_CSV_DIR = 'scripts/data/regions';

// Country -> CSV file, in switcher order. A country whose file does not exist is skipped
// (Germany: `deutschland.csv` will follow; add its META block and COUNTRY_SETTINGS are ready).
export const COUNTRY_FILES = [
  ['AT', 'oesterreich.csv'],
  ['CH', 'schweiz.csv'],
  ['LI', 'liechtenstein.csv'],
  ['DE', 'deutschland.csv'],
];

export const COUNTRY_SETTINGS = {
  AT: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Vienna' },
  CH: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Zurich' },
  // Informational only (all date maths uses Europe/Vienna); same offset all year.
  LI: { subdivisionLabel: 'Landesteil', timezone: 'Europe/Vaduz' },
  DE: { subdivisionLabel: 'Landkreis', timezone: 'Europe/Berlin' },
};

// Per country: CSV region name -> { slug, demonym, inPhrase?, forPhrase? }.
// `slug` is the region id (internal, also the URL `/tirol`): ASCII, lowercase, umlauts
// transliterated, spaces / dots -> "-". NEVER change an existing slug (stored on events,
// profiles, moderators). Missing inPhrase -> "in <name>", missing forPhrase -> <name>.
// `demonym` is the complete token for "Dein <demonym> Kalender".
export const META = {
  AT: {
    Burgenland: {
      slug: 'burgenland',
      demonym: 'burgenländischer',
      inPhrase: 'im Burgenland',
      forPhrase: 'das Burgenland',
    },
    Kärnten: { slug: 'kaernten', demonym: 'Kärntner' },
    Niederösterreich: { slug: 'niederoesterreich', demonym: 'niederösterreichischer' },
    Oberösterreich: { slug: 'oberoesterreich', demonym: 'oberösterreichischer' },
    Salzburg: { slug: 'salzburg', demonym: 'Salzburger' },
    Steiermark: {
      slug: 'steiermark',
      demonym: 'steirischer',
      inPhrase: 'in der Steiermark',
      forPhrase: 'die Steiermark',
    },
    Tirol: { slug: 'tirol', demonym: 'Tiroler' },
    Vorarlberg: { slug: 'vorarlberg', demonym: 'Vorarlberger' },
    Wien: { slug: 'wien', demonym: 'Wiener' },
  },
  CH: {
    Aargau: { slug: 'aargau', demonym: 'Aargauer', inPhrase: 'im Aargau', forPhrase: 'den Aargau' },
    Appenzell: {
      slug: 'appenzell',
      demonym: 'Appenzeller',
      inPhrase: 'im Appenzellerland',
      forPhrase: 'das Appenzellerland',
    },
    Basel: { slug: 'basel', demonym: 'Basler' },
    Bern: { slug: 'bern', demonym: 'Berner' },
    Freiburg: { slug: 'freiburg', demonym: 'Freiburger' },
    Genf: { slug: 'genf', demonym: 'Genfer' },
    Glarus: { slug: 'glarus', demonym: 'Glarner' },
    Graubünden: { slug: 'graubuenden', demonym: 'Bündner' },
    Innerschweiz: {
      slug: 'innerschweiz',
      demonym: 'Innerschweizer',
      inPhrase: 'in der Innerschweiz',
      forPhrase: 'die Innerschweiz',
    },
    Jura: { slug: 'jura', demonym: 'Jurassischer', inPhrase: 'im Jura', forPhrase: 'den Jura' },
    Neuenburg: { slug: 'neuenburg', demonym: 'Neuenburger' },
    Schaffhausen: { slug: 'schaffhausen', demonym: 'Schaffhauser' },
    Solothurn: { slug: 'solothurn', demonym: 'Solothurner' },
    'St. Gallen': { slug: 'st-gallen', demonym: 'St. Galler' },
    Tessin: { slug: 'tessin', demonym: 'Tessiner', inPhrase: 'im Tessin', forPhrase: 'das Tessin' },
    Thurgau: {
      slug: 'thurgau',
      demonym: 'Thurgauer',
      inPhrase: 'im Thurgau',
      forPhrase: 'den Thurgau',
    },
    Waadt: {
      slug: 'waadt',
      demonym: 'Waadtländer',
      inPhrase: 'in der Waadt',
      forPhrase: 'die Waadt',
    },
    Wallis: { slug: 'wallis', demonym: 'Walliser', inPhrase: 'im Wallis', forPhrase: 'das Wallis' },
    Zürich: { slug: 'zuerich', demonym: 'Zürcher' },
  },
  LI: {
    Liechtenstein: { slug: 'liechtenstein', demonym: 'Liechtensteiner' },
  },
};

// Every region id the register ever had (51 Bundesländer / Kantone of AT/DE/CH, 60 cultural
// regions of Germany, the Allgäu pilot). Ids that are no longer in the CSVs become
// RETIRED_REGION_IDS: still reserved as usernames (nobody may claim an old region URL) and
// switched off by scripts/seed-regions.mjs / scripts/cleanup-region-docs.mjs.
// Only ever ADD to this list.
export const HISTORIC_REGION_IDS = Object.freeze([
  'allgaeu',
  'vorarlberg', 'tirol', 'salzburg', 'kaernten', 'steiermark', 'oberoesterreich',
  'niederoesterreich', 'wien', 'burgenland', 'baden-wuerttemberg', 'bayern', 'berlin',
  'brandenburg', 'bremen', 'hamburg', 'hessen', 'mecklenburg-vorpommern', 'niedersachsen',
  'nordrhein-westfalen', 'rheinland-pfalz', 'saarland', 'sachsen', 'sachsen-anhalt',
  'schleswig-holstein', 'thueringen', 'zuerich', 'bern', 'luzern', 'uri', 'schwyz', 'obwalden',
  'nidwalden', 'glarus', 'zug', 'freiburg', 'solothurn', 'basel-stadt', 'basel-landschaft',
  'schaffhausen', 'appenzell-ausserrhoden', 'appenzell-innerrhoden', 'st-gallen', 'graubuenden',
  'aargau', 'thurgau', 'tessin', 'waadt', 'wallis', 'neuenburg', 'genf', 'jura',
  'schwaben-wuerttemberg', 'kurpfalz', 'suedbaden-markgraeflerland', 'schwarzwald',
  'oberschwaben', 'tauberfranken', 'oberbayern', 'niederbayern', 'oberpfalz', 'franken',
  'bayerisch-schwaben-allgaeu', 'niederrhein', 'koeln-bonn-eifel', 'bergisches-land',
  'ruhrgebiet', 'muensterland', 'sauerland-siegerland', 'ostwestfalen-lippe', 'ostfriesland',
  'oldenburger-land-emsland', 'lueneburger-heide', 'weserbergland', 'region-hannover',
  'braunschweiger-land-harz', 'nordhessen', 'mittelhessen', 'odenwald-rhoen',
  'rhein-main-gebiet', 'rheingau', 'erzgebirge', 'vogtland', 'leipzig-region', 'dresden-elbland',
  'oberlausitz', 'pfalz', 'rheinhessen', 'mosel-saar-ruwer', 'eifel-westerwald', 'hunsrueck',
  'thueringer-wald-rennsteig', 'suedthueringen', 'klassikerregion', 'eichsfeld', 'nordfriesland',
  'dithmarschen', 'schleswig-angeln', 'holstein', 'prignitz-uckermark', 'havelland-potsdam',
  'spreewald', 'niederlausitz', 'mecklenburg', 'vorpommern', 'altmark', 'harz-harzvorland',
  'anhalt-dessau', 'saale-unstrut', 'saarlouis-umgebung', 'saarbruecken-warndt',
  'hochwald-bliesgau',
]);

// Legacy pseudo-Bezirke: no real district, never offered for new events, kept only so events
// stored with them stay readable and filterable (Vorarlberg's "Grenznahe", shown as "Umgebung",
// retired for new events by Trello dx8dCQJc). Appended to the region's list at runtime.
export const LEGACY_BEZIRKE = { vorarlberg: ['Grenznahe'] };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "St. Gallen" -> "st-gallen", "Graubünden" -> "graubuenden" (the id rule of META). */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** One CSV file -> [{ name, bezirke }] in file order. Throws on a malformed file. */
export function parseRegionCsv(text, label = 'csv') {
  const lines = String(text)
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const [header, ...rows] = lines;
  if (!header || header.split(';').map((h) => h.trim()).join(';') !== 'Region;Bezirke') {
    throw new Error(`${label}: header must be "Region;Bezirke"`);
  }
  return rows.map((line, i) => {
    const cells = line.split(';');
    if (cells.length !== 2) throw new Error(`${label}: row ${i + 2} needs exactly 2 columns`);
    const name = cells[0].trim();
    const bezirke = cells[1]
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    if (!name) throw new Error(`${label}: row ${i + 2} has no region name`);
    if (bezirke.length === 0) throw new Error(`${label}: region "${name}" has no districts`);
    return { name, bezirke };
  });
}

/** Reads the CSVs of `root` (repo root, ending in "/") -> { country: rows }. */
export function readRegionCsvs(root) {
  const out = {};
  for (const [country, file] of COUNTRY_FILES) {
    const path = `${root}${REGION_CSV_DIR}/${file}`;
    if (!existsSync(path)) continue;
    out[country] = parseRegionCsv(readFileSync(path, 'utf8'), file);
  }
  return out;
}

/**
 * CSV rows per country -> register entries (order = COUNTRY_FILES, then row order).
 * Fails loudly on: a region without META, META without a CSV region, a duplicate or
 * malformed slug, a district listed twice within one country.
 */
export function buildRegister(csvByCountry) {
  const problems = [];
  const regions = [];
  for (const [country] of COUNTRY_FILES) {
    const rows = csvByCountry[country];
    const meta = META[country] ?? {};
    if (!rows) {
      if (Object.keys(meta).length) problems.push(`META ${country} has no CSV file`);
      continue;
    }
    const settings = COUNTRY_SETTINGS[country];
    if (!settings) problems.push(`no COUNTRY_SETTINGS for ${country}`);
    const names = new Set(rows.map((r) => r.name));
    for (const name of Object.keys(meta)) {
      if (!names.has(name)) problems.push(`META ${country}|${name} has no CSV region`);
    }
    const seenDistricts = new Map();
    for (const { name, bezirke } of rows) {
      const m = meta[name];
      if (!m) {
        problems.push(`CSV region ${country}|${name} has no META entry`);
        continue;
      }
      for (const b of bezirke) {
        if (seenDistricts.has(b)) {
          problems.push(`district "${b}" twice in ${country} (${seenDistricts.get(b)}, ${name})`);
        }
        seenDistricts.set(b, name);
      }
      regions.push({
        slug: m.slug,
        name,
        inPhrase: m.inPhrase ?? `in ${name}`,
        forPhrase: m.forPhrase ?? name,
        demonym: m.demonym,
        country,
        subdivisionLabel: settings?.subdivisionLabel ?? 'Bezirk',
        timezone: settings?.timezone ?? 'Europe/Vienna',
        bezirke: bezirke,
      });
    }
  }
  const slugs = regions.map((r) => r.slug);
  for (const s of slugs) {
    if (!SLUG_PATTERN.test(s)) problems.push(`slug "${s}" is not an ASCII slug`);
  }
  if (new Set(slugs).size !== slugs.length) problems.push('duplicate region slug');
  if (!slugs.includes('vorarlberg')) problems.push('vorarlberg must stay in the register');
  if (problems.length) throw new Error(`Region register:\n  ${problems.join('\n  ')}`);
  return regions;
}

/** Old ids that are no longer regions (reserved, switched off). */
export function retiredRegionIds(regions) {
  const live = new Set(regions.map((r) => r.slug));
  return HISTORIC_REGION_IDS.filter((id) => !live.has(id));
}

const HEADER = `// GENERATED by scripts/build-region-data.mjs from scripts/data/regions/*.csv. Do not edit by hand.\n`;
const LEGACY_DOC = `// Legacy pseudo-Bezirke per region (stored on old events only, never offered for new ones).\n`;
const RETIRED_DOC = `// Ids of former regions: no longer regions, but still reserved (usernames) and switched off.\n`;

/** File contents of src/data/regionData.js and functions/src/regionData.ts. */
export function renderRegisterFiles(regions) {
  const json = JSON.stringify(regions, null, 2);
  const legacyJson = JSON.stringify(LEGACY_BEZIRKE, null, 2);
  const retiredJson = JSON.stringify(retiredRegionIds(regions));
  const countries = [...new Set(regions.map((r) => r.country))];
  const client =
    `${HEADER}// Static register entries (see src/utils/regions.js). Countries: ${countries.join(', ')}.\n` +
    `export const REGION_DATA = ${json};\n\n` +
    `${LEGACY_DOC}export const LEGACY_BEZIRKE = ${legacyJson};\n\n` +
    `${RETIRED_DOC}export const RETIRED_REGION_IDS = ${retiredJson};\n`;
  const functions =
    `${HEADER}export interface RegionDatum {\n  slug: string;\n  name: string;\n  inPhrase: string;\n` +
    `  forPhrase: string;\n  demonym: string;\n  country: string;\n  subdivisionLabel: string;\n` +
    `  timezone: string;\n  bezirke: string[];\n}\n\n` +
    `export const REGION_DATA: readonly RegionDatum[] = ${json};\n\n` +
    `${LEGACY_DOC}export const LEGACY_BEZIRKE: Readonly<Record<string, readonly string[]>> = ${legacyJson};\n\n` +
    `${RETIRED_DOC}export const RETIRED_REGION_IDS: readonly string[] = ${retiredJson};\n`;
  return { 'src/data/regionData.js': client, 'functions/src/regionData.ts': functions };
}
