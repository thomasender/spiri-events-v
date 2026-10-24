import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BEZIRKE,
  DEFAULT_REGION_ID,
  REGION_SLUGS,
  STATIC_REGIONS,
  eventVisibleInRegion,
  filterDirectoryForRegion,
  filterEventsForRegion,
  getAllDistricts,
  getBezirke,
  getSubdivisionLabel,
  getSubdivisionLabelPlural,
  getRegionBySlug,
  isRegionSlug,
  mergeRegions,
  regionInstagramAccount,
  instagramChannels,
  instagramProfileUrl,
  bezirkLabel,
  pickEventRegionId,
  resolveDirectoryRegionIds,
  resolveRegionId,
} from '../../src/utils/regions.js';
import { getEventLocationLabel } from '../../src/utils/eventFormat';

describe('static register', () => {
  it('covers 9 Austrian + 16 German Bundeslaender + 26 Swiss cantons + 60 cultural regions (no oesterreich), only Vorarlberg active', () => {
    expect(STATIC_REGIONS.map((r) => r.slug)).toEqual(REGION_SLUGS);
    const perCountry = (c: string) => STATIC_REGIONS.filter((r) => r.country === c).length;
    expect([perCountry('AT'), perCountry('DE'), perCountry('CH')]).toEqual([9, 76, 26]);
    expect(STATIC_REGIONS.filter((r) => r.home)).toHaveLength(51);
    expect(isRegionSlug('allgaeu')).toBe(false);
    expect(STATIC_REGIONS.some((r) => r.id === 'oesterreich')).toBe(false);
    expect(STATIC_REGIONS.filter((r) => r.active).map((r) => r.id)).toEqual(['vorarlberg']);
  });
  it('has Bayern as an inactive German region with Landkreise and kreisfreie Städte', () => {
    expect(getRegionBySlug('bayern')).toEqual({
      id: 'bayern',
      slug: 'bayern',
      name: 'Bayern',
      inPhrase: 'in Bayern',
      demonym: 'bayerischer',
      forPhrase: 'Bayern',
      order: REGION_SLUGS.indexOf('bayern'),
      country: 'DE',
      active: false,
      bezirke: getBezirke('bayern'),
      subdivisionLabel: 'Landkreis',
      timezone: 'Europe/Berlin',
      home: true,
      macro: 'Südosten',
    });
    expect(getRegionBySlug('steiermark')?.timezone).toBe('Europe/Vienna');
    expect(getRegionBySlug('zuerich')?.timezone).toBe('Europe/Zurich');
  });
  it('keeps BEZIRKE as the Vorarlberg Bezirke', () => {
    expect(BEZIRKE).toEqual(['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe']);
    expect(getBezirke('vorarlberg')).toEqual(BEZIRKE);
  });
});

