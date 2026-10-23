import { describe, expect, it } from 'vitest';
import adminAtChMap from '../../src/data/adminAtChMap.json';
import landkreisMap from '../../src/data/landkreisMap.json';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import {
  BORDER_TOLERANCE,
  districtAt,
  parsePathRings,
  positionHit,
  prepareAdminShapes,
  prepareDistrictShapes,
  projectToMap,
  regionForDistrict,
  regionForPosition,
} from '../../src/utils/geoRegion';

// "Meinen Standort verwenden": lat/lon -> Landkreis (point in polygon on the map of the
// product owner) -> region via the current assignment. All local, no third-party service.
const shapes = prepareDistrictShapes(landkreisMap.districts);
const admin = prepareAdminShapes(adminAtChMap);

// City centres (WGS84) -> the Landkreis / kreisfreie Stadt that contains them.
const CITIES: [string, number, number, string][] = [
  ['München, Marienplatz', 48.1374, 11.5755, 'München (Stadt)'],
  ['Berlin, Mitte', 52.52, 13.405, 'Berlin'],
  ['Hamburg', 53.5511, 9.9937, 'Hamburg'],
  ['Köln, Dom', 50.9413, 6.9583, 'Köln'],
  ['Leer (Ostfriesland)', 53.2316, 7.461, 'Leer'],
  ['Freiburg im Breisgau', 47.999, 7.8421, 'Freiburg im Breisgau'],
  ['Dresden', 51.0504, 13.7373, 'Dresden'],
  ['Flensburg', 54.7937, 9.447, 'Flensburg'],
  ['Konstanz (right at the Swiss border)', 47.6779, 9.1732, 'Konstanz'],
  ['Westerland (Sylt)', 54.9079, 8.3105, 'Nordfriesland'],
  ['Garmisch-Partenkirchen', 47.4917, 11.0955, 'Garmisch-Partenkirchen'],
  ['Lindau', 47.546, 9.684, 'Lindau (Bodensee)'],
  ['Görlitz', 51.1526, 14.9872, 'Görlitz'],
  ['Aachen', 50.7753, 6.0839, 'Städteregion Aachen'],
  ['Stralsund', 54.3091, 13.0818, 'Vorpommern-Rügen'],
  ['Hannover', 52.3759, 9.732, 'Region Hannover'],
  ['Stuttgart', 48.7758, 9.1829, 'Stuttgart'],
  ['Passau', 48.5665, 13.4312, 'Passau (Stadt)'],
];

const at = (lat: number, lon: number) => {
  const { x, y } = projectToMap(lat, lon);
  return districtAt(shapes, x, y);
};

describe('lat/lon -> Landkreis', () => {
  it.each(CITIES)('%s lies in %s', (_label, lat, lon, district) => {
    expect(at(lat, lon)).toBe(`DE|${district}`);
  });

  it.each([
    ['Bregenz (Vorarlberg)', 47.5031, 9.7471],
    ['Dornbirn (Vorarlberg)', 47.4125, 9.7417],
    ['Innsbruck', 47.2692, 11.4041],
    ['Salzburg', 47.8095, 13.055],
    ['Zürich', 47.3769, 8.5417],
    ['St. Gallen', 47.4245, 9.3767],
    ['Basel', 47.5596, 7.5886],
    ['Strasbourg', 48.5734, 7.7521],
    ['Amsterdam', 52.3676, 4.9041],
    ['Prag', 50.0755, 14.4378],
    ['North Sea', 54.5, 7.0],
  ])('%s is outside the map: no Landkreis', (_label, lat, lon) => {
    expect(at(lat, lon)).toBeNull();
  });

  it('projects with the fitted constants (one SVG unit is about 1.2 km)', () => {
    // Label point of Berlin on the map: about 1 unit from its projected city centre.
    const { x, y } = projectToMap(52.52, 13.405);
    const label = landkreisMap.districts['DE|Berlin'];
    expect(Math.hypot(x - label.x, y - label.y)).toBeLessThan(3);
  });
});

describe('districtAt', () => {
  const square = prepareDistrictShapes({
    'DE|A': { d: 'M0,0l10,0 0,10-10,0Z' },
    'DE|B': { d: 'M20,0l10,0 0,10-10,0Z' },
  });

  it('parses relative line-tos with implicit repeats and several rings', () => {
    expect(parsePathRings('M1,1l2,0 0,2-2,0ZM10,10l.5,0-.5,.5Z')).toEqual([
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ],
      [
        [10, 10],
        [10.5, 10],
        [10, 10.5],
      ],
    ]);
  });

  it('a point inside a shape is that shape', () => {
    expect(districtAt(square, 5, 5)).toBe('DE|A');
    expect(districtAt(square, 25, 5)).toBe('DE|B');
  });

  it(`a point just outside every shape (within ${BORDER_TOLERANCE} units) takes the nearest one`, () => {
    expect(districtAt(square, 11, 5)).toBe('DE|A');
    expect(districtAt(square, 18.5, 5)).toBe('DE|B');
    expect(districtAt(square, 5, -1.5)).toBe('DE|A');
  });

  it('a point farther away is no match', () => {
    expect(districtAt(square, 15, 5)).toBeNull();
    expect(districtAt(square, 5, -5)).toBeNull();
  });
});

