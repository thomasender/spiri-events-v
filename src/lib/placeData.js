import { prepareAdminShapes, prepareDistrictShapes } from '../utils/geoRegion';
import { buildRegionEntries, preparePlaceIndex } from '../utils/placeSearch';

// The bundled place list (about 380 kB gzipped) and the border shapes are only loaded when
// somebody opens "Wo bist du?" or saves an event, never with the first page.
let placePromise = null;
export function loadPlaceIndex() {
  placePromise ??= import('../data/placeIndex.json').then((m) => preparePlaceIndex(m.default ?? m));
  placePromise.catch(() => {
    placePromise = null;
  });
  return placePromise;
}

export { buildRegionEntries };

// Landkreis shapes (Germany) and Bundesland / Kanton outlines (Austria, Switzerland): only
// needed to put a shared GPS position into the right region near a border.
let shapesPromise = null;
export function loadGeoShapes() {
  shapesPromise ??= Promise.all([
    import('../data/landkreisMap.json'),
    import('../data/adminAtChMap.json'),
  ]).then(([districts, admin]) => ({
    districts: prepareDistrictShapes((districts.default ?? districts).districts),
    admin: prepareAdminShapes(admin.default ?? admin),
  }));
  shapesPromise.catch(() => {
    shapesPromise = null;
  });
  return shapesPromise;
}