describe('districts per region', () => {
  it('Steiermark has its 13 Bezirke', () => {
    const list = getBezirke('steiermark');
    expect(list).toHaveLength(13);
    expect(list).toContain('Graz-Umgebung');
    expect(list).toContain('Südoststeiermark');
  });
  it('Bayern lists its 71 Landkreise and 25 kreisfreie Städte (the old Allgäu areas included)', () => {
    const list = getBezirke('bayern');
    expect(list).toHaveLength(96);
    for (const d of [
      'Oberallgäu',
      'Ostallgäu',
      'Unterallgäu',
      'Lindau (Bodensee)',
      'Kempten (Allgäu)',
    ]) {
      expect(list).toContain(d);
    }
    // A city and a Landkreis with the same name are told apart.
    expect(list).toContain('Ansbach (Stadt)');
    expect(list).toContain('Ansbach (Landkreis)');
    expect(list).not.toContain('Ansbach');
  });
  it('Austria and Switzerland come from the product owner list', () => {
    expect(getBezirke('tirol')).toHaveLength(9);
    expect(getBezirke('wien')).toEqual(['Wien']);
    expect(getBezirke('vorarlberg')).toContain('Grenznahe');
    expect(getBezirke('aargau')).toContain('Aarau');
    expect(getBezirke('genf')).toHaveLength(1);
  });
  it('every Bundesland / Kanton ships at least one Bezirk / Landkreis; cultural regions start empty', () => {
    for (const r of STATIC_REGIONS) {
      if (r.home) expect(r.bezirke.length).toBeGreaterThan(0);
      else expect(r.bezirke).toEqual([]);
    }
  });
  it('has no duplicates or blanks in any list', () => {
    for (const r of STATIC_REGIONS) {
      expect(new Set(r.bezirke).size).toBe(r.bezirke.length);
      expect(r.bezirke.every((b: string) => b.trim() === b && b.length > 0)).toBe(true);
    }
  });
  it('labels: Bezirk in Austria and Switzerland, Landkreis in Germany', () => {
    expect(getSubdivisionLabel('vorarlberg')).toBe('Bezirk');
    expect(getSubdivisionLabel('steiermark')).toBe('Bezirk');
    expect(getSubdivisionLabel('bayern')).toBe('Landkreis');
    expect(getSubdivisionLabel('unknown')).toBe('Bezirk');
    expect(getSubdivisionLabelPlural('wien')).toBe('Bezirke');
    expect(getSubdivisionLabelPlural('bayern')).toBe('Landkreise');
    for (const r of STATIC_REGIONS) {
      expect(r.subdivisionLabel).toBe(r.country === 'DE' ? 'Landkreis' : 'Bezirk');
    }
  });
  it('mergeRegions keeps the static list and label unless the doc has its own list', () => {
    const merged = mergeRegions([{ id: 'bayern', active: true, bezirke: [] }]);
    expect(merged.find((r) => r.id === 'bayern')?.bezirke).toHaveLength(96);
    expect(getSubdivisionLabel('bayern', merged)).toBe('Landkreis');
    const own = mergeRegions([{ id: 'steiermark', bezirke: ['Graz'] }]);
    expect(getBezirke('steiermark', own)).toEqual(['Graz']);
  });
});

describe('helpers', () => {
  it('resolveRegionId falls back to vorarlberg', () => {
    expect(resolveRegionId({ regionId: 'tirol' })).toBe('tirol');
    expect(resolveRegionId({})).toBe(DEFAULT_REGION_ID);
    expect(resolveRegionId({ regionId: '' })).toBe(DEFAULT_REGION_ID);
    expect(resolveRegionId(null)).toBe(DEFAULT_REGION_ID);
  });
  it('getRegionBySlug / isRegionSlug', () => {
    expect(getRegionBySlug('wien')?.name).toBe('Wien');
    expect(getRegionBySlug('allgaeu')).toBeNull();
    expect(isRegionSlug('oesterreich')).toBe(false);
    expect(isRegionSlug('deutschland')).toBe(false);
    expect(isRegionSlug(undefined)).toBe(false);
  });
  it('getBezirke is empty for unknown regions', () => {
    expect(getBezirke('nope')).toEqual([]);
  });
  it('the retired Allgäu region is read as Bayern', () => {
    expect(resolveRegionId({ regionId: 'allgaeu' })).toBe('bayern');
    expect(pickEventRegionId(undefined, { regionId: 'allgaeu' })).toBe('bayern');
    expect(resolveDirectoryRegionIds({ directoryRegionIds: ['allgaeu', 'bayern'] })).toEqual([
      'bayern',
    ]);
  });
  it('eventVisibleInRegion', () => {
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'tirol')).toBe(true);
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'wien')).toBe(false);
    expect(eventVisibleInRegion({}, 'vorarlberg')).toBe(true);
    expect(eventVisibleInRegion({}, 'tirol')).toBe(false);
    expect(eventVisibleInRegion({ regionId: 'tirol', isOnline: true }, 'wien')).toBe(true);
    expect(eventVisibleInRegion({ regionId: 'tirol', isOnline: true }, 'vorarlberg')).toBe(true);
    // No national case any more: oesterreich is not a region.
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'oesterreich')).toBe(false);
  });
});

