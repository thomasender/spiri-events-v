/**
 * Pure content preparation for the Instagram automation: formats, titles,
 * dates, captions and the per-category look. No I/O in here so the Vitest
 * specs in tests/lib/ can cover it without Firebase, sharp or satori.
 * The rendering itself lives in ./instagramImage.ts.
 */

export type InstagramFormat = 'feed' | 'story' | 'carousel';

export const FORMAT_DIMENSIONS: Record<InstagramFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 }, // 4:5
  story: { width: 1080, height: 1920 }, // 9:16
  carousel: { width: 1080, height: 1350 }, // 4:5
};

export const CAPTION_MAX_LENGTH = 2200;
export const TITLE_MAX_LENGTH = 70;
export const SITE_URL = 'https://www.thetribe.at';

// Mirrors CATEGORY_COLORS in src/utils/categoryColors.js. functions/ cannot
// import from src/, and the live `categories` registry (admin-editable) wins
// whenever the caller passes it in.
export const FALLBACK_CATEGORY_COLOR = '#605e5e';
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Yoga: '#c48e6a',
  Breathwork: '#bf5b4e',
  Meditation: '#5c6b3f',
  Tanz: '#8a6d2f',
  Singen: '#9a5f38',
  Soundhealing: '#6b568b',
  Sonstiges: '#605e5e',
};

// Mirrors CATEGORY_FALLBACKS in src/utils/eventFallbacks.js (the photo the
// website shows on an event detail page without an own image). functions/
// cannot import from src/; tests/lib/instagramFallbacks.spec.ts asserts both
// maps stay identical. The files are fetched from the public site.
export const SITE_ORIGIN = 'https://www.thetribe.at';
export const DEFAULT_EVENT_FALLBACK = '/hero.jpeg';
export const CATEGORY_FALLBACKS: Record<string, string> = {
  Yoga: '/event-fallbacks/yoga.jpg',
  Breathwork: '/event-fallbacks/breathwork.jpg',
  Meditation: '/event-fallbacks/meditation.jpg',
  Tanz: '/event-fallbacks/tanz.jpg',
  Singen: '/event-fallbacks/singen.jpg',
  Soundhealing: '/event-fallbacks/soundhealing.jpeg',
  Sonstiges: '/hero.jpeg',
};

/** Absolute URL of the category fallback photo (default for unknown/empty). */
export function getCategoryFallbackUrl(category: unknown): string {
  const path =
    typeof category === 'string' &&
    Object.prototype.hasOwnProperty.call(CATEGORY_FALLBACKS, category)
      ? CATEGORY_FALLBACKS[category]
      : DEFAULT_EVENT_FALLBACK;
  return `${SITE_ORIGIN}${path}`;
}

export interface InstagramEventInput {
  title?: unknown;
  date?: unknown;
  endDate?: unknown;
  time?: unknown;
  endTime?: unknown;
  place?: unknown;
  bezirk?: unknown;
  isOnline?: unknown;
  category?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  slug?: unknown;
  instagramConsent?: unknown;
  createdBy?: unknown;
}

/** Text of the first slide of a weekly carousel (already image-safe). */
export interface CoverModel {
  heading: string;
  bezirk: string;
  dateRange: string;
  /** "Teil 1 von 2"; empty for a single-part carousel. */
  partLabel: string;
  eventCount: number;
}

export interface EventImageModel {
  title: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  category: string;
  color: string;
  imageUrl: string | null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function truncateText(input: string, max: number, keepNewlines = false): string {
  const text = keepNewlines
    ? input
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim()
    : input.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Prefer a word boundary, but not if it would throw away most of the text.
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:!?-]+$/, '')}…`;
}

export function truncateTitle(title: unknown, max = TITLE_MAX_LENGTH): string {
  return truncateText(asString(title), max);
}

// The bundled image fonts (Inter, Cormorant Garamond Latin) have no emoji or
// symbol glyphs, which render as "NO GLYPH" boxes. Covers pictographs, flags,
// keycaps, skin tones, variation selectors, ZWJ and tag characters.
const IMAGE_UNSAFE_CHARS =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}\u200D\u20E3\uFE0E\uFE0F]|(?![\u00A0-\u00FF])\p{So}/gu;

/** Removes emoji/symbols the image fonts cannot draw and tidies whitespace. */
export function stripImageUnsafeChars(input: string): string {
  return input.replace(IMAGE_UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/** Used when a title consists of nothing but emoji, so the image is never blank. */
export const IMAGE_TITLE_FALLBACK = 'Event';

/** Minimal HTML -> plain text for the rich-text event description. */
export function stripHtml(html: unknown): string {
  return asString(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(date: Date): string {
  // Fixed UTC so the label never depends on the server's timezone.
  return date
    .toLocaleDateString('de-AT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    .replace(/\./g, '');
}

/** "Sa, 17 Okt" or, for multi-day events, "Sa, 17 Okt – So, 18 Okt". */
export function formatEventDate(date: unknown, endDate?: unknown): string {
  const start = parseIsoDate(asString(date));
  if (!start) return '';
  const end = parseIsoDate(asString(endDate));
  if (end && end.getTime() > start.getTime()) {
    return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  }
  return formatShortDate(start);
}

/** "18:00 Uhr" or "18:00 – 20:00 Uhr"; empty when no start time is set. */
export function formatEventTime(time: unknown, endTime?: unknown): string {
  const start = asString(time);
  if (!/^\d{1,2}:\d{2}$/.test(start)) return '';
  const end = asString(endTime);
  return /^\d{1,2}:\d{2}$/.test(end) ? `${start} – ${end} Uhr` : `${start} Uhr`;
}

function isOnlineEvent(value: unknown): boolean {
  return value === true || value === 'true';
}

export function formatLocation(event: InstagramEventInput): string {
  if (isOnlineEvent(event.isOnline)) return 'Online';
  const place = asString(event.place);
  const bezirk = asString(event.bezirk);
  if (place && bezirk && !place.includes(bezirk)) return `${place}, ${bezirk}`;
  return place || bezirk;
}

export function resolveCategoryColor(
  category: unknown,
  registry?: Record<string, string> | null
): string {
  const name = asString(category);
  if (!name) return FALLBACK_CATEGORY_COLOR;
  return registry?.[name] || DEFAULT_CATEGORY_COLORS[name] || FALLBACK_CATEGORY_COLOR;
}

export function eventPageUrl(slug: unknown): string {
  const clean = asString(slug);
  return clean ? `${SITE_URL}/event/${clean}` : SITE_URL;
}

export function buildEventImageModel(
  event: InstagramEventInput,
  registry?: Record<string, string> | null
): EventImageModel {
  const imageUrl = asString(event.imageUrl);
  return {
    title: truncateTitle(stripImageUnsafeChars(asString(event.title))) || IMAGE_TITLE_FALLBACK,
    dateLabel: formatEventDate(event.date, event.endDate),
    timeLabel: formatEventTime(event.time, event.endTime),
    location: stripImageUnsafeChars(formatLocation(event)),
    category: asString(event.category),
    color: resolveCategoryColor(event.category, registry),
    imageUrl: imageUrl || null,
  };
}

const UMLAUT_MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * "Yoga & Bewegung" -> "#yogabewegung", "Feldkirch-Süd" -> "#feldkirchsued".
 * Lowercase, umlauts transliterated, other diacritics stripped, everything but
 * a-z0-9 removed. Returns null when nothing is left.
 */
export function toHashtag(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const tag = text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT_MAP[c])
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  return tag ? `#${tag}` : null;
}

