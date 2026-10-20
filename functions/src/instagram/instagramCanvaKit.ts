/**
 * Canva kit: renders every Instagram template once with example text and once
 * as text-free layers (gradient, logo, pill, coloured bars), so the templates
 * can be rebuilt by hand in Canva. Not used by the posting code; driven by
 * scripts/instagram-canva-kit.mjs.
 */

import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import satori from 'satori';
import {
  buildCoverLayout,
  buildFeedLayout,
  buildLayout,
  buildStoryListLayout,
  coverBackgroundSvg,
  loadFonts,
  STORY_IMAGE_SIZE,
  type Node,
} from './instagramImage';
import { FORMAT_DIMENSIONS, type EventImageModel, type InstagramFormat } from './instagramContent';
import type { StoryModel } from './instagramStory';

export interface KitTemplate {
  id: string;
  title: string;
  format: InstagramFormat;
  /** Photo behind the layout (feed, carousel slide); null = the layout paints its own background. */
  photoBehind: boolean;
  /** Photo inside the layout (single-event story). */
  photoInside: { left: number; top: number; width: number; height: number } | null;
  build: (photoDataUri: string | null) => Node;
  /** Opaque background for layouts that paint their own (cover, stories). */
  background: { width: number; height: number } | null;
  backgroundSvg?: Buffer;
  backgroundColor?: string;
}

const SAMPLE_EVENT: EventImageModel = {
  title: 'Yoga am Morgen im Park',
  dateLabel: 'Sa, 17. Okt 2026',
  timeLabel: '09:00 - 10:30 Uhr',
  location: 'Dornbirn',
  category: 'Yoga',
  color: '#c48e6a',
  imageUrl: null,
  organizerName: 'Maria Muster',
};

const SAMPLE_COVER = {
  heading: 'Events der Woche',
  bezirk: 'in Feldkirch',
  dateRange: '19. - 25. Okt 2026',
  partLabel: 'Teil 1 von 2',
  eventCount: 7,
};

const SAMPLE_ITEMS = [
  {
    time: '09:00',
    title: 'Yoga am Morgen',
    location: 'Feldkirch',
    color: '#c48e6a',
    organizer: 'Maria Muster',
  },
  {
    time: '18:30',
    title: 'Breathwork Abend',
    location: 'Rankweil',
    color: '#bf5b4e',
    organizer: '',
  },
  {
    time: '20:00',
    title: 'Klangreise mit Gongs',
    location: 'Götzis',
    color: '#6b568b',
    organizer: '',
  },
];

const SAMPLE_STORY_LIST: StoryModel = {
  heading: 'Heute',
  bezirk: 'in Feldkirch',
  dateLabel: 'Sa, 17. Okt',
  partLabel: '',
  items: SAMPLE_ITEMS,
  image: null,
};

const SAMPLE_STORY_EVENT: StoryModel = {
  ...SAMPLE_STORY_LIST,
  items: [SAMPLE_ITEMS[0]],
  image: { url: 'sample', focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 } as never,
};

