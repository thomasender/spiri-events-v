/**
 * Pure logic for "an already published Instagram feed post is outdated because
 * its event was edited" (Trello 6af4ca87). Instagram does not let us edit a
 * published caption through the API, so the post is only marked: the team gets
 * the new text in the review tab and pastes it by hand ("Erledigt" clears the
 * mark, callable markInstagramPostUpdated). When the date, time or place changes
 * or the event is cancelled, the account also comments under the post (best
 * effort, once per state).
 *
 * All I/O is injected through PostUpdateDeps so tests/lib/instagramPostUpdate.spec.ts
 * drives every branch without Firebase. Trigger wrapper: ../instagramPostUpdate.ts.
 */

import { resolveRegionId } from '../regions';
import {
  CAPTION_MAX_LENGTH,
  buildCaption,
  eventPageUrl,
  formatEventDate,
  formatEventTime,
  formatLocation,
  type InstagramEventInput,
} from './instagramContent';
import { graphPost, resolveTagHandles, sanitizeError } from './instagramPublish';

/** Event fields that flow into the caption (buildCaption), plus the tagged handles. */
export const CAPTION_FIELDS = [
  'title',
  'description',
  'date',
  'endDate',
  'time',
  'endTime',
  'recurrence',
  'recurrenceEndDate',
  'customDates',
  'customTimes',
  'exceptionDates',
  'cancelled',
  'cancelledDates',
  'place',
  'city',
  'bezirk',
  'isOnline',
  'category',
  'contribution',
  'fee',
  'feeMax',
  'priceCurrency',
  'feeNote',
  'firstSessionFree',
  'regionId',
  'instagramHandleOverride',
  'instagramExtraHandles',
] as const;

const DATE_FIELDS = [
  'date',
  'endDate',
  'recurrence',
  'recurrenceEndDate',
  'customDates',
  'exceptionDates',
] as const;
const TIME_FIELDS = ['time', 'endTime', 'customTimes'] as const;
const PLACE_FIELDS = ['place', 'city', 'isOnline'] as const;

type EventData = Record<string, unknown> | null | undefined;

/** Missing, null, '' and [] all mean "not set"; objects compare by value. */
function normalize(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value) && value.length === 0) return '';
  if (typeof value === 'object') return JSON.stringify(sortKeys(value));
  return JSON.stringify(value);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

function changed(before: EventData, after: EventData, fields: readonly string[]): string[] {
  return fields.filter((f) => normalize(before?.[f]) !== normalize(after?.[f]));
}

/**
 * Caption-relevant fields that differ. Compares the fields, not the finished
 * caption: buildCaption of a series depends on "now" (next date), so two
 * captions of the same event can differ without any edit.
 */
export function captionFieldsChanged(before: EventData, after: EventData): string[] {
  return changed(before, after, CAPTION_FIELDS);
}

/** The caption-relevant fields of an event, as stored as baseline on the post doc. */
export function pickCaptionFields(event: EventData): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of CAPTION_FIELDS) {
    const value = event?.[field];
    if (value !== undefined) picked[field] = value;
  }
  return picked;
}

export interface CommentWorthyChange {
  /** The whole event was newly called off. */
  cancelled: boolean;
  /** A called-off event takes place again. */
  reinstated: boolean;
  /** Newly called-off single dates (YYYY-MM-DD), sorted. */
  cancelledDates: string[];
  date: boolean;
  time: boolean;
  place: boolean;
}

function isoDates(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
}

/**
 * What followers should hear about: date, time, place, a cancellation (whole
 * event or single dates). Null for anything else (title, description, price ...).
 */
export function commentWorthyChange(
  before: EventData,
  after: EventData
): CommentWorthyChange | null {
  const wasCancelled = before?.cancelled === true;
  const isCancelled = after?.cancelled === true;
  const previous = new Set(isoDates(before?.cancelledDates));
  const change: CommentWorthyChange = {
    cancelled: isCancelled && !wasCancelled,
    reinstated: wasCancelled && !isCancelled,
    // Dates called off while the whole event is off need no extra word.
    cancelledDates: isCancelled
      ? []
      : Array.from(new Set(isoDates(after?.cancelledDates)))
          .filter((d) => !previous.has(d))
          .sort(),
    date: changed(before, after, DATE_FIELDS).length > 0,
    time: changed(before, after, TIME_FIELDS).length > 0,
    place: changed(before, after, PLACE_FIELDS).length > 0,
  };
  const any =
    change.cancelled ||
    change.reinstated ||
    change.cancelledDates.length > 0 ||
    change.date ||
    change.time ||
    change.place;
  return any ? change : null;
}

