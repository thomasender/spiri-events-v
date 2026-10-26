import { describe, it, expect } from 'vitest';
import { foldSearchText } from '../../src/utils/regionSearch';

describe('foldSearchText', () => {
  it('ignores case, accents and umlaut spelling', () => {
    expect(foldSearchText('Zürich')).toBe(foldSearchText('zuerich'));
    expect(foldSearchText('Zürich')).toBe(foldSearchText('ZURICH'));
    expect(foldSearchText('Graubünden')).toBe(foldSearchText('graubuenden'));
    expect(foldSearchText('Weißenburg')).toBe(foldSearchText('weissenburg'));
    expect(foldSearchText('  Bad   Tölz ')).toBe('bad tolz');
  });
});
