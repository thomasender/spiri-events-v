// Pure logic for the Super-Admin tab "Fun Facts" (callable adminFunFacts):
// numbers over the whole moderation log (`moderation_log`, see
// moderationLog.ts). No Firebase imports, so it is unit-testable
// (tests/lib/funFacts.spec.ts). Definitions, per event (eventId):
//
// - Eingereicht: at least one `submitted`, or the first decision (approved /
//   returned / rejected) came from `pending` (the submission itself happened
//   before the log started).
// - Direkt veröffentlicht: the first `approved` came without a submission
//   before it (the team created the event as approved).
// - First pass: from the first submission to the first `approved`. A review
//   round is a pending phase in which the team intervened: sent it back
//   (`returned`), edited it (`edited` by staff, not only the Instagram crop) or
//   asked a question (`clarification`, logged since the Fun Facts release; the
//   counting works without them too). Sofort freigegeben = 0 rounds.

export const FUN_FACTS_COLLECTION = 'app_stats';
export const FUN_FACTS_DOC = 'fun_facts';

/** Recompute at most this often without "Aktualisieren". */
export const FUN_FACTS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** "Aktualisieren" recomputes at most this often. */
export const FUN_FACTS_MIN_FORCE_MS = 60 * 1000;

const TOP_N = 5;

export interface FunFactLogEntry {
  action: string;
  eventId: string;
  atMs: number | null;
  eventTitle?: string | null;
  eventDate?: string | null;
  ownerUid?: string | null;
  actorUid?: string | null;
  actorName?: string | null;
  byStaff?: boolean;
  source?: string | null;
  statusFrom?: string | null;
  changedFields?: string[];
}

export interface ApprovalSpan {
  eventId: string;
  title: string;
  ms: number;
}

export interface FunFacts {
  /** Earliest log entry (ISO), i.e. "gezählt seit". null for an empty log. */
  since: string | null;
  /** Earliest `clarification` entry (ISO): Rückfragen are counted from then on. */
  clarificationsSince: string | null;
  totalEntries: number;
  backfillEntries: number;
  events: {
    total: number;
    submitted: number;
    directPublished: number;
    published: number;
    approvedRightAway: number;
    neededReview: number;
    neededMoreThanOneReview: number;
    rejected: number;
    cancelled: number;
    unpublished: number;
  };
  approvalTime: {
    count: number;
    medianMs: number | null;
    averageMs: number | null;
    fastest: ApprovalSpan | null;
    slowest: ApprovalSpan | null;
  };
  champions: { name: string; approvals: number }[];
  organizers: { distinct: number; top: { name: string | null; events: number }[] };
  /** Published events by the weekday of their date, Monday first. */
  weekdays: number[];
  /** Published events by the month of their date, January first. */
  months: number[];
}

/** Staff edits that only touch bookkeeping (Instagram crop before approval, region fix). */
function isTechnicalEdit(fields: string[] | undefined): boolean {
  const list = fields ?? [];
  return list.length > 0 && list.every((f) => /^instagram/i.test(f) || f === 'regionId');
}

function isReviewIntervention(entry: FunFactLogEntry): boolean {
  if (entry.action === 'clarification') return true;
  return (
    entry.action === 'edited' && entry.byStaff === true && !isTechnicalEdit(entry.changedFields)
  );
}

function byTime(a: FunFactLogEntry, b: FunFactLogEntry): number {
  return (a.atMs ?? Number.MAX_SAFE_INTEGER) - (b.atMs ?? Number.MAX_SAFE_INTEGER);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Review rounds of the first pass (entries up to, not including, the first approval). */
export function countReviewRounds(entries: FunFactLogEntry[]): number {
  let rounds = 0;
  let intervened = false;
  for (const entry of entries) {
    if (entry.action === 'approved') break;
    if (entry.action === 'returned' || entry.action === 'rejected') {
      rounds += 1;
      intervened = false;
    } else if (isReviewIntervention(entry)) {
      intervened = true;
    } else if (entry.action === 'submitted' && intervened) {
      rounds += 1;
      intervened = false;
    }
  }
  return intervened ? rounds + 1 : rounds;
}

const DECISIONS = new Set(['approved', 'returned', 'rejected']);

/** 'YYYY-MM-DD' -> [weekday (Monday = 0), month (January = 0)], or null. */
function weekdayAndMonth(date: string | null | undefined): [number, number] | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(day.getTime())) return null;
  return [(day.getUTCDay() + 6) % 7, m - 1];
}

function lastDefined<T>(
  entries: FunFactLogEntry[],
  pick: (e: FunFactLogEntry) => T | null | undefined
): T | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = pick(entries[i]);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function topCounts<K>(counts: Map<K, number>): [K, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
}

