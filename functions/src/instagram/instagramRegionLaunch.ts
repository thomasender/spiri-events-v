/**
 * "Launch drip" for a newly switched-on regional Instagram account: instead of
 * posting the whole backlog of already approved events at once, they are spread
 * evenly over the posting windows of a few days. Pure logic (Firestore, publish,
 * clock injected) so tests/lib/instagramRegionLaunch.spec.ts needs no Firebase.
 * Firestore wrapper: ../instagramRegionStore.ts (buildLaunchDeps), schedule:
 * ../instagramRegionLaunch.ts. Docs: docs/instagram-regions.md.
 *
 * Plan fields on instagram_private/region_{id} (written by
 * scripts/instagram-region-launch.mjs):
 *   launchStartAt (Timestamp), launchDays (default 3), launchWindowStart ('08:00'),
 *   launchWindowEnd ('20:00'), launchTimezone (default: the region's timezone).
 * Progress fields (written by the drip only):
 *   launchStartedAt, launchEventIds (backlog frozen at the first run after the
 *   start), launchTotal, launchCursor (next index), launchPosted (slots used),
 *   launchFinishedAt, launchRemaining, launchLeaseUntil (one run at a time).
 *
 * Rules:
 * - Before launchStartAt the region posts nothing at all (isAccountUsable).
 * - The backlog = approved + consent + region + not past + no feed_{id} doc +
 *   approved before launchStartAt (approvedAt; events without it count as
 *   backlog), frozen once. Events approved from launchStartAt on post at once
 *   through the approval trigger and are never part of the drip.
 * - Each run posts only up to the cumulative target of the elapsed window time,
 *   so a run that is missed is caught up by the next one and a run twice in a
 *   row posts nothing extra. A slot is reserved before posting (never above the
 *   target, even after a crash) and released when nothing was posted.
 * - The kill switch skips the run without writing anything.
 * - After the last window nothing more is posted; what is left is logged and
 *   stored as launchRemaining (admin callable adminBackfillInstagramRegion can
 *   post it by hand).
 */

import { REGION_DATA } from '../regionData';
import { DEFAULT_REGION_TIMEZONE, resolveRegionId } from '../regions';
import { isEventPast, sanitizeError, type TriggerOutcome } from './instagramPublish';
import type { InstagramEventInput } from './instagramContent';

export const LAUNCH_DEFAULT_DAYS = 3;
export const LAUNCH_MAX_DAYS = 14;
export const LAUNCH_DEFAULT_WINDOW_START = '08:00';
export const LAUNCH_DEFAULT_WINDOW_END = '20:00';
/** Pause between two posts of one run (same as the backfill). */
export const LAUNCH_PAUSE_MS = 10_000;
/** Stop starting new posts after this long (function timeout 540 s). */
export const LAUNCH_BUDGET_MS = 420_000;
/** Lease longer than the function timeout, so a crashed run frees it in time. */
export const LAUNCH_LEASE_MS = 10 * 60_000;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface LaunchPlan {
  startAt: Date;
  days: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}

