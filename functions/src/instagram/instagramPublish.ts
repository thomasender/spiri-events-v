/**
 * Pure logic for "post to the Instagram feed when an event gets approved".
 * All I/O (Firestore, Storage, Mailgun, fetch, clock) is injected through
 * PublishDeps so tests/lib/instagramPublish.spec.ts can drive every branch
 * without Firebase or the real Instagram API. The Cloud Function wrapper is
 * ../instagramPostOnApproval.ts.
 */

import { buildCaption, type InstagramEventInput } from './instagramContent';

export const GRAPH_BASE = 'https://graph.instagram.com/v23.0';
export const POLL_INTERVAL_MS = 5000;
export const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const VIENNA_TZ = 'Europe/Vienna';

export type PostStatus = 'publishing' | 'published' | 'failed' | 'skipped';

export interface PostRecord {
  type: 'feed';
  eventId: string;
  status: PostStatus;
  attempts: number;
  igMediaId: string | null;
  permalink: string | null;
  error: string | null;
  /** True when the organizer was tagged and invited as collaborator on the container. */
  collaboratorInvited: boolean;
  /** Why the invite/tag was dropped (container retried without it); null otherwise. */
  inviteFallbackReason: string | null;
}

/** The subset of PublishDeps the Graph API helpers need (shared with the carousel flow). */
export interface GraphDeps {
  fetch: typeof fetch;
  accessToken: string;
  userId: string;
  now?(): Date;
}

export interface PublishDeps {
  fetch: typeof fetch;
  accessToken: string;
  userId: string;
  /** app_settings/instagram.enabled === true */
  isEnabled(): Promise<boolean>;
  /** Firestore create(): resolves false when the doc already exists. */
  createPost(id: string, record: PostRecord): Promise<boolean>;
  updatePost(id: string, patch: Partial<PostRecord>): Promise<void>;
  /**
   * Instagram mention (e.g. "@name") of the organizer, or null when the
   * creator has no valid handle in their profile. Optional: no tag without it.
   */
  getOrganizerHandle?(event: InstagramEventInput): Promise<string | null>;
  generateImage(eventId: string, event: InstagramEventInput): Promise<string>;
  notifyAdmins(subject: string, text: string): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export type TriggerOutcome =
  'ignored' | 'disabled' | 'no-consent' | 'duplicate' | 'skipped' | 'published' | 'failed';

function statusOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const status = (data as { status?: unknown }).status;
  return typeof status === 'string' ? status : null;
}

/** True only for a real transition into `approved` (incl. creation as approved). */
export function isApprovalTransition(before: unknown, after: unknown): boolean {
  return statusOf(after) === 'approved' && statusOf(before) !== 'approved';
}

/** Today's calendar date in Vienna as YYYY-MM-DD. */
export function viennaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VIENNA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * An event is past when its last day (endDate, else date) is before today in
 * Vienna. Events without a parseable date are not treated as past.
 */
export function isEventPast(event: InstagramEventInput, now: Date): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const date = typeof event.date === 'string' ? event.date.trim() : '';
  const end = typeof event.endDate === 'string' ? event.endDate.trim() : '';
  const last = iso.test(end) && end > date ? end : date;
  if (!iso.test(last)) return false;
  return last < viennaToday(now);
}