export function computeFunFacts(log: FunFactLogEntry[]): FunFacts {
  const byEvent = new Map<string, FunFactLogEntry[]>();
  const namesByUid = new Map<string, string>();
  let earliest: number | null = null;
  let earliestClarification: number | null = null;
  let backfillEntries = 0;

  for (const entry of [...log].sort(byTime)) {
    if (!entry?.eventId || !entry.action) continue;
    const list = byEvent.get(entry.eventId) ?? [];
    list.push(entry);
    byEvent.set(entry.eventId, list);
    if (entry.source === 'backfill') backfillEntries += 1;
    if (entry.atMs !== null) {
      if (earliest === null || entry.atMs < earliest) earliest = entry.atMs;
      if (
        entry.action === 'clarification' &&
        (earliestClarification === null || entry.atMs < earliestClarification)
      ) {
        earliestClarification = entry.atMs;
      }
    }
    if (entry.actorUid && entry.actorName) namesByUid.set(entry.actorUid, entry.actorName);
  }

  const events = {
    total: byEvent.size,
    submitted: 0,
    directPublished: 0,
    published: 0,
    approvedRightAway: 0,
    neededReview: 0,
    neededMoreThanOneReview: 0,
    rejected: 0,
    cancelled: 0,
    unpublished: 0,
  };
  const spans: ApprovalSpan[] = [];
  const approvals = new Map<string, number>();
  const owners = new Map<string, number>();
  const weekdays = Array(7).fill(0) as number[];
  const months = Array(12).fill(0) as number[];

  for (const [eventId, entries] of byEvent) {
    const has = (action: string) => entries.some((e) => e.action === action);
    const firstSubmitted = entries.findIndex((e) => e.action === 'submitted');
    const firstApproved = entries.findIndex((e) => e.action === 'approved');
    const firstDecision = entries.find((e) => DECISIONS.has(e.action));

    const direct =
      firstApproved >= 0 &&
      (firstSubmitted < 0 || firstSubmitted > firstApproved) &&
      entries[firstApproved].statusFrom !== 'pending';
    const submitted = firstSubmitted >= 0 || firstDecision?.statusFrom === 'pending';
    if (submitted) events.submitted += 1;
    if (direct) events.directPublished += 1;
    if (firstApproved >= 0) events.published += 1;
    if (has('rejected')) events.rejected += 1;
    if (has('cancelled')) events.cancelled += 1;
    if (has('unpublished')) events.unpublished += 1;

    if (firstApproved >= 0 && !direct) {
      const start = firstSubmitted >= 0 && firstSubmitted < firstApproved ? firstSubmitted : 0;
      const rounds = countReviewRounds(entries.slice(start, firstApproved));
      if (rounds === 0) events.approvedRightAway += 1;
      if (rounds >= 1) events.neededReview += 1;
      if (rounds >= 2) events.neededMoreThanOneReview += 1;

      const from = firstSubmitted >= 0 ? entries[firstSubmitted].atMs : null;
      const to = entries[firstApproved].atMs;
      if (firstSubmitted >= 0 && firstSubmitted < firstApproved && from !== null && to !== null) {
        if (to >= from) {
          spans.push({
            eventId,
            title: lastDefined(entries, (e) => e.eventTitle) ?? '',
            ms: to - from,
          });
        }
      }
    }

    for (const e of entries) {
      if (e.action === 'approved' && e.byStaff && e.actorUid) {
        approvals.set(e.actorUid, (approvals.get(e.actorUid) ?? 0) + 1);
      }
    }

    const owner = lastDefined(entries, (e) => e.ownerUid);
    if (owner) owners.set(owner, (owners.get(owner) ?? 0) + 1);

    if (firstApproved >= 0) {
      const wm = weekdayAndMonth(lastDefined(entries, (e) => e.eventDate));
      if (wm) {
        weekdays[wm[0]] += 1;
        months[wm[1]] += 1;
      }
    }
  }

  const sortedSpans = [...spans].sort((a, b) => a.ms - b.ms);
  const total = spans.reduce((sum, s) => sum + s.ms, 0);

  return {
    since: earliest === null ? null : new Date(earliest).toISOString(),
    clarificationsSince:
      earliestClarification === null ? null : new Date(earliestClarification).toISOString(),
    totalEntries: log.length,
    backfillEntries,
    events,
    approvalTime: {
      count: spans.length,
      medianMs: median(spans.map((s) => s.ms)),
      averageMs: spans.length ? Math.round(total / spans.length) : null,
      fastest: sortedSpans[0] ?? null,
      slowest: sortedSpans[sortedSpans.length - 1] ?? null,
    },
    champions: topCounts(approvals).map(([uid, count]) => ({
      name: namesByUid.get(uid) ?? 'Unbekannt',
      approvals: count,
    })),
    organizers: {
      distinct: owners.size,
      top: topCounts(owners).map(([uid, count]) => ({
        name: namesByUid.get(uid) ?? null,
        events: count,
      })),
    },
    weekdays,
    months,
  };
}

/**
 * Whether the callable recomputes instead of returning the stored result:
 * nothing stored yet, older than 6 h, or "Aktualisieren" (force) and the last
 * computation is at least a minute old.
 */
export function shouldRecompute(cachedAtMs: number | null, nowMs: number, force: boolean): boolean {
  if (cachedAtMs === null) return true;
  const age = nowMs - cachedAtMs;
  if (force) return age >= FUN_FACTS_MIN_FORCE_MS;
  return age >= FUN_FACTS_MAX_AGE_MS;
}
