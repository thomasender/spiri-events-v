import { describe, it, expect } from 'vitest';
import {
  INSTAGRAM_REGION_IDS,
  REGION_IDS,
  isInstagramRegion,
  resolveRegionId,
} from '../../functions/src/regions';
import { REGION_SLUGS } from '../../src/utils/regions';
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