/** Identity of the comment-worthy state of an event: one comment per state, never two. */
export function updateCommentKey(event: EventData): string {
  return [...DATE_FIELDS, ...TIME_FIELDS, ...PLACE_FIELDS, 'cancelled', 'cancelledDates']
    .map((f) => normalize(event?.[f]))
    .join('|');
}

const SERIES_RECURRENCES = ['weekly', 'biweekly', 'monthly', 'monthlyWeekday', 'custom'];

function isRecurring(event: EventData): boolean {
  return SERIES_RECURRENCES.includes(event?.recurrence as string);
}

/**
 * German comment for the followers, e.g. "Update: Neuer Termin: Sa, 17. Okt ·
 * 18:00 Uhr". Null when the change is not comment-worthy.
 */
export function buildUpdateComment(
  change: CommentWorthyChange | null,
  after: EventData
): string | null {
  if (!change) return null;
  const event = (after ?? {}) as InstagramEventInput;
  const link = `Alle Details: ${eventPageUrl(event.slug, event.regionId)}`;
  if (change.cancelled) {
    return `Update: Dieses Event ist leider abgesagt.\n\n${link}`;
  }
  const lines: string[] = [];
  if (change.reinstated) lines.push('Das Event findet doch statt.');
  if (change.date) {
    const when = [
      formatEventDate(event.date, event.endDate),
      formatEventTime(event.time, event.endTime),
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      isRecurring(after) || !when ? 'Die Termine haben sich geändert.' : `Neuer Termin: ${when}`
    );
  } else if (change.time) {
    const time = formatEventTime(event.time, event.endTime);
    lines.push(
      time && !isRecurring(after) ? `Neue Uhrzeit: ${time}` : 'Die Uhrzeit hat sich geändert.'
    );
  }
  if (change.place) {
    const location = formatLocation(event);
    lines.push(location ? `Neuer Ort: ${location}` : 'Der Ort hat sich geändert.');
  }
  if (change.cancelledDates.length > 0) {
    const days = change.cancelledDates.map((d) => formatEventDate(d)).filter(Boolean);
    lines.push(
      days.length === 1
        ? `Der Termin am ${days[0]} fällt leider aus.`
        : `Die Termine am ${days.join(', ')} fallen leider aus.`
    );
  }
  if (lines.length === 0) return null;
  return `Update: ${lines.join('\n')}\n\n${link}`;
}

/** buildCaption for the manual edit; a called-off event starts with a clear note. */
export function buildSuggestedCaption(event: EventData, handles: string[], now: Date): string {
  const caption = buildCaption((event ?? {}) as InstagramEventInput, handles, now);
  return event?.cancelled === true
    ? `❌ ABGESAGT\n\n${caption}`.slice(0, CAPTION_MAX_LENGTH)
    : caption;
}

/** The fields of instagram_posts/feed_{id} this flow reads. */
export interface FeedPostState {
  status?: unknown;
  igMediaId?: unknown;
  regionId?: unknown;
  outdated?: unknown;
  /** Caption fields as they were before the first unhandled change. */
  captionBaseline?: unknown;
  lastUpdateCommentKey?: unknown;
}

