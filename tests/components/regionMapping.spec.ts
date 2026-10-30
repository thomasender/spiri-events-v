import { describe, it, expect } from 'vitest';
import {
  DISTRICT_CATALOG,
  FIXED_DISTRICTS,
  currentAssignment,
  districtCatalog,
} from '../../src/utils/regionMapping';
import { STATIC_REGIONS, isPopulated } from '../../src/utils/regions';

type R = (typeof STATIC_REGIONS)[number];
const regions = (): R[] => STATIC_REGIONS.map((r) => ({ ...r, bezirke: [...r.bezirke] }));

describe('district catalogue (the fixed backend structure)', () => {
  it('lists the districts of all 133 regions of the CSVs, without Grenznahe', () => {
    const states = new Set(DISTRICT_CATALOG.map((d) => d.stateSlug));
    expect(states.size).toBe(133);
    expect(DISTRICT_CATALOG.some((d) => d.name === 'Grenznahe')).toBe(false);
    expect(DISTRICT_CATALOG).toHaveLength(658);
    expect(DISTRICT_CATALOG.filter((d) => d.country === 'DE')).toHaveLength(400);
    expect(DISTRICT_CATALOG.filter((d) => d.country === 'LI').map((d) => d.key)).toEqual([
      'LI|Oberland',
      'LI|Unterland',
    ]);
  });

  it('has unique district names within each country (the key is country + name)', () => {
    const keys = DISTRICT_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is built from the register', () => {
    expect(districtCatalog()).toEqual(DISTRICT_CATALOG);
  });
});

describe('initial state = backend structure', () => {
  it('assigns every district to exactly one region; every region has districts', () => {
    const assigned = [...currentAssignment(regions()).keys()].filter(
      (k) => !FIXED_DISTRICTS.includes(k.split('|')[1])
    );
    expect(assigned.sort()).toEqual(DISTRICT_CATALOG.map((d) => d.key).sort());
    expect(STATIC_REGIONS.filter((r) => !isPopulated(r))).toHaveLength(0);
  });
});
