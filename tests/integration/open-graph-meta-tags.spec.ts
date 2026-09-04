import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

const SITE_URL = 'https://events.thetribe.at';
const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/og-default.jpg`;

// Helmet tags carry data-rh="true" once the React tree has committed. Using
// these selectors keeps the assertions robust against any stray defaults that
// might appear in <head> (e.g. via future SSR changes).
async function getMetaContent(page: Page, selector: string) {
  return page.locator(`head ${selector}[data-rh="true"]`).first().getAttribute('content');
}

async function getLinkHref(page: Page, selector: string) {
  return page.locator(`head ${selector}[data-rh="true"]`).first().getAttribute('href');
}

async function openEventFromHome(page: Page, title: string) {
  await page.goto('/');
  await waitForCalendarToLoad(page);
  await page.locator('.events-section').first().waitFor({ state: 'attached', timeout: 15000 });
  const card = page.locator('.event-tile, .event-row').filter({ hasText: title }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  // EventCard/EventListRow render the whole tile as a single <a>, so the
  // href lives on the card itself.
  const href = await card.getAttribute('href');
  expect(href, `${title} card must link to /event/...`).toMatch(/^\/event\//);
  await page.goto(href);
  await page.locator('h1.event-title').waitFor({ state: 'visible', timeout: 15000 });
  // Wait for Helmet to commit its meta updates (data-rh="true" tags).
  await page.waitForFunction(
    () => Boolean(document.querySelector('meta[property="og:title"][data-rh="true"]')),
    null,
    { timeout: 5000 }
  );
}

test.describe('Open Graph & Social Media meta tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('homepage exposes complete OG + Twitter meta tags with absolute URLs', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector('meta[property="og:title"][data-rh="true"]')),
      null,
      { timeout: 5000 }
    );

    const ogType = await getMetaContent(page, 'meta[property="og:type"]');
    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    const ogDescription = await getMetaContent(page, 'meta[property="og:description"]');
    const ogUrl = await getMetaContent(page, 'meta[property="og:url"]');
    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    const ogImageWidth = await getMetaContent(page, 'meta[property="og:image:width"]');
    const ogImageHeight = await getMetaContent(page, 'meta[property="og:image:height"]');
    const ogLocale = await getMetaContent(page, 'meta[property="og:locale"]');
    const ogSiteName = await getMetaContent(page, 'meta[property="og:site_name"]');
    const twitterCard = await getMetaContent(page, 'meta[name="twitter:card"]');
    const twitterTitle = await getMetaContent(page, 'meta[name="twitter:title"]');
    const twitterDescription = await getMetaContent(page, 'meta[name="twitter:description"]');
    const twitterImage = await getMetaContent(page, 'meta[name="twitter:image"]');
    const canonical = await getLinkHref(page, 'link[rel="canonical"]');
    const robots = await getMetaContent(page, 'meta[name="robots"]');

    expect(ogType).toBe('website');
    expect(ogTitle).toMatch(/tribe Vorarlberg/);
    expect(ogDescription).toMatch(/Vorarlberg/);
    expect(ogLocale).toBe('de_AT');
    expect(ogSiteName).toBe('tribe Vorarlberg');
    expect(ogUrl).toBe(`${SITE_URL}/`);
    expect(canonical).toBe(`${SITE_URL}/`);
    expect(robots).toBe('index, follow');

    expect(ogImage, 'og:image must be absolute (acceptance criterion 1)').toMatch(/^https?:\/\//);
    expect(ogImage).toBe(DEFAULT_OG_IMAGE_URL);
    expect(ogImageWidth, 'og:image must declare 1200px width (acceptance criterion 2)').toBe(
      '1200'
    );
    expect(ogImageHeight, 'og:image must declare 630px height (acceptance criterion 2)').toBe(
      '630'
    );

    expect(twitterCard).toBe('summary_large_image');
    expect(twitterTitle).toMatch(/tribe Vorarlberg/);
    expect(twitterDescription).toMatch(/Vorarlberg/);
    expect(twitterImage, 'twitter:image must be absolute (acceptance criterion 1)').toMatch(
      /^https?:\/\//
    );
    expect(twitterImage).toBe(DEFAULT_OG_IMAGE_URL);
  });

  test('event detail page exposes event-specific OG tags with absolute URL and image', async ({
    page,
  }) => {
    await openEventFromHome(page, 'Yoga heute');

    const ogType = await getMetaContent(page, 'meta[property="og:type"]');
    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    const ogUrl = await getMetaContent(page, 'meta[property="og:url"]');
    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    const twitterImage = await getMetaContent(page, 'meta[name="twitter:image"]');
    const canonical = await getLinkHref(page, 'link[rel="canonical"]');

    expect(ogType).toBe('event');
    expect(ogTitle).toBe('Yoga heute | tribe Vorarlberg');
    expect(ogUrl, 'event og:url must be absolute under events.thetribe.at').toMatch(
      /^https:\/\/events\.thetribe\.at\/event\//
    );
    expect(canonical).toBe(ogUrl);

    expect(ogImage, 'event og:image must be absolute (acceptance criterion 1)').toMatch(
      /^https?:\/\//
    );
    expect(ogImage).toBe(`${SITE_URL}/event-fallbacks/yoga.jpg`);
    expect(twitterImage, 'event twitter:image must be absolute (acceptance criterion 1)').toMatch(
      /^https?:\/\//
    );
    expect(twitterImage).toBe(`${SITE_URL}/event-fallbacks/yoga.jpg`);
  });

  test('event detail page falls back to the category image when the event has no imageUrl', async ({
    page,
  }) => {
    await openEventFromHome(page, 'Tanzworkshop diese Woche');

    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    expect(ogImage).toBe(`${SITE_URL}/event-fallbacks/tanz.jpg`);
  });

  test('legal page (impressum) exposes OG tags with the default image', async ({ page }) => {
    await page.goto('/impressum');
    await expect(page.locator('h1.legal-title')).toBeVisible();
    await page.waitForFunction(
      () => Boolean(document.querySelector('meta[property="og:title"][data-rh="true"]')),
      null,
      { timeout: 5000 }
    );

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    const ogUrl = await getMetaContent(page, 'meta[property="og:url"]');
    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    const canonical = await getLinkHref(page, 'link[rel="canonical"]');

    expect(ogTitle).toMatch(/Impressum/);
    expect(ogUrl).toBe(`${SITE_URL}/impressum`);
    expect(canonical).toBe(`${SITE_URL}/impressum`);
    expect(ogImage).toBe(DEFAULT_OG_IMAGE_URL);
  });

  test('login page is excluded from indexing (noindex) and still has OG fallback image', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => Boolean(document.querySelector('meta[property="og:title"][data-rh="true"]')),
      null,
      { timeout: 5000 }
    );

    const robots = await getMetaContent(page, 'meta[name="robots"]');
    const ogType = await getMetaContent(page, 'meta[property="og:type"]');
    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    const canonical = await getLinkHref(page, 'link[rel="canonical"]');

    expect(robots).toBe('noindex, nofollow');
    expect(ogType).toBe('website');
    expect(ogImage).toBe(DEFAULT_OG_IMAGE_URL);
    expect(canonical).toBe(`${SITE_URL}/login`);
  });

  test('og:image asset is served with the expected 1200x630 dimensions', async ({ page }) => {
    const response = await page.request.get('/og-default.jpg');
    expect(response.status()).toBe(200);
    const buffer = await response.body();

    const jpegMarker = Buffer.from([0xff, 0xd8, 0xff]);
    expect(buffer.subarray(0, 3).equals(jpegMarker), 'og-default.jpg must be a valid JPEG').toBe(
      true
    );

    const width = readJpegDimension(buffer, 'width');
    const height = readJpegDimension(buffer, 'height');
    expect(width, 'og-default.jpg must be 1200px wide (acceptance criterion 2)').toBe(1200);
    expect(height, 'og-default.jpg must be 630px tall (acceptance criterion 2)').toBe(630);

    expect(buffer.length, 'og-default.jpg must be < 1MB (acceptance criterion 2)').toBeLessThan(
      1024 * 1024
    );
  });
});

function readJpegDimension(buffer: Buffer, dimension: 'width' | 'height'): number {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('Not a JPEG');
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new Error('Invalid JPEG marker');
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const heightVal = buffer.readUInt16BE(offset + 3);
      const widthVal = buffer.readUInt16BE(offset + 5);
      return dimension === 'height' ? heightVal : widthVal;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    offset += segmentLength;
  }
  throw new Error('Could not read JPEG dimensions');
}
