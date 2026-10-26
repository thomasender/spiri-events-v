#!/usr/bin/env node
// Builds src/data/placeIndex.json: the bundled list of places (Orte / Gemeinden) of
// Austria, Germany and Switzerland that powers "Wo bist du?" (place search, radius
// filter, event positions). No third-party service is called at runtime.
//
// Source: GeoNames postal code files, CC BY 4.0 (https://www.geonames.org, credit required:
// Datenschutz section 17 and Impressum). Download once into an EMPTY directory (raw files
// are not committed) and pass that directory:
//
//   mkdir /tmp/geonames && cd /tmp/geonames
//   for c in AT DE CH; do curl -sSLO https://download.geonames.org/export/zip/$c.zip; unzip -oq $c.zip -d x$c; done
//   node scripts/build-place-index.mjs /tmp/geonames
//
// Rows without an accuracy value are mostly company / large-customer postcodes (e.g.
// "Mercedes-Benz Vertrieb") and are dropped, except for the main town of a district. Places are de-duplicated per (name, district) and their
// coordinates averaged. District names of GeoNames are matched to the register's districts
// (`DISTRICT_CATALOG`); the rest keep only their state. Centroids of districts and states
// are the fallback position for events whose Ort is unknown.
import fs from 'node:fs';
import path from 'node:path';
import { DISTRICT_CATALOG } from '../src/utils/regionMapping.js';
import { foldSearchText } from '../src/utils/regionSearch.js';

const dir = process.argv[2];
if (!dir) {
  console.error(
    'usage: node scripts/build-place-index.mjs <dir with xAT/AT.txt, xDE/DE.txt, xCH/CH.txt>'
  );
  process.exit(1);
}

const norm = foldSearchText;

// GeoNames admin names that differ from the register after normalising.
const ALIASES = {
  AT: {
    klagenfurt: 'Klagenfurt am Wörthersee',
    wien: 'Wien',
    'sankt polten': 'St. Pölten',
    'sankt johann im pongau': 'St. Johann im Pongau',
    krems: 'Krems-Land',
    'krems an der donau': 'Krems an der Donau',
  },
  DE: {},
  CH: {
    'biel bienne': 'Biel/Bienne',
    'interlaken oberhasli': 'Oberland',
    'frutigen niedersimmental': 'Oberland',
    lake: 'See',
    sarine: 'Saane',
    gruyere: 'Greyerz',
    glane: 'Glane',
  },
};

