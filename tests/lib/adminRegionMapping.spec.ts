import { describe, it, expect, vi } from 'vitest';
import {
  countEventsPerDistrict,
  getRegionMappingLocksHandler,
  parseMoves,
  saveRegionMappingHandler,
  type RegionMappingDeps,
} from '../../functions/src/adminRegionMapping';
import { buildMappingRegisters } from '../../functions/src/regionMapping';

type Doc = Record<string, unknown>;

const call = (uid: string | null, data?: unknown) => ({ auth: uid ? { uid } : null, data });
const move = (name: string, toRegionId: string, country = 'DE') => ({
  districtKey: `${country}|${name}`,
  toRegionId,
});

function makeWorld({
  regionDocs = [] as Array<{ id: string; data: Doc }>,
  events = [] as Doc[],
} = {}) {
  const commit = vi.fn(async () => {});
  const deps: RegionMappingDeps = {
    readRoleDoc: async (uid) =>
      uid === 'admin'
        ? { role: 'Admin' }
        : uid === 'mod'
          ? { role: 'RegionModerator', regionIds: ['tirol'] }
          : null,
    listRegionDocs: async () => regionDocs,
    listEventDistricts: async () => events,
    commit,
  };
  return { deps, commit };
}

describe('parseMoves', () => {
  it('needs a non-empty list of { districtKey, toRegionId } strings', () => {
    expect(() => parseMoves(undefined)).toThrow();
    expect(() => parseMoves({ moves: [] })).toThrow();
    expect(() => parseMoves({ moves: [{ districtKey: 1, toRegionId: 'x' }] })).toThrow();
    expect(parseMoves({ moves: [move('Roth', 'franken')] })).toEqual([move('Roth', 'franken')]);
  });
  it('caps the size of one request', () => {
    const many = Array.from({ length: 701 }, () => move('Roth', 'franken'));
    expect(() => parseMoves({ moves: many })).toThrow();
  });
});

describe('countEventsPerDistrict', () => {
  const regions = buildMappingRegisters([]);
  it('counts events per district of the region that holds it; legacy events are Vorarlberg', () => {
    const counts = countEventsPerDistrict(
      [
        { regionId: 'vorarlberg', bezirk: 'Dornbirn' },
        { bezirk: 'Dornbirn' },
        { regionId: 'bayern', bezirk: 'Roth' },
        // inconsistent: Roth is not a Vorarlberg district
        { regionId: 'vorarlberg', bezirk: 'Roth' },
        { regionId: 'bayern' },
        { regionId: 'nope', bezirk: 'Roth' },
      ],
      regions
    );
    expect(counts).toEqual({ 'AT|Dornbirn': 2, 'DE|Roth': 1 });
  });
});

