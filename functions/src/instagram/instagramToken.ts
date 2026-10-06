/**
 * Instagram long-lived token handling. Pure logic: all I/O (Firestore,
 * fetch, Mailgun, clock) is injected so tests/lib/instagramToken.spec.ts can
 * drive every branch without Firebase or the real Instagram API.
 *
 * Secrets are read-only at runtime, so a refreshed token lives in the
 * Firestore doc `instagram_private/token` (no client access in firestore.rules).
 * The secret IG_ACCESS_TOKEN stays the fallback until the first refresh.
 * Wrappers: ../instagramPostOnApproval.ts (reads) and ../instagramTokenRefresh.ts.
 */

import { sanitizeError } from './instagramPublish';

export const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Refresh once less than this much validity is left. */
export const REFRESH_BELOW_MS = 30 * DAY_MS;
/** Warn the admins when less than this much validity is left. */
export const WARN_BELOW_MS = 14 * DAY_MS;
/** Instagram only refreshes tokens that are at least 24h old. */
export const MIN_TOKEN_AGE_MS = DAY_MS;
/** Expiry assumed when nothing is stored yet (secret generated 2026-10-06). */
export const FALLBACK_EXPIRY = new Date('2026-12-05T00:00:00Z');

export interface StoredToken {
  accessToken: string;
  expiresAt: Date;
  refreshedAt: Date | null;
}

export interface TokenSelectionDeps {
  /** Token from the IG_ACCESS_TOKEN secret. */
  secretToken: string;
  readStoredToken(): Promise<StoredToken | null>;
  now?(): Date;
  log?(message: string, data?: Record<string, unknown>): void;
}

/** Firestore token if present and not expired, otherwise the secret value. */
export async function getInstagramAccessToken(deps: TokenSelectionDeps): Promise<string> {
  const now = (deps.now ?? (() => new Date()))();
  try {
    const stored = await deps.readStoredToken();
    if (stored && stored.accessToken && stored.expiresAt.getTime() > now.getTime()) {
      return stored.accessToken;
    }
  } catch (err) {
    deps.log?.('Could not read stored Instagram token; falling back to secret', {
      error: sanitizeError(err, [deps.secretToken]),
    });
  }
  return deps.secretToken;
}

export interface TokenStatusPatch {
  tokenExpiresAt?: Date;
  tokenRefreshedAt?: Date;
  /** null clears a previous error. Omitted = leave as is. */
  tokenRefreshError?: string | null;
}

export interface RefreshDeps extends TokenSelectionDeps {
  fetch: typeof fetch;
  /** Persist the new token (instagram_private/token). */
  saveToken(token: StoredToken): Promise<void>;
  /** Persist non-secret metadata (app_settings/instagram). */
  writeStatus(patch: TokenStatusPatch): Promise<void>;
  notifyAdmins(subject: string, text: string): Promise<void>;
}

export type RefreshOutcome = 'not-configured' | 'not-due' | 'too-young' | 'refreshed' | 'failed';

function daysLeft(expiresAt: Date, now: Date): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

async function requestRefresh(
  deps: RefreshDeps,
  token: string
): Promise<{ accessToken: string; expiresInSec: number }> {
  const url = `${REFRESH_URL}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
  const response = await deps.fetch(url, { method: 'GET' });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await response.text());
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // non-JSON body; handled below
  }
  if (!response.ok) {
    const err = body.error;
    const detail =
      err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : response.statusText;
    throw new Error(`Instagram token refresh failed (HTTP ${response.status}): ${detail}`);
  }
  const accessToken = body.access_token;
  const expiresIn = body.expires_in;
  if (typeof accessToken !== 'string' || !accessToken || typeof expiresIn !== 'number') {
    throw new Error('Instagram token refresh returned an unexpected response');
  }
  return { accessToken, expiresInSec: expiresIn };
}

/** Weekly job body: refresh when < 30 days are left, warn when < 14. */
export async function refreshInstagramToken(deps: RefreshDeps): Promise<RefreshOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => undefined);

  let stored: StoredToken | null = null;
  try {
    stored = await deps.readStoredToken();
  } catch (err) {
    log('Could not read stored Instagram token', {
      error: sanitizeError(err, [deps.secretToken]),
    });
  }
  const usable = stored && stored.expiresAt.getTime() > now.getTime() ? stored : null;
  const token = usable ? usable.accessToken : deps.secretToken;
  const expiresAt = usable ? usable.expiresAt : FALLBACK_EXPIRY;
  const refreshedAt = usable ? usable.refreshedAt : null;
  const secrets = [deps.secretToken, stored?.accessToken ?? ''];

  if (!token) {
    log('No Instagram token configured; skipping refresh');
    return 'not-configured';
  }

  const remainingMs = expiresAt.getTime() - now.getTime();

  if (remainingMs >= REFRESH_BELOW_MS) {
    await deps.writeStatus({ tokenExpiresAt: expiresAt });
    log('Instagram token not due for refresh', { daysLeft: daysLeft(expiresAt, now) });
    return 'not-due';
  }

  if (refreshedAt && now.getTime() - refreshedAt.getTime() < MIN_TOKEN_AGE_MS) {
    await deps.writeStatus({ tokenExpiresAt: expiresAt });
    log('Instagram token is younger than 24h; cannot refresh yet');
    return 'too-young';
  }

  let outcome: RefreshOutcome;
  let finalExpiry = expiresAt;
  let errorText: string | null = null;
  try {
    const result = await requestRefresh(deps, token);
    secrets.push(result.accessToken);
    finalExpiry = new Date(now.getTime() + result.expiresInSec * 1000);
    await deps.saveToken({
      accessToken: result.accessToken,
      expiresAt: finalExpiry,
      refreshedAt: now,
    });
    await deps.writeStatus({
      tokenExpiresAt: finalExpiry,
      tokenRefreshedAt: now,
      tokenRefreshError: null,
    });
    outcome = 'refreshed';
    log('Instagram token refreshed', { daysLeft: daysLeft(finalExpiry, now) });
  } catch (err) {
    errorText = sanitizeError(err, secrets);
    outcome = 'failed';
    log('Instagram token refresh failed', { error: errorText });
    try {
      await deps.writeStatus({ tokenExpiresAt: expiresAt, tokenRefreshError: errorText });
    } catch (writeErr) {
      log('Could not store Instagram token refresh error', {
        error: sanitizeError(writeErr, secrets),
      });
    }
  }

  if (errorText !== null || finalExpiry.getTime() - now.getTime() < WARN_BELOW_MS) {
    const days = Math.max(daysLeft(finalExpiry, now), 0);
    const subject =
      errorText !== null
        ? 'Instagram: Token konnte nicht erneuert werden'
        : 'Instagram: Token läuft bald ab';
    const text =
      `Der Instagram-Zugangstoken läuft in ${days} Tag(en) ab (${finalExpiry.toISOString()}).` +
      (errorText !== null
        ? `\nDie automatische Erneuerung ist fehlgeschlagen:\n${errorText}`
        : '') +
      '\nOhne gültigen Token werden keine Events mehr auf Instagram veröffentlicht.';
    try {
      await deps.notifyAdmins(subject, text);
    } catch (mailErr) {
      log('Could not mail admins about Instagram token', {
        error: sanitizeError(mailErr, secrets),
      });
    }
  }
  return outcome;
}
