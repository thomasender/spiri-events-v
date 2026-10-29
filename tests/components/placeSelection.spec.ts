import { describe, expect, it } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  RADIUS_OPTIONS,
  PLACE_SELECTION_KEY,
  activeRadiusFilter,
  normalizeSelection,
  readPlaceSelection,
  reconcileSelections,
  regionIdForEntry,
  selectionLabel,
  writePlaceSelection,
} from '../../src/utils/placeSelection';

const bregenz = {
  label: 'Bregenz',
  lat: 47.5031,
  lon: 9.7471,
  radiusKm: 50,
  regionId: 'vorarlberg',
  source: 'search',
  updatedAt: 1000,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  } as unknown as Storage & { data: Record<string, string> };
}

describe('normalizeSelection', () => {
  it('rounds the coordinates to the place (3 decimals) and keeps the rest', () => {
    expect(normalizeSelection(bregenz)).toEqual({ ...bregenz, lat: 47.503, lon: 9.747 });
  });

  it('falls back to the default radius, no region and the "search" source', () => {
    const s = normalizeSelection({ label: 'Bregenz', lat: 47.5, lon: 9.7, radiusKm: 'x' })!;
    expect(s.radiusKm).toBe(DEFAULT_RADIUS_KM);
    expect(s.regionId).toBeNull();
    expect(s.source).toBe('search');
    expect(normalizeSelection({ ...bregenz, regionId: 'narnia' })!.regionId).toBeNull();
  });

  it('offers the steps 5 / 10 / 15 / 20 / 25 / 50 km, the default among them', () => {
    expect([...RADIUS_OPTIONS]).toEqual([5, 10, 15, 20, 25, 50]);
    expect(RADIUS_OPTIONS).toContain(DEFAULT_RADIUS_KM);
    expect(DEFAULT_RADIUS_KM).toBe(25);
    expect(MAX_RADIUS_KM).toBe(50);
  });

  it.each([
    [100, 50],
    [500, 50],
    [5000, 50],
    [30, 25],
    [12, 10],
    [7, 5],
    [5, 5],
    [50, 50],
    [17.5, 15],
    ['x', 25],
    [0, 25],
    [-3, 25],
    [null, 25],
    [undefined, 25],
  ])('rounds a stored radius %s to the allowed step %s', (stored, expected) => {
    expect(normalizeSelection({ ...bregenz, radiusKm: stored })!.radiusKm).toBe(expected);
  });

  it('rejects anything without a label or with impossible coordinates', () => {
    expect(normalizeSelection(null)).toBeNull();
    expect(normalizeSelection('x')).toBeNull();
    expect(normalizeSelection({ ...bregenz, label: '  ' })).toBeNull();
    expect(normalizeSelection({ ...bregenz, lat: 91 })).toBeNull();
    expect(normalizeSelection({ ...bregenz, lon: NaN })).toBeNull();
  });
});

describe('storage', () => {
  it('writes, reads and forgets the selection', () => {
    const storage = memoryStorage();
    writePlaceSelection(normalizeSelection(bregenz), storage);
    expect(readPlaceSelection(storage)).toMatchObject({ label: 'Bregenz', radiusKm: 50 });
    writePlaceSelection(null, storage);
    expect(storage.data[PLACE_SELECTION_KEY]).toBeUndefined();
    expect(readPlaceSelection(storage)).toBeNull();
  });

  it('ignores garbage and storage that throws', () => {
    expect(readPlaceSelection(memoryStorage({ [PLACE_SELECTION_KEY]: '{nope' }))).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(readPlaceSelection(broken)).toBeNull();
    expect(() => writePlaceSelection(normalizeSelection(bregenz), broken)).not.toThrow();
  });

  it('never stores more than the place: no exact position field exists', () => {
    const storage = memoryStorage();
    writePlaceSelection(
      normalizeSelection({ ...bregenz, latitude: 47.50312345, accuracy: 12 }),
      storage
    );
    expect(Object.keys(JSON.parse(storage.data[PLACE_SELECTION_KEY])).sort()).toEqual([
      'label',
      'lat',
      'lon',
      'radiusKm',
      'regionId',
      'source',
      'updatedAt',
    ]);
  });
});

