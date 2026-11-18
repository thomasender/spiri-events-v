/**
 * Who gets which push notification about the event review (Trello 6afe0f78,
 * docs/push-notifications.md). Pure: no Firestore, no Messaging, so Vitest
 * covers it without an emulator (tests/lib/pushRouting.spec.ts). The wiring
 * lives in notifications.ts / eventRevisionTrigger.ts, the sending in push.ts.
 *
 * The decisions reuse the mail routing (notificationRouting.ts decide*,
 * adminEventRouting.ts for the region). Push texts carry the event title only,
 * never the content of a chat message.
 *
 * Organizer (createdBy), opt-in per kind:
 *   - event approved                         pushOnEventStatus
 *   - event rejected                         pushOnEventStatus
 *   - question from the team (review chat)   pushOnReviewMessage
 * Staff, opt-in pushStaffReview:
 *   - new submission (also re-submission): Super-Admins + moderators of the
 *     event's region
 *   - "in Klärung" event edited, or the organizer answered in the review chat:
 *     only the staff member responsible for the conversation
 * The person who caused it never gets a push.
 */
import type { NotificationDecision, EventLifecycleStatus } from './notificationRouting';
import { eventMailRegionId, moderatorUidsForRegion, type StaffDocEntry } from './adminEventRouting';
import type { EditAlertKind } from './eventEditNotice';
import type { NotificationPreferenceMap } from './userPreferences';

export type PushPreferenceKey = 'pushOnEventStatus' | 'pushOnReviewMessage' | 'pushStaffReview';

export interface PushMessage {
  title: string;
  body: string;
  /** Same-origin path the notification opens (the service worker resolves it). */
  link: string;
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
}

export interface PushPlan {
  uids: string[];
  prefKey: PushPreferenceKey;
  message: PushMessage;
  /**
   * Rate limit key (the event id) for staff updates: at most one push per event
   * and person within PUSH_THROTTLE_MS. Absent = no limit.
   */
  throttleEventId?: string;
}

/** Edits and replies: at most one push per event and person in this window. */
export const PUSH_THROTTLE_MS = 15 * 60 * 1000;

const TITLE_MAX = 80;

/** „Titel" for the text, shortened; a missing title reads "dein Event". */
function quotedTitle(title: string | null | undefined, fallback: string): string {
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  if (!clean) return fallback;
  const short = clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
  return `„${short}“`;
}

function eventPath(slug: string | null | undefined): string {
  return slug ? `/event/${slug}` : '/admin';
}

export function reviewPath(eventId: string): string {
  return `/admin?tab=review#${eventId}`;
}

function uidOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Organizer push after a status change ("genehmigt" / "abgelehnt"). Not for
 * "back to draft" or "deleted", not for the edit of an event that was already
 * approved (the organizer did that herself), and not when the organizer
 * approved / rejected her own event (`actorUid` = approvedBy / trashedBy).
 */
export function ownerStatusPush(input: {
  decision: NotificationDecision | null;
  beforeStatus: EventLifecycleStatus | null | undefined;
  ownerUid: string | null | undefined;
  actorUid?: string | null;
}): PushPlan | null {
  const { decision, beforeStatus } = input;
  const ownerUid = uidOrNull(input.ownerUid);
  if (!decision || !ownerUid) return null;
  if (uidOrNull(input.actorUid) === ownerUid) return null;
  const name = quotedTitle(decision.event.title, 'Dein Event');
  if (decision.type === 'published') {
    if (beforeStatus === 'approved') return null;
    return {
      uids: [ownerUid],
      prefKey: 'pushOnEventStatus',
      message: {
        title: 'Dein Event ist online',
        body: `${name} wurde genehmigt und ist jetzt im Kalender.`,
        link: eventPath(decision.event.slug),
        tag: `event-status-${decision.event.id}`,
      },
    };
  }
  if (decision.type === 'rejected') {
    return {
      uids: [ownerUid],
      prefKey: 'pushOnEventStatus',
      message: {
        title: 'Dein Event wurde abgelehnt',
        body: `${name} wurde leider nicht freigegeben. Mehr dazu in deinen Events.`,
        link: '/admin',
        tag: `event-status-${decision.event.id}`,
      },
    };
  }
  return null;
}

/** Organizer push for a question of the team in the review chat (changes_requested). */
export function ownerReviewMessagePush(input: {
  decision: NotificationDecision | null;
  ownerUid: string | null | undefined;
  authorUid?: string | null;
}): PushPlan | null {
  const { decision } = input;
  const ownerUid = uidOrNull(input.ownerUid);
  if (!decision || decision.type !== 'changes_requested' || !ownerUid) return null;
  if (uidOrNull(input.authorUid) === ownerUid) return null;
  return {
    uids: [ownerUid],
    prefKey: 'pushOnReviewMessage',
    message: {
      title: 'Rückfrage zu deinem Event',
      body: `Das Team hat eine Frage zu ${quotedTitle(decision.event.title, 'deinem Event')}.`,
      link: eventPath(decision.event.slug),
      tag: `event-message-${decision.event.id}`,
    },
  };
}

