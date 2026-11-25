import { describe, expect, it } from 'vitest';
import { buildBringSummary, countPersons } from '../../functions/src/christmasBringList';

describe('buildBringSummary', () => {
  it('counts case-insensitively, keeps the first spelling and sorts by count', () => {
    const out = buildBringSummary([
      { bring: ['Brot', 'Salat'] },
      { bring: ['brot ', 'Kekse'] },
      { bring: ['BROT'] },
      { bring: 'x' },
      {},
      { bring: ['', 5, 'Salat'] },
    ]);
    expect(out).toEqual([
      { label: 'Brot', count: 3 },
      { label: 'Salat', count: 2 },
      { label: 'Kekse', count: 1 },
    ]);
  });
});

describe('countPersons', () => {
  it('sums valid head counts and ignores junk', () => {
    expect(
      countPersons([{ persons: 2 }, { persons: 3 }, { persons: 'x' }, { persons: 99 }, {}])
    ).toBe(5);
  });
});
