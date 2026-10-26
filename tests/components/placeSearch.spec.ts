import { describe, expect, it } from 'vitest';
import raw from '../../src/data/placeIndex.json';
import {
  buildRegionEntries,
  eventPosition,
  filterEventsByRadius,
  haversineKm,
  nearestPlace,
  placeDetail,
  preparePlaceIndex,
  searchPlaces,
  storedEventPosition,
} from '../../src/utils/placeSearch';
import { DISTRICT_CATALOG } from '../../src/utils/regionMapping';
import { REGION_SLUGS, STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';

// The real bundled list: it is what visitors search, so its shape is pinned here.
const index = preparePlaceIndex(raw);
const regions = STATIC_REGIONS;
const regionEntries = buildRegionEntries(index, regions);
const names = (query: string, limit?: number) =>
  searchPlaces(index, regionEntries, query, limit).map((e) => e.name);

describe('placeIndex.json', () => {
  it('only names known states and districts, with plausible coordinates', () => {
    for (const [slug, lat, lon] of raw.states) {
      expect(REGION_SLUGS).toContain(slug);
      expect(lat).toBeGreaterThan(44);
      expect(lat).toBeLessThan(56);
      expect(lon).toBeGreaterThan(5);
      expect(lon).toBeLessThan(18);
    }
    const catalogKeys = new Set(DISTRICT_CATALOG.map((d) => d.key));
    for (const [key] of raw.districts) expect(catalogKeys).toContain(key);
    for (const p of raw.places) {
      expect(p[3]).toBeGreaterThanOrEqual(0);
      expect(p[3]).toBeLessThan(raw.states.length);
      expect(p[4]).toBeLessThan(raw.districts.length);
    }
  });

  it('keeps every place inside the three countries (guards against broken coordinate sums)', () => {
    const outside = raw.places.filter(
      ([, lat, lon]) => lat < 45.5 || lat > 55.2 || lon < 5.5 || lon > 17.5
    );
    expect(outside).toEqual([]);
  });

  it('covers all 51 Bundesländer / Kantone and the vast majority of districts', () => {
    expect(raw.states).toHaveLength(51);
    expect(raw.districts.length).toBeGreaterThan(DISTRICT_CATALOG.length * 0.95);
    expect(raw.places.length).toBeGreaterThan(25000);
  });

  it('keeps the attribution', () => {
    expect(raw.source).toMatch(/GeoNames/);
    expect(raw.source).toMatch(/CC BY 4.0/);
  });
});

describe('haversineKm', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(47.5, 9.7, 47.5, 9.7)).toBe(0);
    expect(haversineKm(47.5, 9.7, 48.1, 11.6)).toBeCloseTo(haversineKm(48.1, 11.6, 47.5, 9.7), 6);
  });

  it('knows well-known distances (Bregenz - Munich is about 150 km)', () => {
    const d = haversineKm(47.503, 9.747, 48.137, 11.575);
    expect(d).toBeGreaterThan(145);
    expect(d).toBeLessThan(160);
  });
});

describe('searchPlaces', () => {
  it('finds a place without umlauts or case, and says where it is', () => {
    const hit = searchPlaces(index, regionEntries, 'dornbirn')[0];
    expect(hit.name).toBe('Dornbirn');
    expect(hit.stateSlug).toBe('vorarlberg');
    expect(placeDetail(hit)).toContain('Vorarlberg');
    expect(placeDetail(hit)).toContain('Österreich');
    expect(names('zurich')).toContain('Zürich');
  });

  it('finds regions by name, ahead of places', () => {
    const [first] = searchPlaces(index, regionEntries, 'vorarlberg');
    expect(first.kind).toBe('region');
    expect(first.regionId).toBe('vorarlberg');
    // the centre of a region lies inside it
    expect(first.lat).toBeGreaterThan(47);
    expect(first.lat).toBeLessThan(47.7);
  });

  it('finds a cultural region once a Landkreis is assigned to it', () => {
    const merged = mergeRegions([
      { id: 'schwarzwald', bezirke: ['Calw', 'Freudenstadt'], mappingUpdatedAt: 1 },
    ]);
    const entries = buildRegionEntries(index, merged);
    const hit = searchPlaces(index, entries, 'schwarzwald')[0];
    expect(hit).toMatchObject({ kind: 'region', regionId: 'schwarzwald' });
  });

  it('ranks exact before prefix before contains, limits the list, ignores one letter', () => {
    const list = searchPlaces(index, regionEntries, 'bregenz');
    expect(list[0].name).toBe('Bregenz');
    expect(searchPlaces(index, regionEntries, 'b')).toEqual([]);
    expect(searchPlaces(index, regionEntries, 'berg', 3)).toHaveLength(3);
    expect(searchPlaces(null, regionEntries, 'bregenz')).toEqual([]);
  });
});

