import { describe, expect, it } from 'vitest';
import adminAtChMap from '../../src/data/adminAtChMap.json';
import rawPlaces from '../../src/data/placeIndex.json';
import { STATIC_REGIONS } from '../../src/utils/regions';
import {
  ADMIN_SHAPE_REGIONS,
  locatePosition,
  positionHit,
  prepareAdminShapes,
  regionForPosition,
} from '../../src/utils/geoRegion';
import { preparePlaceIndex } from '../../src/utils/placeSearch';

// "Meinen Standort verwenden": lat/lon -> Bundesland / Kanton / Liechtenstein outline
// (adminAtChMap.json, official BEV / swisstopo borders via geoBoundaries, about 0.1-0.15 km)
// -> the region of the register that covers it (ADMIN_SHAPE_REGIONS). All local.
const admin = prepareAdminShapes(adminAtChMap);
const slugAt = (lat: number, lon: number) =>
  regionForPosition(lat, lon, STATIC_REGIONS, admin)?.region.slug ?? null;

describe('lat/lon -> Bundesland / Kanton', () => {
  it.each([
    ['Bregenz', 47.5031, 9.7471, 'vorarlberg'],
    ['Dornbirn', 47.4125, 9.7417, 'vorarlberg'],
    ['Feldkirch', 47.237, 9.598, 'vorarlberg'],
    ['Bludenz', 47.1547, 9.822, 'vorarlberg'],
    ['Mittelberg (Kleinwalsertal)', 47.322, 10.15, 'vorarlberg'],
    ['Innsbruck', 47.2692, 11.4041, 'tirol'],
    ['Jungholz', 47.575, 10.448, 'tirol'],
    ['Salzburg', 47.8095, 13.055, 'salzburg'],
    ['Klagenfurt', 46.6247, 14.3053, 'kaernten'],
    ['Graz', 47.0707, 15.4395, 'steiermark'],
    ['Linz', 48.3069, 14.2858, 'oberoesterreich'],
    ['St. Pölten', 48.2047, 15.6256, 'niederoesterreich'],
    ['Wien', 48.2082, 16.3738, 'wien'],
    ['Eisenstadt', 47.8456, 16.5232, 'burgenland'],
    ['Zürich', 47.3769, 8.5417, 'zuerich'],
    ['Bern', 46.948, 7.4474, 'bern'],
    ['Basel', 47.558, 7.588, 'basel'],
    ['Liestal', 47.484, 7.734, 'basel'],
    ['Genf', 46.2044, 6.1432, 'genf'],
    ['Lausanne', 46.5197, 6.6323, 'waadt'],
    ['Lugano', 46.0037, 8.9511, 'tessin'],
    ['Chur', 46.8508, 9.532, 'graubuenden'],
    ['St. Gallen', 47.4245, 9.3767, 'st-gallen'],
    ['Luzern', 47.0502, 8.3093, 'innerschweiz'],
    ['Sion', 46.2331, 7.3606, 'wallis'],
    ['Fribourg', 46.8065, 7.162, 'freiburg'],
    ['Neuchâtel', 46.99, 6.9293, 'neuenburg'],
    ['Delémont', 47.3649, 7.3445, 'jura'],
    ['Schaffhausen', 47.697, 8.634, 'schaffhausen'],
    ['Frauenfeld', 47.5536, 8.8986, 'thurgau'],
    ['Aarau', 47.3904, 8.0457, 'aargau'],
    ['Solothurn', 47.2088, 7.5323, 'solothurn'],
    ['Zug', 47.1662, 8.5155, 'innerschweiz'],
    ['Schwyz', 47.0207, 8.653, 'innerschweiz'],
    ['Altdorf', 46.8805, 8.6444, 'innerschweiz'],
    ['Sarnen', 46.896, 8.2461, 'innerschweiz'],
    ['Stans', 46.958, 8.366, 'innerschweiz'],
    ['Glarus', 47.0404, 9.068, 'glarus'],
    ['Herisau', 47.386, 9.279, 'appenzell'],
    ['Appenzell', 47.331, 9.409, 'appenzell'],
  ])('%s -> %s', (_label, lat, lon, slug) => {
    expect(slugAt(lat, lon)).toBe(slug);
  });

  // Pairs right at the German border: the AT/CH side gets its region by the outline, the
  // German side no outline (Germany is resolved by the place list, see locatePosition below).
  it.each([
    ['Konstanz, Altstadt', 47.66, 9.175, null],
    ['Konstanz, Bahnhof', 47.6585, 9.1775, null],
    ['Kreuzlingen', 47.6458, 9.1752, 'thurgau'],
    ['Kreuzlingen, Hafen', 47.652, 9.188, 'thurgau'],
    ['Lindau, Insel', 47.546, 9.684, null],
    ['Lindau-Reutin', 47.556, 9.707, null],
    ['Hörbranz', 47.552, 9.755, 'vorarlberg'],
    ['Lochau', 47.53, 9.75, 'vorarlberg'],
    ['Passau, Altstadt', 48.574, 13.465, null],
    ['Passau, Innstadt', 48.57, 13.46, null],
    ['Freinberg', 48.539, 13.457, 'oberoesterreich'],
    ['Schärding', 48.457, 13.432, 'oberoesterreich'],
    ['Basel, Kleinhüningen', 47.581, 7.591, 'basel'],
    ['Riehen', 47.585, 7.648, 'basel'],
    ['Weil am Rhein', 47.5935, 7.6206, null],
    ['Lörrach', 47.615, 7.661, null],
    ['Grenzach-Wyhlen', 47.545, 7.675, null],
    ['Salzburg-Liefering', 47.83, 13.0, 'salzburg'],
    ['Freilassing', 47.838, 12.977, null],
    ['Kufstein', 47.583, 12.17, 'tirol'],
    ['Kiefersfelden', 47.613, 12.189, null],
    ['Braunau am Inn', 48.258, 13.034, 'oberoesterreich'],
    ['Simbach am Inn', 48.265, 13.023, null],
    ['Rheinfelden (CH)', 47.554, 7.794, 'aargau'],
    ['Rheinfelden (Baden)', 47.561, 7.787, null],
    ['Koblenz (AG)', 47.605, 8.237, 'aargau'],
    ['Waldshut', 47.623, 8.214, null],
    ['Feldkirch-Tisis (next to Liechtenstein)', 47.228, 9.558, 'vorarlberg'],
    ['Buchs SG (next to Liechtenstein)', 47.168, 9.478, 'st-gallen'],
    ['Lustenau', 47.427, 9.659, 'vorarlberg'],
    ['St. Margrethen', 47.452, 9.637, 'st-gallen'],
  ] as [string, number, number, string | null][])('border: %s -> %s', (_label, lat, lon, slug) => {
    expect(slugAt(lat, lon)).toBe(slug);
  });

  it.each([
    ['Vaduz', 47.141, 9.521],
    ['Schaan', 47.165, 9.509],
    ['Triesen', 47.107, 9.526],
    ['Balzers', 47.066, 9.503],
    ['Ruggell', 47.238, 9.527],
  ])('%s -> liechtenstein', (_label, lat, lon) => {
    expect(slugAt(lat, lon)).toBe('liechtenstein');
  });

  it.each([
    ['Como', 45.81, 9.085],
    ['Campione d’Italia (enclave in Ticino)', 45.969, 8.971],
    ['Bozen', 46.4983, 11.3548],
    ['Annemasse', 46.193, 6.234],
    ['Ljubljana', 46.0569, 14.5058],
    ['Bratislava', 48.1486, 17.1077],
    ['Brno', 49.1951, 16.6068],
    ['München', 48.1374, 11.5755],
  ])('%s (other countries) -> no region', (_label, lat, lon) => {
    expect(slugAt(lat, lon)).toBeNull();
  });

  it('Liechtenstein is its own outline, not a near miss of St. Gallen or Vorarlberg', () => {
    expect(positionHit(47.141, 9.521, admin)).toEqual({ adminSlug: 'liechtenstein' });
  });

  it('an inactive Bundesland is still returned (the caller leads to "kommt bald")', () => {
    const hit = regionForPosition(47.2692, 11.4041, STATIC_REGIONS, admin);
    expect(hit).toMatchObject({ adminSlug: 'tirol', region: { slug: 'tirol', active: false } });
    expect(regionForPosition(Number.NaN, 9, STATIC_REGIONS, admin)).toBeNull();
  });

  it('every AT / CH / LI region has an outline and every outline belongs to a register region', () => {
    // Germany has no outlines (nearest place of the list instead).
    const register = STATIC_REGIONS.filter((r) => r.country !== 'DE')
      .map((r) => r.slug)
      .sort();
    expect(register).toHaveLength(29);
    const isos = Object.keys(adminAtChMap.shapes).sort();
    expect(isos).toEqual(Object.keys(ADMIN_SHAPE_REGIONS).sort());
    expect(isos).toHaveLength(36);
    for (const rings of Object.values(adminAtChMap.shapes)) expect(rings.length).toBeGreaterThan(0);
    expect([...new Set(Object.values(ADMIN_SHAPE_REGIONS))].sort()).toEqual(register);
    // Grouped cantons resolve to one region.
    expect(ADMIN_SHAPE_REGIONS['CH-LU']).toBe('innerschweiz');
    expect(ADMIN_SHAPE_REGIONS['CH-ZG']).toBe('innerschweiz');
    expect(ADMIN_SHAPE_REGIONS['CH-AR']).toBe('appenzell');
    expect(ADMIN_SHAPE_REGIONS['CH-BL']).toBe('basel');
    expect(ADMIN_SHAPE_REGIONS['AT-8']).toBe('vorarlberg');
  });
});

