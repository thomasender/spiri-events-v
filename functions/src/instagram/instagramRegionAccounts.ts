/**
 * Per-region Instagram accounts. Pure logic: Firestore, fetch, mail and clock
 * are injected so tests/lib/instagramRegionAccounts.spec.ts needs no Firebase.
 *
 * Vorarlberg keeps using the global secrets IG_ACCESS_TOKEN / IG_USER_ID and
 * the token doc instagram_private/token (unchanged). Every other region has an
 * account only when Thomas stored one in the server-only doc
 * instagram_private/region_{regionId} (scripts/instagram-set-region-account.mjs;
 * firestore.rules denies all client access to instagram_private). Firestore
 * wrappers: ../instagramRegionStore.ts. Docs: docs/instagram-regions.md.
 */

import { DEFAULT_REGION_ID } from '../regions';
import { sanitizeError, isEventPast } from './instagramPublish';
import type { TriggerOutcome } from './instagramPublish';
import type { InstagramEventInput } from './instagramContent';
import { refreshInstagramToken, type RefreshDeps, type RefreshOutcome } from './instagramToken';

export const REGION_ACCOUNT_PREFIX = 'region_';
/** Region ids are used inside a Firestore path; never allow anything else. */
const REGION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidRegionId(regionId: unknown): regionId is string {
  return typeof regionId === 'string' && REGION_ID_PATTERN.test(regionId);
}

export function regionAccountDocId(regionId: string): string {
  return `${REGION_ACCOUNT_PREFIX}${regionId}`;
}

/** 'region_tirol' -> 'tirol'; null for other doc ids (e.g. 'token'). */
export function regionIdFromAccountDocId(docId: string): string | null {
  if (!docId.startsWith(REGION_ACCOUNT_PREFIX)) return null;
  const id = docId.slice(REGION_ACCOUNT_PREFIX.length);
  return isValidRegionId(id) ? id : null;
}

export interface RegionAccount {
  regionId: string;
  userId: string;
  accessToken: string;
  expiresAt: Date | null;
  refreshedAt: Date | null;
  enabled: boolean;
}

export interface Credentials {
  accessToken: string;
  userId: string;
}

function toDate(value: unknown): Date | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate()
    : null;
}

/** Parses instagram_private/region_{id}; null when userId or token are missing. */
export function parseRegionAccount(
  regionId: string,
  data: Record<string, unknown> | undefined | null
): RegionAccount | null {
  if (!data) return null;
  const userId = typeof data.userId === 'string' ? data.userId.trim() : '';
  const accessToken = typeof data.accessToken === 'string' ? data.accessToken.trim() : '';
  if (!userId || !accessToken) return null;
  return {
    regionId,
    userId,
    accessToken,
    expiresAt: toDate(data.expiresAt),
    refreshedAt: toDate(data.refreshedAt),
    enabled: data.enabled === true,
  };
}

/** Usable for publishing: enabled, complete and the token has not expired. */
export function isAccountUsable(
  account: RegionAccount | null,
  now: Date
): account is RegionAccount {
  if (!account || !account.enabled) return false;
  return !account.expiresAt || account.expiresAt.getTime() > now.getTime();
}

