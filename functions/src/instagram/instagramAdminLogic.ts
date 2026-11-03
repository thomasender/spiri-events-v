/**
 * Pure logic behind the admin callables (retry / skip). I/O is injected so
 * tests/lib/instagramAdmin.spec.ts can cover it without Firebase.
 */
import type { PostRecord, PublishDeps, SkipReason, TriggerOutcome } from './instagramPublish';
import { describeInstagramError, publishApprovedEvent } from './instagramPublish';
import {
  groupCarousels,
  publishCarousel,
  weekWindowFrom,
  type CarouselDeps,
  type CarouselPostRecord,
} from './instagramCarousel';

export class AdminActionError extends Error {
  constructor(
    public readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition',
    message: string
  ) {
    super(message);
  }
}

/**
 * The admin list sends the record's eventId; carousel and story records have
 * none, so the list sends their own id ("carousel_bregenz_2026-11-02"), which
 * is never a Firestore event id (those have no underscore).
 */
export function isCarouselPostId(id: string): boolean {
  return id.startsWith('carousel_');
}

export function isStoryPostId(id: string): boolean {
  return id.startsWith('story_');
}

export function postIdFor(eventId: string): string {
  return isCarouselPostId(eventId) || isStoryPostId(eventId) ? eventId : `feed_${eventId}`;
}

/**
 * Before this was handled, skipping a carousel created a bogus feed record
 * "feed_carousel_..." that could never be posted. Removes it if present.
 */
async function removeStrayFeedRecord(
  deps: {
    getPostStatus(id: string): Promise<string | null>;
    deletePost?(id: string): Promise<void>;
  },
  postId: string
): Promise<void> {
  if (!deps.deletePost || postId.startsWith('feed_')) return;
  const strayId = `feed_${postId}`;
  if ((await deps.getPostStatus(strayId)) !== null) await deps.deletePost(strayId);
}

export function assertEventId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('/')) {
    throw new AdminActionError('invalid-argument', 'eventId is required.');
  }
  return value.trim();
}

export interface RetryDeps {
  publishDeps: PublishDeps;
  getPostStatus(postId: string): Promise<string | null>;
  deletePost(postId: string): Promise<void>;
  getEvent(eventId: string): Promise<Record<string, unknown> | null>;
}

export async function retryInstagramPost(
  deps: RetryDeps,
  eventId: string,
  options: { force?: boolean } = {}
): Promise<TriggerOutcome> {
  if (isStoryPostId(eventId)) {
    throw new AdminActionError('failed-precondition', 'Stories cannot be posted again.');
  }
  const postId = postIdFor(eventId);
  const status = await deps.getPostStatus(postId);
  // No record (automation was off at approval time), a failed one, or a
  // skipped one (e.g. skipped by an admin) may be posted now. Published and
  // in-flight posts must never be touched.
  if (status === 'published' || status === 'publishing') {
    throw new AdminActionError(
      'failed-precondition',
      'Only failed, skipped or not-yet-posted events can be retried.'
    );
  }
  const event = await deps.getEvent(eventId);
  if (!event) throw new AdminActionError('not-found', 'Event not found.');
  if (event.status !== 'approved') {
    throw new AdminActionError('failed-precondition', 'Event is not approved.');
  }
  // Deliberately no kill-switch check: an explicit admin click posts even when
  // automatic posting is off (the callable passes deps with isEnabled => true).
  if (status !== null) await deps.deletePost(postId);
  // Same flow as the approval trigger: past events end up as `skipped`, unless
  // the admin forces the post.
  return publishApprovedEvent(deps.publishDeps, eventId, null, event, {
    force: options.force === true,
  });
}

export interface CarouselRetryDeps extends CarouselDeps {
  getPostStatus(postId: string): Promise<string | null>;
  getPost(postId: string): Promise<Partial<CarouselPostRecord> | null>;
  deletePost(postId: string): Promise<void>;
}

