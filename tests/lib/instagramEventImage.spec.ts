import { describe, expect, it } from 'vitest';
import sharp from '../../functions/node_modules/sharp';
import {
  CATEGORY_FALLBACKS as FUNCTIONS_FALLBACKS,
  DEFAULT_EVENT_FALLBACK as FUNCTIONS_DEFAULT,
  SITE_ORIGIN,
  getCategoryFallbackUrl,
} from '../../functions/src/instagram/instagramContent';
import { renderEventImage } from '../../functions/src/instagram/instagramImage';
import {
  CATEGORY_FALLBACKS as SITE_FALLBACKS,
  DEFAULT_EVENT_FALLBACK as SITE_DEFAULT,
} from '../../src/utils/eventFallbacks.js';

type Rgb = [number, number, number];

const solid = (width: number, height: number, color: Rgb) =>
  sharp({
    create: { width, height, channels: 3, background: { r: color[0], g: color[1], b: color[2] } },
  })
    .png()
    .toBuffer();

async function pixel(jpeg: Buffer, x: number, y: number): Promise<Rgb> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const close = (a: Rgb, b: Rgb, tol = 25) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const EVENT_URL = 'https://firebasestorage/event.png';
const YOGA_URL = `${SITE_ORIGIN}/event-fallbacks/yoga.jpg`;
const FALLBACK_COLOR: Rgb = [30, 160, 60];

/** Stub: serves the given buffers by URL, throws (404) for everything else. */
function stubFetch(files: Record<string, Buffer>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const file = files[url];
    if (!file) throw new Error('404');
    return file;
  };
}

describe('category fallback map', () => {
  it('is identical to the website map in src/utils/eventFallbacks.js', () => {
    expect(FUNCTIONS_FALLBACKS).toEqual(SITE_FALLBACKS);
    expect(FUNCTIONS_DEFAULT).toBe(SITE_DEFAULT);
  });

  it('picks the fallback per category, default for unknown or missing', () => {
    expect(getCategoryFallbackUrl('Yoga')).toBe(YOGA_URL);
    expect(getCategoryFallbackUrl('Soundhealing')).toBe(
      `${SITE_ORIGIN}/event-fallbacks/soundhealing.jpeg`
    );
    expect(getCategoryFallbackUrl('Unbekannt')).toBe(`${SITE_ORIGIN}/hero.jpeg`);
    expect(getCategoryFallbackUrl(undefined)).toBe(`${SITE_ORIGIN}/hero.jpeg`);
    expect(getCategoryFallbackUrl('toString')).toBe(`${SITE_ORIGIN}/hero.jpeg`);
  });
});

describe('instagram feed image (no text layer)', () => {
  const base = { title: 'Kakao', date: '2026-10-17', category: 'Yoga' };

  it('uses a near-4:5 image with cover (fills the whole frame)', async () => {
    const color: Rgb = [200, 100, 50];
    const jpeg = await renderEventImage({ ...base, imageUrl: EVENT_URL }, 'feed', {
      fetchImage: stubFetch({ [EVENT_URL]: await solid(760, 1000, color) }), // 0.76
    });
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
    // contain would leave darkened side bars; cover reaches the left/right edge
    expect(close(await pixel(jpeg, 2, 675), color)).toBe(true);
    expect(close(await pixel(jpeg, 1077, 675), color)).toBe(true);
  });

  it('does not crop a wide flyer: far left/right edge stay visible', async () => {
    // 2000x500: red left edge, blue right edge, green middle
    const flyer = await sharp({
      create: { width: 2000, height: 500, channels: 3, background: { r: 0, g: 200, b: 0 } },
    })
      .composite([
        { input: await solid(40, 500, [255, 0, 0]), left: 0, top: 0 },
        { input: await solid(40, 500, [0, 0, 255]), left: 1960, top: 0 },
      ])
      .png()
      .toBuffer();
    const jpeg = await renderEventImage({ ...base, imageUrl: EVENT_URL }, 'feed', {
      fetchImage: stubFetch({ [EVENT_URL]: flyer }),
    });
    const meta = await sharp(jpeg).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    const [r1, , b1] = await pixel(jpeg, 6, 675);
    const [r2, , b2] = await pixel(jpeg, 1073, 675);
    expect(r1).toBeGreaterThan(180);
    expect(b1).toBeLessThan(80);
    expect(b2).toBeGreaterThan(180);
    expect(r2).toBeLessThan(80);
    // above the centred flyer there is the blurred, darkened backdrop
    const corner = await pixel(jpeg, 3, 3);
    expect(corner[1]).toBeLessThan(200);
    expect(corner[1]).toBeGreaterThan(0);
  });

  it('uses the category fallback when the event has no image', async () => {
    const calls: string[] = [];
    const jpeg = await renderEventImage(base, 'feed', {
      fetchImage: stubFetch({ [YOGA_URL]: await solid(1600, 900, FALLBACK_COLOR) }, calls),
    });
    expect(calls).toEqual([YOGA_URL]);
    expect(close(await pixel(jpeg, 540, 675), FALLBACK_COLOR)).toBe(true);
    expect(close(await pixel(jpeg, 20, 20), FALLBACK_COLOR)).toBe(true); // no overlay
  });

  it('uses the category fallback when the event image download throws', async () => {
    const calls: string[] = [];
    const jpeg = await renderEventImage({ ...base, imageUrl: EVENT_URL }, 'feed', {
      fetchImage: stubFetch({ [YOGA_URL]: await solid(1600, 900, FALLBACK_COLOR) }, calls),
    });
    expect(calls).toEqual([EVENT_URL, YOGA_URL]);
    expect(close(await pixel(jpeg, 540, 675), FALLBACK_COLOR)).toBe(true);
  });

  it('uses the default fallback for an unknown category', async () => {
    const calls: string[] = [];
    await renderEventImage({ ...base, category: 'Neu' }, 'feed', {
      fetchImage: stubFetch(
        { [`${SITE_ORIGIN}/hero.jpeg`]: await solid(800, 600, [9, 9, 9]) },
        calls
      ),
    });
    expect(calls).toEqual([`${SITE_ORIGIN}/hero.jpeg`]);
  });

  it('falls back to the plain gradient layout when everything fails', async () => {
    const jpeg = await renderEventImage({ ...base, imageUrl: EVENT_URL }, 'feed', {
      fetchImage: stubFetch({}),
    });
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
    // gradient: category colour (Yoga #c48e6a) top-left, near-black bottom-right
    expect(close(await pixel(jpeg, 3, 3), [196, 142, 106], 40)).toBe(true);
    expect((await pixel(jpeg, 1076, 1346)).every((v) => v < 60)).toBe(true);
  });
});

describe('instagram carousel slide without image', () => {
  it('uses the category fallback photo as background, with text overlay', async () => {
    const calls: string[] = [];
    const tanz = `${SITE_ORIGIN}/event-fallbacks/tanz.jpg`;
    const jpeg = await renderEventImage(
      { title: 'Kakao', date: '2026-10-17', category: 'Tanz' },
      'carousel',
      { fetchImage: stubFetch({ [tanz]: await solid(1600, 900, [230, 230, 230]) }, calls) }
    );
    expect(calls).toEqual([tanz]);
    const meta = await sharp(jpeg).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    // photo shows through (not the gradient), darkened by the legibility overlay at the bottom
    const top = await pixel(jpeg, 1070, 5);
    const bottom = await pixel(jpeg, 1070, 1345);
    expect(top[0]).toBeGreaterThan(80);
    expect(bottom[0]).toBeLessThan(top[0]);
    expect(bottom[0]).toBeGreaterThan(20);
  });
});