describe('mergeRegions', () => {
  it('returns the static register for empty or invalid input', () => {
    expect(mergeRegions([])).toBe(STATIC_REGIONS);
    expect(mergeRegions(undefined)).toBe(STATIC_REGIONS);
  });
  it('overlays Firestore data and ignores unknown ids', () => {
    const merged = mergeRegions([
      { id: 'tirol', active: true, contactEmail: 'a@b.at' },
      { id: 'bayern', active: true },
      // A stale doc from before "Österreich" stopped being a region.
      { id: 'oesterreich', active: true, name: 'Österreich' },
    ]);
    expect(merged).toHaveLength(STATIC_REGIONS.length);
    expect(merged.find((r) => r.id === 'tirol')).toMatchObject({
      active: true,
      name: 'Tirol',
      contactEmail: 'a@b.at',
    });
    expect(merged.find((r) => r.id === 'vorarlberg')?.active).toBe(true);
  });
  it('keeps static bezirke when the doc has none', () => {
    const v = mergeRegions([{ id: 'vorarlberg', bezirke: [] }]).find((r) => r.id === 'vorarlberg');
    expect(v?.bezirke).toEqual(BEZIRKE);
  });
});

describe('bezirkLabel', () => {
  it('shows the stored value "Grenznahe" as "Umgebung" but keeps the stored value', () => {
    expect(BEZIRKE).toContain('Grenznahe');
    expect(bezirkLabel('Grenznahe')).toBe('Umgebung');
    expect(getEventLocationLabel({ bezirk: 'Grenznahe' })).toBe('Umgebung');
  });

  it('leaves other districts untouched', () => {
    expect(bezirkLabel('Dornbirn')).toBe('Dornbirn');
    expect(bezirkLabel(undefined as unknown as string)).toBeUndefined();
  });
});

// Same cases as tests/lib/functionsRegions.spec.ts (functions/src/regions.ts is a synced copy).
const RESOLVE_REGION_CASES: Array<[unknown, string]> = [
  [{ regionId: 'tirol' }, 'tirol'],
  [{ regionId: 'vorarlberg' }, 'vorarlberg'],
  [{}, 'vorarlberg'],
  [{ regionId: '' }, 'vorarlberg'],
  [{ regionId: 5 }, 'vorarlberg'],
  [null, 'vorarlberg'],
  [undefined, 'vorarlberg'],
];

describe('resolveRegionId shared cases', () => {
  it.each(RESOLVE_REGION_CASES)('%j -> %s', (doc, expected) => {
    expect(resolveRegionId(doc)).toBe(expected);
  });
});

describe('pickEventRegionId', () => {
  it('uses a valid region from the form', () => {
    expect(pickEventRegionId('tirol')).toBe('tirol');
    expect(pickEventRegionId('tirol', { regionId: 'wien' })).toBe('tirol');
  });

  it('keeps the stored region on edit when the form has none', () => {
    expect(pickEventRegionId('', { regionId: 'tirol' })).toBe('tirol');
    expect(pickEventRegionId(undefined, { regionId: 'tirol' })).toBe('tirol');
  });

  it('falls back to the default for new events, old events and unknown ids', () => {
    expect(pickEventRegionId(undefined)).toBe(DEFAULT_REGION_ID);
    expect(pickEventRegionId(null, {})).toBe(DEFAULT_REGION_ID);
    expect(pickEventRegionId('allgaeu', { regionId: 'nope' })).toBe(DEFAULT_REGION_ID);
    expect(pickEventRegionId('oesterreich', { regionId: 'oesterreich' })).toBe(DEFAULT_REGION_ID);
  });
});

describe('resolveDirectoryRegionIds', () => {
  it('defaults to Vorarlberg for profiles without the field', () => {
    expect(resolveDirectoryRegionIds({})).toEqual(['vorarlberg']);
    expect(resolveDirectoryRegionIds(null)).toEqual(['vorarlberg']);
    expect(resolveDirectoryRegionIds({ directoryRegionIds: [] })).toEqual(['vorarlberg']);
  });

  it('keeps valid ids, drops unknown ones and duplicates, caps at 10', () => {
    expect(
      resolveDirectoryRegionIds({ directoryRegionIds: ['tirol', 'nope', 'tirol', 5, 'wien'] })
    ).toEqual(['tirol', 'wien']);
    expect(
      resolveDirectoryRegionIds({ directoryRegionIds: [...REGION_SLUGS, 'oesterreich'] })
    ).toHaveLength(10);
  });
});