// Extra descriptive tags for the categories in src/utils/categoryColors.js.
// Kept deliberately small: the category itself is always tagged separately.
export const CATEGORY_EXTRA_HASHTAGS: Record<string, string[]> = {
  Yoga: ['#yoga', '#yogavorarlberg'],
  Breathwork: ['#atemarbeit'],
  Meditation: ['#meditation'],
  Tanz: ['#tanz', '#ecstaticdance'],
  Singen: ['#mantras', '#singen'],
  Soundhealing: ['#klangreise', '#klangschalen'],
  Coaching: ['#persoenlichkeitsentwicklung'],
  Körperarbeit: ['#koerperarbeit'],
  Ernährung: ['#gesundeernaehrung'],
  Therapie: ['#ganzheitlich'],
};

export const BASE_HASHTAGS = ['#vorarlberg', '#thetribe', '#bewusstsein', '#veranstaltung'];
export const MAX_HASHTAGS = 12;

/**
 * Hashtags for a feed post, most specific first: Bezirk (or #online), the
 * category, curated extras, then the fixed base set. De-duplicated
 * case-insensitively and capped at `max`.
 */
export function buildHashtags(event: InstagramEventInput, max = MAX_HASHTAGS): string[] {
  const bezirk = asString(event.bezirk);
  const online = isOnlineEvent(event.isOnline) || !bezirk || bezirk.toLowerCase() === 'online';
  const category = asString(event.category);
  const candidates = [
    online ? '#online' : toHashtag(bezirk),
    toHashtag(category),
    ...(CATEGORY_EXTRA_HASHTAGS[category] ?? []),
    ...BASE_HASHTAGS,
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of candidates) {
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= max) break;
  }
  return result;
}

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Turns whatever an organizer typed into their profile ("@name", "name",
 * "instagram.com/name/", "https://www.instagram.com/name?igsh=...") into a
 * mention like "@name". Returns null when no valid handle can be derived.
 */
export function normalizeInstagramHandle(input: unknown): string | null {
  let value = asString(input);
  if (!value) return null;
  const urlMatch = /^(?:https?:\/\/)?(?:[\w-]+\.)?instagram\.com\/([^/?#\s]+)/i.exec(value);
  if (urlMatch) value = urlMatch[1];
  else if (/[/\s]/.test(value)) return null;
  value = value.replace(/^@+/, '');
  return INSTAGRAM_HANDLE_PATTERN.test(value) ? `@${value}` : null;
}

/**
 * Feed caption: headline facts first, a short description, then the link and
 * hashtags. Always <= CAPTION_MAX_LENGTH (Instagram's hard limit); the
 * description is what gets shortened when the budget runs out.
 */
export function buildCaption(event: InstagramEventInput, organizerHandle?: string | null): string {
  const model = buildEventImageModel(event);
  // The caption is rendered by Instagram, which supports emoji, so it uses the
  // raw title/location rather than the image-safe ones from the model.
  const title = truncateTitle(event.title);
  const location = formatLocation(event);
  const when = [model.dateLabel, model.timeLabel].filter(Boolean).join(' · ');
  const handle = normalizeInstagramHandle(organizerHandle);
  const header = [
    title,
    [when && `📅 ${when}`, location && `📍 ${location}`].filter(Boolean).join('\n'),
    handle ? `Mit ${handle}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const footer = [
    `Alle Infos und Anmeldung: ${eventPageUrl(event.slug)}`,
    buildHashtags(event).join(' '),
  ].join('\n\n');

  const description = stripHtml(event.description);
  // Two blank-line separators sit between header, description and footer.
  const budget = CAPTION_MAX_LENGTH - header.length - footer.length - 4;
  const body = description && budget > 20 ? truncateText(description, budget, true) : '';

  return [header, body, footer].filter(Boolean).join('\n\n').slice(0, CAPTION_MAX_LENGTH);
}
