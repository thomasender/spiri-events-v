import { describe, it, expect } from 'vitest';
import { bezirkLabel, BEZIRKE } from '../../src/utils/regions';
import { getEventLocationLabel } from '../../src/utils/eventFormat';

describe('bezirkLabel', () => {
  it('shows the stored value "Grenznahe" as "Umgebung" but keeps the stored value', () => {
    expect(BEZIRKE).toContain('Grenznahe');
    expect(bezirkLabel('Grenznahe')).toBe('Umgebung');
    expect(getEventLocationLabel({ bezirk: 'Grenznahe' })).toBe('Umgebung');
  });

  it('leaves other districts untouched', () => {
    expect(bezirkLabel('Dornbirn')).toBe('Dornbirn');
    expect(bezirkLabel(undefined as unknown as string)).toBeUndefined();
  });
});
