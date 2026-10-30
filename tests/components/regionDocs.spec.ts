import { describe, expect, it } from 'vitest';
import {
  STALE_REGION_FIELDS,
  newRegionDoc,
  planRegionSeed,
  staleRegionFields,
  unknownRegionIds,
} from '../../src/utils/regionDocs';
import { STATIC_REGIONS } from '../../src/utils/regions';

// Plan of scripts/seed-regions.mjs and scripts/cleanup-region-docs.mjs.
describe('planRegionSeed', () => {
  it('creates a doc for every register region without one (only switches, Vorarlberg active)', () => {
    const plan = planRegionSeed([]);
    expect(plan.create.map((c) => c.id)).toEqual(STATIC_REGIONS.map((r) => r.id));
    expect(plan.create.find((c) => c.id === 'vorarlberg')?.data.active).toBe(true);
    expect(plan.create.find((c) => c.id === 'liechtenstein')?.data).toEqual({
      active: false,
      contactEmail: '',
      seo: { title: '', description: '' },
      timezone: 'Europe/Vaduz',
    });
    for (const c of plan.create) {
      expect(c.data).not.toHaveProperty('name');
      expect(c.data).not.toHaveProperty('bezirke');
    }
  });

  it('never changes admin-maintained fields, only fills missing ones', () => {
    const existing = STATIC_REGIONS.map((r) => ({
      id: r.id,
      data: { ...newRegionDoc(r), contactEmail: `${r.id}@x.at`, active: r.id === 'tirol' },
    }));
    existing[0] = { id: existing[0].id, data: { active: true, contactEmail: 'keep@x.at' } };
    const plan = planRegionSeed(existing);
    expect(plan.create).toEqual([]);
    expect(plan.complete).toEqual([
      {
        id: existing[0].id,
        data: { seo: { title: '', description: '' }, timezone: STATIC_REGIONS[0].timezone },
      },
    ]);
  });

  it('switches off docs of former regions (never deletes), reports all of them', () => {
    const plan = planRegionSeed([
      { id: 'vorarlberg', data: newRegionDoc(STATIC_REGIONS.find((r) => r.id === 'vorarlberg')!) },
      { id: 'bayern', data: { active: true } },
      { id: 'luzern', data: { active: false } },
      { id: 'oesterreich', data: {} },
    ]);
    expect(plan.retired).toEqual(['bayern', 'luzern', 'oesterreich']);
    expect(plan.deactivate).toEqual(['bayern', 'oesterreich']);
    expect(plan.live).toEqual([]);
  });

  it('a former id that is a region again keeps its doc: not retired, not switched off', () => {
    // `allgaeu` was a pilot region, then retired; deutschland.csv brings it back.
    const old = {
      active: false,
      name: 'Allgäu',
      bezirke: ['Oberallgäu'],
      timezone: 'Europe/Berlin',
    };
    const plan = planRegionSeed([
      { id: 'allgaeu', data: old },
      { id: 'berlin', data: { active: true, contactEmail: 'b@x.de' } },
    ]);
    expect(plan.retired).toEqual([]);
    expect(plan.deactivate).toEqual([]);
    expect(plan.create.map((c) => c.id)).not.toContain('allgaeu');
    expect(plan.complete.find((c) => c.id === 'allgaeu')?.data).toEqual({
      contactEmail: '',
      seo: { title: '', description: '' },
    });
    // An active reused doc stays active, but is reported.
    expect(plan.live).toEqual(['berlin']);
    // Its old name / districts are stale (cleanup-region-docs deletes them).
    expect(staleRegionFields(old)).toEqual(['name', 'bezirke']);
  });

  it('new German regions are created inactive in Europe/Berlin', () => {
    const plan = planRegionSeed([]);
    expect(plan.create.find((c) => c.id === 'muenchen')?.data).toEqual({
      active: false,
      contactEmail: '',
      seo: { title: '', description: '' },
      timezone: 'Europe/Berlin',
    });
    expect(plan.create.filter((c) => c.data.active).map((c) => c.id)).toEqual(['vorarlberg']);
  });
});

describe('cleanup helpers', () => {
  it('finds the stale keys of a region doc', () => {
    expect(
      staleRegionFields({ name: 'Tirol', slug: 'tirol', bezirke: [], active: true, seo: {} })
    ).toEqual(['name', 'slug', 'bezirke']);
    expect(staleRegionFields({ active: true })).toEqual([]);
    expect(STALE_REGION_FIELDS).toContain('mappingUpdatedAt');
    expect(STALE_REGION_FIELDS).toContain('custom');
  });

  it('reports ids of former regions; a missing field is fine (= Vorarlberg)', () => {
    expect(unknownRegionIds({}, 'regionId')).toEqual([]);
    expect(unknownRegionIds({ regionId: 'vorarlberg' }, 'regionId')).toEqual([]);
    expect(unknownRegionIds({ regionId: 'bayern' }, 'regionId')).toEqual(['bayern']);
    expect(unknownRegionIds({ regionId: 'allgaeu' }, 'regionId')).toEqual([]);
    expect(
      unknownRegionIds({ directoryRegionIds: ['tirol', 'luzern', 'zug'] }, 'directoryRegionIds')
    ).toEqual(['luzern', 'zug']);
    expect(unknownRegionIds({ regionIds: ['innerschweiz'] }, 'regionIds')).toEqual([]);
  });
});
