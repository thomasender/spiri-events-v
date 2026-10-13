/**
 * Firebase App Check for the callable functions.
 *
 * Step 1 (now): every browser-facing callable logs when a request arrives
 * without a verified App Check token, so the observation phase can be
 * evaluated in Cloud Logging ("callable without app check").
 * Step 2 (later, one change): set ENFORCE_APP_CHECK to true and deploy; the
 * callables then reject requests without a valid token.
 *
 * Deliberately NOT covered, because their callers cannot send App Check
 * tokens: mollieWebhook (called by Mollie) and calendarFeed (iCalendar feed
 * fetched by calendar apps; protected by a personal token in the URL instead). Do not add them here.
 */
import { logger } from 'firebase-functions';

/** Master switch. false = observe only, true = reject requests without a valid token. */
export const ENFORCE_APP_CHECK = false;

/** Functions that must never enforce App Check (see above). Guarded by a test. */
export const APP_CHECK_EXEMPT_FUNCTIONS = ['mollieWebhook', 'calendarFeed'] as const;

/** Spread into the options of every browser-facing onCall(). */
export function appCheckOptions(enforce: boolean = ENFORCE_APP_CHECK): { enforceAppCheck?: true } {
  return enforce ? { enforceAppCheck: true } : {};
}

/** Call first thing in a callable's handler; logs only when the token is missing. */
export function logMissingAppCheck(name: string, request: { app?: unknown }): void {
  if (!request.app) {
    logger.warn('callable without app check', { name });
  }
}
