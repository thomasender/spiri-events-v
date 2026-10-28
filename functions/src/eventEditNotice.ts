// Pure logic for the in-app alert to admins when an organizer edits a pending event
// (users/{adminUid}/adminAlerts/{eventId}). No Firebase imports, so it is unit-testable
// (tests/lib/eventEditNotice.spec.ts). The trigger lives in eventRevisionTrigger.ts.
import type { FieldChanges } from './eventRevisions';

type EventData = Record<string, unknown> | undefined;
export type ActorRole = 'Admin' | 'User' | 'System';
export type EditAlertKind = 'edited' | 'resubmitted';

function statusOf(data: EventData): string | null {
  return typeof data?.status === 'string' ? data.status : null;
}

/**
 * Which kind of alert an organizer's update deserves, or null for none.
 * `changes` is the bookkeeping-free diff from `buildRevisionDraft` (status excluded).
 * - pending -> pending with real content changes: "edited"
 * - draft -> pending (re-submission): "resubmitted", even without content changes
 * Admin edits, approved and trashed events never alert.
 */
export function shouldNotifyAdminsOfEdit(
  before: EventData,
  after: EventData,
  actorRole: ActorRole,
  changes: FieldChanges
): EditAlertKind | null {
  if (actorRole !== 'User') return null;
  const from = statusOf(before);
  if (statusOf(after) !== 'pending') return null;
  if (from === 'draft') return 'resubmitted';
  if (from === 'pending' && Object.keys(changes).length > 0) return 'edited';
  return null;
}

export interface EditAlertInput {
  triggerId: string;
  kind: EditAlertKind;
  changeCount: number;
}

export interface EditAlertFields {
  kind: EditAlertKind;
  read: false;
  changeCount: number;
  lastTriggerId: string;
}

/**
 * The fields to write for one admin, or null when this trigger was already counted
 * (a retried delivery of the same event must not count twice). Repeated edits keep
 * one alert per event: unread again, counter raised.
 */
export function buildEditAlertFields(
  existing: Record<string, unknown> | undefined,
  input: EditAlertInput
): EditAlertFields | null {
  if (existing && existing.lastTriggerId === input.triggerId) return null;
  const previous =
    existing && typeof existing.changeCount === 'number' && existing.changeCount > 0
      ? existing.changeCount
      : 0;
  return {
    kind: input.kind,
    read: false,
    changeCount: previous + Math.max(1, input.changeCount),
    lastTriggerId: input.triggerId,
  };
}

export interface StaffMessageLike {
  authorRole?: unknown;
  authorUid?: unknown;
  atMs?: number | null;
}

export interface RevisionLike {
  statusFrom?: unknown;
  statusTo?: unknown;
  by?: unknown;
  atMs?: number | null;
}

/**
 * The staff member who asked the organizer to change this event ("bitte ändere
 * dein Event"), or null when nobody did (then every admin is alerted as before).
 * - the author of the first staff message on the event (the "In Klärung mit ..."
 *   person), or
 * - whoever sent it back to draft last (a status pending -> draft not done by the
 *   owner), for a re-submission this one wins: it is the newer request.
 */
export function pickResponsibleStaff(input: {
  kind: EditAlertKind;
  ownerUid: string | null;
  messages: StaffMessageLike[];
  revisions: RevisionLike[];
}): string | null {
  const byTime = <T extends { atMs?: number | null }>(list: T[]) =>
    list
      .map((item, i) => ({ item, i, at: typeof item.atMs === 'number' ? item.atMs : Infinity }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
      .map((x) => x.item);

  const firstMessage = byTime(
    input.messages.filter(
      (m) => m.authorRole === 'Admin' && typeof m.authorUid === 'string' && m.authorUid
    )
  )[0];
  const messageUid = firstMessage ? (firstMessage.authorUid as string) : null;

  const reverts = byTime(
    input.revisions.filter(
      (r) =>
        r.statusFrom === 'pending' &&
        r.statusTo === 'draft' &&
        typeof r.by === 'string' &&
        r.by &&
        r.by !== input.ownerUid
    )
  );
  const revertUid = reverts.length > 0 ? (reverts[reverts.length - 1].by as string) : null;

  return input.kind === 'resubmitted' ? (revertUid ?? messageUid) : (messageUid ?? revertUid);
}