/** Removes anything token-like before an error text is stored or mailed. */
export function sanitizeError(error: unknown, secrets: string[] = []): string {
  let text = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  text = text.replace(/access_token=[^&\s"']+/gi, 'access_token=[redacted]');
  return text.slice(0, 1000);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function apiErrorMessage(step: string, response: Response, body: Record<string, unknown>): string {
  const err = body.error;
  const detail =
    err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : response.statusText;
  return `Instagram ${step} failed (HTTP ${response.status}): ${detail}`;
}

/** Graph API error carrying the machine-readable code/subcode of the error body. */
export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly userMessage: string | null
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toGraphApiError(step: string, response: Response, body: Record<string, unknown>) {
  const err =
    body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : {};
  return new GraphApiError(
    apiErrorMessage(step, response, body),
    response.status,
    numberOrNull(err.code),
    numberOrNull(err.error_subcode),
    typeof err.error_user_msg === 'string' ? err.error_user_msg : null
  );
}

export const COLLAB_TAG_X = 0.2;
export const COLLAB_TAG_Y = 0.93;
/** Instagram's documented maximum number of collaborators per post. */
export const MAX_COLLABORATORS = 3;

/** Graph usernames are sent without the leading "@". */
export function bareUsername(handle: string): string {
  return handle.replace(/^@+/, '');
}

/**
 * Invalid/private/nonexistent username (110/2207018) or user_tags on a carousel
 * parent (100/2207065): the container can be created again without the invite.
 */
export function isInviteRejection(err: unknown): err is GraphApiError {
  return (
    err instanceof GraphApiError &&
    ((err.code === 110 && err.subcode === 2207018) || (err.code === 100 && err.subcode === 2207065))
  );
}

/**
 * Creates a media container with the invite params (collaborators/user_tags).
 * If Instagram rejects the invite, retries exactly once with the plain params.
 */
export async function createContainerWithInvite(
  deps: GraphDeps,
  path: string,
  params: Record<string, string>,
  inviteParams: Record<string, string> | null,
  step: string,
  log: (message: string, data?: Record<string, unknown>) => void = () => undefined
): Promise<{ json: Record<string, unknown>; invited: boolean; fallbackReason: string | null }> {
  if (!inviteParams || Object.keys(inviteParams).length === 0) {
    return {
      json: await graphPost(deps, path, params, step),
      invited: false,
      fallbackReason: null,
    };
  }
  try {
    const json = await graphPost(deps, path, { ...params, ...inviteParams }, step);
    log('Instagram container created with collaborator invite', { step });
    return { json, invited: true, fallbackReason: null };
  } catch (err) {
    if (!isInviteRejection(err)) throw err;
    const fallbackReason = sanitizeError(
      `${err.code}/${err.subcode}${err.userMessage ? `: ${err.userMessage}` : ''}`,
      [deps.accessToken]
    );
    log('Instagram rejected collaborator invite; retrying container without it', {
      step,
      reason: fallbackReason,
    });
    const json = await graphPost(deps, path, params, step);
    return { json, invited: false, fallbackReason };
  }
}

export async function graphPost(
  deps: GraphDeps,
  path: string,
  params: Record<string, string>,
  step: string
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: deps.accessToken });
  const response = await deps.fetch(`${GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await readJson(response);
  if (!response.ok) throw toGraphApiError(step, response, json);
  return json;
}

export async function graphGet(
  deps: GraphDeps,
  path: string,
  params: Record<string, string>,
  step: string
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ ...params, access_token: deps.accessToken });
  const response = await deps.fetch(`${GRAPH_BASE}/${path}?${query.toString()}`);
  const json = await readJson(response);
  if (!response.ok) throw new Error(apiErrorMessage(step, response, json));
  return json;
}

export function idOf(json: Record<string, unknown>, step: string): string {
  const id = json.id;
  if (typeof id !== 'string' || !id) throw new Error(`Instagram ${step} returned no id`);
  return id;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForContainer(deps: GraphDeps, containerId: string): Promise<void> {
  const clock = deps.now ?? (() => new Date());
  const deadline = clock().getTime() + POLL_TIMEOUT_MS;
  for (;;) {
    const json = await graphGet(
      deps,
      containerId,
      { fields: 'status_code,status' },
      'container status'
    );
    const code = json.status_code;
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      const detail = typeof json.status === 'string' ? `: ${json.status}` : '';
      throw new Error(`Instagram media container ${String(code)}${detail}`);
    }
    if (clock().getTime() + POLL_INTERVAL_MS > deadline) {
      throw new Error(
        `Instagram media container not ready after ${POLL_TIMEOUT_MS / 1000}s (last status: ${String(code)})`
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function publishApprovedEvent(
  deps: PublishDeps,
  eventId: string,
  before: unknown,
  after: unknown
): Promise<TriggerOutcome> {
  const log = deps.log ?? (() => undefined);
  if (!isApprovalTransition(before, after)) return 'ignored';

  if (!(await deps.isEnabled())) {
    log('Instagram posting disabled via app_settings/instagram; skipping', { eventId });
    return 'disabled';
  }

  const event = (after ?? {}) as InstagramEventInput;
  // Opt-in by the organizer. Deliberately before createPost: no dedupe doc is
  // written, so a later re-approval after consent was given can still post.
  if (event.instagramConsent !== true) {
    log('Organizer has not consented to Instagram posting; skipping', { eventId });
    return 'no-consent';
  }

  const postId = `feed_${eventId}`;
  const base: PostRecord = {
    type: 'feed',
    eventId,
    status: 'publishing',
    attempts: 1,
    igMediaId: null,
    permalink: null,
    error: null,
    collaboratorInvited: false,
    inviteFallbackReason: null,
  };

  const past = isEventPast(event, (deps.now ?? (() => new Date()))());
  const created = await deps.createPost(postId, past ? { ...base, status: 'skipped' } : base);
  if (!created) {
    log('Instagram post already exists; not posting again', { eventId });
    return 'duplicate';
  }
  if (past) {
    log('Event date is in the past; skipping Instagram post', { eventId });
    return 'skipped';
  }

  let collaboratorInvited = false;
  let inviteFallbackReason: string | null = null;
  try {
    let handle: string | null = null;
    if (deps.getOrganizerHandle) {
      try {
        handle = await deps.getOrganizerHandle(event);
      } catch (err) {
        log('Organizer handle lookup failed; posting without tag', {
          eventId,
          error: sanitizeError(err, [deps.accessToken]),
        });
      }
    }
    const imageUrl = await deps.generateImage(eventId, event);
    const username = handle ? bareUsername(handle) : '';
    const invite = username
      ? {
          collaborators: JSON.stringify([username]),
          user_tags: JSON.stringify([{ username, x: COLLAB_TAG_X, y: COLLAB_TAG_Y }]),
        }
      : null;
    const created2 = await createContainerWithInvite(
      deps,
      `${deps.userId}/media`,
      { image_url: imageUrl, caption: buildCaption(event, handle) },
      invite,
      'media container creation',
      log
    );
    const container = created2.json;
    collaboratorInvited = created2.invited;
    inviteFallbackReason = created2.fallbackReason;
    const containerId = idOf(container, 'media container creation');
    await waitForContainer(deps, containerId);
    const published = await graphPost(
      deps,
      `${deps.userId}/media_publish`,
      { creation_id: containerId },
      'media publish'
    );
    const mediaId = idOf(published, 'media publish');
    // The post is live at this point; a missing permalink must not fail it.
    let permalink: string | null = null;
    try {
      const info = await graphGet(deps, mediaId, { fields: 'permalink' }, 'permalink lookup');
      permalink = typeof info.permalink === 'string' ? info.permalink : null;
    } catch (err) {
      log('Permalink lookup failed', { eventId, error: sanitizeError(err, [deps.accessToken]) });
    }
    await deps.updatePost(postId, {
      status: 'published',
      igMediaId: mediaId,
      permalink,
      collaboratorInvited,
      inviteFallbackReason,
    });
    return 'published';
  } catch (err) {
    const message = sanitizeError(err, [deps.accessToken]);
    try {
      await deps.updatePost(postId, {
        status: 'failed',
        error: message,
        collaboratorInvited,
        inviteFallbackReason,
      });
    } catch (updateErr) {
      log('Could not record Instagram failure', {
        eventId,
        error: sanitizeError(updateErr, [deps.accessToken]),
      });
    }
    try {
      const title = typeof event.title === 'string' ? event.title : eventId;
      await deps.notifyAdmins(
        `Instagram-Post fehlgeschlagen: ${title}`,
        `Der Instagram-Post für das Event "${title}" (${eventId}) konnte nicht veröffentlicht werden.\n\nFehler: ${message}\n\nEs wird nicht automatisch erneut versucht.`
      );
    } catch (mailErr) {
      log('Could not mail admins about Instagram failure', {
        eventId,
        error: sanitizeError(mailErr, [deps.accessToken]),
      });
    }
    return 'failed';
  }
}
