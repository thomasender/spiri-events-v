#!/usr/bin/env node
// Builds src/data/placeIndex.json: the bundled list of places (Orte / Gemeinden) of
// Austria, Switzerland and Liechtenstein that powers "Wo bist du?" (place search, radius
// filter, event positions). No third-party service is called at runtime.
//
// Source: GeoNames postal code files, CC BY 4.0 (https://www.geonames.org, credit required:
// Datenschutz section 17 and Impressum). Download once into an EMPTY directory (raw files
// are not committed) and pass that directory:
//
//   mkdir /tmp/geonames && cd /tmp/geonames
//   for c in AT CH LI; do curl -sSLO https://download.geonames.org/export/zip/$c.zip; unzip -oq $c.zip -d x$c; done
//   node scripts/build-place-index.mjs /tmp/geonames
//
// Only countries of the region register are read (Germany has no regions until a
// `deutschland.csv` exists; then add DE here: COLS, the `DE.zip` download and ALIASES).
//
// Rows without an accuracy value are mostly company / large-customer postcodes (e.g.
// "Mercedes-Benz Vertrieb") and are dropped, except for the main town of a district. Places
// are de-duplicated per (name, district) and their coordinates averaged. The region
// ("state" of the list) comes from the GeoNames admin code via ADMIN_SHAPE_REGIONS
// (src/utils/geoRegion.js: "CH-LU" -> innerschweiz); the district names of GeoNames are
// matched to the register's districts (`DISTRICT_CATALOG`, from the CSVs in
// scripts/data/regions/); the rest keep only their region. Centroids of districts and
// regions are the fallback position for events whose Ort is unknown.
import fs from 'node:fs';
import path from 'node:path';
import { DISTRICT_CATALOG } from '../src/utils/regionMapping.js';
import { ADMIN_SHAPE_REGIONS } from '../src/utils/geoRegion.js';
import { foldSearchText } from '../src/utils/regionSearch.js';

const COUNTRIES = ['AT', 'CH', 'LI'];

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-place-index.mjs <dir with xAT/AT.txt, xCH/CH.txt, xLI/LI.txt>');
  process.exit(1);
}

const norm = foldSearchText;

// GeoNames district names (normalised: the raw name, or the name without "Politischer
// Bezirk" / "District" / "Bezirk" / "Region" / "Wahlkreis") -> exact register district.
const ALIASES = {
  AT: {
    'klagenfurt am worthersee': 'Klagenfurt (Stadt)',
    // Without "Stadt" these GeoNames names are the surrounding Bezirk, not the city.
    'politischer bezirk sankt polten': 'Sankt Pölten-Land',
    'politischer bezirk wiener neustadt': 'Wiener Neustadt-Land',
    'politischer bezirk krems': 'Krems-Land',
  },
  CH: {
    'lucerne land': 'Luzern-Land',
    'lucerne stadt': 'Luzern-Stadt',
    lake: 'See',
    sarine: 'Saane',
    gruyere: 'Greyerz',
    glane: 'Glane',
    veveyse: 'Vivisbach',
  },
  LI: {},
};

// Districts GeoNames does not have at its district level, decided by the Gemeinde (admin3).
// Appenzell Innerrhoden: the Bezirke are the CSV districts (Schwende and Rüte merged in 2022).
const AI_GEMEINDEN = {
  appenzell: 'Appenzell',
  gonten: 'Gonten',
  oberegg: 'Oberegg',
  'schlatt haslen': 'Schlatt-Haslen',
  schwende: 'Schwende-Rüte',
  rute: 'Schwende-Rüte',
};
// Wallis: GeoNames has one "Raron District"; the CSV splits it into Östlich / Westlich Raron.
const OESTLICH_RARON = new Set(['bettmeralp', 'bister', 'bitsch', 'grengiols', 'morel filet', 'riederalp']);
// Liechtenstein: Gemeinde -> Landesteil (GeoNames gives only the Gemeinde).
const LI_LANDESTEILE = {
  balzers: 'Oberland',
  planken: 'Oberland',
  schaan: 'Oberland',
  triesen: 'Oberland',
  triesenberg: 'Oberland',
  vaduz: 'Oberland',
  eschen: 'Unterland',
  gamprin: 'Unterland',
  mauren: 'Unterland',
  ruggell: 'Unterland',
  schellenberg: 'Unterland',
};

