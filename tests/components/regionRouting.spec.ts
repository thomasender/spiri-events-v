import { describe, it, expect } from 'vitest';
import { STATIC_REGIONS, isRegionSlug, mergeRegions } from '../../src/utils/regions.js';
import {
  ALL_REGIONS_SLUG,
  COMBINED_VIEWS,
  LAST_REGION_STORAGE_KEY,
  availableCombinedViews,
  combinedViewRegions,
  getCombinedView,
  isAllRegionsViewAvailable,
  isCombinedViewAvailable,
  readLastRegion,
  redirectTargetPath,
  regionCanonicalPath,
  regionLocative,
  regionNavPath,
  regionPath,
  regionSlugFromPath,
  regionSwitchSubpath,
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
    expect(resolveTopLevelSlug('mars').kind).toBe('profile');
    expect(resolveTopLevelSlug(undefined).kind).toBe('profile');
  });

  it('oesterreich is the combined view, a redirect to the only active region otherwise', () => {
    expect(resolveTopLevelSlug(ALL_REGIONS_SLUG)).toMatchObject({
      kind: 'redirect',
      redirect: { region: { id: 'vorarlberg' } },
    });
    expect(resolveTopLevelSlug(ALL_REGIONS_SLUG, WITH_TIROL)).toMatchObject({
      kind: 'all-regions',
      region: null,
      view: { slug: 'oesterreich' },
    });
    expect(isAllRegionsViewAvailable(STATIC_REGIONS)).toBe(false);
    expect(resolveTopLevelSlug(ALL_REGIONS_SLUG, regionsWith())).toMatchObject({
      kind: 'coming-soon',
      view: { slug: 'oesterreich' },
    });
  });
});

// Regions with exactly the given ids active (all others inactive).
function regionsWith(...ids: string[]) {
  return STATIC_REGIONS.map((r) => ({ ...r, active: ids.includes(r.id) }));
}