// Common abbreviations / spellings that differ between GeoNames and the register.
function canonBase(text) {
  return norm(text.replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ''))
    .replace(/\bst\b/g, 'sankt')
    .replace(/\ba d\b/g, 'an der')
    .replace(/\bi d\b/g, 'in der')
    .replace(/\ba\b/g, 'am')
    .replace(/\bopf\b/g, 'oberpfalz')
    .replace(/\bwahlkreis\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRegisterName(name) {
  const m = name.match(/^(.*?)\s*\((Stadt|Landkreis)\)$/);
  if (m) return { base: canonBase(m[1]), kind: m[2] === 'Stadt' ? 'stadt' : 'land' };
  return { base: canonBase(name), kind: null };
}

// base name -> [{ district, kind }] per country
const registerIndex = { AT: new Map(), DE: new Map(), CH: new Map() };
for (const d of DISTRICT_CATALOG) {
  const { base, kind } = parseRegisterName(d.name);
  const list = registerIndex[d.country].get(base) ?? [];
  list.push({ d, kind });
  registerIndex[d.country].set(base, list);
}

function parseGeoNamesDistrict(country, raw) {
  let s = raw.trim();
  let kind = null;
  if (/^kreisfreie stadt /i.test(s)) {
    kind = 'stadt';
    s = s.replace(/^kreisfreie stadt /i, '');
  } else if (/^landkreis /i.test(s)) {
    kind = 'land';
    s = s.replace(/^landkreis /i, '');
  } else if (/^stadtkreis /i.test(s)) {
    kind = 'stadt';
    s = s.replace(/^stadtkreis /i, '');
  } else if (/^kreis /i.test(s)) {
    kind = 'land';
    s = s.replace(/^kreis /i, '');
  } else if (/^landeshauptstadt /i.test(s)) {
    kind = 'stadt';
    s = s.replace(/^landeshauptstadt /i, '');
  } else if (/^region /i.test(s)) {
    s = s.replace(/^region /i, '');
  }
  s = s
    .replace(/^politischer bezirk /i, '')
    .replace(/^bezirk /i, '')
    .replace(/ district$/i, '')
    .replace(/, stadt$/i, '');
  if (/ stadt$/i.test(s)) {
    kind = 'stadt';
    s = s.replace(/ stadt$/i, '');
  }
  let base = canonBase(s);
  const alias = ALIASES[country][base] ?? ALIASES[country][norm(raw)];
  if (alias) base = canonBase(alias);
  return { base, kind };
}

function matchDistrict(country, raw) {
  if (!raw) return null;
  const { base, kind } = parseGeoNamesDistrict(country, raw);
  const candidates = registerIndex[country].get(base);
  if (!candidates) return null;
  if (candidates.length === 1) return candidates[0].d;
  const exact = candidates.find((c) => c.kind === kind);
  if (exact) return exact.d;
  // GeoNames "Heilbronn" without a prefix is the kreisfreie Stadt.
  return (candidates.find((c) => c.kind === 'stadt') ?? candidates[0]).d;
}

const stateByName = new Map();
for (const d of DISTRICT_CATALOG) {
  stateByName.set(`${d.country}|${norm(d.stateName)}`, d.stateSlug);
}
// GeoNames spellings of Bundesländer / Kantone that differ from the register.
const STATE_ALIASES = {
  'DE|freistaat bayern': 'bayern',
  'DE|freistaat sachsen': 'sachsen',
  'DE|freistaat thueringen': 'thueringen',
  'DE|free hanseatic city bremen': 'bremen',
  'DE|hamburg': 'hamburg',
  'DE|berlin': 'berlin',
  'CH|kanton appenzell ausserrhoden': 'appenzell-ausserrhoden',
  'CH|kanton appenzell innerrhoden': 'appenzell-innerrhoden',
  'DE|bavaria': 'bayern',
  'DE|lower saxony': 'niedersachsen',
  'CH|canton de berne': 'bern',
  'CH|canton de fribourg': 'freiburg',
  'CH|geneve': 'genf',
  'CH|neuchatel': 'neuenburg',
  'CH|ticino': 'tessin',
  'CH|canton de vaud': 'waadt',
  'CH|canton du valais': 'wallis',
};

function stateSlug(country, raw) {
  const n = norm(raw.replace(/^Kanton /, '').replace(/^Canton (de |of )?/i, ''));
  return (
    stateByName.get(`${country}|${n}`) ??
    STATE_ALIASES[`${country}|${norm(raw)}`] ??
    STATE_ALIASES[`${country}|${n}`] ??
    null
  );
}

const COLS = {
  AT: { state: 3, district: 5 },
  DE: { state: 3, district: 7 },
  CH: { state: 3, district: 5 },
};

const places = new Map(); // key -> { name, country, state, district, n, lat, lon }
const unmatchedStates = new Map();
const unmatchedDistricts = new Map();
let rowsUsed = 0;
for (const country of ['AT', 'DE', 'CH']) {
  const file = path.join(dir, `x${country}`, `${country}.txt`);
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  for (const line of rows) {
    const c = line.split('\t');
    const name = c[2].trim();
    if (/\b(postfach|postlagernd|zustellung|abholfach)\b/i.test(name)) continue;
    // No accuracy value: company / large-customer postcodes ("Mercedes-Benz Vertrieb") mixed
    // with the main town of a postcode ("Lindau (Bodensee)"). Only the latter is kept: a name
    // that equals its own district ("Lindau (Bodensee)" in Landkreis Lindau).
    if (!c[11]) {
      const districtBase = parseGeoNamesDistrict(country, c[COLS[country].district] ?? '').base;
      if (canonBase(name) !== districtBase) continue;
    }
    const lat = Number(c[9]);
    const lon = Number(c[10]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const state = stateSlug(country, c[COLS[country].state]);
    if (!state) {
      unmatchedStates.set(c[3], (unmatchedStates.get(c[3]) ?? 0) + 1);
      continue;
    }
    const rawDistrict = c[COLS[country].district];
    const district = matchDistrict(country, rawDistrict);
    if (!district && rawDistrict) {
      unmatchedDistricts.set(
        `${country}|${rawDistrict}`,
        (unmatchedDistricts.get(`${country}|${rawDistrict}`) ?? 0) + 1
      );
    }
    const key = `${country}|${norm(name)}|${district?.key ?? state}`;
    const p = places.get(key) ?? {
      name,
      country,
      state,
      district: district?.key ?? null,
      n: 0,
      seat: false,
      lat: 0,
      lon: 0,
    };
    // The main town of its district ("Lindau (Bodensee)" in Landkreis Lindau) ranks first.
    if (rawDistrict && canonBase(name) === parseGeoNamesDistrict(country, rawDistrict).base) {
      p.seat = true;
    }
    p.n += 1;
    p.lat += lat;
    p.lon += lon;
    places.set(key, p);
    rowsUsed += 1;
  }
}

// A place seen once with and once without a matched district ("Wien" in the Bezirk "Wien" and
// a Wien row GeoNames gives no Bezirk) is one place: the unmatched rows join the matched one.
for (const [key, p] of [...places.entries()]) {
  if (p.district) continue;
  const twin = [...places.values()].find(
    (o) =>
      o.district && o.country === p.country && o.state === p.state && norm(o.name) === norm(p.name)
  );
  if (twin) {
    twin.n += p.n;
    twin.lat += p.lat;
    twin.lon += p.lon;
    places.delete(key);
  }
}

const states = [];
const stateIdx = new Map();
const districts = [];
const districtIdx = new Map();
const centroids = new Map(); // "s|slug" / "d|key" -> { lat, lon, n }
function addCentroid(id, p) {
  const c = centroids.get(id) ?? { lat: 0, lon: 0, n: 0 };
  c.lat += p.lat / p.n;
  c.lon += p.lon / p.n;
  c.n += 1;
  centroids.set(id, c);
}
for (const p of places.values()) {
  addCentroid(`s|${p.state}`, p);
  if (p.district) addCentroid(`d|${p.district}`, p);
}
const round = (x) => Math.round(x * 1000) / 1000;
const centroidOf = (id) => {
  const c = centroids.get(id);
  return [round(c.lat / c.n), round(c.lon / c.n)];
};

const rows = [...places.values()].sort(
  (a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name, 'de')
);
const out = rows.map((p) => {
  if (!stateIdx.has(p.state)) {
    stateIdx.set(p.state, states.length);
    states.push([p.state, ...centroidOf(`s|${p.state}`)]);
  }
  let di = -1;
  if (p.district) {
    if (!districtIdx.has(p.district)) {
      districtIdx.set(p.district, districts.length);
      districts.push([p.district, ...centroidOf(`d|${p.district}`)]);
    }
    di = districtIdx.get(p.district);
  }
  // Number of postcodes (+100 for the main town of a district): a stand-in for the size of the
  // place, ranks the search hits.
  return [
    p.name,
    round(p.lat / p.n),
    round(p.lon / p.n),
    stateIdx.get(p.state),
    di,
    Math.min(p.n + (p.seat ? 100 : 0), 255),
  ];
});

const result = {
  source: 'GeoNames postal code data (https://www.geonames.org), CC BY 4.0',
  // [slug, lat, lon]
  states,
  // ["<country>|<district name>", lat, lon]
  districts,
  // [name, lat, lon, state index, district index or -1, postcode count]
  places: out,
};
const target = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'src',
  'data',
  'placeIndex.json'
);
fs.writeFileSync(target, JSON.stringify(result));

const matched = out.filter((p) => p[4] >= 0).length;
console.log(
  `rows used ${rowsUsed}, places ${out.length}, with district ${matched} (${((matched / out.length) * 100).toFixed(1)}%)`
);
console.log(`states ${states.length}, districts ${districts.length} of ${DISTRICT_CATALOG.length}`);
const missing = DISTRICT_CATALOG.filter((d) => !districtIdx.has(d.key)).map((d) => d.key);
console.log(`catalog districts without places (${missing.length}):`, missing.join(' | '));
console.log('unmatched states:', [...unmatchedStates.entries()]);
console.log(
  'unmatched districts (top):',
  [...unmatchedDistricts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, n]) => `${k} (${n})`)
    .join(' | ')
);
console.log(`written ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} kB)`);
