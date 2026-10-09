/**
 * Pure logic for the weekly Instagram carousel: every Sunday one carousel per
 * Bezirk with the events of the coming week (Monday-Sunday, Europe/Vienna).
 * All I/O (Firestore, Storage, Mailgun, fetch, clock) is injected through
 * CarouselDeps so tests/lib/instagramCarousel.spec.ts can drive every branch
 * without Firebase or the real Instagram API. The Cloud Function wrapper is
 * ../instagramWeeklyCarousel.ts.
 */

import {
  BASE_HASHTAGS,
  CAPTION_MAX_LENGTH,
  buildCaptionFooter,
  formatEventDate,
  formatEventTime,
  stripImageUnsafeChars,
  toHashtag,
  truncateTitle,
  type CoverModel,
  type InstagramEventInput,
} from './instagramContent';
import {
  MAX_COLLABORATORS,
  bareUsername,
  createContainerWithInvite,
  graphGet,
  graphPost,
  idOf,
  sanitizeError,
  viennaToday,
  waitForContainer,
  type PostStatus,
} from './instagramPublish';

/** Bezirke that get a weekly carousel. "Grenznahe" and online events are excluded. */
export const CAROUSEL_BEZIRKE = ['Dornbirn', 'Feldkirch', 'Bregenz', 'Bludenz'] as const;
export type CarouselBezirk = (typeof CAROUSEL_BEZIRKE)[number];

/** Instagram allows 10 items per carousel: 1 cover + 9 events. */
export const MAX_EVENTS_PER_CAROUSEL = 9;

export interface CarouselEvent extends InstagramEventInput {
  id?: string;
  status?: unknown;
  /**
   * Added by the parallel consent ticket. Until that lands no event carries it,
   * so isCarouselEligible() excludes everything and nothing is posted.
   */
  instagramConsent?: unknown;
  /** 'none' | 'weekly' | 'biweekly' | 'monthly' | 'custom' (absent = none) */
  recurrence?: unknown;
  recurrenceEndDate?: unknown;
  customDates?: unknown;
  exceptionDates?: unknown;
}