describe('adminGetRegionMappingLocks', () => {
  it('is for Super-Admins only', async () => {
    const w = makeWorld();
    await expect(getRegionMappingLocksHandler(call(null), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    for (const uid of ['mod', 'nobody']) {
      await expect(getRegionMappingLocksHandler(call(uid), w.deps)).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
  });
  it('returns the districts that have events', async () => {
    const w = makeWorld({ events: [{ regionId: 'vorarlberg', bezirk: 'Feldkirch' }] });
    await expect(getRegionMappingLocksHandler(call('admin'), w.deps)).resolves.toEqual({
      locks: { 'AT|Feldkirch': 1 },
    });
  });
});

describe('adminSaveRegionMapping', () => {
  it('is for Super-Admins only and writes nothing otherwise', async () => {
    const w = makeWorld();
    const data = { moves: [move('Roth', 'franken')] };
    await expect(saveRegionMappingHandler(call(null, data), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(saveRegionMappingHandler(call('mod', data), w.deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(w.commit).not.toHaveBeenCalled();
  });

  it('moves districts into a cultural region and commits the changed regions', async () => {
    const w = makeWorld();
    const result = await saveRegionMappingHandler(
      call('admin', { moves: [move('Roth', 'franken'), move('Kitzingen', 'franken')] }),
      w.deps
    );
    expect(result.changes.map((c) => c.regionId).sort()).toEqual(['bayern', 'franken']);
    expect(result.changes.find((c) => c.regionId === 'franken')?.added).toEqual([
      'Kitzingen',
      'Roth',
    ]);
    expect(w.commit).toHaveBeenCalledTimes(1);
    const args = w.commit.mock.calls[0][0] as {
      actorUid: string;
      changes: Array<{ regionId: string; after: string[] }>;
    };
    expect(args.actorUid).toBe('admin');
    expect(args.changes.find((c) => c.regionId === 'franken')?.after).toEqual([
      'Kitzingen',
      'Roth',
    ]);
  });

  it('builds on what the mapping tool saved before', async () => {
    const w = makeWorld({
      regionDocs: [
        { id: 'franken', data: { bezirke: ['Roth'], mappingUpdatedAt: 1 } },
        { id: 'bayern', data: { bezirke: ['Kitzingen'], mappingUpdatedAt: 1 } },
      ],
    });
    const result = await saveRegionMappingHandler(
      call('admin', { moves: [move('Kitzingen', 'franken')] }),
      w.deps
    );
    expect(result.changes.find((c) => c.regionId === 'franken')?.added).toEqual(['Kitzingen']);
  });

  it('is a no-op when nothing changes', async () => {
    const w = makeWorld();
    await expect(
      saveRegionMappingHandler(call('admin', { moves: [move('Roth', 'bayern')] }), w.deps)
    ).resolves.toEqual({ changes: [] });
    expect(w.commit).not.toHaveBeenCalled();
  });

  it('refuses invalid moves with details', async () => {
    const w = makeWorld();
    await expect(
      saveRegionMappingHandler(call('admin', { moves: [move('Roth', 'tirol')] }), w.deps)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'mapping-invalid', errors: [{ code: 'wrong-country' }] },
    });
    await expect(
      saveRegionMappingHandler(call('admin', { moves: [move('Atlantis', 'franken')] }), w.deps)
    ).rejects.toMatchObject({ details: { errors: [{ code: 'unknown-district' }] } });
    expect(w.commit).not.toHaveBeenCalled();
  });

  it('never lets an active region lose its last district', async () => {
    const w = makeWorld({ regionDocs: [{ id: 'tirol', data: { active: true } }] });
    const all = [
      'Innsbruck',
      'Imst',
      'Innsbruck-Land',
      'Kitzbühel',
      'Kufstein',
      'Landeck',
      'Reutte',
      'Schwaz',
      'Lienz',
    ].map((n) => move(n, 'salzburg', 'AT'));
    await expect(
      saveRegionMappingHandler(call('admin', { moves: all }), w.deps)
    ).rejects.toMatchObject({
      details: { errors: [{ code: 'would-empty-active-region', regionId: 'tirol' }] },
    });
  });

  it('refuses to move a district that still has events, and names it', async () => {
    const w = makeWorld({
      events: [
        { regionId: 'bayern', bezirk: 'Roth' },
        { regionId: 'bayern', bezirk: 'Roth' },
      ],
    });
    await expect(
      saveRegionMappingHandler(
        call('admin', { moves: [move('Roth', 'franken'), move('Kitzingen', 'franken')] }),
        w.deps
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: {
        reason: 'events-in-district',
        blocked: [{ districtKey: 'DE|Roth', district: 'Roth', events: 2 }],
      },
    });
    expect(w.commit).not.toHaveBeenCalled();
  });

  it('allows moving INTO a region that has events (only leaving is locked)', async () => {
    const w = makeWorld({
      regionDocs: [
        { id: 'franken', data: { bezirke: ['Roth'], mappingUpdatedAt: 1 } },
        { id: 'bayern', data: { bezirke: ['Kitzingen'], mappingUpdatedAt: 1 } },
      ],
      events: [{ regionId: 'franken', bezirk: 'Roth' }],
    });
    await expect(
      saveRegionMappingHandler(call('admin', { moves: [move('Kitzingen', 'franken')] }), w.deps)
    ).resolves.toMatchObject({ changes: [{ regionId: 'bayern' }, { regionId: 'franken' }] });
  });
});