// Common abbreviations / spellings that differ between GeoNames and the register.
function canonBase(text) {
  return norm(text.replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ''))
    .replace(/\bst\b/g, 'sankt')
    .replace(/\ba d\b/g, 'an der')
    .replace(/\bi d\b/g, 'in der')
    .replace(/\ba\b/g, 'am')
    .replace(/\bwahlkreis\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Eisenstadt (Stadt)" -> base "eisenstadt", kind stadt; Wien "1. Innere Stadt" -> "innere stadt".
function parseRegisterName(name) {
  const m = name.match(/^(.*?)\s*\((Stadt|Landkreis)\)$/);
  if (m) return { base: canonBase(m[1]), kind: m[2] === 'Stadt' ? 'stadt' : 'land' };
  return { base: canonBase(name.replace(/^\d+\.\s*/, '')), kind: null };
}

// base name -> [{ district, kind }] per country; exact name -> district per country
const registerIndex = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
const byExactName = new Map(DISTRICT_CATALOG.map((d) => [`${d.country}|${d.name}`, d]));
const districtsOfRegion = new Map();
for (const d of DISTRICT_CATALOG) {
  if (!registerIndex[d.country]) continue;
  const { base, kind } = parseRegisterName(d.name);
  const list = registerIndex[d.country].get(base) ?? [];
  list.push({ d, kind });
  registerIndex[d.country].set(base, list);
  districtsOfRegion.set(d.stateSlug, [...(districtsOfRegion.get(d.stateSlug) ?? []), d]);
}

function parseGeoNamesDistrict(raw) {
  let s = raw.trim();
  let kind = null;
  if (/^gemeindebezirk /i.test(s)) return { base: canonBase(s.replace(/^gemeindebezirk /i, '')), kind };
  if (/^region /i.test(s)) s = s.replace(/^region /i, '');
  s = s
    .replace(/^politischer bezirk /i, '')
    .replace(/^bezirk /i, '')
    .replace(/ district$/i, '');
  if (/ stadt$/i.test(s)) {
    kind = 'stadt';
    s = s.replace(/ stadt$/i, '');
  }
  return { base: canonBase(s), kind };
}

function matchDistrict(country, raw) {
  if (!raw) return null;
  const { base, kind } = parseGeoNamesDistrict(raw);
  const alias = ALIASES[country][norm(raw)] ?? ALIASES[country][base];
  if (alias) return byExactName.get(`${country}|${alias}`) ?? null;
  const candidates = registerIndex[country].get(base);
  if (!candidates) return null;
  if (candidates.length === 1) return candidates[0].d;
  return (candidates.find((c) => c.kind === kind) ?? candidates[0]).d;
}

// GeoNames columns: 0 country, 2 place, 3 admin1 name, 4 admin1 code, 5 admin2 name,
// 7 admin3 name, 9 lat, 10 lon, 11 accuracy.
function regionOf(country, c) {
  if (country === 'LI') return ADMIN_SHAPE_REGIONS.LI;
  const code = country === 'AT' ? String(Number(c[4])) : c[4];
  return ADMIN_SHAPE_REGIONS[`${country}-${code}`] ?? null;
}

// The register district of a row (or null), given its region.
function districtOf(country, region, c) {
  const admin2 = c[5] ?? '';
  const admin3 = norm(c[7] ?? '');
  const own = districtsOfRegion.get(region) ?? [];
  // A region with a single district (Genf, Glarus, Neuenburg, Schaffhausen): all its places.
  if (own.length === 1) return own[0];
  if (country === 'LI') {
    const name = LI_LANDESTEILE[norm(c[3] ?? '')];
    return name ? byExactName.get(`LI|${name}`) : null;
  }
  if (country === 'AT' && /wien \(stadt\)/i.test(admin2)) {
    // The bare name "Wien" is the whole city, not one Gemeindebezirk.
    if (norm(c[2]) === 'wien') return null;
    return matchDistrict(country, c[7] ?? '');
  }
  if (country === 'CH' && c[4] === 'AI') {
    const name = AI_GEMEINDEN[admin3];
    return name ? byExactName.get(`CH|${name}`) : null;
  }
  if (country === 'CH' && /^raron district$/i.test(admin2)) {
    return byExactName.get(`CH|${OESTLICH_RARON.has(admin3) ? 'Östlich Raron' : 'Westlich Raron'}`);
  }
  return matchDistrict(country, admin2);
}

const places = new Map(); // key -> { name, country, state, district, n, lat, lon }
const unmatchedStates = new Map();
const unmatchedDistricts = new Map();
let rowsUsed = 0;
for (const country of COUNTRIES) {
  const file = path.join(dir, `x${country}`, `${country}.txt`);
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  for (const line of rows) {
    const c = line.split('\t');
    const name = c[2].trim();
    if (/\b(postfach|postlagernd|zustellung|abholfach)\b/i.test(name)) continue;
    const region = regionOf(country, c);
    if (!region) {
      unmatchedStates.set(`${country}|${c[3]}`, (unmatchedStates.get(`${country}|${c[3]}`) ?? 0) + 1);
      continue;
    }
    const district = districtOf(country, region, c);
    // No accuracy value: company / large-customer postcodes ("Mercedes-Benz Vertrieb") mixed
    // with the main town of a postcode. Only the latter is kept: a name that equals its own
    // district.
    if (!c[11] && !(district && canonBase(name) === parseRegisterName(district.name).base)) continue;
    const lat = Number(c[9]);
    const lon = Number(c[10]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const rawDistrict = country === 'LI' ? c[3] : c[5];
    if (!district && rawDistrict) {
      const k = `${country}|${region}|${rawDistrict}`;
      unmatchedDistricts.set(k, (unmatchedDistricts.get(k) ?? 0) + 1);
    }
    // A matched district decides the region (GeoNames lists a few rows under the neighbour).
    const state = district?.stateSlug ?? region;
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
    // The main town of its district ("Innsbruck" in "Innsbruck (Stadt)") ranks first.
    if (district && canonBase(name) === parseRegisterName(district.name).base) p.seat = true;
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
  // [region id, lat, lon] (the region the place lies in)
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
console.log(`regions ${states.length}, districts ${districts.length} of ${DISTRICT_CATALOG.length}`);
const missing = DISTRICT_CATALOG.filter((d) => !districtIdx.has(d.key)).map((d) => d.key);
console.log(`catalog districts without places (${missing.length}):`, missing.join(' | '));
console.log('unmatched states:', [...unmatchedStates.entries()]);
console.log(
  'unmatched districts (top):',
  [...unmatchedDistricts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([k, n]) => `${k} (${n})`)
    .join(' | ')
);
console.log(`written ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} kB)`);