describe('activeRadiusFilter (dark launch and region guard)', () => {
  const sel = normalizeSelection(bregenz);
  const ctx = { regionId: 'vorarlberg', isNational: false, activeCount: 2 };

  it("applies for the place's own region with two active regions", () => {
    expect(activeRadiusFilter(sel, ctx)).toEqual({ lat: 47.503, lon: 9.747, km: 50 });
  });

  it('is off with fewer than two active regions: nothing visible changes', () => {
    expect(activeRadiusFilter(sel, { ...ctx, activeCount: 1 })).toBeNull();
  });

  it('is off in a combined view, for another region, or without a selection', () => {
    expect(activeRadiusFilter(sel, { ...ctx, isNational: true })).toBeNull();
    expect(activeRadiusFilter(sel, { ...ctx, regionId: 'tirol' })).toBeNull();
    expect(activeRadiusFilter(null, ctx)).toBeNull();
  });
});

describe('reconcileSelections (browser vs profile)', () => {
  const local = normalizeSelection({ ...bregenz, updatedAt: 2000 })!;
  const remote = normalizeSelection({ ...bregenz, label: 'Dornbirn', updatedAt: 1000 })!;

  it('copies whichever side exists to the other', () => {
    expect(reconcileSelections(local, null)).toEqual({
      selection: local,
      writeProfile: true,
      writeLocal: false,
    });
    expect(reconcileSelections(null, remote)).toEqual({
      selection: remote,
      writeProfile: false,
      writeLocal: true,
    });
    expect(reconcileSelections(null, null).selection).toBeNull();
  });

  it('the newer one wins', () => {
    expect(reconcileSelections(local, remote)).toMatchObject({
      selection: local,
      writeProfile: true,
      writeLocal: false,
    });
    const newerRemote = { ...remote, updatedAt: 3000 };
    expect(reconcileSelections(local, newerRemote)).toMatchObject({
      selection: newerRemote,
      writeProfile: false,
      writeLocal: true,
    });
  });

  it('writes nothing when both are the same', () => {
    expect(reconcileSelections(local, { ...local })).toMatchObject({
      writeProfile: false,
      writeLocal: false,
    });
  });
});

describe('regionIdForEntry', () => {
  it('a region hit is the region itself', () => {
    expect(regionIdForEntry({ kind: 'region', regionId: 'tirol' }, STATIC_REGIONS)).toBe('tirol');
  });

  it('a place goes to the region that holds its district, else to its Bundesland', () => {
    const place = { kind: 'place', districtKey: 'DE|Calw', stateSlug: 'baden-wuerttemberg' };
    expect(regionIdForEntry(place, STATIC_REGIONS)).toBe('baden-wuerttemberg');
    const merged = mergeRegions([
      { id: 'schwarzwald', bezirke: ['Calw'], mappingUpdatedAt: 1 },
      { id: 'baden-wuerttemberg', bezirke: [], mappingUpdatedAt: 1 },
    ]);
    expect(regionIdForEntry(place, merged)).toBe('schwarzwald');
    expect(regionIdForEntry({ kind: 'place', stateSlug: 'tirol' }, STATIC_REGIONS)).toBe('tirol');
    expect(regionIdForEntry({ kind: 'place', stateSlug: 'narnia' }, STATIC_REGIONS)).toBeNull();
  });
});

describe('selectionLabel', () => {
  it('names place and radius', () => {
    expect(selectionLabel(normalizeSelection(bregenz))).toBe('Bregenz · 50 km');
    expect(selectionLabel(null)).toBe('');
  });
});