/**
 * Posts one weekly carousel again ("Erneut versuchen" / "Trotzdem posten"):
 * rebuilds the Bezirk/part group of the record's week from the current events
 * and publishes it, ignoring the kill switch like every manual action. Events
 * of the week that already lie in the past stay in, the admin asked for it.
 */
export async function retryCarouselPost(
  deps: CarouselRetryDeps,
  postId: string
): Promise<TriggerOutcome> {
  const record = await deps.getPost(postId);
  if (!record) throw new AdminActionError('not-found', 'Carousel record not found.');
  if (record.status === 'published' || record.status === 'publishing') {
    throw new AdminActionError('failed-precondition', 'Carousel is published or in flight.');
  }
  const weekStart = typeof record.weekStart === 'string' ? record.weekStart : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || typeof record.bezirk !== 'string') {
    throw new AdminActionError('failed-precondition', 'Carousel record is incomplete.');
  }
  const part = typeof record.part === 'number' && record.part > 0 ? record.part : 1;
  const window = weekWindowFrom(weekStart);
  const group = groupCarousels(await deps.listEvents(window), window).find(
    (g) => g.bezirk === record.bezirk && g.part === part
  );
  if (!group) {
    throw new AdminActionError('failed-precondition', 'No events left for this carousel.');
  }
  await removeStrayFeedRecord(deps, postId);
  await deps.updatePost(postId, {
    status: 'publishing',
    attempts: (typeof record.attempts === 'number' ? record.attempts : 0) + 1,
    error: null,
    eventIds: group.events.map((e) => e.id ?? ''),
  });
  try {
    await publishCarousel(deps, group, window, postId);
    return 'published';
  } catch (err) {
    await deps.updatePost(postId, {
      status: 'failed',
      error: describeInstagramError(err, [deps.accessToken]),
    });
    return 'failed';
  }
}

export interface SkipDeps {
  getPostStatus(postId: string): Promise<string | null>;
  deletePost?(postId: string): Promise<void>;
  setSkipped(postId: string, skipReason: SkipReason): Promise<void>;
  createSkipped(postId: string, record: PostRecord): Promise<void>;
}

export interface ArchiveDeps {
  getPostStatus(postId: string): Promise<string | null>;
  deletePost?(postId: string): Promise<void>;
  setArchived(postId: string): Promise<void>;
}

/** Moves a skipped post into the archive: the admin decided it is never to be posted. */
export async function archiveInstagramPost(
  deps: ArchiveDeps,
  eventId: string
): Promise<'archived'> {
  const postId = postIdFor(eventId);
  await removeStrayFeedRecord(deps, postId);
  const status = await deps.getPostStatus(postId);
  if (status === 'archived') return 'archived';
  if (status !== 'skipped') {
    throw new AdminActionError('failed-precondition', 'Only skipped posts can be archived.');
  }
  await deps.setArchived(postId);
  return 'archived';
}

/** Marks a post skipped; creates the record when none exists so it stays blocked. */
export async function skipInstagramPost(deps: SkipDeps, eventId: string): Promise<'skipped'> {
  const postId = postIdFor(eventId);
  await removeStrayFeedRecord(deps, postId);
  const status = await deps.getPostStatus(postId);
  if (status === 'published') {
    throw new AdminActionError('failed-precondition', 'Post is already published.');
  }
  if (status === null && postId !== `feed_${eventId}`) {
    throw new AdminActionError('not-found', 'Post record not found.');
  }
  if (status === null) {
    await deps.createSkipped(postId, {
      type: 'feed',
      eventId,
      status: 'skipped',
      attempts: 0,
      igMediaId: null,
      permalink: null,
      error: null,
      collaboratorInvited: false,
      inviteFallbackReason: null,
      skipReason: 'admin',
    });
  } else {
    await deps.setSkipped(postId, 'admin');
  }
  return 'skipped';
}
