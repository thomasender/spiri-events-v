import { describe, expect, it } from 'vitest';
import landkreisMap from '../../src/data/landkreisMap.json';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import {
  BORDER_TOLERANCE,
  districtAt,
  parsePathRings,
  prepareDistrictShapes,
  projectToMap,
  regionForDistrict,
  regionForPosition,
} from '../../src/utils/geoRegion';

// "Meinen Standort verwenden": lat/lon -> Landkreis (point in polygon on the map of the
// product owner) -> region via the current assignment. All local, no third-party service.
const shapes = prepareDistrictShapes(landkreisMap.districts);

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

  it('outside Germany and for invalid input there is no region', () => {
    expect(regionForPosition(47.5031, 9.7471, shapes, STATIC_REGIONS)).toBeNull();
    expect(regionForPosition(Number.NaN, 9, shapes, STATIC_REGIONS)).toBeNull();
  });
});
