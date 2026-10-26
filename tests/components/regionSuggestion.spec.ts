import { describe, it, expect } from 'vitest';
import { REGION_SUGGESTION, suggestedMoves } from '../../src/data/regionSuggestion';
import { CATALOG_BY_KEY, DISTRICT_CATALOG, planMappingChange } from '../../src/utils/regionMapping';
import { STATIC_REGIONS } from '../../src/utils/regions';

describe('REGION_SUGGESTION', () => {
  const moves = suggestedMoves();

  it('names only existing Landkreise / Städte, each once', () => {
    const keys = moves.map((m) => m.districtKey);
    expect(keys.filter((k) => !CATALOG_BY_KEY.has(k))).toEqual([]);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('targets only cultural regions of Germany', () => {
    const cultural = new Set(
      STATIC_REGIONS.filter((r) => r.country === 'DE' && !r.home).map((r) => r.id)
    );
    expect(Object.keys(REGION_SUGGESTION).filter((id) => !cultural.has(id))).toEqual([]);
  });

  it('is a valid plan: gives every cultural region at least one district', () => {
    const { errors, changes } = planMappingChange(STATIC_REGIONS, moves);
    expect(errors).toEqual([]);
    const cultural = STATIC_REGIONS.filter((r) => r.country === 'DE' && !r.home);
    const filled = new Set(changes.filter((c) => c.added.length).map((c) => c.regionId));
    expect(cultural.filter((r) => !filled.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  it('includes cities without a Landkreis in the district list', () => {
    const names = DISTRICT_CATALOG.filter((d) => d.country === 'DE').map((d) => d.name);
    for (const city of ['Berlin', 'Hamburg', 'Bremen', 'Köln', 'München (Stadt)']) {
      expect(names).toContain(city);
    }
  });
});
