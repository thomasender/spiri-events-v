import { describe, it, expect } from 'vitest';
import { afterVerifyPath, getReturnPath } from '../../src/utils/returnPath';

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

describe('afterVerifyPath (where the e-mail confirmation link leads)', () => {
  it('allows only the whitelisted event wizard', () => {
    expect(afterVerifyPath('/admin/new')).toBe('/admin/new');
  });

  it('sends everything else home, so the link is no open redirect', () => {
    expect(afterVerifyPath(null)).toBe('/');
    expect(afterVerifyPath('')).toBe('/');
    expect(afterVerifyPath('/admin')).toBe('/');
    expect(afterVerifyPath('/admin/new?x=1')).toBe('/');
    expect(afterVerifyPath('https://evil.example')).toBe('/');
    expect(afterVerifyPath('//evil.example/admin/new')).toBe('/');
  });
});
