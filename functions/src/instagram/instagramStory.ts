/**
 * Pure logic for the daily Instagram story: "Heute in <Bezirk>" with the
 * events that start today (Europe/Vienna). Same shape as the weekly carousel:
 * all I/O is injected through StoryDeps so tests/lib/instagramStory.spec.ts can
 * drive every branch without Firebase or the real Instagram API.
 *
 * The Graph API cannot add link/poll stickers to stories, so the story is one
 * 9:16 image per part with the times and titles baked in.
 */

import {
  formatEventDate,
  formatEventTime,
  resolveCategoryColor,
  resolveEventImageChoice,
  stripImageUnsafeChars,
  truncateText,
  truncateTitle,
  type InstagramEventInput,
  type InstagramImageChoice,
} from './instagramContent';
import {
  CAROUSEL_BEZIRKE,
  bezirkInPhrase,
  bezirkLabel,
  isCarouselEligible,
  type CarouselEvent,
  type CarouselBezirk,
} from './instagramCarousel';
import {
  graphGet,
  graphPost,
  idOf,
  sanitizeError,
  viennaToday,
  waitForContainer,
  type PostStatus,
} from './instagramPublish';

/** Events per story image; more events are spread over several stories. */
export const MAX_EVENTS_PER_STORY = 4;
/** Stories with more events than this skip the organizer line (no room). */
export const MAX_STORY_ITEMS_WITH_ORGANIZER = 2;
const STORY_TITLE_MAX = 44;
const STORY_LOCATION_MAX = 34;

export interface StoryItem {
  /** "18:00" or "" when the event has no start time */
  time: string;
  title: string;
  location: string;
  color: string;
  /** "@name" of the organizer, shown as text (stories cannot carry a clickable mention); '' when unknown. */
  organizer: string;
}

/** Everything the renderer needs for one story image (already image-safe). */
export interface StoryModel {
  heading: string;
  /** "in Feldkirch" */
  bezirk: string;
  /** "Sa, 17. Okt" */
  dateLabel: string;
  /** "Teil 1 von 2"; empty for a single story */
  partLabel: string;
  items: StoryItem[];
  /** The event's own picture and crop, only for a story about a single event. */
  image: InstagramImageChoice | null;
}

