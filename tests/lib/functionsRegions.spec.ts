import { describe, it, expect } from 'vitest';
import {
  INSTAGRAM_REGION_IDS,
  isInstagramRegion,
  resolveRegionId,
} from '../../functions/src/regions';

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
