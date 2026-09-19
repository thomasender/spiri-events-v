import { describe, it, expect } from 'vitest';
import { resolveAppBaseUrl } from '../../src/lib/mollieBaseUrl';

describe('resolveAppBaseUrl', () => {
  it('prefers the Origin header from the browser', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: {
          host: 'europe-west3-spirieventsvbg.cloudfunctions.net',
          protocol: 'https',
          headers: { origin: 'https://www.thetribe.at' },
        },
      })
    ).toBe('https://www.thetribe.at');
  });

  it('falls back to the Referer origin when Origin is missing', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: {
          host: 'europe-west3-spirieventsvbg.cloudfunctions.net',
          protocol: 'https',
          headers: { referer: 'https://www.thetribe.at/spenden' },
        },
      })
    ).toBe('https://www.thetribe.at');
  });

  it('falls back to host + protocol when no browser headers are present', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: { host: 'localhost:5001', protocol: 'http' },
      })
    ).toBe('http://localhost:5001');
  });

  it('defaults to https://localhost when request has no rawRequest', () => {
    expect(resolveAppBaseUrl({})).toBe('https://localhost');
  });

  it('reads lower-cased header names too', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: {
          host: 'placeholder',
          protocol: 'https',
          headers: { origin: 'https://www.thetribe.at' },
        },
      })
    ).toBe('https://www.thetribe.at');
  });

  it('ignores an unparseable Referer and falls back to host', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: {
          host: 'europe-west3-spirieventsvbg.cloudfunctions.net',
          protocol: 'https',
          headers: { referer: 'not a url' },
        },
      })
    ).toBe('https://europe-west3-spirieventsvbg.cloudfunctions.net');
  });

  it('uses the first value when the header is an array', () => {
    expect(
      resolveAppBaseUrl({
        rawRequest: {
          host: 'placeholder',
          protocol: 'https',
          headers: { origin: ['https://www.thetribe.at', 'https://other.example'] },
        },
      })
    ).toBe('https://www.thetribe.at');
  });
});