/**
 * "Neu eingereicht": Super-Admins plus the moderators of the event's region
 * (never of another region), each once, without the person who submitted.
 */
export function staffSubmittedPush(input: {
  decision: NotificationDecision | null;
  eventData: unknown;
  superAdminUids: readonly string[];
  moderatorDocs: readonly StaffDocEntry[];
  actorUid?: string | null;
}): PushPlan | null {
  const { decision } = input;
  if (!decision || decision.type !== 'submitted') return null;
  const regionId = eventMailRegionId(input.eventData);
  const actor = uidOrNull(input.actorUid);
  const uids = Array.from(
    new Set([
      ...input.superAdminUids.filter((uid) => uidOrNull(uid)),
      ...moderatorUidsForRegion([...input.moderatorDocs], regionId),
    ])
  ).filter((uid) => uid !== actor);
  if (uids.length === 0) return null;
  return {
    uids,
    prefKey: 'pushStaffReview',
    message: {
      title: 'Neues Event eingereicht',
      body: `${quotedTitle(decision.event.title, 'Ein Event')} wartet auf eure Prüfung.`,
      link: reviewPath(decision.event.id),
      tag: `review-${decision.event.id}`,
    },
  };
}

/**
 * "Update in Klärung": the organizer changed a pending event the team asked
 * about. Only the responsible staff member (the adminAlerts recipient after
 * pickResponsibleStaff), never the fallback "all Super-Admins". A re-submission
 * (draft -> pending) already sends "Neues Event eingereicht", so no second push.
 */
export function staffEditPush(input: {
  eventId: string;
  title: string | null | undefined;
  kind: EditAlertKind | null;
  responsibleUid: string | null | undefined;
  actorUid?: string | null;
}): PushPlan | null {
  const responsible = uidOrNull(input.responsibleUid);
  if (input.kind !== 'edited' || !responsible) return null;
  if (responsible === uidOrNull(input.actorUid)) return null;
  return {
    uids: [responsible],
    prefKey: 'pushStaffReview',
    throttleEventId: input.eventId,
    message: {
      title: 'Update in Klärung',
      body: `${quotedTitle(input.title, 'Ein Event')} wurde überarbeitet.`,
      link: reviewPath(input.eventId),
      tag: `review-${input.eventId}`,
    },
  };
}

export interface ReviewMessageLike {
  authorRole?: unknown;
  authorUid?: unknown;
}

/**
 * Who a message in the review chat is "for" on the staff side, like
 * messageIsUnreadFor (src/utils/staffNotifications.js): only the organizer's
 * messages, only for the staff member responsible for the conversation (the
 * author of the first staff message). Unlike the red dot, no push while no
 * staff member has written yet: then the event is not "in Klärung".
 */
export function replyPushRecipient(
  message: ReviewMessageLike,
  responsibleUid: string | null | undefined
): string | null {
  if (message.authorRole !== 'User') return null;
  const responsible = uidOrNull(responsibleUid);
  if (!responsible || responsible === uidOrNull(message.authorUid)) return null;
  return responsible;
}

/** "Antwort im Review-Chat" to the responsible staff member (rate-limited). */
export function staffReplyPush(input: {
  eventId: string;
  title: string | null | undefined;
  message: ReviewMessageLike;
  responsibleUid: string | null | undefined;
}): PushPlan | null {
  const recipient = replyPushRecipient(input.message, input.responsibleUid);
  if (!recipient) return null;
  return {
    uids: [recipient],
    prefKey: 'pushStaffReview',
    throttleEventId: input.eventId,
    message: {
      title: 'Antwort in Klärung',
      body: `Neue Antwort zu ${quotedTitle(input.title, 'einem Event')}.`,
      link: reviewPath(input.eventId),
      tag: `review-${input.eventId}`,
    },
  };
}

/** Only the uids that switched this kind of push on. */
export function filterUidsByPushPreference(
  uids: readonly string[],
  prefKey: PushPreferenceKey,
  prefs: Map<string, NotificationPreferenceMap>
): string[] {
  return uids.filter((uid) => prefs.get(uid)?.[prefKey] === true);
}

/** True while the last push for this event and person is younger than the window. */
export function isPushThrottled(
  lastAtMs: number | null | undefined,
  nowMs: number,
  windowMs: number = PUSH_THROTTLE_MS
): boolean {
  return typeof lastAtMs === 'number' && nowMs - lastAtMs < windowMs;
}

/** Doc id of the rate-limit marker in `push_throttle` (server-only collection). */
export function pushThrottleDocId(eventId: string, uid: string): string {
  return `${eventId}_${uid}`;
}
