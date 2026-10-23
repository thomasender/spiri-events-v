#!/usr/bin/env node
// Builds the Bundesland / Kanton outlines of Austria and Switzerland for "Meinen
// Standort verwenden" (src/utils/geoRegion.js) -> src/data/adminAtChMap.json.
// Lazily loaded by LocateRegionButton.jsx only after the visitor asked for the location.
//
// Sources (downloads are not committed; treated as untrusted data, parsed as JSON only):
// - Austria: geoBoundaries gbOpen AUT ADM1 (boundaryID AUT-ADM1-97560089, build
//   Dec 12, 2023; source BEV, Bundesamt für Eich- und Vermessungswesen), licence
//   CC BY-SA 2.0 as stated by geoBoundaries.
// - Switzerland: geoBoundaries gbOpen CHE ADM1 (CHE-ADM1-70761945, build Dec 12, 2023;
//   source swisstopo swissBOUNDARIES3D), licence swisstopo OGD (free use, source must be
//   named).
// - Liechtenstein (no region, only so a position there stays "no match"): Natural Earth
//   Admin 1 1:10m, public domain.
// Natural Earth alone is too coarse for AT / CH (it puts Konstanz into Thurgau and
// Passau into Oberösterreich), see docs/regions.md.
//
//   G=https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen
//   curl -sSLo aut.geojson $G/AUT/ADM1/geoBoundaries-AUT-ADM1.geojson   # sha256 b8fe718a…
//   curl -sSLo che.geojson $G/CHE/ADM1/geoBoundaries-CHE-ADM1.geojson   # sha256 c5528a47…
//   curl -sSLo ne.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   node scripts/build-admin-at-ch-map.mjs aut.geojson che.geojson ne.geojson
//
// Keeps the 9 Bundesländer and the 26 Kantone, matched by ISO 3166-2 code AND an explicit
// list of accepted names (both must agree), and checks them against the region register
// both ways. Coordinates stay plain lon/lat: simplified (Douglas-Peucker, SIMPLIFY_KM)
// and rounded to 1/1000 degree (about 110 m north-south, 75 m east-west). Each ring is
// stored as integers [lon0, lat0, dLon1, dLat1, ...] in 1/1000 degree.
import { readFileSync, writeFileSync } from 'node:fs';
import { STATIC_REGIONS } from '../src/utils/regions.js';

const root = new URL('..', import.meta.url).pathname;
const SCALE = 1000;
const SIMPLIFY_KM = 0.1;

// ISO 3166-2 -> slug and the names accepted for it (geoBoundaries shapeName; German,
// French, Italian and English variants so a renamed source fails loudly, not silently).
const ADMIN = {
  'AT-1': ['burgenland', 'Burgenland'],
  'AT-2': ['kaernten', 'Kärnten', 'Carinthia'],
  'AT-3': ['niederoesterreich', 'Niederösterreich', 'Lower Austria'],
  'AT-4': ['oberoesterreich', 'Oberösterreich', 'Upper Austria'],
  'AT-5': ['salzburg', 'Salzburg'],
  'AT-6': ['steiermark', 'Steiermark', 'Styria'],
  'AT-7': ['tirol', 'Tirol', 'Tyrol'],
  'AT-8': ['vorarlberg', 'Vorarlberg'],
  'AT-9': ['wien', 'Wien', 'Vienna'],
  'CH-AG': ['aargau', 'Aargau'],
  'CH-AI': ['appenzell-innerrhoden', 'Appenzell Innerrhoden'],
  'CH-AR': ['appenzell-ausserrhoden', 'Appenzell Ausserrhoden'],
  'CH-BE': ['bern', 'Bern', 'Berne'],
  'CH-BL': ['basel-landschaft', 'Basel-Landschaft'],
  'CH-BS': ['basel-stadt', 'Basel-Stadt'],
  'CH-FR': ['freiburg', 'Freiburg', 'Fribourg'],
  'CH-GE': ['genf', 'Genf', 'Genève', 'Geneva'],
  'CH-GL': ['glarus', 'Glarus'],
  'CH-GR': ['graubuenden', 'Graubünden', 'Grisons', 'Grigioni'],
  'CH-JU': ['jura', 'Jura'],
  'CH-LU': ['luzern', 'Luzern', 'Lucerne'],
  'CH-NE': ['neuenburg', 'Neuenburg', 'Neuchâtel'],
  'CH-NW': ['nidwalden', 'Nidwalden'],
  'CH-OW': ['obwalden', 'Obwalden'],
  'CH-SG': ['st-gallen', 'St. Gallen', 'Sankt Gallen'],
  'CH-SH': ['schaffhausen', 'Schaffhausen'],
  'CH-SO': ['solothurn', 'Solothurn'],
  'CH-SZ': ['schwyz', 'Schwyz'],
  'CH-TG': ['thurgau', 'Thurgau'],
  'CH-TI': ['tessin', 'Tessin', 'Ticino'],
  'CH-UR': ['uri', 'Uri'],
  'CH-VD': ['waadt', 'Waadt', 'Vaud'],
  'CH-VS': ['wallis', 'Wallis', 'Valais'],
  'CH-ZG': ['zug', 'Zug'],
  'CH-ZH': ['zuerich', 'Zürich', 'Zurich'],
};
// Countries without a region of this app (from Natural Earth): a position there is
// "no match" instead of snapping to St. Gallen / Vorarlberg.
const NO_REGION_COUNTRIES = ['LI'];