describe('firestore.rules region list', () => {
  it('matches REGION_SLUGS', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const body = rules.match(/function regionIds\(\) \{\s*return \[([^\]]*)\]/);
    expect(body).not.toBeNull();
    const ids = [...(body?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(REGION_SLUGS);
  });
});

describe('filters with a country view (ticket 33)', () => {
  const events = [
    { id: 'vbg' },
    { id: 'tirol', regionId: 'tirol' },
    { id: 'bayern', regionId: 'bayern' },
    { id: 'wien', regionId: 'wien' },
  ];
  const ids = (list: Array<{ id: string }>) => list.map((e) => e.id);

  it('national mode with a region-id list shows exactly those regions', () => {
    const at = filterEventsForRegion(events, {
      isNational: true,
      activeRegionIds: ['vorarlberg', 'tirol'],
    });
    expect(ids(at)).toEqual(['vbg', 'tirol']);
    const de = filterEventsForRegion(events, { isNational: true, activeRegionIds: ['bayern'] });
    expect(ids(de)).toEqual(['bayern']);
    expect(filterEventsForRegion(events, { isNational: true, activeRegionIds: [] })).toEqual([]);
  });

  it('directory entries and Bezirke follow the same list', () => {
    const entries = [
      { uid: 'a', regionIds: ['vorarlberg'] },
      { uid: 'b', regionIds: ['bayern'] },
      { uid: 'c', regionIds: ['tirol', 'bayern'] },
    ];
    const de = filterDirectoryForRegion(entries, {
      isNational: true,
      activeRegionIds: ['bayern'],
    });
    expect(de.map((e) => e.uid)).toEqual(['b', 'c']);
    const regions = STATIC_REGIONS.filter((r) => r.id === 'bayern');
    expect(getAllDistricts(regions)).toEqual(getBezirke('bayern'));
    expect(getAllDistricts(STATIC_REGIONS.filter((r) => r.id === 'genf'))).toEqual(['Genf']);
  });
});

describe('region Instagram account (display only)', () => {
  it('uses the stored handle, normalised', () => {
    const merged = mergeRegions([{ id: 'tirol', instagramHandle: 'instagram.com/tribe.tirol/' }]);
    expect(regionInstagramAccount(merged.find((r) => r.id === 'tirol'))).toBe('@tribe.tirol');
  });

  it('defaults Vorarlberg to @tribevorarlberg and shows no name for other regions', () => {
    expect(regionInstagramAccount({ id: 'vorarlberg' })).toBe('@tribevorarlberg');
    expect(regionInstagramAccount({ id: 'tirol' })).toBeNull();
    expect(regionInstagramAccount(null)).toBeNull();
    expect(regionInstagramAccount({ id: 'tirol', instagramHandle: 'not valid!' })).toBeNull();
  });

  it('a stored Vorarlberg handle wins over the default', () => {
    expect(regionInstagramAccount({ id: 'vorarlberg', instagramHandle: '@neu' })).toBe('@neu');
  });

  it('ignores an invalid stored handle when merging', () => {
    const merged = mergeRegions([{ id: 'tirol', instagramHandle: 'a b' }]);
    expect(merged.find((r) => r.id === 'tirol')).not.toHaveProperty('instagramHandle');
  });

  it('lists distinct channels incl. the Vorarlberg default', () => {
    const channels = instagramChannels([
      { id: 'vorarlberg', name: 'Vorarlberg' },
      { id: 'tirol', name: 'Tirol', instagramHandle: '@tribetirol' },
      { id: 'wien', name: 'Wien' },
      { id: 'salzburg', name: 'Salzburg', instagramHandle: '@TribeTirol' },
    ]);
    expect(channels.map((c) => c.handle)).toEqual(['@tribevorarlberg', '@tribetirol']);
  });

  it('builds the profile URL', () => {
    expect(instagramProfileUrl('@tribe.tirol')).toBe('https://www.instagram.com/tribe.tirol/');
    expect(instagramProfileUrl('')).toBeNull();
  });
});
