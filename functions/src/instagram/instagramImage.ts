/**
 * Renders Instagram images for an event. Feed (4:5): the event image itself
 * (without an image the category fallback photo of the website) with a small
 * text layer: only the event title and the organizer's name (everything else
 * is in the caption). Story 9:16 and carousel slides 4:5: image or
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
  computeCropRect,
  getCategoryFallbackUrl,
  parseInstagramImageChoice,
  type InstagramImageChoice,
  type CoverModel,
  type EventImageModel,
  type InstagramEventInput,
  type InstagramFormat,
} from './instagramContent';
import type { StoryModel } from './instagramStory';

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
        format === 'carousel'
          ? el(
              'div',
              {
                marginTop: 40,
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              },
              [
                el(
                  'div',
                  { fontSize: 34, fontWeight: 700, opacity: 0.9, maxWidth: 640 },
                  model.organizerName ?? ''
                ),
                el(
                  'div',
                  { fontSize: 26, fontWeight: 400, letterSpacing: 1, opacity: 0.6 },
                  'www.thetribe.at'
                ),
              ]
            )
          : el(
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

/** Feed post: only title and organizer over a dark bottom gradient. */
function buildFeedLayout(model: EventImageModel, hasImage: boolean): Node {
  const { width, height } = FORMAT_DIMENSIONS.feed;
  const pad = 80;
  const titleSize = model.title.length > 45 ? 72 : model.title.length > 28 ? 84 : 96;
  return el(
    'div',
    {
      width,
      height,
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: `${pad}px`,
      // Top half stays untouched so the photo is fully visible.
      background: hasImage
        ? 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.80) 100%)'
        : `linear-gradient(160deg, ${model.color} 0%, #1d1a1a 100%)`,
      color: '#ffffff',
      fontFamily: 'Inter',
    },
    [
      el(
        'div',
        {
          fontFamily: 'Cormorant Garamond',
          fontWeight: 700,
          fontSize: titleSize,
          lineHeight: 1.05,
        },
        model.title
      ),
      model.organizerName
        ? el(
            'div',
            { marginTop: 28, fontSize: 40, fontWeight: 700, opacity: 0.9 },
            model.organizerName
          )
        : null,
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

/** The organizer's own crop (picked in the wizard), scaled to the target size. */
async function cropToChoice(
  source: Buffer,
  width: number,
  height: number,
  choice: InstagramImageChoice
): Promise<Buffer> {
  const { data, info } = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  const rect = computeCropRect(info.width, info.height, choice, width / height);
  return sharp(data)
    .extract(rect)
    .resize(width, height, { fit: 'fill' })
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
 * feed: the event image itself (fitted), else the category fallback photo,
 * else a plain category-coloured background, with only title and organizer
 * on top. carousel/story: same background choice, with the full text overlay.
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
  // The organizer's crop is 4:5, so it applies to feed and carousel, not story.
  const choice = format === 'story' ? null : parseInstagramImageChoice(event.instagramImage);

  const chosenImage = choice
    ? await tryRender(choice.url, fetchImage, (src) => cropToChoice(src, width, height, choice))
    : null;
  const ownImage =
    chosenImage ??
    (await tryRender(model.imageUrl, fetchImage, (src) =>
      isFeed ? fitEventImage(src, width, height) : coverImage(src, width, height)
    ));
  const background =
    ownImage ?? (await tryRender(fallbackUrl, fetchImage, (src) => coverImage(src, width, height)));

  const hasImage = background !== null;
  const layout = isFeed ? buildFeedLayout(model, hasImage) : buildLayout(model, format, hasImage);
  const svg = await satori(layout as never, {
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

const COVER_PAPER = '#f4f2f0';
const COVER_INK = '#161819';
const COVER_TERRACOTTA = '#c48e6a';

/** The website logo (terracotta circle over a thin arc) as the cover background. */
function coverBackgroundSvg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${COVER_PAPER}"/>` +
      `<circle cx="${width / 2}" cy="330" r="150" fill="${COVER_TERRACOTTA}"/>` +
      `<path d="M 70 360 A 470 300 0 0 0 ${width - 70} 360" fill="none" stroke="${COVER_INK}" stroke-width="5" stroke-linecap="round"/>` +
      `</svg>`
  );
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
      padding: `${pad}px`,
      color: COVER_INK,
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
      // Keeps the text block below the logo drawn by coverBackgroundSvg().
      el('div', { height: 530 }),
      el('div', { flexDirection: 'column' }, [
        el(
          'div',
          { fontFamily: 'Cormorant Garamond', fontWeight: 700, fontSize: 112, lineHeight: 1.02 },
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
      el('div', { flexGrow: 1 }),
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
  return sharp(coverBackgroundSvg(width, height))
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

// Logo mark of the site (public/logo-mark.svg: sun above an arc), cropped to the
// mark itself so it can sit on any background. Same look as the carousel cover.
const LOGO_VIEWBOX = { x: 0, y: 30, width: 180, height: 120 };
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX.x} ${LOGO_VIEWBOX.y} ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}"><circle cx="90" cy="70" r="36" fill="#c48e6a"/><path d="M 2 74 A 88 72 0 0 0 178 74" fill="none" stroke="#161819" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`;

function logoNode(width: number): Node {
  const height = Math.round((width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width);
  return {
    type: 'img',
    props: { src: LOGO_DATA_URI, width, height, style: { display: 'flex' } },
  };
}

/** Story 9:16 with the day's events as a list; top/bottom stay clear of Instagram's UI. */
function buildStoryListLayout(story: StoryModel): Node {
  const { width, height } = FORMAT_DIMENSIONS.story;
  const pad = 90;
  const compact = story.items.length > 2;
  return el(
    'div',
    {
      width,
      height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: `250px ${pad}px 280px`,
      background: '#f4f2f0',
      color: '#1d1a1a',
      fontFamily: 'Inter',
    },
    [
      el('div', { flexDirection: 'column' }, [
        el('div', { alignSelf: 'center', marginBottom: compact ? 30 : 50 }, [
          logoNode(compact ? 420 : 600),
        ]),
        el(
          'div',
          { fontFamily: 'Cormorant Garamond', fontWeight: 700, fontSize: 150, lineHeight: 1 },
          story.heading
        ),
        el('div', { fontSize: 64, fontWeight: 700, marginTop: 18 }, story.bezirk),
        el(
          'div',
          { fontSize: 44, fontWeight: 400, marginTop: 12, opacity: 0.8 },
          [story.dateLabel, story.partLabel].filter(Boolean).join('  ·  ')
        ),
      ]),
      el(
        'div',
        { flexDirection: 'column' },
        story.items.map((item) =>
          el(
            'div',
            {
              alignItems: 'stretch',
              marginTop: compact ? 24 : 40,
              borderLeft: `10px solid ${item.color}`,
              paddingLeft: 28,
            },
            [
              el('div', { flexDirection: 'column' }, [
                el(
                  'div',
                  { fontSize: 34, fontWeight: 700, letterSpacing: 1, opacity: 0.7 },
                  [item.time && `${item.time} Uhr`, item.location].filter(Boolean).join('  ·  ')
                ),
                el(
                  'div',
                  {
                    fontFamily: 'Cormorant Garamond',
                    fontWeight: 700,
                    fontSize: compact ? 52 : 62,
                    lineHeight: 1.05,
                    marginTop: 4,
                  },
                  item.title
                ),
                item.organizer
                  ? el(
                      'div',
                      { fontSize: 34, fontWeight: 400, marginTop: 10, opacity: 0.7 },
                      `mit ${item.organizer}`
                    )
                  : null,
              ]),
            ]
          )
        )
      ),
      el(
        'div',
        {
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: 0.7,
        },
        'Mehr auf thetribe.at'
      ),
    ]
  );
}

/** Renders one "Heute in <Bezirk>" story as a JPEG buffer. */
export async function renderStoryImage(story: StoryModel): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS.story;
  const svg = await satori(buildStoryListLayout(story) as never, {
    width,
    height,
    fonts: loadFonts(),
  });
  const overlay = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  return sharp({ create: { width, height, channels: 3, background: '#f4f2f0' } })
    .composite([{ input: overlay }])
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
