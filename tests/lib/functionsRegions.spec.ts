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
import { expandOccurrencesInWindow } from '../../functions/src/instagram/instagramOccurrences';
import { selectFeedEvents } from '../../functions/src/calendar/calendarRoutes';

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
      { id: 'allgaeu', timezone: 'Europe/Berlin', active: false },
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
