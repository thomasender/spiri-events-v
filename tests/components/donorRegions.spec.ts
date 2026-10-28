import { describe, it, expect } from 'vitest';
import { donorsOfRegion } from '../../src/utils/donorRegions';

describe('donorsOfRegion', () => {
  const donors = [
    { id: 'legacy', order: 100 },
    { id: 'vbLate', regionId: 'vorarlberg', createdAt: { seconds: 9 } },
    { id: 'vb', regionId: 'vorarlberg', order: 0 },
    { id: 'tirol', regionId: 'tirol', order: 0 },
    { id: 'allgaeu', regionId: 'allgaeu', order: 0 },
  ];

  it('treats donors without regionId as Vorarlberg and sorts by admin order', () => {
    expect(donorsOfRegion(donors, 'vorarlberg').map((d) => d.id)).toEqual([
      'vb',
      'legacy',
      'vbLate',
    ]);
  });

  it('keeps other regions apart (legacy Allgäu ids count as Bavaria)', () => {
    expect(donorsOfRegion(donors, 'tirol').map((d) => d.id)).toEqual(['tirol']);
    expect(donorsOfRegion(donors, 'bayern').map((d) => d.id)).toEqual(['allgaeu']);
  });
});
