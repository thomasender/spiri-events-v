import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_REGION_SLUGS,
  BEZIRKE,
  DEFAULT_REGION_ID,
  REGION_SLUGS,
  STATIC_REGIONS,
  eventVisibleInRegion,
  getBezirke,
  getRegionBySlug,
  isRegionSlug,
  mergeRegions,
  bezirkLabel,
  pickEventRegionId,
  resolveDirectoryRegionIds,
  resolveRegionId,
} from '../../src/utils/regions.js';
import { getEventLocationLabel } from '../../src/utils/eventFormat';

describe('static register', () => {
  it('covers all Bundeslaender plus oesterreich, only Vorarlberg active', () => {
    expect(STATIC_REGIONS.map((r) => r.slug)).toEqual([...REGION_SLUGS, 'oesterreich']);
    expect(STATIC_REGIONS.filter((r) => r.active).map((r) => r.id)).toEqual(['vorarlberg']);
  });
  it('keeps BEZIRKE as the Vorarlberg Bezirke', () => {
    expect(BEZIRKE).toEqual(['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe']);
    expect(getBezirke('vorarlberg')).toEqual(BEZIRKE);
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
    expect(getRegionBySlug('bayern')).toBeNull();
    expect(isRegionSlug('oesterreich')).toBe(true);
    expect(isRegionSlug('bayern')).toBe(false);
    expect(isRegionSlug(undefined)).toBe(false);
  });
  it('getBezirke is empty for other or unknown regions', () => {
    expect(getBezirke('tirol')).toEqual([]);
    expect(getBezirke('nope')).toEqual([]);
  });
  it('eventVisibleInRegion', () => {
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'tirol')).toBe(true);
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'wien')).toBe(false);
    expect(eventVisibleInRegion({}, 'vorarlberg')).toBe(true);
    expect(eventVisibleInRegion({}, 'tirol')).toBe(false);
    expect(eventVisibleInRegion({ regionId: 'tirol', isOnline: true }, 'wien')).toBe(true);
    expect(eventVisibleInRegion({ regionId: 'tirol' }, 'oesterreich')).toBe(true);
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
    expect(pickEventRegionId('bayern', { regionId: 'bayern' })).toBe(DEFAULT_REGION_ID);
  });
});

describe('resolveDirectoryRegionIds', () => {
  it('defaults to Vorarlberg for profiles without the field', () => {
    expect(resolveDirectoryRegionIds({})).toEqual(['vorarlberg']);
    expect(resolveDirectoryRegionIds(null)).toEqual(['vorarlberg']);
    expect(resolveDirectoryRegionIds({ directoryRegionIds: [] })).toEqual(['vorarlberg']);
  });

  it('keeps valid ids, drops unknown ones and duplicates, caps at 9', () => {
    expect(
      resolveDirectoryRegionIds({ directoryRegionIds: ['tirol', 'bayern', 'tirol', 5, 'wien'] })
    ).toEqual(['tirol', 'wien']);
    expect(resolveDirectoryRegionIds({ directoryRegionIds: ALL_REGION_SLUGS })).toHaveLength(9);
  });
});

describe('firestore.rules region list', () => {
  it('matches ALL_REGION_SLUGS', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const body = rules.match(/function regionIds\(\) \{\s*return \[([^\]]*)\]/);
    expect(body).not.toBeNull();
    const ids = [...(body?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(ALL_REGION_SLUGS);
  });
});
