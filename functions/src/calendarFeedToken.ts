/**
 * Personal calendar feed tokens (calendarFeedTokens/{uid}).
 *
 * The calendar export is for signed-in users only, but calendar apps fetch
 * the .ics URLs without a Firebase login. So every user gets one random,
 * secret token that is part of their calendar URLs; calendarFeed.ts accepts a
 * request only when the token belongs to an existing, enabled account.
 *
 * The collection is server-only (firestore.rules denies every client access);
 * this callable is the only way to obtain, replace or delete a token.
 * Revoking by hand: delete calendarFeedTokens/{uid} in the Firestore console.
 */
import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { enforceRateLimit } from './rateLimit';
import { isValidCalendarToken } from './calendar/calendarRoutes';
import { ALLOWED_ORIGINS } from './allowedOrigins';

if (getApps().length === 0) {
  initializeApp();
}

export const CALENDAR_TOKENS_COLLECTION = 'calendarFeedTokens';

// Every "add to calendar" click asks for the token, so reading is generous;
// replacing it invalidates the user's subscriptions and is rare.
const READ_LIMIT = { maxAttempts: 60, windowMs: 10 * 60 * 1000 };
const CHANGE_LIMIT = { maxAttempts: 5, windowMs: 10 * 60 * 1000 };

/** 32 random bytes, base64url: 43 characters, matches CALENDAR_TOKEN_PATTERN. */
export function generateCalendarFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Storage access, injectable so the handler is unit-tested without Firestore. */
export interface CalendarTokenStore {
  read(uid: string): Promise<string | null>;
  /** Creates the doc only if absent; false when it already existed. */
  createIfAbsent(uid: string, token: string): Promise<boolean>;
  replace(uid: string, token: string): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function firestoreCalendarTokenStore(): CalendarTokenStore {
  const ref = (uid: string) => getFirestore().collection(CALENDAR_TOKENS_COLLECTION).doc(uid);
  return {
    async read(uid) {
      const snap = await ref(uid).get();
      const token = snap.exists ? snap.get('token') : null;
      return isValidCalendarToken(token) ? token : null;
    },
    async createIfAbsent(uid, token) {
      try {
        await ref(uid).create({ token, createdAt: FieldValue.serverTimestamp() });
        return true;
      } catch (err) {
        // gRPC ALREADY_EXISTS: a parallel call created it first.
        if ((err as { code?: unknown })?.code === 6) return false;
        throw err;
      }
    },
    async replace(uid, token) {
      await ref(uid).set({ token, createdAt: FieldValue.serverTimestamp() });
    },
    async remove(uid) {
      await ref(uid).delete();
    },
  };
}

export interface CalendarTokenRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
  rawRequest?: unknown;
}

export interface CalendarTokenDeps {
  store?: CalendarTokenStore;
  generate?: () => string;
  enforceRateLimit?: typeof enforceRateLimit;
}

/**
 * data: {}                  -> the existing token, created on first use
 *       { regenerate: true } -> a new token; links with the old one stop working
 *       { revoke: true }     -> deletes the token (used when deleting the account)
 */
export async function calendarFeedTokenHandler(
  request: CalendarTokenRequest,
  deps: CalendarTokenDeps = {}
): Promise<{ token: string | null }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const data = (request.data ?? {}) as { regenerate?: unknown; revoke?: unknown };
  const store = deps.store ?? firestoreCalendarTokenStore();
  const generate = deps.generate ?? generateCalendarFeedToken;
  const limit = deps.enforceRateLimit ?? enforceRateLimit;

  if (data.revoke === true) {
    limit(request as never, 'calendarTokenChange', CHANGE_LIMIT);
    await store.remove(uid);
    return { token: null };
  }

  if (data.regenerate === true) {
    limit(request as never, 'calendarTokenChange', CHANGE_LIMIT);
    const token = generate();
    await store.replace(uid, token);
    return { token };
  }

  limit(request as never, 'calendarTokenRead', READ_LIMIT);
  const existing = await store.read(uid);
  if (existing) return { token: existing };

  const fresh = generate();
  if (await store.createIfAbsent(uid, fresh)) return { token: fresh };
  const winner = await store.read(uid);
  if (winner) return { token: winner };
  // The doc exists but holds no valid token (should not happen): repair it.
  await store.replace(uid, fresh);
  return { token: fresh };
}

export const getCalendarFeedToken = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    ...appCheckOptions(),
  },
  (request) => {
    logMissingAppCheck('getCalendarFeedToken', request);
    return calendarFeedTokenHandler(request);
  }
);