describe('Landkreis -> region (current assignment)', () => {
  const byName = (slug: string) => STATIC_REGIONS.find((r) => r.slug === slug)!;

  it('without cultural regions a Landkreis belongs to its Bundesland', () => {
    expect(regionForDistrict('DE|München (Stadt)', STATIC_REGIONS)?.slug).toBe('bayern');
    expect(regionForDistrict('DE|Leer', STATIC_REGIONS)?.slug).toBe('niedersachsen');
  });

  it('a Landkreis moved into a cultural region belongs to it', () => {
    const bayern = byName('bayern');
    const regions = mergeRegions([
      { id: 'ostfriesland', bezirke: ['Leer'], mappingUpdatedAt: 1 },
      {
        id: 'niedersachsen',
        bezirke: byName('niedersachsen').bezirke.filter((b) => b !== 'Leer'),
        mappingUpdatedAt: 1,
      },
      { id: 'bayern', bezirke: bayern.bezirke },
    ]);
    expect(regionForDistrict('DE|Leer', regions)?.slug).toBe('ostfriesland');
    expect(regionForDistrict('DE|Aurich', regions)?.slug).toBe('niedersachsen');
  });

  it('a Landkreis no region lists falls back to its Bundesland', () => {
    const regions = STATIC_REGIONS.map((r) =>
      r.slug === 'niedersachsen' ? { ...r, bezirke: r.bezirke.filter((b) => b !== 'Leer') } : r
    );
    expect(regionForDistrict('DE|Leer', regions)?.slug).toBe('niedersachsen');
    expect(regionForDistrict(null, regions)).toBeNull();
  });

  it('returns the region even when it is not open yet (the caller leads to "kommt bald")', () => {
    const hit = regionForPosition(53.2316, 7.461, shapes, STATIC_REGIONS);
    expect(hit?.districtKey).toBe('DE|Leer');
    expect(hit?.region.slug).toBe('niedersachsen');
    expect(hit?.region.active).toBe(false);
  });

  it('without the AT/CH outlines, outside Germany and for invalid input there is no region', () => {
    expect(regionForPosition(47.5031, 9.7471, shapes, STATIC_REGIONS)).toBeNull();
    expect(regionForPosition(Number.NaN, 9, shapes, STATIC_REGIONS, admin)).toBeNull();
  });
});

