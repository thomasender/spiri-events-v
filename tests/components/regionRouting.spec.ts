import { describe, it, expect } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions.js';
import {
  ALL_REGIONS_SLUG,
  LAST_REGION_STORAGE_KEY,
  isAllRegionsViewAvailable,
  readLastRegion,
  regionCanonicalPath,
  regionLocative,
  regionPath,
  regionSlugFromPath,
  resolveCurrentRegionId,
  resolveTopLevelSlug,
  writeLastRegion,
} from '../../src/utils/regionRouting.js';

const WITH_TIROL = mergeRegions([{ id: 'tirol', active: true }]);

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('resolveTopLevelSlug', () => {
  it('an active region shows its calendar', () => {
    expect(resolveTopLevelSlug('vorarlberg')).toMatchObject({
      kind: 'region',
      region: { id: 'vorarlberg' },
    });
    expect(resolveTopLevelSlug('tirol', WITH_TIROL).kind).toBe('region');
  });

  it('an inactive region shows the coming-soon page, not a profile or 404', () => {
    expect(resolveTopLevelSlug('steiermark')).toMatchObject({
      kind: 'coming-soon',
      region: { id: 'steiermark', name: 'Steiermark' },
    });
    expect(resolveTopLevelSlug('wien', WITH_TIROL).kind).toBe('coming-soon');
  });

  it('usernames and unknown slugs are profiles', () => {
    expect(resolveTopLevelSlug('maria-muster')).toEqual({ kind: 'profile', region: null });
    expect(resolveTopLevelSlug('bayern').kind).toBe('profile');
    expect(resolveTopLevelSlug(undefined).kind).toBe('profile');
  });

  it('oesterreich is the combined view, coming soon while only one region is active', () => {
    expect(resolveTopLevelSlug(ALL_REGIONS_SLUG)).toEqual({ kind: 'coming-soon', region: null });
    expect(resolveTopLevelSlug(ALL_REGIONS_SLUG, WITH_TIROL)).toEqual({
      kind: 'all-regions',
      region: null,
    });
    expect(isAllRegionsViewAvailable(STATIC_REGIONS)).toBe(false);
  });
});

describe('regionSlugFromPath', () => {
  it('finds region and combined-view slugs in the first segment only', () => {
    expect(regionSlugFromPath('/tirol')).toBe('tirol');
    expect(regionSlugFromPath('/Tirol/verzeichnis')).toBe('tirol');
    expect(regionSlugFromPath('/oesterreich')).toBe('oesterreich');
    expect(regionSlugFromPath('/')).toBeNull();
    expect(regionSlugFromPath('/verzeichnis')).toBeNull();
    expect(regionSlugFromPath('/event/tirol')).toBeNull();
    expect(regionSlugFromPath('/maria-muster')).toBeNull();
  });
});

describe('resolveCurrentRegionId', () => {
  it('defaults to vorarlberg', () => {
    expect(resolveCurrentRegionId({})).toBe('vorarlberg');
  });
  it('/ uses the remembered region while it is active', () => {
    expect(resolveCurrentRegionId({ storedSlug: 'tirol', regions: WITH_TIROL })).toBe('tirol');
    expect(resolveCurrentRegionId({ storedSlug: 'tirol' })).toBe('vorarlberg');
  });
  it('the URL beats localStorage', () => {
    expect(
      resolveCurrentRegionId({ urlSlug: 'vorarlberg', storedSlug: 'tirol', regions: WITH_TIROL })
    ).toBe('vorarlberg');
  });
  it('an inactive or invalid URL region does not become the context', () => {
    expect(
      resolveCurrentRegionId({ urlSlug: 'wien', storedSlug: 'tirol', regions: WITH_TIROL })
    ).toBe('tirol');
    expect(resolveCurrentRegionId({ urlSlug: 'oesterreich', storedSlug: 'bayern' })).toBe(
      'vorarlberg'
    );
  });
});

describe('regionPath', () => {
  it('builds region addresses from a slug or region object', () => {
    expect(regionPath('tirol')).toBe('/tirol');
    expect(regionPath('tirol', '/verzeichnis')).toBe('/tirol/verzeichnis');
    expect(regionPath({ slug: 'wien' }, 'verzeichnis')).toBe('/wien/verzeichnis');
    expect(regionPath(ALL_REGIONS_SLUG)).toBe('/oesterreich');
  });
  it('falls back to vorarlberg for unknown slugs', () => {
    expect(regionPath('bayern')).toBe('/vorarlberg');
    expect(regionPath(null, '/verzeichnis')).toBe('/vorarlberg/verzeichnis');
  });
});

describe('regionCanonicalPath', () => {
  it('keeps the old addresses while Vorarlberg is the only active region', () => {
    expect(regionCanonicalPath('vorarlberg', '/')).toBe('/');
    expect(regionCanonicalPath('vorarlberg', '/verzeichnis')).toBe('/verzeichnis');
  });
  it('points to the region address once several regions are active', () => {
    expect(regionCanonicalPath('vorarlberg', '/', WITH_TIROL)).toBe('/vorarlberg');
    expect(regionCanonicalPath('tirol', '/verzeichnis', WITH_TIROL)).toBe('/tirol/verzeichnis');
  });
});

describe('regionLocative', () => {
  it('uses "in der" for the Steiermark', () => {
    expect(regionLocative({ slug: 'steiermark', name: 'Steiermark' })).toBe('in der Steiermark');
    expect(regionLocative({ slug: 'tirol', name: 'Tirol' })).toBe('in Tirol');
  });
});

describe('last region in localStorage', () => {
  it('round-trips valid region slugs only', () => {
    const store = memoryStorage();
    writeLastRegion('tirol', store);
    expect(store.data.get(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(readLastRegion(store)).toBe('tirol');
    writeLastRegion('oesterreich', store);
    writeLastRegion('bayern', store);
    expect(readLastRegion(store)).toBe('tirol');
    expect(readLastRegion(memoryStorage({ [LAST_REGION_STORAGE_KEY]: 'bayern' }))).toBeNull();
  });
  it('a throwing localStorage does not crash', () => {
    expect(readLastRegion(throwingStorage)).toBeNull();
    expect(() => writeLastRegion('tirol', throwingStorage)).not.toThrow();
  });
});
