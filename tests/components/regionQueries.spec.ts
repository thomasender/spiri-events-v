import { describe, it, expect } from 'vitest';
import {
  MAX_IN_VALUES,
  buildDirectoryQueryPlan,
  buildPublicEventQueryPlan,
  isRegionMigrationComplete,
  queryPlanKey,
} from '../../src/utils/regionQueries.js';
import { REGION_SLUGS } from '../../src/utils/regions.js';
import indexes from '../../firestore.indexes.json';

const APPROVED = ['status', '==', 'approved'];
const LISTED = ['listedInDirectory', '==', true];
const FULL_EVENTS = { mode: 'all', queries: [{ key: 'all', constraints: [APPROVED] }] };
const FULL_DIRECTORY = { mode: 'all', constraints: [LISTED] };

describe('isRegionMigrationComplete', () => {
  it('is true only for an explicit complete: true', () => {
    expect(isRegionMigrationComplete({ complete: true, completedAt: 1 })).toBe(true);
    for (const data of [null, undefined, {}, { complete: false }, { complete: 'true' }, 'x']) {
      expect(isRegionMigrationComplete(data)).toBe(false);
    }
  });
});

describe('buildPublicEventQueryPlan', () => {
  it('waits while the marker state is unknown', () => {
    expect(buildPublicEventQueryPlan({ markerComplete: null, regionId: 'vorarlberg' })).toBe(null);
    expect(buildPublicEventQueryPlan({ markerComplete: undefined })).toBe(null);
  });

  it('without the marker: exactly the old full query, whatever the region', () => {
    for (const input of [
      { regionId: 'vorarlberg' },
      { regionId: 'tirol', activeRegionIds: ['vorarlberg', 'tirol'] },
      { isNational: true, activeRegionIds: ['vorarlberg', 'tirol'] },
    ]) {
      expect(buildPublicEventQueryPlan({ markerComplete: false, ...input })).toEqual(FULL_EVENTS);
    }
  });

  it('region view: that region plus every online event', () => {
    expect(
      buildPublicEventQueryPlan({
        markerComplete: true,
        regionId: 'tirol',
        activeRegionIds: ['vorarlberg', 'tirol'],
      })
    ).toEqual({
      mode: 'region',
      queries: [
        { key: 'region', constraints: [APPROVED, ['regionId', '==', 'tirol']] },
        { key: 'online', constraints: [APPROVED, ['isOnline', '==', true]] },
      ],
    });
  });

  it('only Vorarlberg active: the region queries for Vorarlberg', () => {
    const plan = buildPublicEventQueryPlan({
      markerComplete: true,
      regionId: 'vorarlberg',
      activeRegionIds: ['vorarlberg'],
    });
    expect(plan?.queries[0].constraints).toEqual([APPROVED, ['regionId', '==', 'vorarlberg']]);
  });

  it('combined view: active regions via `in`, unknown ids and duplicates dropped', () => {
    expect(
      buildPublicEventQueryPlan({
        markerComplete: true,
        regionId: 'vorarlberg',
        isNational: true,
        activeRegionIds: ['vorarlberg', 'tirol', 'tirol', 'mars'],
      })
    ).toEqual({
      mode: 'national',
      queries: [
        { key: 'regions', constraints: [APPROVED, ['regionId', 'in', ['vorarlberg', 'tirol']]] },
      ],
    });
  });

  it('country view / Alle Tribes: `in` over exactly the regions of the view', () => {
    const plan = (ids: string[]) =>
      buildPublicEventQueryPlan({
        markerComplete: true,
        isNational: true,
        activeRegionIds: ids,
      });
    expect(plan(['allgaeu', 'vorarlberg']).queries[0].constraints[1]).toEqual([
      'regionId',
      'in',
      ['allgaeu', 'vorarlberg'],
    ]);
    expect(plan(['allgaeu']).queries[0].constraints[1]).toEqual(['regionId', 'in', ['allgaeu']]);
    // A country without active region (Switzerland): no query.
    expect(plan([])).toEqual({ mode: 'national', queries: [] });
  });

  it('combined view with no active region: no query at all', () => {
    expect(
      buildPublicEventQueryPlan({ markerComplete: true, isNational: true, activeRegionIds: [] })
    ).toEqual({ mode: 'national', queries: [] });
  });

  it('every region fits into one `in` (limit 30)', () => {
    expect(REGION_SLUGS.length).toBeLessThanOrEqual(MAX_IN_VALUES);
    const plan = buildPublicEventQueryPlan({
      markerComplete: true,
      isNational: true,
      activeRegionIds: REGION_SLUGS,
    });
    expect(plan?.queries[0].constraints[1]).toEqual(['regionId', 'in', REGION_SLUGS]);
  });

  it('an unknown region id falls back to the full query', () => {
    expect(buildPublicEventQueryPlan({ markerComplete: true, regionId: 'mars' })).toEqual(
      FULL_EVENTS
    );
  });
});

