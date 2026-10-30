import { describe, it, expect } from 'vitest';
import landkreisMap from '../../src/data/landkreisMap.json';
import { DISTRICT_CATALOG } from '../../src/utils/regionMapping';
import { STATIC_REGIONS } from '../../src/utils/regions';

// Guard for src/data/landkreisMap.json (from the product owner's map): keeps the
// file in line with the catalog when either side changes.
//
// Documented exceptions: none on the catalog side. On the map side two old shapes are drawn
// as part of the district they merged into (Osterode am Harz -> Göttingen, Eisenach ->
// Wartburgkreis); they have no key of their own, so they cannot show up here.
const CATALOG_WITHOUT_SHAPE: string[] = [];

const districts = landkreisMap.districts as Record<string, { d: string; x: number; y: number }>;

describe('landkreisMap.json', () => {
  const german = DISTRICT_CATALOG.filter((d) => d.country === 'DE').map((d) => d.key);

  it('has a shape for every Landkreis / Stadt of Germany in the catalog', () => {
    expect(german.filter((k) => !districts[k] && !CATALOG_WITHOUT_SHAPE.includes(k))).toEqual([]);
  });

  it('has no shape the catalog does not know', () => {
    expect(Object.keys(districts).filter((k) => !german.includes(k))).toEqual([]);
  });

  it('no two districts share a shape', () => {
    const paths = Object.values(districts).map((s) => s.d);
    expect(paths.filter((d, i) => paths.indexOf(d) !== i)).toEqual([]);
  });

  it('has a colour for every cultural region of Germany and none for other regions', () => {
    const cultural = STATIC_REGIONS.filter((r) => r.country === 'DE' && !r.home).map((r) => r.slug);
    expect(Object.keys(landkreisMap.regions).sort()).toEqual([...cultural].sort());
  });

  it('only uses the path commands the components expect, inside the viewBox', () => {
    const [, , w, h] = landkreisMap.viewBox.split(' ').map(Number);
    for (const [key, s] of Object.entries(districts)) {
      expect(s.d, key).toMatch(/^M[-0-9.,lMZ ]+$/);
      expect(s.x > 0 && s.x < w && s.y > 0 && s.y < h, key).toBe(true);
    }
  });
});
