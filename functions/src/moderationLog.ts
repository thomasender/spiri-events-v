// Pure logic for the moderation log (`moderation_log/{id}`, admin tab
// "Protokoll"). One flat, denormalised entry per moderation-relevant change of
// an event, so Super-Admins can filter by region, person, action and period
// without reading every event. Written only by the Cloud Functions in
// eventRevisionTrigger.ts (and scripts/backfill-moderation-log.mjs for the
// history); readable by Super-Admins only (firestore.rules).
// No Firebase imports, so it is unit-testable (tests/lib/moderationLog.spec.ts).

import { resolveRegionId } from './regions';

export const MODERATION_LOG_COLLECTION = 'moderation_log';

export type ModerationAction =
  | 'submitted'
  | 'approved'
  | 'returned'
  | 'unpublished'
  | 'rejected'
  | 'trashed'
  | 'restored'
  | 'edited'
  | 'cancelled'
  | 'deleted'
  | 'status';

export const MODERATION_ACTIONS: readonly ModerationAction[] = [
  'submitted',
  'approved',
  'returned',
  'unpublished',
  'rejected',
  'trashed',
  'restored',
  'edited',
  'cancelled',
  'deleted',
  'status',
];

export type ActorRole = 'Admin' | 'RegionModerator' | 'User' | 'System';

export interface LogActor {
  uid: string | null;
  name: string | null;
  role: ActorRole;
}

export interface ModerationLogEntry {
  action: ModerationAction;
  eventId: string;
  eventTitle: string;
  eventSlug: string | null;
  eventDate: string | null;
  regionId: string;
  ownerUid: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  changedFields: string[];
  reason: string | null;
  actorUid: string | null;
  actorName: string | null;
  actorRole: ActorRole;
  /** true for Super-Admins and Regions-Moderator:innen: the default "Team" filter. */
  byStaff: boolean;
  source: 'trigger' | 'backfill';
}

type EventData = Record<string, unknown> | undefined;

const MAX_FIELDS = 40;
const MAX_REASON = 500;
const MAX_TITLE = 200;

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function statusOf(data: EventData): string | null {
  return str(data?.status);
}

/**
 * What happened, from the status transition (and, without one, the fields).
 * Returns null for changes that are no moderation topic: drafts the
 * organizer is still working on, and updates without any change.
 */
export function classifyModerationAction(input: {
  kind: 'create' | 'update' | 'delete';
  before?: EventData;
  after?: EventData;
  changedFields?: string[];
}): ModerationAction | null {
  const { kind, before, after, changedFields = [] } = input;
  if (kind === 'delete') return 'deleted';
  const to = statusOf(after);
  if (kind === 'create') {
    if (to === 'pending') return 'submitted';
    if (to === 'approved') return 'approved';
    return null;
  }
  const from = statusOf(before);
  if (from !== to) {
    if (to === 'approved') return 'approved';
    if (to === 'pending') return 'submitted';
    if (to === 'trashed') {
      return after?.trashKind === 'rejected' ? 'rejected' : 'trashed';
    }
    if (to === 'draft') {
      if (from === 'pending') return 'returned';
      if (from === 'approved') return 'unpublished';
      if (from === 'trashed') return 'restored';
    }
    return 'status';
  }
  if (changedFields.length === 0) return null;
  // Organizer still writing her draft: not a moderation topic.
  if (to === 'draft' || to === null) return null;
  if (changedFields.includes('cancelled') && after?.cancelled === true) return 'cancelled';
  return 'edited';
}