export interface LaunchProgress {
  startedAt: Date | null;
  eventIds: string[] | null;
  cursor: number;
  posted: number;
  finishedAt: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate()
    : null;
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function regionTimezone(regionId: string): string {
  return REGION_DATA.find((r) => r.slug === regionId)?.timezone ?? DEFAULT_REGION_TIMEZONE;
}

/** A region doc carries a launch plan as soon as launchStartAt is set (even if invalid). */
export function hasLaunchPlan(data: Record<string, unknown> | undefined | null): boolean {
  return !!data && data.launchStartAt !== undefined && data.launchStartAt !== null;
}

/** The plan of a region doc, or null without a (valid) launchStartAt. Bad fields fall back. */
export function parseLaunchPlan(
  regionId: string,
  data: Record<string, unknown> | undefined | null
): LaunchPlan | null {
  const startAt = toDate(data?.launchStartAt);
  if (!data || !startAt) return null;
  const days =
    typeof data.launchDays === 'number' &&
    Number.isInteger(data.launchDays) &&
    data.launchDays >= 1 &&
    data.launchDays <= LAUNCH_MAX_DAYS
      ? data.launchDays
      : LAUNCH_DEFAULT_DAYS;
  let windowStart =
    typeof data.launchWindowStart === 'string' && TIME.test(data.launchWindowStart)
      ? data.launchWindowStart
      : LAUNCH_DEFAULT_WINDOW_START;
  let windowEnd =
    typeof data.launchWindowEnd === 'string' && TIME.test(data.launchWindowEnd)
      ? data.launchWindowEnd
      : LAUNCH_DEFAULT_WINDOW_END;
  if (windowStart >= windowEnd) {
    windowStart = LAUNCH_DEFAULT_WINDOW_START;
    windowEnd = LAUNCH_DEFAULT_WINDOW_END;
  }
  const timezone =
    typeof data.launchTimezone === 'string' && isValidTimezone(data.launchTimezone)
      ? data.launchTimezone
      : regionTimezone(regionId);
  return { startAt, days, windowStart, windowEnd, timezone };
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

export function parseLaunchProgress(
  data: Record<string, unknown> | undefined | null
): LaunchProgress {
  const ids = data?.launchEventIds;
  return {
    startedAt: toDate(data?.launchStartedAt),
    eventIds: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null,
    cursor: nonNegativeInt(data?.launchCursor),
    posted: nonNegativeInt(data?.launchPosted),
    finishedAt: toDate(data?.launchFinishedAt),
  };
}

/** True while a plan exists and its start lies ahead: the region posts nothing. */
export function isBeforeLaunch(launchStartAt: Date | null | undefined, now: Date): boolean {
  return !!launchStartAt && now.getTime() < launchStartAt.getTime();
}

// ------------------------------------------------------------- slot maths

/** Offset of `tz` from UTC at `date`, in ms (positive east of Greenwich). */
function zoneOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` shows `day` (YYYY-MM-DD) `time` (HH:MM). */
export function zonedWallTimeToUtc(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  // Two passes settle the offset around DST changes.
  const first = wall - zoneOffsetMs(new Date(wall), tz);
  return new Date(wall - zoneOffsetMs(new Date(first), tz));
}

/** Calendar day (YYYY-MM-DD) of `date` in `tz`. */
export function localDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export interface LaunchWindow {
  start: Date;
  end: Date;
}

/**
 * Posting windows: `days` calendar days from the start day (in the plan's
 * timezone), each windowStart-windowEnd; the first one begins at startAt.
 */
export function launchWindows(plan: LaunchPlan): LaunchWindow[] {
  const first = localDay(plan.startAt, plan.timezone);
  const windows: LaunchWindow[] = [];
  for (let i = 0; i < plan.days; i += 1) {
    const day = addDays(first, i);
    let start = zonedWallTimeToUtc(day, plan.windowStart, plan.timezone);
    const end = zonedWallTimeToUtc(day, plan.windowEnd, plan.timezone);
    if (i === 0 && plan.startAt > start) start = plan.startAt;
    if (end > start) windows.push({ start, end });
  }
  return windows;
}

/** End of the last window (or the start when no window is left). */
export function launchEnd(plan: LaunchPlan): Date {
  const windows = launchWindows(plan);
  return windows.length ? windows[windows.length - 1].end : plan.startAt;
}

/**
 * How many of `total` posts should be done at `now`: slot k (0-based) opens
 * after k/total of the summed window time, so the first post goes out at the
 * start and the last one well before the end. Never above `total`.
 */
export function launchTarget(plan: LaunchPlan, total: number, now: Date): number {
  if (total <= 0) return 0;
  const windows = launchWindows(plan);
  const length = windows.reduce((sum, w) => sum + (w.end.getTime() - w.start.getTime()), 0);
  if (length <= 0) return now >= plan.startAt ? total : 0;
  const elapsed = windows.reduce(
    (sum, w) =>
      sum +
      Math.min(Math.max(now.getTime() - w.start.getTime(), 0), w.end.getTime() - w.start.getTime()),
    0
  );
  if (elapsed <= 0) return 0;
  if (elapsed >= length) return total;
  // Slots whose opening time k * length / total lies before `elapsed`.
  return Math.min(total, Math.ceil((total * elapsed) / length));
}

// ------------------------------------------------------------------ drip

export interface LaunchCandidate {
  id: string;
  data: InstagramEventInput & Record<string, unknown>;
}

export interface LaunchProgressPatch {
  startedAt?: Date;
  eventIds?: string[];
  total?: number;
  cursor?: number;
  posted?: number;
  finishedAt?: Date;
  remaining?: number;
}

export interface LaunchDeps {
  /** app_settings/instagram.enabled === true */
  isEnabled(): Promise<boolean>;
  /** Takes the region's run lease until `until`; null when another run holds it. Returns fresh progress. */
  acquireLease(regionId: string, now: Date, until: Date): Promise<LaunchProgress | null>;
  releaseLease(regionId: string): Promise<void>;
  saveProgress(regionId: string, patch: LaunchProgressPatch): Promise<void>;
  /** approved + instagramConsent + regionId (query; re-checked here). */
  listCandidates(regionId: string): Promise<LaunchCandidate[]>;
  /** Ids (of `ids`) that already have an instagram_posts/feed_{id} doc, any status. */
  existingPostEventIds(ids: string[]): Promise<Set<string>>;
  getEvent(eventId: string): Promise<Record<string, unknown> | null>;
  /** publishApprovedEvent with the regional credentials. */
  publish(eventId: string, before: unknown, after: unknown): Promise<TriggerOutcome>;
  sleep(ms: number): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export type LaunchRunResult =
  | { regionId: string; status: 'not-started' | 'disabled' | 'busy' | 'finished-before' }
  | {
      regionId: string;
      status: 'ran' | 'finished';
      total: number;
      target: number;
      posted: number;
      cursor: number;
      postedThisRun: number;
      remaining: number;
    };

function isBacklogEvent(
  data: Record<string, unknown> | null,
  regionId: string,
  now: Date
): boolean {
  return (
    !!data &&
    data.status === 'approved' &&
    data.instagramConsent === true &&
    resolveRegionId(data) === regionId &&
    !isEventPast(data as InstagramEventInput, now)
  );
}

function startKey(c: LaunchCandidate): string {
  return `${String(c.data.date ?? '')} ${String(c.data.time ?? '').padStart(5, '0')}`;
}

/** Backlog at the start: soonest first, approved before the start, no post doc yet. */
export async function selectLaunchBacklog(
  deps: Pick<LaunchDeps, 'listCandidates' | 'existingPostEventIds'>,
  regionId: string,
  plan: LaunchPlan,
  now: Date
): Promise<string[]> {
  const candidates = (await deps.listCandidates(regionId)).filter((c) => {
    if (!isBacklogEvent(c.data, regionId, now)) return false;
    // Approved from the start on: the approval trigger posts it at once.
    const approvedAt = toDate(c.data.approvedAt);
    return !approvedAt || approvedAt < plan.startAt;
  });
  const existing = await deps.existingPostEventIds(candidates.map((c) => c.id));
  return candidates
    .filter((c) => !existing.has(c.id))
    .sort((a, b) => startKey(a).localeCompare(startKey(b)) || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/** One drip run for one region. Safe to call any time and any number of times. */
export async function runLaunchDrip(
  deps: LaunchDeps,
  regionId: string,
  plan: LaunchPlan,
  options: { pauseMs?: number; budgetMs?: number } = {}
): Promise<LaunchRunResult> {
  const log = deps.log ?? (() => undefined);
  const clock = deps.now ?? (() => new Date());
  const started = clock();
  const pauseMs = options.pauseMs ?? LAUNCH_PAUSE_MS;
  const budgetMs = options.budgetMs ?? LAUNCH_BUDGET_MS;

  if (isBeforeLaunch(plan.startAt, started)) return { regionId, status: 'not-started' };
  // Kill switch: no lease, no backlog, no slot, no post doc.
  if (!(await deps.isEnabled())) {
    log('Instagram posting disabled; launch drip run skipped', { regionId });
    return { regionId, status: 'disabled' };
  }
  const progress = await deps.acquireLease(
    regionId,
    started,
    new Date(started.getTime() + LAUNCH_LEASE_MS)
  );
  if (!progress) {
    log('Instagram launch drip already running for region; skipping', { regionId });
    return { regionId, status: 'busy' };
  }

  try {
    if (progress.finishedAt) return { regionId, status: 'finished-before' };

    let eventIds = progress.eventIds;
    if (!eventIds) {
      eventIds = await selectLaunchBacklog(deps, regionId, plan, started);
      await deps.saveProgress(regionId, {
        startedAt: started,
        eventIds,
        total: eventIds.length,
        cursor: 0,
        posted: 0,
      });
      log('Instagram launch drip started', { regionId, total: eventIds.length });
    }
    const total = eventIds.length;
    let { cursor, posted } = progress.eventIds ? progress : { cursor: 0, posted: 0 };
    const target = launchTarget(plan, total, started);
    let postedThisRun = 0;

    const summary = (status: 'ran' | 'finished') => ({
      regionId,
      status,
      total,
      target,
      posted,
      cursor,
      postedThisRun,
      remaining: total - cursor,
    });

    // After the last window nothing is forced out; the rest stays for a manual backfill.
    if (started >= launchEnd(plan)) {
      await deps.saveProgress(regionId, { finishedAt: started, remaining: total - cursor });
      if (total - cursor > 0) {
        log('Instagram launch drip ended with events left over', {
          regionId,
          remaining: total - cursor,
        });
      }
      return summary('finished');
    }

    let first = true;
    while (posted < target && cursor < total) {
      if (clock().getTime() - started.getTime() > budgetMs) break;
      const eventId = eventIds[cursor];
      const event = await deps.getEvent(eventId);
      const taken = (await deps.existingPostEventIds([eventId])).has(eventId);
      if (!isBacklogEvent(event, regionId, clock()) || taken) {
        // Gone, withdrawn, past or already posted: no slot used.
        cursor += 1;
        await deps.saveProgress(regionId, { cursor });
        continue;
      }
      if (!first) await deps.sleep(pauseMs);
      first = false;
      // Reserve the slot before posting: a crash can never push us past the target.
      cursor += 1;
      posted += 1;
      await deps.saveProgress(regionId, { cursor, posted });
      let outcome: TriggerOutcome;
      try {
        outcome = await deps.publish(eventId, null, event);
      } catch (err) {
        log('Instagram launch post crashed', { regionId, eventId, error: sanitizeError(err) });
        outcome = 'failed';
      }
      if (outcome === 'disabled') {
        // Kill switch flipped during the run: give the slot and the event back.
        cursor -= 1;
        posted -= 1;
        await deps.saveProgress(regionId, { cursor, posted });
        break;
      }
      if (outcome === 'published' || outcome === 'failed') {
        postedThisRun += 1;
      } else {
        posted -= 1;
        await deps.saveProgress(regionId, { posted });
      }
      log('Instagram launch event processed', { regionId, eventId, outcome });
    }

    if (cursor >= total) {
      await deps.saveProgress(regionId, { finishedAt: clock(), remaining: 0 });
      log('Instagram launch drip finished', { regionId, total, posted });
      return summary('finished');
    }
    await deps.saveProgress(regionId, { remaining: total - cursor });
    return summary('ran');
  } finally {
    try {
      await deps.releaseLease(regionId);
    } catch (err) {
      log('Could not release launch lease', { regionId, error: sanitizeError(err) });
    }
  }
}
