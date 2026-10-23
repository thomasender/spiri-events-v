import { CATALOG_BY_KEY, currentAssignment } from './regionMapping.js';

// "Meinen Standort verwenden" (ticket 567): lat/lon -> region, computed entirely in the
// browser. No reverse geocoding, no IP lookup, nothing is sent anywhere, and the
// coordinates are never stored. Pure, free of Firebase/React imports.
//
// Two datasets, both bundled and lazily loaded by LocateRegionButton.jsx:
// - Germany: Landkreis shapes (landkreisMap.json, SVG units, see GEO_PROJECTION) -> region
//   via the current assignment (Verwaltung -> "Zuordnung").
// - Austria / Switzerland: Bundesland / Kanton outlines in plain lon/lat
//   (adminAtChMap.json from the official BEV / swisstopo borders via geoBoundaries,
//   simplified to about 0.1-0.15 km, see scripts/build-admin-at-ch-map.mjs) -> the region
//   with that slug, plus Liechtenstein, which has no region ("no match").
// Order (positionHit): an exact hit in AT/CH/LI, then an exact hit in a Landkreis, and
// only when there is no exact hit anywhere the nearest shape within its tolerance. So the
// German tolerance can never pull an Austrian or Swiss position into a Landkreis, and
// where the (less precise) projected German shapes overlap an AT/CH outline, AT/CH wins.
//
// The Landkreis shapes (src/data/landkreisMap.json, from the product owner's map) are in
// SVG units of a 539.7 x 720.8 viewBox, not lat/lon. The map is an equirectangular
// projection fitted to Germany's bounding box (no Mercator curvature visible in the
// residuals). The constants below were fitted by least squares on the label points of 54
// kreisfreie Städte against their known city-centre coordinates:
//   RMS 1.3 SVG units in x, 1.6 in y, at most 4.4 (the labels are shape centres, not the
//   exact city centres, so part of that is label noise, not projection error).
// One SVG unit is about 1.2 km, so the result is accurate to roughly 2-3 km, worst case
// about 5 km. A position right next to a Landkreis border can therefore land in the
// neighbouring Landkreis; the simplified map outlines (about 2015 geometry) add to that.
// Checked with well-known cities in tests/components/geoRegion.spec.ts.
export const GEO_PROJECTION = Object.freeze({
  lon0: 5.866,
  lat0: 55.058,
  x0: 10.17,
  y0: 8.69,
  xPerDegLon: 56.53,
  yPerDegLat: 90.26,
});

// A point outside every shape but this close (SVG units, about 2.5 km) to one counts as
// that Landkreis (coast, border rivers, simplified outlines). Farther away: no match.
export const BORDER_TOLERANCE = 2;
// The same for the AT/CH outlines, in km: only the simplification noise of those
// (precise) outlines. A point farther outside really is outside Austria / Switzerland.
export const ADMIN_TOLERANCE_KM = 0.2;
// km per SVG unit of landkreisMap.json (mean of x and y at about 51 degrees north), only
// used to compare a near miss in Germany with one in AT/CH.
const KM_PER_SVG_UNIT = 1.25;
const KM_PER_DEG_LAT = 111.32;

/** lat/lon (WGS84 degrees) -> { x, y } in the SVG units of landkreisMap.json. */
export function projectToMap(lat, lon, p = GEO_PROJECTION) {
  return {
    x: p.x0 + (lon - p.lon0) * p.xPerDegLon,
    y: p.y0 + (p.lat0 - lat) * p.yPerDegLat,
  };
}

/**
 * Parses the paths of landkreisMap.json (only `M`, relative `l` with implicit repeats
 * and `Z`, as guarded by landkreisMap.spec.ts) into rings of absolute points.
 */
export function parsePathRings(d) {
  const rings = [];
  const re = /([MlZ])|(-?(?:\d+\.?\d*|\.\d+))/g;
  let cmd = null;
  let ring = null;
  let cx = 0;
  let cy = 0;
  let pending = null;
  let m;
  while ((m = re.exec(d))) {
    if (m[1]) {
      cmd = m[1];
      pending = null;
      if (cmd === 'Z') {
        if (ring) {
          cx = ring[0][0];
          cy = ring[0][1];
        }
        ring = null;
      }
      continue;
    }
    const n = Number(m[2]);
    if (pending === null) {
      pending = n;
      continue;
    }
    const a = pending;
    pending = null;
    if (cmd === 'M' && !ring) {
      cx = a;
      cy = n;
      ring = [[cx, cy]];
      rings.push(ring);
      continue;
    }
    if (cmd === 'M') {
      // Pairs after the first one of an M are absolute line-tos.
      cx = a;
      cy = n;
    } else {
      cx += a;
      cy += n;
    }
    if (!ring) {
      ring = [[cx, cy]];
      rings.push(ring);
    } else ring.push([cx, cy]);
  }
  return rings;
}

function insideRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// kx / ky scale x and y before measuring (lon/lat -> km); 1 for SVG units.
function distanceToRings(rings, x, y, kx = 1, ky = 1) {
  let best = Infinity;
  const p = [x * kx, y * ky];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = [ring[j][0] * kx, ring[j][1] * ky];
      const b = [ring[i][0] * kx, ring[i][1] * ky];
      best = Math.min(best, segmentDistance(p[0], p[1], a, b));
    }
  }
  return best;
}

function boxOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/** { key: { d } } of landkreisMap.json -> [{ key, rings, box }] for districtAt. */
export function prepareDistrictShapes(districts) {
  return Object.entries(districts).map(([key, { d }]) => {
    const rings = parsePathRings(d);
    return { key, rings, box: boxOf(rings) };
  });
}

// The shape containing (x, y), otherwise the nearest one within `tolerance` (box-filtered;
// distances in the units of the shapes, scaled by kx / ky), as { key, dist }; dist 0 =
// inside. null when nothing is close enough.
function nearestShape(shapes, x, y, tolerance, kx = 1, ky = 1) {
  const tx = tolerance / kx;
  const ty = tolerance / ky;
  let nearest = null;
  for (const s of shapes) {
    const [minX, minY, maxX, maxY] = s.box;
    if (x < minX - tx || x > maxX + tx || y < minY - ty || y > maxY + ty) continue;
    if (insideRings(s.rings, x, y)) return { key: s.key, dist: 0 };
    if (tolerance <= 0) continue;
    const dist = distanceToRings(s.rings, x, y, kx, ky);
    if (dist <= tolerance && (!nearest || dist < nearest.dist)) nearest = { key: s.key, dist };
  }
  return nearest;
}

/**
 * District key ("DE|<name>") at an SVG point: the shape that contains it, otherwise the
 * nearest shape within `tolerance`, otherwise null (outside Germany / out at sea).
 */
export function districtAt(shapes, x, y, tolerance = BORDER_TOLERANCE) {
  return nearestShape(shapes, x, y, tolerance)?.key ?? null;
}

/**
 * adminAtChMap.json -> [{ key, rings, box }] in lon/lat. key is the region slug of a
 * Bundesland / Kanton, or null for a country without a region (Liechtenstein).
 */
export function prepareAdminShapes(data) {
  const scale = data.scale;
  const decode = (flat) => {
    const ring = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < flat.length; i += 2) {
      x += flat[i];
      y += flat[i + 1];
      ring.push([x / scale, y / scale]);
    }
    return ring;
  };
  const shape = (key, rings) => {
    const decoded = rings.map(decode);
    return { key, rings: decoded, box: boxOf(decoded) };
  };
  return [
    ...Object.entries(data.regions).map(([slug, rings]) => shape(slug, rings)),
    ...Object.values(data.noRegion ?? {}).map((rings) => shape(null, rings)),
  ];
}

/**
 * Where a position lies: { districtKey } (Germany), { adminSlug } (a Bundesland / Kanton,
 * adminSlug null = Liechtenstein, no region) or null (outside everything). Exact hits in
 * all datasets come first (AT/CH/LI before Germany), the tolerances only afterwards.
 */
export function positionHit(lat, lon, shapes, adminShapes = []) {
  const kx = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const { x, y } = projectToMap(lat, lon);
  const admin = nearestShape(adminShapes, lon, lat, 0);
  if (admin) return { adminSlug: admin.key };
  const district = nearestShape(shapes, x, y, 0);
  if (district) return { districtKey: district.key };
  const nearAdmin = nearestShape(adminShapes, lon, lat, ADMIN_TOLERANCE_KM, kx, KM_PER_DEG_LAT);
  const nearDistrict = nearestShape(shapes, x, y, BORDER_TOLERANCE);
  if (nearAdmin && (!nearDistrict || nearAdmin.dist <= nearDistrict.dist * KM_PER_SVG_UNIT))
    return { adminSlug: nearAdmin.key };
  return nearDistrict ? { districtKey: nearDistrict.key } : null;
}

/**
 * Region for a district key via the CURRENT assignment (merged register, as edited in
 * Verwaltung -> "Zuordnung"). A Landkreis no cultural region holds stays with its
 * Bundesland (the home region of the backend structure). Returns the region or null.
 */
export function regionForDistrict(districtKey, regions) {
  if (!districtKey) return null;
  const byId = new Map(regions.map((r) => [r.id, r]));
  const holder = byId.get(currentAssignment(regions).get(districtKey));
  if (holder) return holder;
  return byId.get(CATALOG_BY_KEY.get(districtKey)?.stateSlug) ?? null;
}

/**
 * lat/lon -> { districtKey, region } (Germany) or { adminSlug, region } (Austria /
 * Switzerland: the Bundesland / Kanton is the region), or null when the position lies
 * outside all of them (Liechtenstein, Italy, France, ...) or no region holds it.
 */
export function regionForPosition(lat, lon, shapes, regions, adminShapes = []) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const hit = positionHit(lat, lon, shapes, adminShapes);
  if (!hit) return null;
  if ('adminSlug' in hit) {
    const region = hit.adminSlug ? regions.find((r) => r.id === hit.adminSlug) : null;
    return region ? { adminSlug: hit.adminSlug, region } : null;
  }
  const region = regionForDistrict(hit.districtKey, regions);
  return region ? { districtKey: hit.districtKey, region } : null;
}
