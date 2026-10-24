import { describe, it, expect } from 'vitest';
import * as client from '../../src/utils/regionMapping';
import * as server from '../../functions/src/regionMapping';
import { STATIC_REGIONS } from '../../src/utils/regions';

// The functions copy must behave exactly like src/utils/regionMapping.js.
const clientRegions = () => STATIC_REGIONS.map((r) => ({ ...r, bezirke: [...r.bezirke] }));
const serverRegions = () => server.buildMappingRegisters([]);

describe('functions/src/regionMapping.ts = src/utils/regionMapping.js', () => {
  it('has the same district catalogue', () => {
    expect(server.DISTRICT_CATALOG).toEqual(client.DISTRICT_CATALOG);
  });

  it('builds the same register from nothing', () => {
    const a = serverRegions().map((r) => [r.id, r.country, r.active, r.order, r.bezirke]);
    const b = clientRegions().map((r) => [r.id, r.country, r.active, r.order, r.bezirke]);
    expect(a).toEqual(b);
  });

  const cases: Array<Array<{ districtKey: string; toRegionId: string }>> = [
    [{ districtKey: 'DE|Roth', toRegionId: 'franken' }],
    [
      { districtKey: 'DE|Roth', toRegionId: 'franken' },
      { districtKey: 'DE|Kitzingen', toRegionId: 'franken' },
      { districtKey: 'DE|Main-Tauber-Kreis', toRegionId: 'franken' },
      { districtKey: 'DE|Roth', toRegionId: 'oberbayern' },
    ],
    [{ districtKey: 'AT|Bregenz', toRegionId: 'tirol' }],
    [{ districtKey: 'DE|Roth', toRegionId: 'tirol' }],
    [{ districtKey: 'DE|Nirgendwo', toRegionId: 'franken' }],
    [{ districtKey: 'AT|Grenznahe', toRegionId: 'tirol' }],
    [{ districtKey: 'DE|Roth', toRegionId: 'nope' }],
    [{ districtKey: 'DE|Roth', toRegionId: 'bayern' }],
  ];
  it.each(cases.map((c, i) => [i, c] as const))('plans case %i identically', (_i, moves) => {
    const a = client.planMappingChange(clientRegions(), moves);
    const b = server.planMappingChange(serverRegions(), moves);
    expect(b.errors).toEqual(a.errors);
    expect(b.changes).toEqual(a.changes);
  });
});