export const KIT_TEMPLATES: KitTemplate[] = [
  {
    id: '1-beitrag',
    title: 'Beitrag (Feed)',
    format: 'feed',
    photoBehind: true,
    photoInside: null,
    build: () => buildFeedLayout(SAMPLE_EVENT, true),
    background: null,
  },
  {
    id: '2-carousel-event',
    title: 'Carousel: Event-Folie',
    format: 'carousel',
    photoBehind: true,
    photoInside: null,
    build: () => buildLayout(SAMPLE_EVENT, 'carousel', true),
    background: null,
  },
  {
    id: '3-carousel-titelfolie',
    title: 'Carousel: Titelfolie',
    format: 'carousel',
    photoBehind: false,
    photoInside: null,
    build: () => buildCoverLayout(SAMPLE_COVER, 'carousel'),
    background: FORMAT_DIMENSIONS.carousel,
    backgroundSvg: coverBackgroundSvg(
      FORMAT_DIMENSIONS.carousel.width,
      FORMAT_DIMENSIONS.carousel.height
    ),
  },
  {
    id: '4-story-uebersicht',
    title: 'Story: Tagesübersicht',
    format: 'story',
    photoBehind: false,
    photoInside: null,
    build: () => buildStoryListLayout(SAMPLE_STORY_LIST, null),
    background: FORMAT_DIMENSIONS.story,
    backgroundColor: '#f4f2f0',
  },
  {
    id: '5-story-einzelevent',
    title: 'Story: einzelnes Event mit Foto',
    format: 'story',
    photoBehind: false,
    photoInside: { left: 90, top: 0, ...STORY_IMAGE_SIZE },
    build: (photo) => buildStoryListLayout(SAMPLE_STORY_EVENT, photo),
    background: FORMAT_DIMENSIONS.story,
    backgroundColor: '#f4f2f0',
  },
];

/** Copy of the tree with all text made invisible; layout, pills, bars and images stay. */
export function hideText(node: Node | string | null): Node | string | null {
  if (node === null || typeof node === 'string') return node;
  const { children, style, ...rest } = node.props;
  const kids = Array.isArray(children) ? children.map((c) => hideText(c as Node)) : children;
  const hasText =
    typeof kids === 'string' || (Array.isArray(kids) && kids.some((k) => typeof k === 'string'));
  return {
    type: node.type,
    props: {
      ...rest,
      style: hasText ? { ...style, color: 'rgba(0,0,0,0)' } : style,
      children: typeof kids === 'string' ? kids : (kids as unknown),
    },
  } as Node;
}

async function overlayPng(layout: Node, format: InstagramFormat): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const svg = await satori(layout as never, { width, height, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

export interface KitOutput {
  /** Finished example with sample text and the sample photo. */
  example: Buffer;
  /** Same without any text. Transparent PNG when a photo goes behind, opaque otherwise. */
  layers: Buffer;
}

/** Photo is a JPEG/PNG buffer used as the sample picture. */
export async function renderKitTemplate(t: KitTemplate, photo: Buffer): Promise<KitOutput> {
  const { width, height } = FORMAT_DIMENSIONS[t.format];
  const slot = t.photoInside;
  const insidePhoto = slot
    ? await sharp(photo).resize(slot.width, slot.height, { fit: 'cover' }).jpeg().toBuffer()
    : null;
  const dataUri = insidePhoto ? `data:image/jpeg;base64,${insidePhoto.toString('base64')}` : null;

  const withText = await overlayPng(t.build(dataUri), t.format);
  const withoutText = await overlayPng(hideText(t.build(dataUri)) as Node, t.format);

  const base = async () => {
    if (t.photoBehind) {
      return sharp(photo).resize(width, height, { fit: 'cover', position: 'attention' }).toBuffer();
    }
    if (t.backgroundSvg) return sharp(t.backgroundSvg).png().toBuffer();
    return sharp({
      create: { width, height, channels: 3, background: t.backgroundColor ?? '#f4f2f0' },
    })
      .png()
      .toBuffer();
  };

  const example = await sharp(await base())
    .composite([{ input: withText }])
    .jpeg({ quality: 92 })
    .toBuffer();

  let layers: Buffer;
  if (t.photoBehind) {
    layers = withoutText;
  } else {
    // The sample photo of the single-event story is a placeholder, not part of the design.
    const noPhoto = slot
      ? await overlayPng(hideText(t.build(blankPhoto(slot))) as Node, t.format)
      : withoutText;
    layers = await sharp(await base())
      .composite([{ input: noPhoto }])
      .png()
      .toBuffer();
  }
  return { example, layers };
}

function blankPhoto(slot: { width: number; height: number }): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${slot.width}" height="${slot.height}"><rect width="100%" height="100%" fill="#d9d4cf"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