export interface WeekWindow {
  /** Monday, YYYY-MM-DD */
  start: string;
  /** Sunday, YYYY-MM-DD */
  end: string;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday-Sunday week after the current Vienna calendar day. On a Sunday
 * that is the week starting tomorrow. Pure calendar arithmetic on date
 * strings (UTC), so DST changes and year ends cannot shift it.
 */
export function getNextWeekWindow(now: Date): WeekWindow {
  const today = parseIso(viennaToday(now));
  const dow = today.getUTCDay(); // 0 = Sunday
  const daysToMonday = (8 - dow) % 7 || 7;
  const monday = new Date(today.getTime() + daysToMonday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { start: toIso(monday), end: toIso(sunday) };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Whether an event may appear in the weekly carousel: approved, starts inside
 * the window, in one of the carousel Bezirke (so not online-only), and the
 * organiser explicitly consented. NOTE: `instagramConsent` is introduced by a
 * parallel ticket (consent checkbox); until that is merged no event has the
 * field and the carousel stays empty by design.
 */
export function isCarouselEligible(event: CarouselEvent, window: WeekWindow): boolean {
  if (event.status !== 'approved') return false;
  if (event.instagramConsent !== true) return false;
  const date = asString(event.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < window.start || date > window.end) return false;
  if (event.isOnline === true || event.isOnline === 'true') return false;
  return (CAROUSEL_BEZIRKE as readonly string[]).includes(asString(event.bezirk));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDaysIso(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * 86_400_000));
}

function addMonthIso(iso: string): string {
  const d = parseIso(iso);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return toIso(d);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Start dates of every occurrence of `event` inside the window (mirrors src/utils/eventOccurrences.js). */
function occurrenceDatesInWindow(event: CarouselEvent, window: WeekWindow): string[] {
  const date = asString(event.date);
  if (!ISO_DATE.test(date)) return [];
  const recurrence = asString(event.recurrence) || 'none';
  const exceptions = stringList(event.exceptionDates);

  let dates: string[];
  if (recurrence === 'custom') {
    dates = [date, ...stringList(event.customDates)];
  } else if (recurrence === 'weekly' || recurrence === 'biweekly' || recurrence === 'monthly') {
    // Same horizon as the site: the end date, else 3 months (1 year for monthly).
    const endDate = asString(event.recurrenceEndDate);
    const end = ISO_DATE.test(endDate)
      ? endDate
      : recurrence === 'monthly'
        ? addDaysIso(date, 365)
        : addDaysIso(date, 92);
    dates = [];
    for (
      let cur = date;
      cur <= end && cur <= window.end;
      cur =
        recurrence === 'monthly'
          ? addMonthIso(cur)
          : addDaysIso(cur, recurrence === 'weekly' ? 7 : 14)
    ) {
      dates.push(cur);
    }
  } else {
    dates = [date];
  }

  return [...new Set(dates)]
    .filter(
      (d) => ISO_DATE.test(d) && d >= window.start && d <= window.end && !exceptions.includes(d)
    )
    .sort();
}

/**
 * One entry per occurrence that starts inside the window. Recurring events
 * (weekly, biweekly, monthly, custom dates) carry their first date in `date`,
 * so the Firestore range query alone would miss every later occurrence.
 * A multi-day occurrence keeps its length (`endDate` is shifted along).
 */
export function expandOccurrencesInWindow(
  event: CarouselEvent,
  window: WeekWindow
): CarouselEvent[] {
  const baseDate = asString(event.date);
  const baseEnd = asString(event.endDate);
  const length =
    ISO_DATE.test(baseEnd) && ISO_DATE.test(baseDate)
      ? Math.round((parseIso(baseEnd).getTime() - parseIso(baseDate).getTime()) / 86_400_000)
      : 0;
  return occurrenceDatesInWindow(event, window).map((date) =>
    date === baseDate
      ? event
      : { ...event, date, ...(length > 0 ? { endDate: addDaysIso(date, length) } : {}) }
  );
}

function compareEvents(a: CarouselEvent, b: CarouselEvent): number {
  const ka = `${asString(a.date)} ${asString(a.time).padStart(5, '0')}`;
  const kb = `${asString(b.date)} ${asString(b.time).padStart(5, '0')}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export interface CarouselGroup {
  bezirk: CarouselBezirk;
  /** 1-based */
  part: number;
  parts: number;
  events: CarouselEvent[];
}

/** Eligible events grouped per Bezirk, sorted by date/time, chunked by 9. Empty Bezirke are skipped. */
export function groupCarousels(events: CarouselEvent[], window: WeekWindow): CarouselGroup[] {
  const groups: CarouselGroup[] = [];
  for (const bezirk of CAROUSEL_BEZIRKE) {
    const list = events
      .filter((e) => isCarouselEligible(e, window) && asString(e.bezirk) === bezirk)
      .sort(compareEvents);
    if (list.length === 0) continue;
    const parts = Math.ceil(list.length / MAX_EVENTS_PER_CAROUSEL);
    for (let i = 0; i < parts; i += 1) {
      groups.push({
        bezirk,
        part: i + 1,
        parts,
        events: list.slice(i * MAX_EVENTS_PER_CAROUSEL, (i + 1) * MAX_EVENTS_PER_CAROUSEL),
      });
    }
  }
  return groups;
}

const SHORT_MONTH = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** "12. – 18. Okt 2026", "28. Sep – 4. Okt 2026" or across years "28. Dez 2026 – 3. Jan 2027". */
export function formatWeekRange(window: WeekWindow): string {
  const s = parseIso(window.start);
  const e = parseIso(window.end);
  const sm = SHORT_MONTH[s.getUTCMonth()];
  const em = SHORT_MONTH[e.getUTCMonth()];
  if (s.getUTCFullYear() !== e.getUTCFullYear()) {
    return `${s.getUTCDate()}. ${sm} ${s.getUTCFullYear()} – ${e.getUTCDate()}. ${em} ${e.getUTCFullYear()}`;
  }
  const startPart = sm === em ? `${s.getUTCDate()}.` : `${s.getUTCDate()}. ${sm}`;
  return `${startPart} – ${e.getUTCDate()}. ${em} ${e.getUTCFullYear()}`;
}

export function buildCoverModel(group: CarouselGroup, window: WeekWindow): CoverModel {
  return {
    heading: 'Events nächste Woche',
    bezirk: stripImageUnsafeChars(`in ${group.bezirk}`),
    dateRange: formatWeekRange(window),
    partLabel: group.parts > 1 ? `Teil ${group.part} von ${group.parts}` : '',
    eventCount: group.events.length,
  };
}

const MORE_LINE = `…und mehr auf thetribe.at`;

const MAX_MENTION_LINE = 400;

/** "Mit @a @b", dropping trailing handles that would exceed the mention budget. */
export function buildMentionLine(handles: string[]): string {
  let line = 'Mit';
  let count = 0;
  for (const handle of handles) {
    const next = `${line} ${handle}`;
    if (next.length > MAX_MENTION_LINE) break;
    line = next;
    count += 1;
  }
  return count > 0 ? line : '';
}

/** Always <= CAPTION_MAX_LENGTH; the event list is shortened gracefully when needed. */
export function buildCarouselCaption(
  group: CarouselGroup,
  window: WeekWindow,
  handles: string[] = []
): string {
  const part = group.parts > 1 ? ` (Teil ${group.part} von ${group.parts})` : '';
  const heading = `Events nächste Woche in ${group.bezirk}${part}\n${formatWeekRange(window)}`;
  const hashtags = [
    ...new Set([toHashtag(group.bezirk), ...BASE_HASHTAGS, '#events'].filter(Boolean)),
  ].join(' ');
  const footer = buildCaptionFooter(hashtags);

  const lines = group.events.map((event) => {
    const when = [
      formatEventDate(event.date, event.endDate),
      formatEventTime(event.time, event.endTime),
    ]
      .filter(Boolean)
      .join(' · ');
    const place = asString(event.place);
    const title = truncateTitle(event.title, 60) || 'Event';
    return `• ${when ? `${when} – ` : ''}${title}${place ? ` (${place})` : ''}`;
  });

  const mentions = buildMentionLine(handles);
  const fixed = (list: string[]) =>
    [heading, list.join('\n'), mentions, footer].filter(Boolean).join('\n\n');
  if (fixed(lines).length <= CAPTION_MAX_LENGTH) return fixed(lines);

  const kept: string[] = [];
  for (const line of lines) {
    if (fixed([...kept, line, MORE_LINE]).length > CAPTION_MAX_LENGTH) break;
    kept.push(line);
  }
  return fixed([...kept, MORE_LINE]).slice(0, CAPTION_MAX_LENGTH);
}

export type CarouselPostId = string;

export interface CarouselPostRecord {
  type: 'carousel';
  bezirk: string;
  weekStart: string;
  part: number;
  eventIds: string[];
  status: PostStatus;
  attempts: number;
  igMediaId: string | null;
  permalink: string | null;
  error: string | null;
  collaboratorInvited: boolean;
  inviteFallbackReason: string | null;
}

export interface CarouselDeps {
  fetch: typeof fetch;
  accessToken: string;
  userId: string;
  /** app_settings/instagram.enabled === true */
  isEnabled(): Promise<boolean>;
  /**
   * Events that may occur in [start, end], including recurring series whose first
   * date lies before the window. Occurrences are expanded and eligibility is
   * checked by the logic.
   */
  listEvents(window: WeekWindow): Promise<CarouselEvent[]>;
  /** Firestore create(): resolves false when the doc already exists. */
  createPost(id: string, record: CarouselPostRecord): Promise<boolean>;
  updatePost(id: string, patch: Partial<CarouselPostRecord>): Promise<void>;
  /** Instagram mention ("@name") of the event's organizer, or null. Optional: no collab without it. */
  getOrganizerHandle?(event: CarouselEvent): Promise<string | null>;
  generateCoverImage(name: string, cover: CoverModel): Promise<string>;
  generateEventImage(name: string, event: CarouselEvent): Promise<string>;
  notifyAdmins(subject: string, text: string): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export interface CarouselResult {
  id: string;
  outcome: 'published' | 'failed' | 'duplicate';
}

export type CarouselRunOutcome =
  { status: 'disabled' } | { status: 'done'; window: WeekWindow; results: CarouselResult[] };

function bezirkSlug(bezirk: string): string {
  return bezirk.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function carouselPostId(bezirk: string, weekStart: string, part: number): CarouselPostId {
  return `carousel_${bezirkSlug(bezirk)}_${weekStart}${part > 1 ? `_p${part}` : ''}`;
}

async function publishCarousel(
  deps: CarouselDeps,
  group: CarouselGroup,
  window: WeekWindow,
  postId: string
): Promise<string | null> {
  const log = deps.log ?? (() => undefined);
  const imageBase = `carousel_${bezirkSlug(group.bezirk)}_${window.start}${
    group.part > 1 ? `_p${group.part}` : ''
  }`;

  const imageUrls: string[] = [
    await deps.generateCoverImage(`${imageBase}_0`, buildCoverModel(group, window)),
  ];
  for (let i = 0; i < group.events.length; i += 1) {
    imageUrls.push(await deps.generateEventImage(`${imageBase}_${i + 1}`, group.events[i]));
  }

  // Distinct organizer handles in event order (events are consented already).
  const handles: string[] = [];
  if (deps.getOrganizerHandle) {
    for (const event of group.events) {
      try {
        const handle = await deps.getOrganizerHandle(event);
        if (handle && !handles.some((h) => h.toLowerCase() === handle.toLowerCase())) {
          handles.push(handle);
        }
      } catch (err) {
        log('Organizer handle lookup failed; skipping mention', {
          postId,
          error: sanitizeError(err, [deps.accessToken]),
        });
      }
    }
  }
  const collaborators = handles.slice(0, MAX_COLLABORATORS).map(bareUsername);

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const child = await graphPost(
      deps,
      `${deps.userId}/media`,
      { image_url: imageUrl, is_carousel_item: 'true' },
      'carousel item creation'
    );
    childIds.push(idOf(child, 'carousel item creation'));
  }
  for (const childId of childIds) await waitForContainer(deps, childId);

  // user_tags are rejected on a carousel parent, so only collaborators go along.
  const created = await createContainerWithInvite(
    deps,
    `${deps.userId}/media`,
    {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: buildCarouselCaption(group, window, handles),
    },
    collaborators.length > 0 ? { collaborators: JSON.stringify(collaborators) } : null,
    'carousel container creation',
    log
  );
  const parent = created.json;
  const parentId = idOf(parent, 'carousel container creation');
  await waitForContainer(deps, parentId);

  const published = await graphPost(
    deps,
    `${deps.userId}/media_publish`,
    { creation_id: parentId },
    'carousel publish'
  );
  const mediaId = idOf(published, 'carousel publish');
  // The post is live now; a missing permalink must not fail it.
  let permalink: string | null = null;
  try {
    const info = await graphGet(deps, mediaId, { fields: 'permalink' }, 'permalink lookup');
    permalink = typeof info.permalink === 'string' ? info.permalink : null;
  } catch (err) {
    log('Permalink lookup failed', { postId, error: sanitizeError(err, [deps.accessToken]) });
  }
  await deps.updatePost(postId, {
    status: 'published',
    igMediaId: mediaId,
    permalink,
    collaboratorInvited: created.invited,
    inviteFallbackReason: created.fallbackReason,
  });
  return mediaId;
}

export async function runWeeklyCarousels(deps: CarouselDeps): Promise<CarouselRunOutcome> {
  const log = deps.log ?? (() => undefined);
  if (!(await deps.isEnabled())) {
    log('Instagram posting disabled via app_settings/instagram; skipping weekly carousels');
    return { status: 'disabled' };
  }

  const window = getNextWeekWindow((deps.now ?? (() => new Date()))());
  const events = (await deps.listEvents(window)).flatMap((e) =>
    expandOccurrencesInWindow(e, window)
  );
  const groups = groupCarousels(events, window);
  const results: CarouselResult[] = [];

  for (const group of groups) {
    const postId = carouselPostId(group.bezirk, window.start, group.part);
    const created = await deps.createPost(postId, {
      type: 'carousel',
      bezirk: group.bezirk,
      weekStart: window.start,
      part: group.part,
      eventIds: group.events.map((e) => e.id ?? ''),
      status: 'publishing',
      attempts: 1,
      igMediaId: null,
      permalink: null,
      error: null,
      collaboratorInvited: false,
      inviteFallbackReason: null,
    });
    if (!created) {
      log('Carousel already exists; not posting again', { postId });
      results.push({ id: postId, outcome: 'duplicate' });
      continue;
    }

    try {
      await publishCarousel(deps, group, window, postId);
      results.push({ id: postId, outcome: 'published' });
    } catch (err) {
      const message = sanitizeError(err, [deps.accessToken]);
      results.push({ id: postId, outcome: 'failed' });
      try {
        await deps.updatePost(postId, { status: 'failed', error: message });
      } catch (updateErr) {
        log('Could not record carousel failure', {
          postId,
          error: sanitizeError(updateErr, [deps.accessToken]),
        });
      }
      try {
        await deps.notifyAdmins(
          `Instagram-Karussell fehlgeschlagen: ${group.bezirk} ${window.start}`,
          `Das wöchentliche Instagram-Karussell für ${group.bezirk} (Woche ab ${window.start}, Teil ${group.part} von ${group.parts}, ${postId}) konnte nicht veröffentlicht werden.\n\nFehler: ${message}\n\nEs wird nicht automatisch erneut versucht.`
        );
      } catch (mailErr) {
        log('Could not mail admins about carousel failure', {
          postId,
          error: sanitizeError(mailErr, [deps.accessToken]),
        });
      }
    }
  }
  return { status: 'done', window, results };
}