export interface StoryGroup {
  bezirk: CarouselBezirk;
  /** 1-based */
  part: number;
  parts: number;
  events: CarouselEvent[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compareEvents(a: CarouselEvent, b: CarouselEvent): number {
  const ka = asString(a.time).padStart(5, '0');
  const kb = asString(b.time).padStart(5, '0');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Eligible events of `day` for one Bezirk (consent, approved, not online),
 * sorted by start time and spread evenly over as many stories as needed.
 * Empty when nothing happens.
 */
export function groupStories(events: CarouselEvent[], day: string, bezirk: string): StoryGroup[] {
  if (!(CAROUSEL_BEZIRKE as readonly string[]).includes(bezirk)) return [];
  const list = events
    .filter((e) => isCarouselEligible(e, { start: day, end: day }) && asString(e.bezirk) === bezirk)
    .sort(compareEvents);
  if (list.length === 0) return [];
  const parts = Math.ceil(list.length / MAX_EVENTS_PER_STORY);
  const base = Math.floor(list.length / parts);
  const extra = list.length % parts;
  const groups: StoryGroup[] = [];
  let offset = 0;
  for (let i = 0; i < parts; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    groups.push({
      bezirk: bezirk as CarouselBezirk,
      part: i + 1,
      parts,
      events: list.slice(offset, offset + size),
    });
    offset += size;
  }
  return groups;
}

export function buildStoryItem(
  event: InstagramEventInput,
  registry?: Record<string, string> | null,
  handle?: string | null
): StoryItem {
  const start = formatEventTime(event.time).replace(' Uhr', '');
  return {
    time: start,
    title: truncateTitle(stripImageUnsafeChars(asString(event.title)), STORY_TITLE_MAX) || 'Event',
    location: truncateText(stripImageUnsafeChars(asString(event.place)), STORY_LOCATION_MAX),
    color: resolveCategoryColor(event.category, registry),
    organizer: handle ? stripImageUnsafeChars(handle) : '',
  };
}

export function buildStoryModel(
  group: StoryGroup,
  day: string,
  registry?: Record<string, string> | null,
  heading = 'Heute',
  handles: Array<string | null> = []
): StoryModel {
  return {
    heading,
    bezirk: stripImageUnsafeChars(bezirkInPhrase(group.bezirk)),
    dateLabel: formatEventDate(day),
    partLabel: group.parts > 1 ? `Teil ${group.part} von ${group.parts}` : '',
    image: group.events.length === 1 ? resolveEventImageChoice(group.events[0]) : null,
    // Only short stories have room for the organizer line.
    items: group.events.map((e, i) =>
      buildStoryItem(
        e,
        registry,
        group.events.length <= MAX_STORY_ITEMS_WITH_ORGANIZER ? handles[i] : null
      )
    ),
  };
}

export type StoryPostId = string;

export function storyPostId(bezirk: string, day: string, part: number): StoryPostId {
  return `story_${bezirk.toLowerCase().replace(/[^a-z0-9]/g, '')}_${day}${part > 1 ? `_p${part}` : ''}`;
}

export interface StoryPostRecord {
  type: 'story';
  /** 'overview' = "Heute in <Bezirk>" for the whole day, 'event' = one event shortly before it starts */
  kind: 'overview' | 'event';
  bezirk: string;
  /** Day the story is about (an event story posted the evening before is about tomorrow). */
  day: string;
  /** Vienna day the story was posted; drives the daily cap. */
  postedDay: string;
  part: number;
  eventIds: string[];
  status: PostStatus;
  attempts: number;
  igMediaId: string | null;
  permalink: string | null;
  error: string | null;
}

export interface StoryDeps {
  fetch: typeof fetch;
  accessToken: string;
  userId: string;
  /** app_settings/instagram.enabled === true */
  isEnabled(): Promise<boolean>;
  /** Events whose date lies in [start, end]; eligibility is checked by the logic. */
  listEvents(window: { start: string; end: string }): Promise<CarouselEvent[]>;
  /** Firestore create(): resolves false when the doc already exists. */
  createPost(id: string, record: StoryPostRecord): Promise<boolean>;
  updatePost(id: string, patch: Partial<StoryPostRecord>): Promise<void>;
  /** Number of story posts (any status) already created for this Vienna day; for the daily cap. */
  countStoriesPostedOn?(postedDay: string): Promise<number>;
  /** Instagram mention ("@name") of the event's organizer, or null. Optional: no tags without it. */
  getOrganizerHandle?(event: CarouselEvent): Promise<string | null>;
  /** Renders the story image, stores it and returns its public URL. */
  generateStoryImage(name: string, model: StoryModel): Promise<string>;
  notifyAdmins(subject: string, text: string): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export interface StoryResult {
  id: string;
  outcome: 'published' | 'failed' | 'duplicate';
}

export type StoryRunOutcome =
  { status: 'disabled' } | { status: 'done'; day: string; results: StoryResult[] };

/**
 * Container for a story image, then publish; returns the media id. Stories
 * cannot carry a clickable mention (Instagram accepts user_tags but never shows
 * them), so organizers are named as text in the image instead.
 */
export async function publishStoryImage(
  deps: Pick<StoryDeps, 'fetch' | 'accessToken' | 'userId' | 'now'>,
  imageUrl: string
): Promise<string> {
  const created = await graphPost(
    deps,
    `${deps.userId}/media`,
    { media_type: 'STORIES', image_url: imageUrl },
    'story container creation'
  );
  const containerId = idOf(created, 'story container creation');
  await waitForContainer(deps, containerId);
  const published = await graphPost(
    deps,
    `${deps.userId}/media_publish`,
    { creation_id: containerId },
    'story publish'
  );
  return idOf(published, 'story publish');
}

/** Organizer handle per event of the group (null when unknown or the lookup failed). */
async function lookupHandles(
  deps: StoryDeps,
  group: StoryGroup,
  postId: string
): Promise<Array<string | null>> {
  const log = deps.log ?? (() => undefined);
  const handles: Array<string | null> = [];
  for (const event of group.events) {
    let handle: string | null = null;
    if (deps.getOrganizerHandle) {
      try {
        handle = await deps.getOrganizerHandle(event);
      } catch (err) {
        log('Organizer handle lookup failed; skipping organizer', {
          postId,
          error: sanitizeError(err, [deps.accessToken]),
        });
      }
    }
    handles.push(handle);
  }
  return handles;
}

export interface PostGroupOptions {
  kind: StoryPostRecord['kind'];
  postedDay: string;
  /** "Heute", "Morgen", ... */
  heading?: string;
}

/**
 * Creates the instagram_posts record (the dedupe guard) and publishes one story
 * image for the group. Failures are recorded and mailed, never thrown, so one
 * broken story does not stop the others.
 */
export async function postStoryGroup(
  deps: StoryDeps,
  group: StoryGroup,
  day: string,
  postId: string,
  options: PostGroupOptions
): Promise<StoryResult> {
  const log = deps.log ?? (() => undefined);
  const created = await deps.createPost(postId, {
    type: 'story',
    kind: options.kind,
    bezirk: group.bezirk,
    day,
    postedDay: options.postedDay,
    part: group.part,
    eventIds: group.events.map((e) => e.id ?? ''),
    status: 'publishing',
    attempts: 1,
    igMediaId: null,
    permalink: null,
    error: null,
  });
  if (!created) {
    log('Story already exists; not posting again', { postId });
    return { id: postId, outcome: 'duplicate' };
  }

  try {
    const handles = await lookupHandles(deps, group, postId);
    const imageUrl = await deps.generateStoryImage(
      postId,
      buildStoryModel(group, day, null, options.heading, handles)
    );
    const mediaId = await publishStoryImage(deps, imageUrl);
    // The story is live now; a missing permalink must not fail it.
    let permalink: string | null = null;
    try {
      const info = await graphGet(deps, mediaId, { fields: 'permalink' }, 'permalink lookup');
      permalink = typeof info.permalink === 'string' ? info.permalink : null;
    } catch (err) {
      log('Permalink lookup failed', { postId, error: sanitizeError(err, [deps.accessToken]) });
    }
    await deps.updatePost(postId, { status: 'published', igMediaId: mediaId, permalink });
    return { id: postId, outcome: 'published' };
  } catch (err) {
    const message = sanitizeError(err, [deps.accessToken]);
    try {
      await deps.updatePost(postId, { status: 'failed', error: message });
    } catch (updateErr) {
      log('Could not record story failure', {
        postId,
        error: sanitizeError(updateErr, [deps.accessToken]),
      });
    }
    try {
      await deps.notifyAdmins(
        `Instagram-Story fehlgeschlagen: ${bezirkLabel(group.bezirk)} ${day}`,
        `Die Instagram-Story für ${bezirkLabel(group.bezirk)} (${day}, ${group.events.length} Event(s), ${postId}) konnte nicht veröffentlicht werden.\n\nFehler: ${message}\n\nEs wird nicht automatisch erneut versucht.`
      );
    } catch (mailErr) {
      log('Could not mail admins about story failure', {
        postId,
        error: sanitizeError(mailErr, [deps.accessToken]),
      });
    }
    return { id: postId, outcome: 'failed' };
  }
}

/** Overview stories for several Bezirke; a Bezirk needs at least `minEvents` events that day. */
export async function runDailyStories(
  deps: StoryDeps,
  bezirke: readonly string[],
  options: { minEvents?: number } = {}
): Promise<StoryRunOutcome> {
  const log = deps.log ?? (() => undefined);
  if (!(await deps.isEnabled())) {
    log('Instagram posting disabled via app_settings/instagram; skipping stories');
    return { status: 'disabled' };
  }

  const day = viennaToday((deps.now ?? (() => new Date()))());
  const events = await deps.listEvents({ start: day, end: day });
  const results: StoryResult[] = [];

  for (const bezirk of bezirke) {
    const groups = groupStories(events, day, bezirk);
    const total = groups.reduce((sum, g) => sum + g.events.length, 0);
    if (total < (options.minEvents ?? 1)) continue;
    for (const group of groups) {
      results.push(
        await postStoryGroup(deps, group, day, storyPostId(group.bezirk, day, group.part), {
          kind: 'overview',
          postedDay: day,
        })
      );
    }
  }
  return { status: 'done', day, results };
}

/**
 * Posts today's story/stories for one Bezirk. One post per Bezirk, day and
 * part (instagram_posts doc id), so a second run the same day posts nothing.
 */
export function runDailyStory(deps: StoryDeps, bezirk: string): Promise<StoryRunOutcome> {
  return runDailyStories(deps, [bezirk]);
}
