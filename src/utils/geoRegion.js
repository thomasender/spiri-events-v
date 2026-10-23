import { CATALOG_BY_KEY, currentAssignment } from './regionMapping.js';

// "Meinen Standort verwenden" (ticket 567): lat/lon -> Landkreis -> region, computed
// entirely in the browser. No reverse geocoding, no IP lookup, nothing is sent anywhere,
// and the coordinates are never stored. Pure, free of Firebase/React imports.
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

function distanceToRings(rings, x, y) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      best = Math.min(best, segmentDistance(x, y, ring[j], ring[i]));
    }
  }
  return best;
}

/** { key: { d } } of landkreisMap.json -> [{ key, rings, box }] for districtAt. */
export function prepareDistrictShapes(districts) {
  return Object.entries(districts).map(([key, { d }]) => {
    const rings = parsePathRings(d);
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
    return { key, rings, box: [minX, minY, maxX, maxY] };
  });
}

/**
 * District key ("DE|<name>") at an SVG point: the shape that contains it, otherwise the
 * nearest shape within `tolerance`, otherwise null (outside Germany / out at sea).
 */
export function districtAt(shapes, x, y, tolerance = BORDER_TOLERANCE) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const s of shapes) {
    const [minX, minY, maxX, maxY] = s.box;
    if (
      x < minX - tolerance ||
      x > maxX + tolerance ||
      y < minY - tolerance ||
      y > maxY + tolerance
    )
      continue;
    if (insideRings(s.rings, x, y)) return s.key;
    const dist = distanceToRings(s.rings, x, y);
    if (dist < nearestDist) {
      nearest = s.key;
      nearestDist = dist;
    }
  }
  return nearestDist <= tolerance ? nearest : null;
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
 * lat/lon -> { districtKey, region } or null when the position lies outside the map
 * (outside Germany, e.g. Austria or Switzerland) or no region holds the district.
 */
export function regionForPosition(lat, lon, shapes, regions) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { x, y } = projectToMap(lat, lon);
  const districtKey = districtAt(shapes, x, y);
  const region = regionForDistrict(districtKey, regions);
  return region ? { districtKey, region } : null;
}
