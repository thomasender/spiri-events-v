import { describe, it, expect } from 'vitest';
import { ALLOWED_ORIGINS } from '../../functions/src/allowedOrigins';

// The site is served on the new deintribe domains as well as thetribe.at. Callables
// (verification mail, password reset, Verwaltung > E-Mail-Versand) reject any origin
// missing here with a bare "internal" error in the browser.
describe('ALLOWED_ORIGINS', () => {
  it.each([
    'https://www.thetribe.at',
    'https://thetribe.at',
    'https://www.deintribe.at',
    'https://deintribe.at',
    'https://www.deintribe.de',
    'https://deintribe.de',
    'https://www.deintribe.ch',
    'https://deintribe.ch',
  ])('allows %s', (origin) => {
    expect(ALLOWED_ORIGINS).toContain(origin);
  });

  it('does not trust the staging site in production', () => {
    expect(ALLOWED_ORIGINS).not.toContain('https://tribe-vbg-staging.web.app');
  });
});
