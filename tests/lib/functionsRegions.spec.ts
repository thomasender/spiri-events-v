import { describe, it, expect } from 'vitest';
import {
  COMBINED_VIEWS,
  DIRECTORY_REGIONS,
  INSTAGRAM_REGION_IDS,
  REGION_IDS,
  STATIC_FEED_REGIONS,
  filterEventsForRegion,
  isInstagramRegion,
  mergeFeedRegions,
  resolveRegionId,
} from '../../functions/src/regions';
import {
  COMBINED_VIEWS as SRC_COMBINED_VIEWS,
  REGION_SLUGS,
  STATIC_REGIONS,
  filterEventsForRegion as srcFilterEventsForRegion,
  mergeRegions,
} from '../../src/utils/regions';
import { DIRECTORY_REGIONS as SRC_DIRECTORY_REGIONS } from '../../src/utils/directory';
import {
  LEGACY_BEZIRKE as SRC_LEGACY_BEZIRKE,
  REGION_DATA as SRC_REGION_DATA,
} from '../../src/data/regionData';
import {
  LEGACY_BEZIRKE as FN_LEGACY_BEZIRKE,
  REGION_DATA as FN_REGION_DATA,
} from '../../functions/src/regionData';
import { expandOccurrencesInWindow } from '../../functions/src/instagram/instagramOccurrences';
import { selectFeedEvents } from '../../functions/src/calendar/calendarRoutes';
import {
  annotateOnlineRegionIds as fnAnnotate,
  onlineEventVisibleIn as fnVisibleIn,
  organizerQualifiesForOnline as fnQualifies,
} from '../../functions/src/onlineEventEligibility';
import {
  annotateOnlineRegionIds as srcAnnotate,
  onlineEventVisibleIn as srcVisibleIn,
  organizerQualifiesForOnline as srcQualifies,
} from '../../src/utils/onlineEventEligibility';

// Same cases as "resolveRegionId shared cases" in tests/components/regions.spec.ts.
// functions/src/regions.ts is a synced copy of src/utils/regions.js.
const RESOLVE_REGION_CASES: Array<[unknown, string]> = [
  [{ regionId: 'tirol' }, 'tirol'],
  [{ regionId: 'vorarlberg' }, 'vorarlberg'],
  [{}, 'vorarlberg'],
  [{ regionId: '' }, 'vorarlberg'],
  [{ regionId: 5 }, 'vorarlberg'],
  [null, 'vorarlberg'],
  [undefined, 'vorarlberg'],
];

describe('generated region data (scripts/build-region-data.mjs)', () => {
  it('src/data/regionData.js and functions/src/regionData.ts are identical', () => {
    expect(FN_REGION_DATA).toEqual(SRC_REGION_DATA);
    expect(FN_LEGACY_BEZIRKE).toEqual(SRC_LEGACY_BEZIRKE);
  });

  it('the old Allgäu pilot id is read as Bavaria in both copies', () => {
    expect(resolveRegionId({ regionId: 'allgaeu' })).toBe('bayern');
  });
});

describe('functions resolveRegionId', () => {
  it.each(RESOLVE_REGION_CASES)('%j -> %s', (doc, expected) => {
    expect(resolveRegionId(doc)).toBe(expected);
  });
});

describe('functions REGION_IDS', () => {
  it('matches REGION_SLUGS in src/utils/regions.js (moderator region validation)', () => {
    expect([...REGION_IDS]).toEqual(REGION_SLUGS);
  });
});

describe('functions DIRECTORY_REGIONS', () => {
  it('matches DIRECTORY_REGIONS in src/utils/directory.js (member profile validation)', () => {
    expect([...DIRECTORY_REGIONS]).toEqual(SRC_DIRECTORY_REGIONS);
  });
});

describe('isInstagramRegion', () => {
  it('only allows Vorarlberg (and events without regionId)', () => {
    expect(INSTAGRAM_REGION_IDS).toEqual(['vorarlberg']);
    expect(isInstagramRegion({ regionId: 'vorarlberg' })).toBe(true);
    expect(isInstagramRegion({})).toBe(true);
    expect(isInstagramRegion({ regionId: 'tirol' })).toBe(false);
    expect(isInstagramRegion({ regionId: 'tirol', isOnline: true })).toBe(false);
    expect(isInstagramRegion({ regionId: 'vorarlberg', isOnline: true })).toBe(true);
  });
});

// Functions that expand or copy events must hand regionId through, otherwise
// the Instagram region check (and later region filters) see the default.
describe('regionId survives event expansion in functions', () => {
  const series = {
    id: 'e1',
    status: 'approved',
    date: '2026-11-02',
    recurrence: 'weekly',
    recurrenceEndDate: '2026-11-30',
    regionId: 'tirol',
  };

  it('instagram expandOccurrencesInWindow (weekly carousel source)', () => {
    const occ = expandOccurrencesInWindow(series, { start: '2026-11-01', end: '2026-11-20' });
    expect(occ.length).toBeGreaterThan(1);
    expect(occ.every((e) => e.regionId === 'tirol')).toBe(true);
  });

  it('calendar selectFeedEvents (ICS feed source)', () => {
    const feed = selectFeedEvents([series], '2026-11-01', { bezirk: [], kategorie: [] });
    expect(feed.length).toBeGreaterThan(1);
    expect(feed.every((e) => e.regionId === 'tirol')).toBe(true);
  });
});

