import { describe, it, expect } from 'vitest';
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE_URL,
  DEFAULT_OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  TWITTER_CARD,
  LOCALE,
  getSiteUrl,
  toAbsoluteUrl,
  buildPageUrl,
  getDefaultOgTags,
} from '../../src/utils/seo';
import { getEventOgImage } from '../../src/components/SeoMeta';

describe('seo constants', () => {
  it('uses events.thetribe.at as the production site URL', () => {
    expect(SITE_URL).toBe('https://events.thetribe.at');
  });

  it('has a branded site name', () => {
    expect(SITE_NAME).toBe('tribe Vorarlberg');
  });

  it('points the default OG image at an absolute URL under the site', () => {
    expect(DEFAULT_OG_IMAGE_URL).toBe('https://events.thetribe.at/og-default.jpg');
    expect(DEFAULT_OG_IMAGE_URL.startsWith('http')).toBe(true);
  });

  it('uses the standard 1200x630 OG image dimensions', () => {
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
  });

  it('uses summary_large_image for Twitter cards', () => {
    expect(TWITTER_CARD).toBe('summary_large_image');
  });

  it('uses de_AT as the OG locale', () => {
    expect(LOCALE).toBe('de_AT');
  });
});

describe('getSiteUrl', () => {
  it('returns the canonical site URL', () => {
    expect(getSiteUrl()).toBe('https://events.thetribe.at');
  });
});

describe('toAbsoluteUrl', () => {
  it('leaves absolute https URLs untouched', () => {
    expect(toAbsoluteUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('leaves absolute http URLs untouched', () => {
    expect(toAbsoluteUrl('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
  });

  it('prepends the site URL to paths starting with /', () => {
    expect(toAbsoluteUrl('/event-fallbacks/yoga.jpg')).toBe(
      'https://events.thetribe.at/event-fallbacks/yoga.jpg'
    );
  });

  it('prepends https: to protocol-relative URLs', () => {
    expect(toAbsoluteUrl('//cdn.example.com/img.jpg')).toBe('https://cdn.example.com/img.jpg');
  });

  it('prepends the site URL with a slash for paths without a leading slash', () => {
    expect(toAbsoluteUrl('og-default.jpg')).toBe('https://events.thetribe.at/og-default.jpg');
  });

  it('returns the default OG image when given a falsy value', () => {
    expect(toAbsoluteUrl(undefined)).toBe(DEFAULT_OG_IMAGE_URL);
    expect(toAbsoluteUrl(null)).toBe(DEFAULT_OG_IMAGE_URL);
    expect(toAbsoluteUrl('')).toBe(DEFAULT_OG_IMAGE_URL);
  });
});

describe('buildPageUrl', () => {
  it('returns an absolute URL under the site when no path is provided', () => {
    expect(buildPageUrl()).toMatch(/^https:\/\/events\.thetribe\.at\//);
    expect(buildPageUrl('')).toMatch(/^https:\/\/events\.thetribe\.at/);
  });

  it('builds an absolute URL for "/"', () => {
    expect(buildPageUrl('/')).toBe('https://events.thetribe.at/');
  });

  it('builds an absolute URL for an event detail path', () => {
    expect(buildPageUrl('/event/yoga-heute')).toBe('https://events.thetribe.at/event/yoga-heute');
  });

  it('returns absolute URLs unchanged', () => {
    expect(buildPageUrl('https://example.com/foo')).toBe('https://example.com/foo');
  });
});

describe('getDefaultOgTags', () => {
  it('returns the default site-wide tags when called with no arguments', () => {
    const tags = getDefaultOgTags();
    expect(tags.title).toBe('tribe Vorarlberg');
    expect(tags.description).toMatch(/Vorarlberg/);
    expect(tags.url).toBe('https://events.thetribe.at/');
    expect(tags.imageUrl).toBe(DEFAULT_OG_IMAGE_URL);
    expect(tags.type).toBe('website');
  });

  it('honors overrides for title, description, path and image', () => {
    const tags = getDefaultOgTags({
      title: 'Mein Event',
      description: 'Tolle Beschreibung',
      path: '/event/mein-event',
      imagePath: '/event-fallbacks/yoga.jpg',
      type: 'event',
    });
    expect(tags.title).toBe('Mein Event');
    expect(tags.description).toBe('Tolle Beschreibung');
    expect(tags.url).toBe('https://events.thetribe.at/event/mein-event');
    expect(tags.imageUrl).toBe('https://events.thetribe.at/event-fallbacks/yoga.jpg');
    expect(tags.type).toBe('event');
  });
});

describe('getEventOgImage', () => {
  it('returns the event imageUrl (made absolute) when present', () => {
    expect(getEventOgImage({ imageUrl: '/event-fallbacks/yoga.jpg', category: 'Yoga' })).toBe(
      'https://events.thetribe.at/event-fallbacks/yoga.jpg'
    );
  });

  it('falls back to the category fallback image when the event has no imageUrl (acceptance criterion 4)', () => {
    expect(getEventOgImage({ category: 'Yoga' })).toBe(
      'https://events.thetribe.at/event-fallbacks/yoga.jpg'
    );
    expect(getEventOgImage({ category: 'Tanz' })).toBe(
      'https://events.thetribe.at/event-fallbacks/tanz.jpg'
    );
    expect(getEventOgImage({ category: 'Sonstiges' })).toBe(
      'https://events.thetribe.at/event-fallbacks/sonstiges.jpg'
    );
  });

  it('returns the Sonstiges category fallback when the event has no category', () => {
    // Mirrors getEventFallbackImage's behavior — events without a category
    // resolve to the generic "Sonstiges" fallback used everywhere else.
    expect(getEventOgImage({})).toBe('https://events.thetribe.at/event-fallbacks/sonstiges.jpg');
    expect(getEventOgImage(null)).toBe('https://events.thetribe.at/event-fallbacks/sonstiges.jpg');
    expect(getEventOgImage(undefined)).toBe(
      'https://events.thetribe.at/event-fallbacks/sonstiges.jpg'
    );
  });

  it('keeps already-absolute image URLs intact', () => {
    expect(getEventOgImage({ imageUrl: 'https://storage.googleapis.com/example/event.jpg' })).toBe(
      'https://storage.googleapis.com/example/event.jpg'
    );
  });
});

describe('default OG image asset', () => {
  it('points to the og-default.jpg asset', () => {
    expect(DEFAULT_OG_IMAGE_PATH).toBe('/og-default.jpg');
  });
});
