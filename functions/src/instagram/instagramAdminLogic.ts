/**
 * Pure logic behind the admin callables (retry / skip). I/O is injected so
 * tests/lib/instagramAdmin.spec.ts can cover it without Firebase.
 */
import type { PostRecord, PublishDeps, TriggerOutcome } from './instagramPublish';
import { publishApprovedEvent } from './instagramPublish';

export class AdminActionError extends Error {
  constructor(
    public readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition',
    message: string
  ) {
    super(message);
  }
}

export function postIdFor(eventId: string): string {
  return `feed_${eventId}`;
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
  eventId: string
): Promise<TriggerOutcome> {
  const postId = postIdFor(eventId);
  const status = await deps.getPostStatus(postId);
  if (status !== 'failed') {
    throw new AdminActionError('failed-precondition', 'Only failed posts can be retried.');
  }
  const event = await deps.getEvent(eventId);
  if (!event) throw new AdminActionError('not-found', 'Event not found.');
  if (event.status !== 'approved') {
    throw new AdminActionError('failed-precondition', 'Event is not approved.');
  }
  // Kill switch first so a disabled automation leaves the failed record intact.
  if (!(await deps.publishDeps.isEnabled())) return 'disabled';

  await deps.deletePost(postId);
  // Same flow as the approval trigger: past events end up as `skipped`.
  return publishApprovedEvent(deps.publishDeps, eventId, null, event);
}

export interface SkipDeps {
  getPostStatus(postId: string): Promise<string | null>;
  setSkipped(postId: string): Promise<void>;
  createSkipped(postId: string, record: PostRecord): Promise<void>;
}

/** Marks a post skipped; creates the record when none exists so it stays blocked. */
export async function skipInstagramPost(deps: SkipDeps, eventId: string): Promise<'skipped'> {
  const postId = postIdFor(eventId);
  const status = await deps.getPostStatus(postId);
  if (status === 'published') {
    throw new AdminActionError('failed-precondition', 'Post is already published.');
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
    });
  } else {
    await deps.setSkipped(postId);
  }
  return 'skipped';
}
