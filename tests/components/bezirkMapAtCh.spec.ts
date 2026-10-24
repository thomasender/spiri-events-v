import { describe, it, expect } from 'vitest';
import bezirkMap from '../../src/data/bezirkMapAtCh.json';
import { DISTRICT_CATALOG } from '../../src/utils/regionMapping';
import { STATIC_REGIONS } from '../../src/utils/regions';

// Guard for src/data/bezirkMapAtCh.json (scripts/build-atch-bezirk-map.mjs, from the product
// owner's map, ticket 599). Known gaps: the map draws four Bezirke the register does not
// have (Küssnacht SZ, la Veveyse FR, Dorneck SO, Solothurn SO); they are in `unmatched`.
// Liechtenstein is not in the register and not in the file.
type Shape = { d: string };
type CountryMap = {
  viewBox: string;
  country: string[];
  regions: Record<string, { h: number; sh: number }>;
  districts: Record<string, Shape>;
  unmatched: { key: string; name: string; state: string; d: string }[];
};
const maps = bezirkMap as unknown as Record<'AT' | 'CH', CountryMap>;

describe.each(['AT', 'CH'] as const)('bezirkMapAtCh.json %s', (country) => {
  const keys = DISTRICT_CATALOG.filter((d) => d.country === country).map((d) => d.key);
  const map = maps[country];

  it('has a shape for every Bezirk of the register and none the register does not know', () => {
    expect(keys.filter((k) => !map.districts[k])).toEqual([]);
    expect(Object.keys(map.districts).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it('has a colour for every Bundesland / Kanton and for no other region', () => {
    const slugs = STATIC_REGIONS.filter((r) => r.country === country && r.home).map((r) => r.slug);
    expect(Object.keys(map.regions).sort()).toEqual([...slugs].sort());
  });

  it('keeps unmatched shapes out of the Bezirk keys', () => {
    for (const u of map.unmatched) expect(map.districts[u.key]).toBeUndefined();
    expect(map.viewBox.split(' ')).toHaveLength(4);
  });
});

it('lists exactly the four known map shapes without a register Bezirk', () => {
  const names = [...maps.AT.unmatched, ...maps.CH.unmatched].map((u) => u.name).sort();
  expect(names).toEqual(['Dorneck', 'Küssnacht (SZ)', 'Solothurn', 'la Veveyse']);
});
