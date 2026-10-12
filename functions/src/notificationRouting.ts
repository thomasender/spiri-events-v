import type { AdminMessageContext, EventOrganizer, NotificationEvent } from './emailTemplates';

export type EventLifecycleStatus = 'draft' | 'pending' | 'approved' | 'trashed';

export interface EventSnapshot {
  status?: EventLifecycleStatus | null;
  organizer?: EventOrganizer | null;
  trashedAt?: unknown;
  lastNotifiedStatus?: EventLifecycleStatus | null;
  createdBy?: string | null;
  unpublishedBy?: string | null;
  trashReason?: string | null;
}

export type AdminMessageRole = 'Admin' | 'User';

export interface AdminMessageSnapshot {
  authorRole?: AdminMessageRole | string | null;
  authorUid?: string | null;
  text?: string | null;
  authorName?: string | null;
  id: string;
}

export type NotificationType =
  'submitted' | 'changes_requested' | 'published' | 'unpublished' | 'deleted' | 'contact_message';

export interface EventNotificationDecision {
  type: Exclude<NotificationType, 'changes_requested'>;
  event: NotificationEvent;
  recipient: string | 'admins';
  /** Only for 'deleted': why an admin deleted the owner's event. */
  reason?: string | null;
}

export interface ChangesRequestedDecision {
  type: 'changes_requested';
  event: NotificationEvent;
  recipient: string;
  context: AdminMessageContext;
}

export type NotificationDecision = EventNotificationDecision | ChangesRequestedDecision;

function organizerDisplayName(organizer: EventOrganizer | null | undefined): string {
  if (!organizer) return '';
  const parts = [organizer.firstName, organizer.lastName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  return parts.join(' ').trim();
}

function isStatus(value: unknown): value is EventLifecycleStatus {
  return value === 'draft' || value === 'pending' || value === 'approved' || value === 'trashed';
}

function safeOwnerEmail(organizer: EventOrganizer | null | undefined): string | null {
  const email = organizer?.email;
  return typeof email === 'string' && email.trim().length > 0 ? email.trim() : null;
}

function buildEventFor(
  id: string,
  snapshot: EventSnapshot,
  title?: string | null,
  slug?: string | null
): NotificationEvent {
  return {
    id,
    title: typeof title === 'string' && title.trim().length > 0 ? title.trim() : '',
    slug: typeof slug === 'string' && slug.trim().length > 0 ? slug.trim() : null,
    organizer: snapshot.organizer ?? null,
  };
}

export function decideEventStatusNotification(
  eventId: string,
  before: EventSnapshot,
  after: EventSnapshot,
  eventTitle?: string | null,
  slug?: string | null
): EventNotificationDecision | null {
  const beforeStatus = isStatus(before.status) ? before.status : null;
  const afterStatus = isStatus(after.status) ? after.status : null;
  if (!afterStatus || beforeStatus === afterStatus) return null;

  if (afterStatus === 'trashed') {
    const ownerEmail = safeOwnerEmail(after.organizer);
    if (!ownerEmail) return null;
    const reason = typeof after.trashReason === 'string' ? after.trashReason.trim() : '';
    return {
      type: 'deleted',
      event: buildEventFor(eventId, after, eventTitle, slug),
      recipient: ownerEmail,
      reason: reason || null,
    };
  }

  if (afterStatus === 'approved') {
    const ownerEmail = safeOwnerEmail(after.organizer);
    if (!ownerEmail) return null;
    return {
      type: 'published',
      event: buildEventFor(eventId, after, eventTitle, slug),
      recipient: ownerEmail,
    };
  }

  // An admin took an approved event offline again (back to draft) so the
  // owner can rework it. Skip when the admin unpublished their own event.
  if (beforeStatus === 'approved' && afterStatus === 'draft') {
    const ownerEmail = safeOwnerEmail(after.organizer);
    if (!ownerEmail) return null;
    if (after.unpublishedBy && after.unpublishedBy === after.createdBy) return null;
    return {
      type: 'unpublished',
      event: buildEventFor(eventId, after, eventTitle, slug),
      recipient: ownerEmail,
    };
  }

  if (afterStatus === 'pending') {
    return {
      type: 'submitted',
      event: buildEventFor(eventId, after, eventTitle, slug),
      recipient: 'admins',
    };
  }

  return null;
}

export function decideCreatedEventNotification(
  eventId: string,
  after: EventSnapshot,
  eventTitle?: string | null,
  slug?: string | null
): EventNotificationDecision | null {
  const afterStatus = isStatus(after.status) ? after.status : null;
  if (afterStatus !== 'pending') return null;
  if (after.lastNotifiedStatus === 'pending') return null;
  return {
    type: 'submitted',
    event: buildEventFor(eventId, after, eventTitle, slug),
    recipient: 'admins',
  };
}

export function decideAdminMessageNotification(
  eventId: string,
  message: AdminMessageSnapshot,
  eventSnapshot: EventSnapshot,
  eventTitle?: string | null,
  slug?: string | null
): ChangesRequestedDecision | null {
  if (message.authorRole !== 'Admin') return null;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text) return null;

  const ownerEmail = safeOwnerEmail(eventSnapshot.organizer);
  if (!ownerEmail) return null;

  return {
    type: 'changes_requested',
    event: buildEventFor(eventId, eventSnapshot, eventTitle, slug),
    recipient: ownerEmail,
    context: {
      messageId: message.id,
      authorName:
        typeof message.authorName === 'string' && message.authorName.trim().length > 0
          ? message.authorName.trim()
          : 'Das tribe-Team',
      text,
    },
  };
}