const [autPath, chePath, nePath] = process.argv.slice(2);
if (!autPath || !chePath || !nePath) {
  console.error(
    'usage: node scripts/build-admin-at-ch-map.mjs <geoBoundaries-AUT-ADM1.geojson> <geoBoundaries-CHE-ADM1.geojson> <ne_10m_admin_1_states_provinces.geojson>'
  );
  process.exit(1);
}
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const polysOf = (g) =>
  g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];

// Douglas-Peucker in km (local equirectangular scale at 47 degrees north).
const KX = 111.32 * Math.cos((47 * Math.PI) / 180);
const KY = 111.32;
function simplify(ring, epsKm) {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const dx = (ring[b][0] - ring[a][0]) * KX;
    const dy = (ring[b][1] - ring[a][1]) * KY;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const px = (ring[i][0] - ring[a][0]) * KX;
      const py = (ring[i][1] - ring[a][1]) * KY;
      const d = len ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0 && bestD > epsKm) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

function encodeRing(ring, label) {
  if (
    !Array.isArray(ring) ||
    !ring.every((c) => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]))
  )
    throw new Error(`${label}: invalid coordinates`);
  const pts = simplify(
    ring.map((c) => [Number(c[0]), Number(c[1])]),
    SIMPLIFY_KM
  ).map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);
  const out = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of pts) {
    if (out.length && x === px && y === py) continue;
    out.push(out.length ? x - px : x, out.length ? y - py : y);
    px = x;
    py = y;
  }
  return out.length >= 6 ? out : null;
}

const addRings = (target, geometry, label) => {
  for (const poly of polysOf(geometry))
    for (const ring of poly) {
      const enc = encodeRing(ring, label);
      if (enc) target.push(enc);
    }
};

const regions = {};
const noRegion = {};
const problems = [];
for (const [path, country] of [
  [autPath, 'AT'],
  [chePath, 'CH'],
]) {
  for (const f of read(path).features ?? []) {
    const iso = String(f?.properties?.shapeISO ?? '');
    const name = String(f?.properties?.shapeName ?? '');
    const entry = ADMIN[iso];
    if (!iso.startsWith(`${country}-`) || !entry) {
      problems.push(`${path}: no slug for ${iso} (${name})`);
      continue;
    }
    const [slug, ...names] = entry;
    if (!names.includes(name)) problems.push(`${iso}: unexpected name "${name}"`);
    if (regions[slug]) problems.push(`${iso}: listed twice`);
    regions[slug] = [];
    addRings(regions[slug], f.geometry, iso);
  }
}
for (const f of read(nePath).features ?? []) {
  const country = String(f?.properties?.iso_a2 ?? '');
  if (!NO_REGION_COUNTRIES.includes(country)) continue;
  addRings((noRegion[country] ??= []), f.geometry, country);
}

// Register <-> polygons, both ways.
const registerSlugs = STATIC_REGIONS.filter((r) => r.country === 'AT' || r.country === 'CH').map(
  (r) => r.slug
);
for (const s of registerSlugs)
  if (!regions[s]?.length) problems.push(`register region ${s} has no polygon`);
for (const s of Object.keys(regions))
  if (!registerSlugs.includes(s)) problems.push(`polygon ${s} is not a register region`);
for (const c of NO_REGION_COUNTRIES) if (!noRegion[c]) problems.push(`no outline for ${c}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const sorted = (o) =>
  Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]])
  );
const out = {
  source:
    'AT: geoBoundaries AUT ADM1 (BEV, CC BY-SA 2.0); CH: geoBoundaries CHE ADM1 (swisstopo, OGD, Quelle: swisstopo); LI: Natural Earth (public domain). Generated by scripts/build-admin-at-ch-map.mjs',
  scale: SCALE,
  regions: sorted(regions),
  noRegion: sorted(noRegion),
};
const json = JSON.stringify(out);
writeFileSync(root + 'src/data/adminAtChMap.json', json + '\n');
const points = [...Object.values(regions), ...Object.values(noRegion)]
  .flat()
  .reduce((a, r) => a + r.length / 2, 0);
console.log(
  `src/data/adminAtChMap.json: ${Object.keys(regions).length} regions, ${points} points, ${json.length} bytes`
);
