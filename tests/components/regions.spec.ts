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
  isLegacyBezirk,
  LEGACY_BEZIRKE,
  pickEventRegionId,
  resolveDirectoryRegionIds,
  resolveRegionId,
  selectableBezirke,
} from '../../src/utils/regions.js';
import { getEventLocationLabel } from '../../src/utils/eventFormat';
import { REGION_DATA } from '../../src/data/regionData';
import {
  annotateOnlineRegionIds,
  filterOnlineEventsForRegions,
  onlineEligibilityEnabled,
  onlineEligibilityHint,
  onlineEligibilityReason,
  onlineEventVisibleIn,
  onlineOrganizerUids,
  onlineRegionIdsFor,
} from '../../src/utils/onlineEventEligibility';

describe('static register', () => {
  it('covers the CSV register: 9 Austrian, 104 German, 19 Swiss, 1 Liechtenstein region (no oesterreich), only Vorarlberg active', () => {
    expect(STATIC_REGIONS.map((r) => r.slug)).toEqual(REGION_SLUGS);
    const perCountry = (c: string) => STATIC_REGIONS.filter((r) => r.country === c).length;
    expect([perCountry('AT'), perCountry('CH'), perCountry('LI')]).toEqual([9, 19, 1]);
    expect(perCountry('DE')).toBeGreaterThanOrEqual(100);
    // The Allgäu is a German region again (deutschland.csv); Bayern / Luzern stay former ids.
    expect(isRegionSlug('allgaeu')).toBe(true);
    expect(isRegionSlug('bayern')).toBe(false);
    expect(isRegionSlug('luzern')).toBe(false);
    expect(STATIC_REGIONS.some((r) => r.id === 'oesterreich')).toBe(false);
    expect(STATIC_REGIONS.filter((r) => r.active).map((r) => r.id)).toEqual(['vorarlberg']);
  });
  it('has the Innerschweiz as an inactive Swiss region', () => {
    expect(getRegionBySlug('innerschweiz')).toEqual({
      id: 'innerschweiz',
      slug: 'innerschweiz',
      name: 'Innerschweiz',
      inPhrase: 'in der Innerschweiz',
      demonym: 'Innerschweizer',
      forPhrase: 'die Innerschweiz',
      order: REGION_SLUGS.indexOf('innerschweiz'),
      country: 'CH',
      active: false,
      bezirke: getBezirke('innerschweiz'),
      subdivisionLabel: 'Bezirk',
      timezone: 'Europe/Zurich',
    });
    expect(getRegionBySlug('steiermark')?.timezone).toBe('Europe/Vienna');
    expect(getRegionBySlug('zuerich')?.timezone).toBe('Europe/Zurich');
    expect(getRegionBySlug('liechtenstein')?.timezone).toBe('Europe/Vaduz');
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
    expect(list).toContain('Graz (Stadt)');
    expect(list).toContain('Graz-Umgebung');
    expect(list).toContain('Südoststeiermark');
  });
  it('Austria, Switzerland and Liechtenstein come 1:1 from the CSVs', () => {
    expect(getBezirke('tirol')).toHaveLength(9);
    expect(getBezirke('wien')).toHaveLength(23);
    expect(getBezirke('wien')[0]).toBe('1. Innere Stadt');
    expect(getBezirke('burgenland')).toContain('Eisenstadt (Stadt)');
    expect(getBezirke('vorarlberg')).toContain('Grenznahe');
    expect(getBezirke('aargau')).toContain('Aarau');
    expect(getBezirke('genf')).toEqual(['Genf']);
    expect(getBezirke('innerschweiz')).toHaveLength(15);
    expect(getBezirke('liechtenstein')).toEqual(['Oberland', 'Unterland']);
  });
  it('every region ships at least one district', () => {
    for (const r of STATIC_REGIONS) expect(r.bezirke.length).toBeGreaterThan(0);
  });
  it('has no duplicates or blanks in any list', () => {
    for (const r of STATIC_REGIONS) {
      expect(new Set(r.bezirke).size).toBe(r.bezirke.length);
      expect(r.bezirke.every((b: string) => b.trim() === b && b.length > 0)).toBe(true);
    }
  });
  it('labels: Bezirk in Austria and Switzerland, Landkreis in Germany, Landesteil in Liechtenstein', () => {
    expect(getSubdivisionLabel('vorarlberg')).toBe('Bezirk');
    expect(getSubdivisionLabel('steiermark')).toBe('Bezirk');
    expect(getSubdivisionLabel('liechtenstein')).toBe('Landesteil');
    expect(getSubdivisionLabel('allgaeu')).toBe('Landkreis');
    expect(getSubdivisionLabel('unknown')).toBe('Bezirk');
    expect(getSubdivisionLabelPlural('wien')).toBe('Bezirke');
    expect(getSubdivisionLabelPlural('liechtenstein')).toBe('Landesteile');
    expect(getSubdivisionLabelPlural('muenchen')).toBe('Landkreise');
    const labels = { AT: 'Bezirk', CH: 'Bezirk', DE: 'Landkreis', LI: 'Landesteil' };
    for (const r of STATIC_REGIONS) {
      expect(r.subdivisionLabel).toBe(labels[r.country as keyof typeof labels]);
    }
  });
  it('mergeRegions never lets a doc override the districts, the name or the order', () => {
    const merged = mergeRegions([
      { id: 'tirol', active: true, bezirke: [], mappingUpdatedAt: 1, name: 'Anders', order: 99 },
      { id: 'steiermark', bezirke: ['Graz'] },
    ]);
    expect(merged.find((r) => r.id === 'tirol')?.bezirke).toEqual(getBezirke('tirol'));
    expect(merged.find((r) => r.id === 'tirol')?.name).toBe('Tirol');
    expect(merged.find((r) => r.id === 'tirol')?.active).toBe(true);
    expect(merged.map((r) => r.id)).toEqual(REGION_SLUGS);
    expect(getBezirke('steiermark', merged)).toEqual(getBezirke('steiermark'));
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
    expect(getRegionBySlug('allgaeu')?.name).toBe('Allgäu');
    expect(getRegionBySlug('bayern')).toBeNull();
    expect(isRegionSlug('oesterreich')).toBe(false);
    expect(isRegionSlug('deutschland')).toBe(false);
    expect(isRegionSlug(undefined)).toBe(false);
  });
  it('getBezirke is empty for unknown regions', () => {
    expect(getBezirke('nope')).toEqual([]);
  });
  it('ids of former regions are no regions any more (no alias), stored ones stay as they are', () => {
    expect(resolveRegionId({ regionId: 'luzern' })).toBe('luzern');
    expect(resolveRegionId({ regionId: 'bayern' })).toBe('bayern');
    expect(pickEventRegionId(undefined, { regionId: 'bayern' })).toBe(DEFAULT_REGION_ID);
    expect(resolveDirectoryRegionIds({ directoryRegionIds: ['luzern', 'bayern'] })).toEqual([
      DEFAULT_REGION_ID,
    ]);
    // A former id that is a region again (deutschland.csv) is simply valid.
    expect(resolveDirectoryRegionIds({ directoryRegionIds: ['allgaeu', 'bayern'] })).toEqual([
      'allgaeu',
    ]);
    expect(resolveDirectoryRegionIds({ directoryRegionIds: ['luzern', 'innerschweiz'] })).toEqual([
      'innerschweiz',
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

  it('keeps "Grenznahe" only as a legacy entry, out of the generated register', () => {
    expect(REGION_DATA.find((r) => r.slug === 'vorarlberg')!.bezirke).not.toContain('Grenznahe');
    expect(LEGACY_BEZIRKE).toEqual({ vorarlberg: ['Grenznahe'] });
    expect(isLegacyBezirk('Grenznahe')).toBe(true);
    expect(isLegacyBezirk('Dornbirn')).toBe(false);
    expect(selectableBezirke(BEZIRKE)).toEqual(['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz']);
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
    expect(pickEventRegionId('bayern', { regionId: 'nope' })).toBe(DEFAULT_REGION_ID);
    expect(pickEventRegionId('allgaeu', { regionId: 'nope' })).toBe('allgaeu');
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
    { id: 'innerschweiz', regionId: 'innerschweiz' },
    { id: 'wien', regionId: 'wien' },
  ];
  const ids = (list: Array<{ id: string }>) => list.map((e) => e.id);

  it('national mode with a region-id list shows exactly those regions', () => {
    const at = filterEventsForRegion(events, {
      isNational: true,
      activeRegionIds: ['vorarlberg', 'tirol'],
    });
    expect(ids(at)).toEqual(['vbg', 'tirol']);
    const ch = filterEventsForRegion(events, {
      isNational: true,
      activeRegionIds: ['innerschweiz'],
    });
    expect(ids(ch)).toEqual(['innerschweiz']);
    expect(filterEventsForRegion(events, { isNational: true, activeRegionIds: [] })).toEqual([]);
  });

  it('directory entries and Bezirke follow the same list', () => {
    const entries = [
      { uid: 'a', regionIds: ['vorarlberg'] },
      { uid: 'b', regionIds: ['innerschweiz'] },
      { uid: 'c', regionIds: ['tirol', 'innerschweiz'] },
    ];
    const de = filterDirectoryForRegion(entries, {
      isNational: true,
      activeRegionIds: ['innerschweiz'],
    });
    expect(de.map((e) => e.uid)).toEqual(['b', 'c']);
    const regions = STATIC_REGIONS.filter((r) => r.id === 'innerschweiz');
    expect(getAllDistricts(regions)).toEqual(getBezirke('innerschweiz'));
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

describe('online events need a regional directory listing (lVFp6Dvw)', () => {
  const REG = mergeRegions([
    { id: 'tirol', active: true, bezirke: ['Innsbruck (Stadt)', 'Kufstein'] },
    { id: 'wien', active: false },
  ]);
  const tirolListing = {
    listedInDirectory: true,
    directoryRegionIds: ['tirol'],
    directoryRegions: ['Innsbruck (Stadt)'],
  };

  it('is only in force with two or more active regions', () => {
    expect(onlineEligibilityEnabled(1)).toBe(false);
    expect(onlineEligibilityEnabled(2)).toBe(true);
  });

  it('needs a listing in the region that names one of its districts', () => {
    expect(onlineEligibilityReason(null, 'tirol', REG)).toBe('not-listed');
    expect(
      onlineEligibilityReason({ ...tirolListing, listedInDirectory: false }, 'tirol', REG)
    ).toBe('not-listed');
    expect(onlineEligibilityReason({ ...tirolListing, directoryHidden: true }, 'tirol', REG)).toBe(
      'not-listed'
    );
    expect(onlineEligibilityReason(tirolListing, 'vorarlberg', REG)).toBe('not-listed');
    expect(
      onlineEligibilityReason({ ...tirolListing, directoryRegions: ['Online'] }, 'tirol', REG)
    ).toBe('no-district');
    // A district of another region does not count, even if listed in Tirol.
    expect(
      onlineEligibilityReason({ ...tirolListing, directoryRegions: ['Dornbirn'] }, 'tirol', REG)
    ).toBe('no-district');
    expect(onlineEligibilityReason(tirolListing, 'tirol', REG)).toBeNull();
    // No directoryRegionIds = Vorarlberg.
    expect(
      onlineEligibilityReason(
        { listedInDirectory: true, directoryRegions: ['Dornbirn'] },
        'vorarlberg',
        REG
      )
    ).toBeNull();
  });

  it('German hints name the region and the subdivision label', () => {
    const tirol = REG.find((r) => r.id === 'tirol');
    expect(onlineEligibilityHint(null, tirol, REG)).toContain('im Verzeichnis für Tirol gelistet');
    expect(onlineEligibilityHint({ ...tirolListing, directoryRegions: [] }, tirol, REG)).toContain(
      'mindestens einen Bezirk in Tirol'
    );
    expect(onlineEligibilityHint(tirolListing, tirol, REG)).toBeNull();
  });

  it('onlineRegionIdsFor: active regions only', () => {
    const both = {
      ...tirolListing,
      directoryRegionIds: ['tirol', 'wien'],
      directoryRegions: ['Innsbruck (Stadt)', 'Wien'],
    };
    expect(onlineRegionIdsFor(both, REG)).toEqual(['tirol']);
  });

  it('annotates online events of non-staff organisers, only with two or more active regions', () => {
    const events = [
      { id: 'a', isOnline: true, createdBy: 'u1' },
      { id: 'b', isOnline: true, createdBy: 'staff' },
      { id: 'c', isOnline: true },
      { id: 'd', isOnline: false, createdBy: 'u1' },
      { id: 'e', isOnline: true, createdBy: 'u2' },
    ];
    expect(onlineOrganizerUids(events)).toEqual(['staff', 'u1', 'u2']);
    const out = annotateOnlineRegionIds(events, {
      regions: REG,
      listings: { u1: tirolListing, u2: null },
      staffUids: ['staff'],
    });
    expect(out.map((e) => e.onlineRegionIds)).toEqual([
      ['tirol'],
      undefined,
      undefined,
      undefined,
      [],
    ]);
    // Dark launch: one active region = same array, nothing added.
    expect(annotateOnlineRegionIds(events, { regions: STATIC_REGIONS, listings: {} })).toBe(events);
  });

  it('visibility fails open without onlineRegionIds', () => {
    expect(onlineEventVisibleIn({ isOnline: true }, ['tirol'])).toBe(true);
    expect(onlineEventVisibleIn({ isOnline: true, onlineRegionIds: [] }, ['tirol'])).toBe(false);
    expect(
      onlineEventVisibleIn({ isOnline: true, onlineRegionIds: ['tirol'] }, ['wien', 'tirol'])
    ).toBe(true);
    expect(onlineEventVisibleIn({ isOnline: false, onlineRegionIds: [] }, ['tirol'])).toBe(true);
    const plain = [{ id: 'x', isOnline: true }];
    expect(filterOnlineEventsForRegions(plain, ['tirol'])).toBe(plain);
  });
});
