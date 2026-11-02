import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SITE_ORIGIN,
  requestSiteOrigin,
  resolveSiteOrigin,
} from '../../functions/src/siteOrigin';
import { buildFavoriteCancelledPayload, withSiteOrigin } from '../../functions/src/emailTemplates';
import { chatMailBaseUrl } from '../../functions/src/chatMailNotify';

describe('resolveSiteOrigin', () => {
  it('keeps every domain we serve the site on', () => {
    for (const origin of [
      'https://www.thetribe.at',
      'https://deintribe.de',
      'https://www.deintribe.at',
      'https://www.deintribe.ch',
    ]) {
      expect(resolveSiteOrigin(origin)).toBe(origin);
    }
  });

  it('falls back to the default for unknown, missing or malformed values', () => {
    expect(resolveSiteOrigin('https://evil.example')).toBe(DEFAULT_SITE_ORIGIN);
    expect(resolveSiteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN);
    expect(resolveSiteOrigin(42)).toBe(DEFAULT_SITE_ORIGIN);
    expect(resolveSiteOrigin('https://www.thetribe.at.evil.example')).toBe(DEFAULT_SITE_ORIGIN);
  });

  it('reads the origin header of a callable request', () => {
    expect(requestSiteOrigin({ rawRequest: { headers: { origin: 'https://deintribe.ch' } } })).toBe(
      'https://deintribe.ch'
    );
    expect(requestSiteOrigin({})).toBe(DEFAULT_SITE_ORIGIN);
  });
});

describe('withSiteOrigin', () => {
  const payload = buildFavoriteCancelledPayload({
    event: { id: 'e1', title: 'Yoga', slug: 'yoga' },
    recipient: 'a@b.at',
    recipientName: 'Anna',
    dates: ['2026-11-10'],
    wholeEvent: true,
  });

  it('moves event, settings and logo links to the recipient domain', () => {
    const out = withSiteOrigin(payload, 'https://www.deintribe.de');
    expect(out.html).toContain('https://www.deintribe.de/event/yoga');
    expect(out.html).toContain('https://www.deintribe.de/profil');
    expect(out.text).toContain('https://www.deintribe.de/event/yoga');
    expect(out.html).not.toContain('https://www.thetribe.at');
    expect(out.text).not.toContain('https://www.thetribe.at');
  });

  it('leaves the payload alone for the default domain or no domain', () => {
    expect(withSiteOrigin(payload, DEFAULT_SITE_ORIGIN)).toBe(payload);
    expect(withSiteOrigin(payload, undefined)).toBe(payload);
  });
});

describe('chatMailBaseUrl', () => {
  it('uses the recipient domain in production and the staging site on staging', () => {
    expect(chatMailBaseUrl('spirieventsvbg', 'https://www.deintribe.de')).toBe(
      'https://www.deintribe.de'
    );
    expect(chatMailBaseUrl('spirieventsvbg')).toBe('https://www.thetribe.at');
    expect(chatMailBaseUrl('tribe-vbg-staging', 'https://www.deintribe.de')).toBe(
      'https://tribe-vbg-staging.web.app'
    );
  });
});