// Austria / Switzerland: the Bundesland / Kanton is the region (adminAtChMap.json, official
// BEV / swisstopo borders via geoBoundaries, about 0.1-0.15 km).
const slugAt = (lat: number, lon: number) =>
  regionForPosition(lat, lon, shapes, STATIC_REGIONS, admin)?.region.slug ?? null;

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
    ['Basel', 47.558, 7.588, 'basel-stadt'],
    ['Liestal', 47.484, 7.734, 'basel-landschaft'],
    ['Genf', 46.2044, 6.1432, 'genf'],
    ['Lausanne', 46.5197, 6.6323, 'waadt'],
    ['Lugano', 46.0037, 8.9511, 'tessin'],
    ['Chur', 46.8508, 9.532, 'graubuenden'],
    ['St. Gallen', 47.4245, 9.3767, 'st-gallen'],
    ['Luzern', 47.0502, 8.3093, 'luzern'],
    ['Sion', 46.2331, 7.3606, 'wallis'],
    ['Fribourg', 46.8065, 7.162, 'freiburg'],
    ['Neuchâtel', 46.99, 6.9293, 'neuenburg'],
    ['Delémont', 47.3649, 7.3445, 'jura'],
    ['Schaffhausen', 47.697, 8.634, 'schaffhausen'],
    ['Frauenfeld', 47.5536, 8.8986, 'thurgau'],
    ['Aarau', 47.3904, 8.0457, 'aargau'],
    ['Solothurn', 47.2088, 7.5323, 'solothurn'],
    ['Zug', 47.1662, 8.5155, 'zug'],
    ['Schwyz', 47.0207, 8.653, 'schwyz'],
    ['Altdorf', 46.8805, 8.6444, 'uri'],
    ['Sarnen', 46.896, 8.2461, 'obwalden'],
    ['Stans', 46.958, 8.366, 'nidwalden'],
    ['Glarus', 47.0404, 9.068, 'glarus'],
    ['Herisau', 47.386, 9.279, 'appenzell-ausserrhoden'],
    ['Appenzell', 47.331, 9.409, 'appenzell-innerrhoden'],
  ])('%s -> %s', (_label, lat, lon, slug) => {
    expect(slugAt(lat, lon)).toBe(slug);
  });

  // Pairs right at the German border: the precise AT/CH outlines are checked first, so
  // neither the German projection (2-3 km) nor its tolerance pulls a point across.
  it.each([
    ['Konstanz, Altstadt', 47.66, 9.175, 'baden-wuerttemberg'],
    ['Konstanz, Bahnhof', 47.6585, 9.1775, 'baden-wuerttemberg'],
    ['Kreuzlingen', 47.6458, 9.1752, 'thurgau'],
    ['Kreuzlingen, Hafen', 47.652, 9.188, 'thurgau'],
    ['Lindau, Insel', 47.546, 9.684, 'bayern'],
    ['Lindau-Reutin', 47.556, 9.707, 'bayern'],
    ['Hörbranz', 47.552, 9.755, 'vorarlberg'],
    ['Lochau', 47.53, 9.75, 'vorarlberg'],
    ['Passau, Altstadt', 48.574, 13.465, 'bayern'],
    ['Passau, Innstadt', 48.57, 13.46, 'bayern'],
    ['Freinberg', 48.539, 13.457, 'oberoesterreich'],
    ['Schärding', 48.457, 13.432, 'oberoesterreich'],
    ['Basel, Kleinhüningen', 47.581, 7.591, 'basel-stadt'],
    ['Riehen', 47.585, 7.648, 'basel-stadt'],
    ['Weil am Rhein', 47.5935, 7.6206, 'baden-wuerttemberg'],
    ['Lörrach', 47.615, 7.661, 'baden-wuerttemberg'],
    ['Grenzach-Wyhlen', 47.545, 7.675, 'baden-wuerttemberg'],
    ['Salzburg-Liefering', 47.83, 13.0, 'salzburg'],
    ['Freilassing', 47.838, 12.977, 'bayern'],
    ['Kufstein', 47.583, 12.17, 'tirol'],
    ['Kiefersfelden', 47.613, 12.189, 'bayern'],
    ['Braunau am Inn', 48.258, 13.034, 'oberoesterreich'],
    ['Simbach am Inn', 48.265, 13.023, 'bayern'],
    ['Rheinfelden (CH)', 47.554, 7.794, 'aargau'],
    ['Rheinfelden (Baden)', 47.561, 7.787, 'baden-wuerttemberg'],
    ['Koblenz (AG)', 47.605, 8.237, 'aargau'],
    ['Waldshut', 47.623, 8.214, 'baden-wuerttemberg'],
    ['Feldkirch-Tisis (next to Liechtenstein)', 47.228, 9.558, 'vorarlberg'],
    ['Buchs SG (next to Liechtenstein)', 47.168, 9.478, 'st-gallen'],
    ['Lustenau', 47.427, 9.659, 'vorarlberg'],
    ['St. Margrethen', 47.452, 9.637, 'st-gallen'],
  ])('border: %s -> %s', (_label, lat, lon, slug) => {
    expect(slugAt(lat, lon)).toBe(slug);
  });

  it.each([
    ['Vaduz', 47.141, 9.521],
    ['Schaan', 47.165, 9.509],
    ['Triesen', 47.107, 9.526],
    ['Balzers', 47.066, 9.503],
    ['Ruggell', 47.238, 9.527],
    ['Como', 45.81, 9.085],
    ['Campione d’Italia (enclave in Ticino)', 45.969, 8.971],
    ['Bozen', 46.4983, 11.3548],
    ['Annemasse', 46.193, 6.234],
    ['Ljubljana', 46.0569, 14.5058],
    ['Bratislava', 48.1486, 17.1077],
    ['Brno', 49.1951, 16.6068],
  ])('%s (Liechtenstein / other countries) -> no region', (_label, lat, lon) => {
    expect(slugAt(lat, lon)).toBeNull();
  });

  it('Liechtenstein is a known "no region", not a near miss of St. Gallen or Vorarlberg', () => {
    expect(positionHit(47.141, 9.521, shapes, admin)).toEqual({ adminSlug: null });
  });

  it('an inactive Bundesland is still returned (the caller leads to "kommt bald")', () => {
    const hit = regionForPosition(47.2692, 11.4041, shapes, STATIC_REGIONS, admin);
    expect(hit).toMatchObject({ adminSlug: 'tirol', region: { slug: 'tirol', active: false } });
    expect(hit?.districtKey).toBeUndefined();
  });

  it('every AT / CH register region has an outline and every outline is a register region', () => {
    const register = STATIC_REGIONS.filter((r) => r.country === 'AT' || r.country === 'CH')
      .map((r) => r.slug)
      .sort();
    expect(register).toHaveLength(35);
    expect(Object.keys(adminAtChMap.regions).sort()).toEqual(register);
    for (const rings of Object.values(adminAtChMap.regions))
      expect(rings.length).toBeGreaterThan(0);
    expect(Object.keys(adminAtChMap.noRegion)).toEqual(['LI']);
  });
});
