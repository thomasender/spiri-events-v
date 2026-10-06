/**
 * Renders Instagram images for an event. Feed (4:5): the event image itself,
 * no text layer (all info is in the caption); without an image the category
 * fallback photo of the website. Story 9:16 and carousel slides 4:5: image or
 * fallback photo as background with a category-coloured text overlay. If no
 * image can be loaded at all: plain category-coloured layout.
 *
 * Pipeline: satori (element tree -> SVG) -> resvg (SVG -> transparent PNG)
 * -> sharp (composite over the background, encode JPEG, which is the only
 * format the Instagram Graph API accepts for feed posts).
 *
 * Which text goes where is decided in ./instagramContent.ts (unit-tested);
 * this file is layout only, so it is checked by looking at the result.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import {
  FORMAT_DIMENSIONS,
  buildEventImageModel,
  getCategoryFallbackUrl,
  type CoverModel,
  type EventImageModel,
  type InstagramEventInput,
  type InstagramFormat,
} from './instagramContent';

const JPEG_QUALITY = 90;
const STORAGE_PREFIX = 'instagram';

type FontWeight = 400 | 700;
interface LoadedFont {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: 'normal';
}

let fontCache: LoadedFont[] | null = null;

// Bundled via the @fontsource packages (same families as the website:
// Cormorant Garamond for headings, Inter for body). satori reads TTF/OTF/WOFF,
// not WOFF2.
function loadFonts(): LoadedFont[] {
  if (fontCache) return fontCache;
  const read = (pkg: string, file: string) =>
    readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
  fontCache = [
    {
      name: 'Cormorant Garamond',
      data: read('cormorant-garamond', 'cormorant-garamond-latin-700-normal.woff'),
      weight: 700,
      style: 'normal',
    },
    {
      name: 'Inter',
      data: read('inter', 'inter-latin-400-normal.woff'),
      weight: 400,
      style: 'normal',
    },
    {
      name: 'Inter',
      data: read('inter', 'inter-latin-700-normal.woff'),
      weight: 700,
      style: 'normal',
    },
  ];
  return fontCache;
}

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown; [key: string]: unknown };
};

function el(
  type: string,
  style: Record<string, unknown>,
  children?: Node | string | Array<Node | string | null> | null
): Node {
  const kids = Array.isArray(children) ? children.filter(Boolean) : children;
  return { type, props: { style: { display: 'flex', ...style }, children: kids ?? undefined } };
}

function buildLayout(model: EventImageModel, format: InstagramFormat, hasImage: boolean): Node {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const isStory = format === 'story';
  const pad = 80;
  // Stories keep the top/bottom ~250px clear: Instagram's UI covers them.
  const padTop = isStory ? 250 : pad;
  const padBottom = isStory ? 280 : pad;

  const titleSize = model.title.length > 45 ? 78 : model.title.length > 28 ? 92 : 108;

  const info = [model.dateLabel, model.timeLabel, model.location].filter(Boolean);

  return el(
    'div',
    {
      width,
      height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: `${padTop}px ${pad}px ${padBottom}px`,
      // With an image: only a dark gradient so the text stays readable and the
      // photo shines through. Without: solid category colour.
      background: hasImage
        ? 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.80) 100%)'
        : `linear-gradient(160deg, ${model.color} 0%, #1d1a1a 100%)`,
      color: '#ffffff',
      fontFamily: 'Inter',
    },
    [
      el('div', { flexDirection: 'column' }, [
        model.category
          ? el(
              'div',
              {
                alignSelf: 'flex-start',
                backgroundColor: model.color,
                border: '3px solid rgba(255,255,255,0.75)',
                borderRadius: 999,
                padding: '14px 36px',
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
              },
              model.category
            )
          : null,
      ]),
      el('div', { flexDirection: 'column' }, [
        el(
          'div',
          {
            fontFamily: 'Cormorant Garamond',
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.05,
            marginBottom: 48,
          },
          model.title
        ),
        ...info.map((line) =>
          el('div', { fontSize: 48, fontWeight: 400, marginBottom: 14, opacity: 0.95 }, line)
        ),
        el(
          'div',
          {
            marginTop: 40,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            opacity: 0.85,
          },
          'thetribe.at'
        ),
      ]),
    ]
  );
}

export type ImageFetcher = (url: string) => Promise<Buffer>;

const defaultFetchImage: ImageFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

/** Aspect ratios (w/h) treated as "already 4:5": cropped to fill, not letterboxed. */
const PORTRAIT_MIN_RATIO = 0.75;
const PORTRAIT_MAX_RATIO = 0.85;

/** Event photo/flyer fitted to the target size without cutting off content. */
async function fitEventImage(source: Buffer, width: number, height: number): Promise<Buffer> {
  // rotate(): honour EXIF orientation of phone photos
  const { data, info } = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  const ratio = info.width / info.height;
  if (ratio >= PORTRAIT_MIN_RATIO && ratio <= PORTRAIT_MAX_RATIO) {
    return sharp(data)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  }
  // Flyers, landscape, square: show the whole image (no text cut off) centred
  // over a blurred, darkened copy of itself.
  const backdrop = await sharp(data)
    .resize(width, height, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.55 })
    .toBuffer();
  const foreground = await sharp(data).resize(width, height, { fit: 'inside' }).png().toBuffer();
  return sharp(backdrop)
    .composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/** Category fallback photo (landscape) cropped to fill the target size. */