// functions/src/regions.ts copies the register and the event filter of src/utils/regions.js.
describe('functions feed region register', () => {
  it('matches STATIC_REGIONS (name, active, bezirke, timezone)', () => {
    expect(STATIC_FEED_REGIONS).toEqual(
      STATIC_REGIONS.map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country,
        active: r.active,
        bezirke: r.bezirke,
        timezone: r.timezone,
      }))
    );
  });

  it('matches COMBINED_VIEWS (slug, label, country) of src/utils/regions.js', () => {
    expect(COMBINED_VIEWS).toEqual(
      SRC_COMBINED_VIEWS.map((v) => ({ slug: v.slug, label: v.label, country: v.country }))
    );
  });

  it('merges region docs like mergeRegions', () => {
    const docs = [
      { id: 'tirol', active: true, bezirke: ['Imst', 'Lienz'], name: 'Tirol' },
      { id: 'bayern', timezone: 'Europe/Berlin', active: false },
      { id: 'nowhere', active: true },
      { id: 'wien', timezone: 'x\r\nEVIL:1' },
    ];
    const merged = mergeFeedRegions(docs);
    const expected = mergeRegions(docs);
    for (const r of merged) {
      const e = expected.find((x: { id: string }) => x.id === r.id);
      expect(r.active).toBe(e.active);
      expect(r.bezirke).toEqual(e.bezirke);
    }
    // Unlike the client copy, a malformed timezone never reaches the ICS file.
    expect(merged.find((r) => r.id === 'wien')?.timezone).toBe('Europe/Vienna');
  });
});

describe('functions filterEventsForRegion', () => {
  const events = [
    { id: 'a' },
    { id: 'b', regionId: 'tirol' },
    { id: 'c', regionId: 'tirol', isOnline: true },
    { id: 'd', regionId: 'steiermark' },
    { id: 'e', regionId: 'wien', isOnline: true },
  ];
  const cases = [
    { regionId: 'vorarlberg', activeRegionIds: ['vorarlberg'] },
    { regionId: 'tirol', activeRegionIds: ['vorarlberg', 'tirol'] },
    { regionId: 'tirol', activeRegionIds: ['vorarlberg'] },
    { regionId: 'steiermark', activeRegionIds: ['vorarlberg', 'steiermark', 'wien'] },
    { isNational: true, activeRegionIds: ['vorarlberg', 'tirol'] },
    { activeRegionIds: ['vorarlberg'] },
  ];
  it.each(cases)('same result as the client copy: %j', (opts) => {
    expect(filterEventsForRegion(events, opts)).toEqual(srcFilterEventsForRegion(events, opts));
  });
});

describe('online-event eligibility: functions copy matches src (lVFp6Dvw)', () => {
  const srcRegions = mergeRegions([
    { id: 'tirol', active: true, bezirke: ['Innsbruck', 'Kufstein'] },
    { id: 'bayern', active: true },
  ]);
  const fnRegions = mergeFeedRegions([
    { id: 'tirol', active: true, bezirke: ['Innsbruck', 'Kufstein'] },
    { id: 'bayern', active: true },
  ]);
  const LISTINGS: unknown[] = [
    null,
    { listedInDirectory: true, directoryRegions: ['Dornbirn'] },
    { listedInDirectory: true, directoryRegionIds: ['tirol'], directoryRegions: ['Innsbruck'] },
    { listedInDirectory: true, directoryRegionIds: ['tirol'], directoryRegions: ['Online'] },
    { listedInDirectory: true, directoryRegionIds: ['allgaeu'], directoryRegions: ['Oberallgäu'] },
    {
      listedInDirectory: true,
      directoryRegionIds: ['tirol'],
      directoryRegions: ['Innsbruck'],
      directoryHidden: true,
    },
    { listedInDirectory: false, directoryRegionIds: ['tirol'], directoryRegions: ['Innsbruck'] },
  ];

  it('organizerQualifiesForOnline', () => {
    for (const listing of LISTINGS) {
      for (const id of ['vorarlberg', 'tirol', 'bayern']) {
        expect(fnQualifies(listing as never, id, fnRegions)).toBe(
          srcQualifies(listing, id, srcRegions)
        );
      }
    }
  });

  it('annotateOnlineRegionIds and onlineEventVisibleIn', () => {
    const events = LISTINGS.map((_, i) => ({ id: `e${i}`, isOnline: true, createdBy: `u${i}` }));
    const listings = Object.fromEntries(LISTINGS.map((l, i) => [`u${i}`, l]));
    const fn = fnAnnotate(events, {
      regions: fnRegions,
      listings: listings as never,
      staffUids: ['u2'],
    });
    const src = srcAnnotate(events, { regions: srcRegions, listings, staffUids: ['u2'] });
    expect(fn).toEqual(src);
    for (const e of fn) {
      expect(fnVisibleIn(e, ['tirol'])).toBe(srcVisibleIn(e, ['tirol']));
    }
    expect(fnAnnotate(events, { regions: STATIC_FEED_REGIONS, listings: {} })).toBe(events);
  });

  it('the ICS feed drops online events not listed in the region; unannotated ones stay', () => {
    const base = { status: 'approved', date: '2026-11-05', recurrence: 'none', regionId: 'tirol' };
    const feedEvents = [
      { ...base, id: 'in', isOnline: true, onlineRegionIds: ['tirol'] },
      { ...base, id: 'out', isOnline: true, onlineRegionIds: ['bayern'] },
      { ...base, id: 'plain', isOnline: true },
    ];
    const ids = (filters: Record<string, unknown>) =>
      selectFeedEvents(feedEvents, '2026-11-01', { bezirk: [], kategorie: [], ...filters }).map(
        (e) => e.id
      );
    const active = ['vorarlberg', 'tirol', 'bayern'];
    expect(ids({ regionId: 'tirol', activeRegionIds: active })).toEqual(['in', 'plain']);
    expect(ids({ regionId: 'bayern', activeRegionIds: active })).toEqual(['out', 'plain']);
    expect(ids({ combinedRegionIds: ['tirol'] })).toEqual(['in', 'plain']);
  });
});