describe('combined views (ticket 33)', () => {
  const available = (slug: string, regions: typeof STATIC_REGIONS) =>
    isCombinedViewAvailable(slug, regions);

  it('every region has a country: 9 Austrian, 19 Swiss, 1 Liechtenstein, no German one', () => {
    expect(STATIC_REGIONS.filter((r) => r.country === 'DE')).toHaveLength(0);
    expect(STATIC_REGIONS.filter((r) => r.country === 'AT')).toHaveLength(9);
    expect(STATIC_REGIONS.filter((r) => r.country === 'CH')).toHaveLength(19);
    expect(STATIC_REGIONS.filter((r) => r.country === 'LI').map((r) => r.id)).toEqual([
      'liechtenstein',
    ]);
  });

  it('the three slugs are fixed and keep the order of the chooser (no Deutschland, no Liechtenstein view)', () => {
    expect(COMBINED_VIEWS.map((v) => v.slug)).toEqual(['oesterreich', 'schweiz', 'alle-tribes']);
    expect(COMBINED_VIEWS.map((v) => v.name)).toEqual([
      'Ganz Österreich',
      'Ganz Schweiz',
      'Alle Tribes',
    ]);
  });

  it('country view: needs at least two active regions of that country', () => {
    expect(available('oesterreich', regionsWith())).toBe(false);
    expect(available('oesterreich', regionsWith('vorarlberg'))).toBe(false);
    expect(available('oesterreich', regionsWith('vorarlberg', 'tirol'))).toBe(true);
    // Zürich is not Austrian, Liechtenstein not Swiss.
    expect(available('oesterreich', regionsWith('vorarlberg', 'zuerich'))).toBe(false);
    expect(available('schweiz', regionsWith('zuerich'))).toBe(false);
    expect(available('schweiz', regionsWith('zuerich', 'liechtenstein'))).toBe(false);
    expect(available('schweiz', regionsWith('vorarlberg', 'tirol', 'zuerich'))).toBe(false);
    expect(available('schweiz', regionsWith('zuerich', 'innerschweiz'))).toBe(true);
    expect(available('deutschland', regionsWith('vorarlberg', 'tirol'))).toBe(false);
  });

  it('Alle Tribes: at least two active regions in total, one country is enough', () => {
    expect(available('alle-tribes', regionsWith('vorarlberg'))).toBe(false);
    expect(available('alle-tribes', regionsWith('vorarlberg', 'tirol'))).toBe(true);
    expect(available('alle-tribes', regionsWith('zuerich'))).toBe(false);
    expect(available('alle-tribes', regionsWith('vorarlberg', 'liechtenstein'))).toBe(true);
    expect(available('alle-tribes', regionsWith('vorarlberg', 'tirol', 'zuerich'))).toBe(true);
  });

  it('availableCombinedViews lists only available views in fixed order', () => {
    expect(availableCombinedViews(STATIC_REGIONS)).toEqual([]);
    expect(availableCombinedViews(regionsWith('vorarlberg', 'tirol')).map((v) => v.slug)).toEqual([
      'oesterreich',
      'alle-tribes',
    ]);
    expect(
      availableCombinedViews(regionsWith('vorarlberg', 'tirol', 'zuerich')).map((v) => v.slug)
    ).toEqual(['oesterreich', 'alle-tribes']);
  });

  it('combinedViewRegions: country view and global view cover active regions only (register order)', () => {
    const regions = regionsWith('vorarlberg', 'tirol', 'zuerich', 'liechtenstein');
    expect(combinedViewRegions('oesterreich', regions).map((r) => r.id)).toEqual([
      'tirol',
      'vorarlberg',
    ]);
    expect(combinedViewRegions('schweiz', regions).map((r) => r.id)).toEqual(['zuerich']);
    expect(combinedViewRegions('alle-tribes', regions).map((r) => r.id)).toEqual([
      'tirol',
      'vorarlberg',
      'zuerich',
      'liechtenstein',
    ]);
  });

  it('resolveTopLevelSlug: available -> view, one region -> redirect, none -> coming soon', () => {
    const at2 = regionsWith('vorarlberg', 'tirol');
    expect(resolveTopLevelSlug('schweiz', regionsWith('zuerich'))).toMatchObject({
      kind: 'redirect',
      region: null,
      redirect: { region: { id: 'zuerich' } },
    });
    expect(resolveTopLevelSlug('schweiz', at2)).toMatchObject({
      kind: 'coming-soon',
      region: null,
      view: { slug: 'schweiz' },
    });
    expect(resolveTopLevelSlug('alle-tribes', regionsWith('vorarlberg', 'zuerich'))).toMatchObject({
      kind: 'all-regions',
      view: { slug: 'alle-tribes' },
    });
    // One active region only: its page. Two regions of one country: the view itself.
    expect(resolveTopLevelSlug('alle-tribes', regionsWith('tirol'))).toMatchObject({
      kind: 'redirect',
      redirect: { region: { id: 'tirol' } },
    });
    expect(resolveTopLevelSlug('alle-tribes', at2)).toMatchObject({
      kind: 'all-regions',
      view: { slug: 'alle-tribes' },
    });
    expect(resolveTopLevelSlug('alle-tribes', regionsWith())).toMatchObject({
      kind: 'coming-soon',
    });
    // The former view /deutschland is no view any more (reserved, so no profile either).
    expect(resolveTopLevelSlug('deutschland', at2)).toMatchObject({ kind: 'profile' });
  });

  it('redirectTargetPath keeps the area and uses the old addresses for Vorarlberg only', () => {
    const only = regionsWith('vorarlberg');
    const vbg = only.find((r) => r.id === 'vorarlberg');
    expect(redirectTargetPath({ region: vbg }, '/', only)).toBe('/');
    expect(redirectTargetPath({ region: vbg }, '/verzeichnis', only)).toBe('/verzeichnis');
    const tirol = regionsWith('tirol');
    expect(
      redirectTargetPath({ region: tirol.find((r) => r.id === 'tirol') }, '/verzeichnis', tirol)
    ).toBe('/tirol/verzeichnis');
    // Nothing to redirect to (coming soon, or an unknown fallback): the start page.
    expect(redirectTargetPath(null, '/', tirol)).toBe('/');
  });

  it('every combined slug is a valid first path segment, region slugs stay separate', () => {
    for (const slug of ['oesterreich', 'schweiz', 'alle-tribes']) {
      expect(regionSlugFromPath(`/${slug}/verzeichnis`)).toBe(slug);
      expect(regionPath(slug, '/verzeichnis')).toBe(`/${slug}/verzeichnis`);
      expect(regionSwitchSubpath(`/${slug}/verzeichnis`)).toBe('/verzeichnis');
    }
    expect(isRegionSlug('deutschland')).toBe(false);
    expect(regionSlugFromPath('/deutschland')).toBeNull();
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
    expect(regionPath('mars')).toBe('/vorarlberg');
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
  it('has the right preposition for every region of the register', () => {
    const phrases = Object.fromEntries(STATIC_REGIONS.map((r) => [r.id, regionLocative(r)]));
    expect(phrases).toMatchObject({
      vorarlberg: 'in Vorarlberg',
      tirol: 'in Tirol',
      salzburg: 'in Salzburg',
      kaernten: 'in Kärnten',
      steiermark: 'in der Steiermark',
      oberoesterreich: 'in Oberösterreich',
      niederoesterreich: 'in Niederösterreich',
      wien: 'in Wien',
      burgenland: 'im Burgenland',
      wallis: 'im Wallis',
      waadt: 'in der Waadt',
      innerschweiz: 'in der Innerschweiz',
      appenzell: 'im Appenzellerland',
      liechtenstein: 'in Liechtenstein',
    });
    expect(Object.keys(phrases)).toEqual(STATIC_REGIONS.map((r) => r.id));
    // Firestore-merged regions keep the phrase; bare objects fall back by slug.
    expect(
      regionLocative(mergeRegions([{ id: 'tessin', active: true }]).find((r) => r.id === 'tessin'))
    ).toBe('im Tessin');
    expect(regionLocative({ slug: 'tessin', name: 'Tessin' })).toBe('im Tessin');
    expect(regionLocative({ name: 'Irgendwo' })).toBe('in Irgendwo');
  });
  it('an inactive Innerschweiz shows the coming-soon page, a former region is no region', () => {
    expect(resolveTopLevelSlug('innerschweiz')).toMatchObject({
      kind: 'coming-soon',
      region: { id: 'innerschweiz', name: 'Innerschweiz' },
    });
    expect(resolveTopLevelSlug('bayern')).toMatchObject({ kind: 'profile' });
  });
});

describe('last region in localStorage', () => {
  it('round-trips valid region slugs only', () => {
    const store = memoryStorage();
    writeLastRegion('tirol', store);
    expect(store.data.get(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(readLastRegion(store)).toBe('tirol');
    writeLastRegion('oesterreich', store);
    writeLastRegion('mars', store);
    expect(readLastRegion(store)).toBe('tirol');
    expect(readLastRegion(memoryStorage({ [LAST_REGION_STORAGE_KEY]: 'mars' }))).toBeNull();
  });
  it('a throwing localStorage does not crash', () => {
    expect(readLastRegion(throwingStorage)).toBeNull();
    expect(() => writeLastRegion('tirol', throwingStorage)).not.toThrow();
  });
});

describe('regionNavPath (header Kalender / Verzeichnis)', () => {
  const opts = (o: Record<string, unknown> = {}) => ({ regions: WITH_TIROL, ...o });

  it('leads to the coming-soon page of the chosen place on pages without a region (event form)', () => {
    const o = opts({ placeRegionId: 'niederoesterreich' });
    expect(regionNavPath('/', o)).toBe('/niederoesterreich');
    expect(regionNavPath('/verzeichnis', o)).toBe('/niederoesterreich/verzeichnis');
  });
  it('uses the last chosen region when no place is stored', () => {
    expect(regionNavPath('/', opts({ lastRegion: 'kaernten' }))).toBe('/kaernten');
  });
  it('keeps the region or combined view of the page', () => {
    expect(regionNavPath('/', opts({ pageSlug: 'tirol', placeRegionId: 'kaernten' }))).toBe(
      '/tirol'
    );
    expect(regionNavPath('/verzeichnis', opts({ pageSlug: 'niederoesterreich' }))).toBe(
      '/niederoesterreich/verzeichnis'
    );
    expect(regionNavPath('/', opts({ pageSlug: 'alle-tribes' }))).toBe('/alle-tribes');
  });
  it('keeps the plain path for an active chosen region (it already shows it)', () => {
    expect(regionNavPath('/', opts({ placeRegionId: 'tirol' }))).toBe('/');
    expect(regionNavPath('/verzeichnis', opts())).toBe('/verzeichnis');
  });
  it('changes nothing with one active region or while loading (dark launch)', () => {
    expect(regionNavPath('/', { placeRegionId: 'niederoesterreich' })).toBe('/');
    expect(regionNavPath('/', opts({ placeRegionId: 'niederoesterreich', loading: true }))).toBe(
      '/'
    );
  });
});