async function coverImage(source: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function tryRender(
  url: string | null,
  fetchImage: ImageFetcher,
  render: (source: Buffer) => Promise<Buffer>
): Promise<Buffer | null> {
  if (!url) return null;
  try {
    return await render(await fetchImage(url));
  } catch {
    // A broken or unsupported image must not block the post.
    return null;
  }
}

export interface RenderOptions {
  fetchImage?: ImageFetcher;
  /** category name -> colour from the live `categories` registry */
  categoryColors?: Record<string, string> | null;
}

/**
 * Renders one event as a JPEG buffer in the requested Instagram format.
 *
 * feed: the event image itself (fitted, no text layer), else the category
 * fallback photo, else a plain category-coloured layout. carousel/story: same
 * background choice, but with the text overlay on top.
 */
export async function renderEventImage(
  event: InstagramEventInput,
  format: InstagramFormat,
  options: RenderOptions = {}
): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const model = buildEventImageModel(event, options.categoryColors);
  const fetchImage = options.fetchImage ?? defaultFetchImage;
  const fallbackUrl = getCategoryFallbackUrl(event.category);
  const isFeed = format === 'feed';

  const ownImage = await tryRender(model.imageUrl, fetchImage, (src) =>
    isFeed ? fitEventImage(src, width, height) : coverImage(src, width, height)
  );
  const background =
    ownImage ?? (await tryRender(fallbackUrl, fetchImage, (src) => coverImage(src, width, height)));

  if (isFeed && background) return background;

  const svg = await satori(buildLayout(model, format, background !== null) as never, {
    width,
    height,
    fonts: loadFonts(),
  });
  const overlay = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

  const base = background
    ? sharp(background)
    : sharp({ create: { width, height, channels: 3, background: '#1d1a1a' } });
  return base
    .composite([{ input: overlay }])
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

interface BucketLike {
  name: string;
  file(path: string): {
    save(data: Buffer, options: { contentType: string; metadata: unknown }): Promise<unknown>;
  };
}

/**
 * Stores a rendered JPEG in Firebase Storage and returns a public,
 * unauthenticated URL (a download-token URL, so no storage.rules change is
 * needed; clients still cannot write under instagram/). Instagram fetches the
 * image from this URL when the media container is created.
 */
export async function uploadInstagramImage(
  bucket: BucketLike,
  name: string,
  jpeg: Buffer
): Promise<string> {
  const path = `${STORAGE_PREFIX}/${name}.jpg`;
  const token = randomUUID();
  await bucket.file(path).save(jpeg, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

function buildCoverLayout(cover: CoverModel, format: InstagramFormat): Node {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const pad = 90;
  return el(
    'div',
    {
      width,
      height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: `${pad}px`,
      background: 'linear-gradient(160deg, #5c6b3f 0%, #1d1a1a 100%)',
      color: '#ffffff',
      fontFamily: 'Inter',
    },
    [
      el(
        'div',
        {
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: 0.85,
        },
        'thetribe.at'
      ),
      el('div', { flexDirection: 'column' }, [
        el(
          'div',
          { fontFamily: 'Cormorant Garamond', fontWeight: 700, fontSize: 124, lineHeight: 1.02 },
          cover.heading
        ),
        el('div', { fontSize: 64, fontWeight: 700, marginTop: 56 }, cover.bezirk),
        el('div', { fontSize: 52, fontWeight: 400, marginTop: 20, opacity: 0.95 }, cover.dateRange),
        cover.partLabel
          ? el(
              'div',
              { fontSize: 44, fontWeight: 400, marginTop: 14, opacity: 0.85 },
              cover.partLabel
            )
          : null,
      ]),
      el(
        'div',
        { fontSize: 40, fontWeight: 400, opacity: 0.9 },
        `${cover.eventCount} ${cover.eventCount === 1 ? 'Event' : 'Events'} - weiter wischen`
      ),
    ]
  );
}

/** Renders the cover slide of a weekly carousel as a JPEG buffer. */
export async function renderCoverImage(
  cover: CoverModel,
  format: InstagramFormat = 'carousel'
): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const svg = await satori(buildCoverLayout(cover, format) as never, {
    width,
    height,
    fonts: loadFonts(),
  });
  const overlay = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  return sharp({ create: { width, height, channels: 3, background: '#1d1a1a' } })
    .composite([{ input: overlay }])
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** Render + upload in one step; `name` should be deterministic, e.g. `feed_<eventId>`. */
export async function generateAndStoreEventImage(
  bucket: BucketLike,
  name: string,
  event: InstagramEventInput,
  format: InstagramFormat,
  options: RenderOptions = {}
): Promise<string> {
  const jpeg = await renderEventImage(event, format, options);
  return uploadInstagramImage(bucket, name, jpeg);
}
