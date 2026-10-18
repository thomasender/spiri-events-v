// Pure logic for the event change history (events/{id}/revisions).
// No Firebase imports, so it is unit-testable (tests/lib/eventRevisions.spec.ts).

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export type FieldChanges = Record<string, FieldChange>;

// Bookkeeping that changes on its own (build/Instagram/approval flow) and says
// nothing about what the organizer edited. Status transitions are recorded
// separately as statusFrom/statusTo.
const IGNORED_FIELDS = new Set([
  'updatedAt',
  'favoriteCount',
  'slug',
  'approvedBy',
  'approvedAt',
  'unpublishedBy',
  'unpublishedAt',
  'trashedBy',
  'trashReason',
]);

const MAX_STRING_LENGTH = 20000;

interface TimestampLike {
  toMillis: () => number;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TimestampLike).toMillis === 'function'
  );
}

/** Turns a Firestore value into something that compares and stores predictably. */
export function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (isTimestampLike(value)) return new Date(value.toMillis()).toISOString();
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Field-level diff between two event documents, bookkeeping fields excluded. */
export function computeEventChanges(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): FieldChanges {
  const changes: FieldChanges = {};
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = normalizeValue(b[key]);
    const to = normalizeValue(a[key]);
    if (sameValue(from, to)) continue;
    changes[key] = { from, to };
  }
  return changes;
}

export interface RevisionDraft {
  statusFrom: string | null;
  statusTo: string | null;
  changes: FieldChanges;
}

function readStatus(data: Record<string, unknown> | undefined): string | null {
  return typeof data?.status === 'string' ? data.status : null;
}

/** Returns null when nothing worth recording changed. */
export function buildRevisionDraft(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): RevisionDraft | null {
  const changes = computeEventChanges(before, after);
  const statusFrom = readStatus(before);
  const statusTo = readStatus(after);
  // `status` is shown as its own transition, not as a content change.
  delete changes.status;
  if (Object.keys(changes).length === 0 && statusFrom === statusTo) return null;
  return { statusFrom, statusTo, changes };
}
