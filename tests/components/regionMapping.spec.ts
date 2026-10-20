import { describe, it, expect } from 'vitest';
import {
  DISTRICT_CATALOG,
  checkMapping,
  currentAssignment,
  districtCatalog,
  planMappingChange,
} from '../../src/utils/regionMapping';
import { STATIC_REGIONS, isPopulated } from '../../src/utils/regions';

type R = (typeof STATIC_REGIONS)[number];
const regions = (): R[] => STATIC_REGIONS.map((r) => ({ ...r, bezirke: [...r.bezirke] }));
const key = (country: string, name: string) => `${country}|${name}`;

describe('district catalogue (the fixed backend structure)', () => {
  it('lists the districts of the 51 Bundeslaender / Kantone, without Grenznahe', () => {
    const states = new Set(DISTRICT_CATALOG.map((d) => d.stateSlug));
    expect(states.size).toBe(51);
    expect(DISTRICT_CATALOG.some((d) => d.name === 'Grenznahe')).toBe(false);
    expect(DISTRICT_CATALOG.length).toBeGreaterThan(600);
  });

  it('has unique district names within each country (the key is country + name)', () => {
    const keys = DISTRICT_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is built from the original states only, never from cultural regions', () => {
    const cultural = STATIC_REGIONS.filter((r) => !r.home);
    expect(cultural.length).toBe(60);
    expect(cultural.every((r) => r.bezirke.length === 0)).toBe(true);
    expect(districtCatalog()).toEqual(DISTRICT_CATALOG);
  });
});

describe('initial state = backend structure', () => {
  it('assigns every district to exactly one region and leaves cultural regions empty', () => {
    const check = checkMapping(regions());
    expect(check).toMatchObject({ ok: true, unassigned: [], duplicates: [], unknown: [] });
    expect(STATIC_REGIONS.filter((r) => !isPopulated(r)).length).toBe(60);
  });

  it('reports unassigned, duplicate and unknown districts', () => {
    const rs = regions();
    const bayern = rs.find((r) => r.id === 'bayern')!;
    const baden = rs.find((r) => r.id === 'baden-wuerttemberg')!;
    const removed = bayern.bezirke.shift()!;
    baden.bezirke.push(bayern.bezirke[0]);
    baden.bezirke.push('Atlantis');
    const check = checkMapping(rs);
    expect(check.ok).toBe(false);
    expect(check.unassigned.map((d) => d.name)).toEqual([removed]);
    expect(check.duplicates.map((d) => d.name)).toEqual([bayern.bezirke[0]]);
    expect(check.unknown).toEqual([{ regionId: 'baden-wuerttemberg', name: 'Atlantis' }]);
  });
});

describe('planMappingChange', () => {
  it('moves districts into a cultural region, across Bundeslaender', () => {
    const rs = regions();
    const { changes, errors } = planMappingChange(rs, [
      { districtKey: key('DE', 'Roth'), toRegionId: 'franken' },
      { districtKey: key('DE', 'Kitzingen'), toRegionId: 'franken' },
      { districtKey: key('DE', 'Main-Tauber-Kreis'), toRegionId: 'franken' },
    ]);
    expect(errors).toEqual([]);
    const franken = changes.find((c) => c.regionId === 'franken')!;
    expect(franken.added.sort()).toEqual(['Kitzingen', 'Main-Tauber-Kreis', 'Roth']);
    expect(changes.find((c) => c.regionId === 'bayern')!.removed.sort()).toEqual([
      'Kitzingen',
      'Roth',
    ]);
    expect(changes.find((c) => c.regionId === 'baden-wuerttemberg')!.removed).toEqual([
      'Main-Tauber-Kreis',
    ]);
    // Result still passes the health check.
    const after = rs.map((r) => {
      const c = changes.find((x) => x.regionId === r.id);
      return c ? { ...r, bezirke: c.after } : r;
    });
    expect(checkMapping(after).ok).toBe(true);
    expect(currentAssignment(after).get(key('DE', 'Roth'))).toBe('franken');
  });

  it('sorts a changed region by the catalogue order, state by state', () => {
    const { changes } = planMappingChange(regions(), [
      { districtKey: key('DE', 'Kitzingen'), toRegionId: 'franken' },
      { districtKey: key('DE', 'Roth'), toRegionId: 'franken' },
    ]);
    expect(changes.find((c) => c.regionId === 'franken')!.after).toEqual(['Kitzingen', 'Roth']);
  });

  it('is a no-op when the district already is in that region', () => {
    const { changes, errors } = planMappingChange(regions(), [
      { districtKey: key('DE', 'Roth'), toRegionId: 'bayern' },
    ]);
    expect(errors).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('refuses districts of another country, unknown ids and the fixed Grenznahe', () => {
    const rs = regions();
    expect(
      planMappingChange(rs, [{ districtKey: key('DE', 'Roth'), toRegionId: 'tirol' }]).errors[0]
    ).toMatchObject({ code: 'wrong-country' });
    expect(
      planMappingChange(rs, [{ districtKey: key('DE', 'Nirgendwo'), toRegionId: 'franken' }])
        .errors[0]
    ).toMatchObject({ code: 'unknown-district' });
    expect(
      planMappingChange(rs, [{ districtKey: key('DE', 'Roth'), toRegionId: 'nope' }]).errors[0]
    ).toMatchObject({ code: 'unknown-region' });
    expect(
      planMappingChange(rs, [{ districtKey: key('AT', 'Grenznahe'), toRegionId: 'tirol' }])
        .errors[0]
    ).toMatchObject({ code: 'fixed-district' });
  });

  it('never returns partial changes when one move is invalid', () => {
    const result = planMappingChange(regions(), [
      { districtKey: key('DE', 'Roth'), toRegionId: 'franken' },
      { districtKey: key('DE', 'Roth'), toRegionId: 'nope' },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it('does not let an active region lose its last district', () => {
    const rs = regions();
    const vorarlberg = rs.find((r) => r.id === 'vorarlberg')!;
    expect(vorarlberg.active).toBe(true);
    const moves = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'].map((n) => ({
      districtKey: key('AT', n),
      toRegionId: 'tirol',
    }));
    // Grenznahe stays with Vorarlberg, so it is not empty; a purely Austrian active region is:
    const tirol = rs.find((r) => r.id === 'tirol')!;
    tirol.active = true;
    const emptyTirol = tirol.bezirke.map((n) => ({
      districtKey: key('AT', n),
      toRegionId: 'salzburg',
    }));
    expect(planMappingChange(rs, emptyTirol).errors).toEqual([
      { code: 'would-empty-active-region', regionId: 'tirol' },
    ]);
    expect(planMappingChange(rs, moves).errors).toEqual([]);
  });

  it('keeps the legacy Grenznahe entry with Vorarlberg', () => {
    const { changes } = planMappingChange(regions(), [
      { districtKey: key('AT', 'Bregenz'), toRegionId: 'tirol' },
    ]);
    expect(changes.find((c) => c.regionId === 'vorarlberg')!.after).toEqual([
      'Dornbirn',
      'Feldkirch',
      'Bludenz',
      'Grenznahe',
    ]);
  });
});