describe('buildDirectoryQueryPlan', () => {
  it('waits while unknown, full query without the marker', () => {
    expect(buildDirectoryQueryPlan({ markerComplete: null })).toBe(null);
    expect(
      buildDirectoryQueryPlan({ markerComplete: false, regionId: 'tirol', isNational: true })
    ).toEqual(FULL_DIRECTORY);
  });

  it('region view: array-contains the region', () => {
    expect(buildDirectoryQueryPlan({ markerComplete: true, regionId: 'tirol' })).toEqual({
      mode: 'region',
      constraints: [LISTED, ['directoryRegionIds', 'array-contains', 'tirol']],
    });
  });

  it('combined view: array-contains-any of the active regions; none active = no query', () => {
    expect(
      buildDirectoryQueryPlan({
        markerComplete: true,
        isNational: true,
        activeRegionIds: ['vorarlberg', 'tirol'],
      })
    ).toEqual({
      mode: 'national',
      constraints: [LISTED, ['directoryRegionIds', 'array-contains-any', ['vorarlberg', 'tirol']]],
    });
    expect(
      buildDirectoryQueryPlan({ markerComplete: true, isNational: true, activeRegionIds: [] })
    ).toEqual({ mode: 'national', constraints: null });
  });
});

describe('queryPlanKey', () => {
  it('is "pending" for null and stable for equal plans', () => {
    expect(queryPlanKey(null)).toBe('pending');
    const a = buildPublicEventQueryPlan({ markerComplete: true, regionId: 'tirol' });
    const b = buildPublicEventQueryPlan({ markerComplete: true, regionId: 'tirol' });
    expect(queryPlanKey(a)).toBe(queryPlanKey(b));
  });
});

// The emulator ignores missing indexes, production does not. Every query shape
// above must have a composite index in firestore.indexes.json.
describe('firestore.indexes.json covers the region queries', () => {
  type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
  type Index = { collectionGroup: string; queryScope: string; fields: IndexField[] };
  const has = (group: string, scope: string, fields: IndexField[]) =>
    (indexes.indexes as Index[]).some(
      (i) =>
        i.collectionGroup === group &&
        i.queryScope === scope &&
        JSON.stringify(i.fields) === JSON.stringify(fields)
    );

  it('events: status + regionId (region ==, combined `in`, staff `in`) and status + isOnline', () => {
    expect(
      has('events', 'COLLECTION', [
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'regionId', order: 'ASCENDING' },
      ])
    ).toBe(true);
    expect(
      has('events', 'COLLECTION', [
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'isOnline', order: 'ASCENDING' },
      ])
    ).toBe(true);
  });

  it('publicProfile (collection group): listedInDirectory + directoryRegionIds CONTAINS', () => {
    expect(
      has('publicProfile', 'COLLECTION_GROUP', [
        { fieldPath: 'listedInDirectory', order: 'ASCENDING' },
        { fieldPath: 'directoryRegionIds', arrayConfig: 'CONTAINS' },
      ])
    ).toBe(true);
  });
});