describe('nearestPlace', () => {
  it('snaps a position to the closest place of the list', () => {
    const place = nearestPlace(index, 47.5031, 9.7471);
    expect(place?.name).toBe('Bregenz');
    expect(place?.stateSlug).toBe('vorarlberg');
  });

  it('prefers the town over a suburb next to it (Innsbruck, not Pradl)', () => {
    expect(nearestPlace(index, 47.2692, 11.4041)?.name).toBe('Innsbruck');
    expect(nearestPlace(index, 48.1374, 11.5755)?.name).toBe('München');
  });

  it('returns null far away from every place or for bad input', () => {
    expect(nearestPlace(index, 40.4, -3.7)).toBeNull();
    expect(nearestPlace(index, NaN, 9)).toBeNull();
  });
});

describe('eventPosition', () => {
  const at = (event: Record<string, unknown>) => eventPosition(event, index, regions);

  it('places an event in a Gemeinde of its Bezirk', () => {
    const pos = at({ city: 'Altach', bezirk: 'Feldkirch', regionId: 'vorarlberg' })!;
    expect(haversineKm(pos.lat, pos.lng, 47.38, 9.65)).toBeLessThan(5);
  });

  it('takes the namesake in the right Bezirk (Neustadt exists many times)', () => {
    const a = at({ city: 'Neustadt', bezirk: 'Wiener Neustadt', regionId: 'niederoesterreich' });
    expect(a).not.toBeNull();
  });

  it('falls back to the Bezirk centre, then to the Bundesland, when the Ort is unknown', () => {
    const district = at({ city: 'Gibtsnicht', bezirk: 'Bregenz', regionId: 'vorarlberg' })!;
    const bregenz = nearestPlace(index, 47.5031, 9.7471)!;
    expect(haversineKm(district.lat, district.lng, bregenz.lat, bregenz.lon)).toBeLessThan(25);
    const state = at({ city: '', bezirk: '', regionId: 'vorarlberg' })!;
    expect(state.lat).toBeGreaterThan(46.8);
    expect(state.lat).toBeLessThan(47.7);
  });

  it('finds a place outside the region for "Grenznahe" (Lindau)', () => {
    const pos = at({ city: 'Lindau', bezirk: 'Grenznahe', regionId: 'vorarlberg' })!;
    expect(haversineKm(pos.lat, pos.lng, 47.55, 9.69)).toBeLessThan(10);
  });

  it('has no position for online events or without an index', () => {
    expect(at({ isOnline: true, city: 'Altach', bezirk: 'Feldkirch' })).toBeNull();
    expect(eventPosition({ city: 'Altach' }, null, regions)).toBeNull();
  });
});

describe('filterEventsByRadius', () => {
  const bregenz = { lat: 47.503, lon: 9.747 };
  const events = [
    { id: 'near', lat: 47.51, lng: 9.75, regionId: 'vorarlberg' },
    { id: 'lindau', lat: 47.55, lng: 9.69, regionId: 'bayern' },
    { id: 'munich', lat: 48.137, lng: 11.575, regionId: 'bayern' },
    { id: 'online', isOnline: true, regionId: 'tirol' },
    { id: 'noPosHome', regionId: 'vorarlberg' },
    { id: 'noPosAway', regionId: 'tirol' },
  ];

  it('keeps everything within the radius, whatever region it lies in', () => {
    const ids = filterEventsByRadius(events, { ...bregenz, km: 25, regionId: 'vorarlberg' }).map(
      (e) => e.id
    );
    expect(ids).toEqual(['near', 'lindau', 'online', 'noPosHome']);
  });

  it('a bigger radius reaches farther; events without position stay in their own region only', () => {
    const ids = filterEventsByRadius(events, { ...bregenz, km: 200, regionId: 'vorarlberg' }).map(
      (e) => e.id
    );
    expect(ids).toContain('munich');
    expect(ids).not.toContain('noPosAway');
  });

  it('is safe with bad input', () => {
    expect(filterEventsByRadius(null as never, { ...bregenz, km: 10 })).toEqual([]);
  });
});

describe('storedEventPosition', () => {
  it('reads numbers, rejects null / missing / garbage (null is not 0)', () => {
    expect(storedEventPosition({ lat: 47.5, lng: 9.7 })).toEqual({ lat: 47.5, lng: 9.7 });
    expect(storedEventPosition({ lat: null, lng: null })).toBeNull();
    expect(storedEventPosition({})).toBeNull();
    expect(storedEventPosition({ lat: 'x', lng: 9 })).toBeNull();
  });
});