export interface PostUpdateDeps {
  getPost(postId: string): Promise<FeedPostState | null>;
  /** Merge patch on the post doc (null clears captionBaseline / outdatedFields). */
  updatePost(postId: string, patch: Record<string, unknown>): Promise<void>;
  /**
   * Atomically stores `key` as lastUpdateCommentKey. Resolves false when it is
   * already stored (comment written before, or a parallel run claimed it).
   */
  claimCommentKey(postId: string, key: string): Promise<boolean>;
  /** app_settings/instagram.enabled === true */
  isEnabled(): Promise<boolean>;
  /** Account of the region (same rules as posting); null = no usable account. */
  resolveCredentials(regionId: string): Promise<{ accessToken: string; userId: string } | null>;
  getTagHandles?(event: InstagramEventInput): Promise<string[]>;
  fetch: typeof fetch;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export type PostUpdateOutcome =
  | 'ignored'
  | 'no-post'
  | 'baseline'
  | 'unchanged'
  | 'cleared'
  | 'outdated'
  | 'commented'
  | 'comment-skipped'
  | 'comment-failed';

function statusOf(data: EventData): string | null {
  return typeof data?.status === 'string' ? data.status : null;
}

function baselineOf(post: FeedPostState): Record<string, unknown> | null {
  const b = post.captionBaseline;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

/**
 * One event update. Approved -> approved compares the two versions; an edit
 * while the event is not approved (e.g. back in review) is only compared once
 * it is approved again, against the state before it left "approved".
 */
export async function handleEventUpdate(
  deps: PostUpdateDeps,
  eventId: string,
  before: EventData,
  after: EventData
): Promise<PostUpdateOutcome> {
  const log = deps.log ?? (() => undefined);
  const wasApproved = statusOf(before) === 'approved';
  const isApproved = statusOf(after) === 'approved';
  if (!wasApproved && !isApproved) return 'ignored';
  // The common case (favourite counter, chat flags ...) costs no read.
  if (wasApproved && isApproved && captionFieldsChanged(before, after).length === 0) {
    return 'ignored';
  }

  const postId = `feed_${eventId}`;
  const post = await deps.getPost(postId);
  if (!post || post.status !== 'published') return 'no-post';
  const baseline = baselineOf(post);

  // Leaving "approved": remember what the post was based on, decide later.
  if (!isApproved) {
    if (baseline) return 'ignored';
    await deps.updatePost(postId, { captionBaseline: pickCaptionFields(before) });
    return 'baseline';
  }

  const reference = baseline ?? pickCaptionFields(before);
  const fields = captionFieldsChanged(reference, after);
  const regionId =
    typeof post.regionId === 'string' && post.regionId ? post.regionId : resolveRegionId(after);

  if (fields.length === 0) {
    // Edited back to what the post shows: nothing to do any more.
    if (baseline || post.outdated === true) {
      await deps.updatePost(postId, {
        outdated: false,
        outdatedFields: null,
        captionBaseline: null,
      });
      return 'cleared';
    }
    return 'unchanged';
  }

  const handles = await resolveTagHandles(deps, after, (err) =>
    log('Tag handle lookup failed; caption without tag', { eventId, error: String(err) })
  );
  const now = (deps.now ?? (() => new Date()))();
  await deps.updatePost(postId, {
    outdated: true,
    outdatedFields: fields,
    regionId,
    eventTitle: typeof after?.title === 'string' ? after.title : '',
    suggestedCaption: buildSuggestedCaption(after, handles, now),
    captionBaseline: reference,
    outdatedAt: now,
  });

  // B: a comment for followers, only for date, time, place or a cancellation.
  // Back from review the comparison is against the state before review.
  const comment = buildUpdateComment(
    commentWorthyChange(wasApproved ? before : reference, after),
    after
  );
  if (!comment) return 'outdated';
  const mediaId = typeof post.igMediaId === 'string' ? post.igMediaId : '';
  if (!mediaId) return 'outdated';
  if (!(await deps.isEnabled())) {
    log('Instagram disabled; no update comment', { eventId });
    return 'comment-skipped';
  }
  const credentials = await deps.resolveCredentials(regionId);
  if (!credentials) {
    log('No usable Instagram account; no update comment', { eventId, regionId });
    return 'comment-skipped';
  }
  if (!(await deps.claimCommentKey(postId, updateCommentKey(after)))) {
    log('Update comment for this state already written', { eventId });
    return 'comment-skipped';
  }
  try {
    await graphPost(
      { fetch: deps.fetch, ...credentials },
      `${mediaId}/comments`,
      { message: comment },
      'update comment'
    );
    return 'commented';
  } catch (err) {
    // Best effort: the outdated mark is set, the key stays claimed so a retry
    // never comments twice.
    log('Update comment failed', {
      eventId,
      error: sanitizeError(err, [credentials.accessToken]),
    });
    return 'comment-failed';
  }
}

/** Who may clear the mark: Super-Admins, and moderators of the post's region. */
export function canResolveOutdatedPost(
  role: { kind: 'superAdmin' } | { kind: 'regionModerator'; regionIds: string[] } | null,
  postRegionId: unknown
): boolean {
  if (!role) return false;
  if (role.kind === 'superAdmin') return true;
  return typeof postRegionId === 'string' && role.regionIds.includes(postRegionId);
}