// "Meinen Standort verwenden" end to end: outline first (AT / CH / LI), else the nearest
// German place of the list -> its Landkreis -> region. Real data (placeIndex.json).
describe('locatePosition (outline, then nearest German place)', () => {
  const index = preparePlaceIndex(rawPlaces);
  const locate = (lat: number, lon: number, shapes: typeof admin | null = admin) =>
    locatePosition(lat, lon, index, STATIC_REGIONS, shapes);

  it.each([
    // Vorarlberg side must never change.
    ['Bregenz', 47.5031, 9.7471, 'vorarlberg', 'AT'],
    ['Hörbranz', 47.552, 9.755, 'vorarlberg', 'AT'],
    ['Lochau', 47.53, 9.75, 'vorarlberg', 'AT'],
    ['Lustenau', 47.427, 9.659, 'vorarlberg', 'AT'],
    ['Feldkirch-Tisis', 47.228, 9.558, 'vorarlberg', 'AT'],
    ['Mittelberg (Kleinwalsertal)', 47.322, 10.15, 'vorarlberg', 'AT'],
    // German side of the Vorarlberg / Swiss border.
    ['Lindau, Insel', 47.546, 9.684, 'bodensee', 'DE'],
    ['Lindau-Reutin', 47.556, 9.707, 'bodensee', 'DE'],
    ['Konstanz, Altstadt', 47.66, 9.175, 'bodensee', 'DE'],
    ['Kreuzlingen', 47.6458, 9.1752, 'thurgau', 'CH'],
    ['Oberstaufen', 47.555, 10.022, 'allgaeu', 'DE'],
    // Passau / Schärding, Salzburg / Freilassing, Basel / Weil am Rhein.
    ['Passau, Altstadt', 48.574, 13.465, 'bayerischer-wald', 'DE'],
    ['Schärding', 48.457, 13.432, 'oberoesterreich', 'AT'],
    ['Freinberg', 48.539, 13.457, 'oberoesterreich', 'AT'],
    ['Salzburg-Liefering', 47.83, 13.0, 'salzburg', 'AT'],
    ['Freilassing', 47.838, 12.977, 'chiemgau', 'DE'],
    ['Basel, Kleinhüningen', 47.581, 7.591, 'basel', 'CH'],
    ['Weil am Rhein', 47.5935, 7.6206, 'suedbaden', 'DE'],
    ['Kufstein', 47.583, 12.17, 'tirol', 'AT'],
    ['Kiefersfelden', 47.613, 12.189, 'chiemgau', 'DE'],
    ['Braunau am Inn', 48.258, 13.034, 'oberoesterreich', 'AT'],
    ['Simbach am Inn', 48.265, 13.023, 'niederbayern', 'DE'],
    // Inland Germany.
    ['München, Marienplatz', 48.1374, 11.5755, 'muenchen', 'DE'],
    ['Stuttgart', 48.7758, 9.1829, 'region-stuttgart', 'DE'],
    ['Berlin, Mitte', 52.52, 13.405, 'berlin', 'DE'],
    ['Hamburg', 53.5511, 9.9937, 'hamburg', 'DE'],
    ['Essen', 51.4556, 7.0116, 'ruhrgebiet', 'DE'],
  ] as [string, number, number, string, string][])('%s -> %s', (_l, lat, lon, slug, country) => {
    const hit = locate(lat, lon);
    expect(hit?.regionId).toBe(slug);
    expect(hit?.place.country).toBe(country);
  });

  it('Liechtenstein resolves to its region with a Liechtenstein place', () => {
    expect(locate(47.141, 9.521)).toMatchObject({
      regionId: 'liechtenstein',
      place: { country: 'LI' },
    });
  });

  it('no place within 30 km: null; outside every country near Austria: the nearest place', () => {
    expect(locate(40.4168, -3.7038)).toBeNull(); // Madrid
    expect(locate(Number.NaN, 9)).toBeNull();
    // Sterzing (Italy): no outline, no German place near, so the nearest place (Tirol) as before.
    expect(locate(46.893, 11.43)).toMatchObject({ regionId: 'tirol', place: { country: 'AT' } });
  });

  it('without outlines (failed to load) the nearest place of any country decides', () => {
    expect(locate(47.5031, 9.7471, null)?.regionId).toBe('vorarlberg');
    expect(locate(48.1374, 11.5755, null)?.regionId).toBe('muenchen');
  });
});