export interface CredentialDeps {
  /** Legacy secrets + instagram_private/token resolution (Vorarlberg). */
  legacy(): Promise<Credentials | null>;
  readRegionAccount(regionId: string): Promise<RegionAccount | null>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

/**
 * Credentials to publish for a region, or null (= skip quietly). Vorarlberg
 * always resolves via the legacy path. Any lookup failure for another region
 * means "no credentials": the safe default is not to post.
 */
export async function resolveRegionCredentials(
  deps: CredentialDeps,
  regionId: string
): Promise<Credentials | null> {
  if (regionId === DEFAULT_REGION_ID) return deps.legacy();
  if (!isValidRegionId(regionId)) return null;
  try {
    const account = await deps.readRegionAccount(regionId);
    if (!isAccountUsable(account, (deps.now ?? (() => new Date()))())) return null;
    return { accessToken: account.accessToken, userId: account.userId };
  } catch (err) {
    deps.log?.('Could not read Instagram region account; treating region as not configured', {
      regionId,
      error: sanitizeError(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------- refresh

export interface RegionRefreshDeps {
  fetch: typeof fetch;
  listAccounts(): Promise<RegionAccount[]>;
  saveToken(
    regionId: string,
    token: { accessToken: string; expiresAt: Date; refreshedAt: Date }
  ): Promise<void>;
  writeStatus(
    regionId: string,
    patch: { tokenExpiresAt?: Date; tokenRefreshedAt?: Date; tokenRefreshError?: string | null }
  ): Promise<void>;
  notifyAdmins(subject: string, text: string): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

/**
 * Weekly refresh for every stored regional account with the same thresholds,
 * status fields and mails as the Vorarlberg token (refreshInstagramToken). A
 * failing region never stops the others. Admin mails carry the region id.
 */
export async function refreshRegionAccounts(
  deps: RegionRefreshDeps
): Promise<Record<string, RefreshOutcome | 'expired' | 'error'>> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => undefined);
  const results: Record<string, RefreshOutcome | 'expired' | 'error'> = {};
  let accounts: RegionAccount[] = [];
  try {
    accounts = await deps.listAccounts();
  } catch (err) {
    log('Could not list Instagram region accounts', { error: sanitizeError(err) });
    return results;
  }

  for (const account of accounts) {
    const { regionId } = account;
    const secrets = [account.accessToken];
    const notify = (subject: string, text: string) =>
      deps.notifyAdmins(`${subject} (Region ${regionId})`, `Region: ${regionId}\n\n${text}`);
    try {
      // A stored token without expiry is treated as expired: the owner has to
      // re-run the script (it always writes expiresAt).
      if (!account.expiresAt || account.expiresAt.getTime() <= now.getTime()) {
        results[regionId] = 'expired';
        const message = 'Token ist abgelaufen oder ohne Ablaufdatum; bitte neu erzeugen.';
        await deps.writeStatus(regionId, {
          tokenExpiresAt: account.expiresAt ?? undefined,
          tokenRefreshError: message,
        });
        // A switched-off region may be left to expire without noise.
        if (account.enabled) {
          await notify(
            'Instagram: Token konnte nicht erneuert werden',
            `Der Instagram-Zugangstoken der Region ${regionId} ist abgelaufen und kann nicht mehr erneuert werden.\nBitte einen neuen Token erzeugen und scripts/instagram-set-region-account.mjs ausführen.\nOhne gültigen Token werden für diese Region keine Events mehr auf Instagram veröffentlicht.`
          );
        }
        continue;
      }
      const stored = {
        accessToken: account.accessToken,
        expiresAt: account.expiresAt,
        refreshedAt: account.refreshedAt,
      };
      const refreshDeps: RefreshDeps = {
        fetch: deps.fetch,
        secretToken: '',
        readStoredToken: async () => stored,
        saveToken: async (token) => {
          await deps.saveToken(regionId, {
            accessToken: token.accessToken,
            expiresAt: token.expiresAt,
            refreshedAt: token.refreshedAt ?? now,
          });
        },
        writeStatus: (patch) => deps.writeStatus(regionId, patch),
        notifyAdmins: notify,
        now: () => now,
        log: (message, data) => log(message, { regionId, ...data }),
      };
      results[regionId] = await refreshInstagramToken(refreshDeps);
    } catch (err) {
      results[regionId] = 'error';
      log('Instagram region token refresh crashed', {
        regionId,
        error: sanitizeError(err, secrets),
      });
    }
  }
  return results;
}

// --------------------------------------------------------------- backfill

/** Posts per run; a run is one function invocation (timeout 540s). */
export const BACKFILL_DEFAULT_LIMIT = 10;
export const BACKFILL_MAX_LIMIT = 25;
/** Pause between two posts so we stay far below the API publishing limits. */
export const BACKFILL_PAUSE_MS = 10_000;
/** Stop starting new posts after this long (function timeout is 540s). */
export const BACKFILL_BUDGET_MS = 420_000;

export interface BackfillCandidate {
  id: string;
  data: InstagramEventInput & Record<string, unknown>;
}

export interface BackfillDeps {
  /** approved + instagramConsent == true + regionId == regionId (query). */
  listCandidates(regionId: string): Promise<BackfillCandidate[]>;
  /** Ids (of `ids`) that already have an instagram_posts/feed_{id} doc, any status. */
  existingPostEventIds(ids: string[]): Promise<Set<string>>;
  /** publishApprovedEvent with the regional credentials. */
  publish(eventId: string, before: unknown, after: unknown): Promise<TriggerOutcome>;
  sleep(ms: number): Promise<void>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

export interface BackfillResult {
  regionId: string;
  /** Events that matched approved + consent + region. */
  candidates: number;
  skippedPast: number;
  skippedDuplicate: number;
  /** Eligible events left for another run (limit or time budget reached). */
  remaining: number;
  published: number;
  failed: number;
  /** True when the global kill switch stopped the run. */
  disabled: boolean;
}

function startKey(c: BackfillCandidate): string {
  return `${String(c.data.date ?? '')} ${String(c.data.time ?? '')}`;
}

/**
 * Publishes the region's approved, consented, not-yet-past events that have no
 * feed post record yet. Idempotent: the record is created before posting
 * (create() fails when it exists), so reruns and a parallel trigger/callable
 * never double-post. Serial with a pause; bounded by `limit` and a time budget.
 */
export async function backfillRegion(
  deps: BackfillDeps,
  regionId: string,
  options: { limit?: number; pauseMs?: number; budgetMs?: number } = {}
): Promise<BackfillResult> {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const limit = Math.max(1, Math.min(options.limit ?? BACKFILL_DEFAULT_LIMIT, BACKFILL_MAX_LIMIT));
  const pauseMs = options.pauseMs ?? BACKFILL_PAUSE_MS;
  const budgetMs = options.budgetMs ?? BACKFILL_BUDGET_MS;
  const result: BackfillResult = {
    regionId,
    candidates: 0,
    skippedPast: 0,
    skippedDuplicate: 0,
    remaining: 0,
    published: 0,
    failed: 0,
    disabled: false,
  };

  // Re-check the fields in code too: the query is only a pre-filter.
  const all = (await deps.listCandidates(regionId)).filter(
    (c) =>
      c.data.status === 'approved' &&
      c.data.instagramConsent === true &&
      (typeof c.data.regionId === 'string' && c.data.regionId
        ? c.data.regionId === regionId
        : regionId === DEFAULT_REGION_ID)
  );
  result.candidates = all.length;
  const upcoming = all.filter((c) => {
    if (isEventPast(c.data, now())) {
      result.skippedPast++;
      return false;
    }
    return true;
  });
  const existing = await deps.existingPostEventIds(upcoming.map((c) => c.id));
  const todo = upcoming
    .filter((c) => {
      if (existing.has(c.id)) {
        result.skippedDuplicate++;
        return false;
      }
      return true;
    })
    .sort((a, b) => startKey(a).localeCompare(startKey(b)) || a.id.localeCompare(b.id));

  let first = true;
  for (let i = 0; i < todo.length; i++) {
    if (result.published + result.failed >= limit || now().getTime() - started > budgetMs) {
      result.remaining = todo.length - i;
      break;
    }
    if (!first) await deps.sleep(pauseMs);
    first = false;
    const { id, data } = todo[i];
    try {
      // Synthetic transition: not approved before, approved now.
      const outcome = await deps.publish(id, null, data);
      if (outcome === 'disabled') {
        result.disabled = true;
        result.remaining = todo.length - i;
        break;
      }
      if (outcome === 'published') result.published++;
      else if (outcome === 'failed') result.failed++;
      else if (outcome === 'duplicate') result.skippedDuplicate++;
      else if (outcome === 'skipped') result.skippedPast++;
      log('Instagram backfill event processed', { regionId, eventId: id, outcome });
    } catch (err) {
      result.failed++;
      log('Instagram backfill event crashed', { regionId, eventId: id, error: sanitizeError(err) });
    }
  }
  log('Instagram backfill finished', { ...result });
  return result;
}

/** True when a write to a region account doc switches publishing on. */
export function becameEnabled(
  before: Record<string, unknown> | undefined | null,
  after: Record<string, unknown> | undefined | null,
  regionId: string
): boolean {
  const was = parseRegionAccount(regionId, before);
  const now = parseRegionAccount(regionId, after);
  return !!now && now.enabled && !(was && was.enabled);
}