/** First date of the event as YYYY-MM-DD (for display only). */
function eventDateOf(data: EventData): string | null {
  const date = data?.date;
  if (typeof date === 'string') return date.slice(0, 10) || null;
  if (date && typeof (date as { toDate?: unknown }).toDate === 'function') {
    return (date as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Builds the log entry for one change of `events/{eventId}`, or null when the
 * change is not logged (see classifyModerationAction). `before`/`after` are
 * the event documents; for a delete `after` is undefined.
 */
export function buildModerationLogEntry(input: {
  kind: 'create' | 'update' | 'delete';
  eventId: string;
  before?: EventData;
  after?: EventData;
  changedFields?: string[];
  actor: LogActor;
  source?: 'trigger' | 'backfill';
}): ModerationLogEntry | null {
  const { kind, eventId, before, after, actor } = input;
  const changedFields = (input.changedFields ?? []).slice(0, MAX_FIELDS);
  const action = classifyModerationAction({ kind, before, after, changedFields });
  if (!action) return null;
  const doc = after ?? before ?? {};
  const reason = action === 'rejected' || action === 'trashed' ? str(after?.trashReason) : null;
  return {
    action,
    eventId,
    eventTitle: (str(doc.title) ?? '').slice(0, MAX_TITLE),
    eventSlug: str(doc.slug),
    eventDate: eventDateOf(doc),
    regionId: resolveRegionId(doc),
    ownerUid: str(doc.createdBy),
    statusFrom: kind === 'create' ? null : statusOf(before),
    statusTo: kind === 'delete' ? null : statusOf(after),
    changedFields: kind === 'update' ? changedFields : [],
    reason: reason ? reason.slice(0, MAX_REASON) : null,
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    byStaff: actor.role === 'Admin' || actor.role === 'RegionModerator',
    source: input.source ?? 'trigger',
  };
}

/**
 * Role of the actor for the log, from her `admin_users` doc. Unlike the
 * revision's `byRole` (Admin/User) a Regions-Moderator:in is named as such.
 */
export function actorRoleFromStaffDoc(uid: string | null, staffDoc: unknown): ActorRole {
  if (!uid) return 'System';
  const role =
    staffDoc && typeof staffDoc === 'object' ? (staffDoc as { role?: unknown }).role : null;
  if (role === 'Admin') return 'Admin';
  if (role === 'RegionModerator') return 'RegionModerator';
  return 'User';
}

// ── History (scripts/backfill-moderation-log.mjs) ─────────────────────────

export interface RevisionLike {
  id: string;
  atMs: number | null;
  by?: string | null;
  byName?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  changes?: Record<string, unknown>;
}

export interface PersonInfo {
  name: string | null;
  staffDoc?: unknown;
}

export type BackfillEntry = ModerationLogEntry & { id: string; atMs: number };

function personActor(
  uid: string | null | undefined,
  people: Record<string, PersonInfo>,
  fallbackName?: string | null
): LogActor {
  if (!uid) return { uid: null, name: null, role: 'System' };
  const person = people[uid];
  return {
    uid,
    name: fallbackName || person?.name || null,
    role: actorRoleFromStaffDoc(uid, person?.staffDoc),
  };
}

/**
 * Log entries for the history of one existing event, from its revisions
 * (same doc id as the trigger would have used, so re-running is harmless) and,
 * where no revision covers them, from the who/when fields on the event
 * (approvedBy/At, unpublishedBy/At, trashedBy/At). Limits, documented in
 * docs/regions.md: the person's role is today's role; a rejection is only
 * recognised for the event's current trash state; deleted events are gone.
 */
export function buildBackfillEntries(
  eventId: string,
  event: Record<string, unknown>,
  revisions: RevisionLike[],
  people: Record<string, PersonInfo>
): BackfillEntry[] {
  const out: BackfillEntry[] = [];
  const sorted = [...revisions].sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
  const lastTrash = [...sorted].reverse().find((r) => r.statusTo === 'trashed');
  const currentlyTrashed = event.status === 'trashed';
  for (const rev of sorted) {
    if (rev.atMs === null) continue;
    const isCurrentTrash = currentlyTrashed && rev === lastTrash;
    const before = { ...event, status: rev.statusFrom ?? null };
    const after = {
      ...event,
      status: rev.statusTo ?? null,
      trashKind: isCurrentTrash ? event.trashKind : null,
      trashReason: isCurrentTrash ? event.trashReason : null,
    };
    const entry = buildModerationLogEntry({
      kind: 'update',
      eventId,
      before,
      after,
      changedFields: Object.keys(rev.changes ?? {}),
      actor: personActor(rev.by, people, rev.byName),
      source: 'backfill',
    });
    if (entry) out.push({ ...entry, id: rev.id, atMs: rev.atMs });
  }

  const millis = (v: unknown): number | null =>
    v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
      ? (v as { toMillis: () => number }).toMillis()
      : null;
  const synthetic: Array<{ to: string; from: string; by: unknown; at: unknown; key: string }> = [
    {
      to: 'approved',
      from: 'pending',
      by: event.approvedBy,
      at: event.approvedAt,
      key: 'approved',
    },
    {
      to: 'draft',
      from: 'approved',
      by: event.unpublishedBy,
      at: event.unpublishedAt,
      key: 'unpublished',
    },
    { to: 'trashed', from: 'pending', by: event.trashedBy, at: event.trashedAt, key: 'trashed' },
  ];
  for (const s of synthetic) {
    const atMs = millis(s.at);
    if (typeof s.by !== 'string' || atMs === null) continue;
    // A trash may have come from pending or approved; the others need the exact transition.
    const covered = sorted.some(
      (r) => r.statusTo === s.to && (s.key === 'trashed' || r.statusFrom === s.from)
    );
    if (covered) continue;
    const after = { ...event, status: s.to };
    const entry = buildModerationLogEntry({
      kind: 'update',
      eventId,
      before: { ...event, status: s.from },
      after: s.key === 'trashed' ? after : { ...after, trashKind: null, trashReason: null },
      actor: personActor(s.by, people),
      source: 'backfill',
    });
    if (entry) out.push({ ...entry, id: `${s.key}-${eventId}`, atMs });
  }
  return out;
}
