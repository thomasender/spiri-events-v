import { describe, it, expect } from 'vitest';
import { getReturnPath } from '../../src/utils/returnPath';

describe('getReturnPath', () => {
  it('returns a same-site path from router state', () => {
    expect(getReturnPath({ from: '/event/yoga-20261004' })).toBe('/event/yoga-20261004');
  });

  it('falls back to the home page without state', () => {
    expect(getReturnPath(null)).toBe('/');
    expect(getReturnPath({})).toBe('/');
  });

  it('rejects external and protocol-relative targets', () => {
    expect(getReturnPath({ from: 'https://evil.example' })).toBe('/');
    expect(getReturnPath({ from: '//evil.example' })).toBe('/');
  });
});
