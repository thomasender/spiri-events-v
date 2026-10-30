// "Meinen Standort verwenden" (ticket 567): lat/lon -> region, computed entirely in the
// browser. No reverse geocoding, no IP lookup, nothing is sent anywhere, and the
// coordinates are never stored. Pure, free of Firebase/React imports.
//
// Dataset (bundled, lazily loaded by PlacePicker.jsx via loadGeoShapes): the Bundesland /
// Kanton outlines of Austria and Switzerland plus Liechtenstein, in plain lon/lat
// (src/data/adminAtChMap.json from the official BEV / swisstopo borders via geoBoundaries,
// simplified to about 0.1-0.15 km, see scripts/build-admin-at-ch-map.mjs). The shapes are
// keyed by ISO 3166-2 code ("AT-8", "CH-LU", "LI"); ADMIN_SHAPE_REGIONS maps each onto the
// region of the register that covers it. Several cantons share one region (Luzern, Schwyz,
// Obwalden, Nidwalden, Uri, Zug -> Innerschweiz; both Appenzell -> Appenzell; both Basel ->
// Basel): the polygons are not merged, they simply resolve to the same region id.
// Germany has no region (yet), so a position there is "no region" (the German Landkreis
// projection was removed with the German regions; Trello QG0GR5lv).

// A point outside every outline but this close (km) to one counts as that outline: only the
// simplification noise of the (precise) outlines. A point farther outside really is outside.
export const ADMIN_TOLERANCE_KM = 0.2;
const KM_PER_DEG_LAT = 111.32;

// ISO 3166-2 code of an outline -> region id of the register. Guarded both ways (every
// register region has an outline, every outline a register region) by
// scripts/build-admin-at-ch-map.mjs and tests/components/geoRegion.spec.ts.
export const ADMIN_SHAPE_REGIONS = Object.freeze({
  'AT-1': 'burgenland',
  'AT-2': 'kaernten',
  'AT-3': 'niederoesterreich',
  'AT-4': 'oberoesterreich',
  'AT-5': 'salzburg',
  'AT-6': 'steiermark',
  'AT-7': 'tirol',
  'AT-8': 'vorarlberg',
  'AT-9': 'wien',
  'CH-AG': 'aargau',
  'CH-AI': 'appenzell',
  'CH-AR': 'appenzell',
  'CH-BE': 'bern',
  'CH-BL': 'basel',
  'CH-BS': 'basel',
  'CH-FR': 'freiburg',
  'CH-GE': 'genf',
  'CH-GL': 'glarus',
  'CH-GR': 'graubuenden',
  'CH-JU': 'jura',
  'CH-LU': 'innerschweiz',
  'CH-NE': 'neuenburg',
  'CH-NW': 'innerschweiz',
  'CH-OW': 'innerschweiz',
  'CH-SG': 'st-gallen',
  'CH-SH': 'schaffhausen',
  'CH-SO': 'solothurn',
  'CH-SZ': 'innerschweiz',
  'CH-TG': 'thurgau',
  'CH-TI': 'tessin',
  'CH-UR': 'innerschweiz',
  'CH-VD': 'waadt',
  'CH-VS': 'wallis',
  'CH-ZG': 'innerschweiz',
  'CH-ZH': 'zuerich',
  LI: 'liechtenstein',
});

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
 * adminAtChMap.json -> [{ key, rings, box }] in lon/lat. key is the region id the outline
 * belongs to (ADMIN_SHAPE_REGIONS), or null for an outline without a region.
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
  return Object.entries(data.shapes ?? {}).map(([iso, rings]) => {
    const decoded = rings.map(decode);
    return { key: ADMIN_SHAPE_REGIONS[iso] ?? null, iso, rings: decoded, box: boxOf(decoded) };
  });
}

/**
 * Where a position lies: { adminSlug } (the region of the outline that holds it, or of the
 * nearest one within ADMIN_TOLERANCE_KM; null = an outline without region) or null
 * (outside everything: Germany, Italy, France, ...).
 */
export function positionHit(lat, lon, adminShapes = []) {
  const kx = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const admin = nearestShape(adminShapes, lon, lat, 0);
  if (admin) return { adminSlug: admin.key };
  const nearAdmin = nearestShape(adminShapes, lon, lat, ADMIN_TOLERANCE_KM, kx, KM_PER_DEG_LAT);
  return nearAdmin ? { adminSlug: nearAdmin.key } : null;
}

/**
 * lat/lon -> { adminSlug, region } (the region covering that Bundesland / Kanton /
 * Liechtenstein), or null when the position lies outside all of them (Germany, Italy,
 * France, ...) or no region holds it.
 */
export function regionForPosition(lat, lon, regions, adminShapes = []) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const hit = positionHit(lat, lon, adminShapes);
  if (!hit) return null;
  const region = hit.adminSlug ? regions.find((r) => r.id === hit.adminSlug) : null;
  return region ? { adminSlug: hit.adminSlug, region } : null;
}
