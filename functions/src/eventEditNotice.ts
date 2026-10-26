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
