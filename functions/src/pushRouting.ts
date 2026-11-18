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
}

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

/** Only the uids that switched this kind of push on. */
export function filterUidsByPushPreference(
  uids: readonly string[],
  prefKey: PushPreferenceKey,
  prefs: Map<string, NotificationPreferenceMap>
): string[] {
  return uids.filter((uid) => prefs.get(uid)?.[prefKey] === true);
}
