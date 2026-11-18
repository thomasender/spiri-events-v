/**
 * Sends Web Push via Firebase Cloud Messaging (Trello 6afe0f78,
 * docs/push-notifications.md). Who gets what is decided in pushRouting.ts;
 * this module only resolves the devices and talks to FCM.
 *
 * Tokens: `users/{uid}/pushTokens/{sha256(token)}` `{ token, platform,
 * createdAt, lastSeenAt }`, written by the client (src/lib/pushMessaging.js).
 * Tokens FCM reports as unknown are deleted here.
 *
 * The message is data-only (title, body, link, tag): the app's own service
 * worker (public/push-sw.js) shows it, there is no Firebase SDK in the worker.
 *
 * Never throws (sendPushPlan): a push must never block a mail or a revision.
 */
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getUsersNotificationPreferences, type NotificationPreferenceMap } from './userPreferences';
import {
  filterUidsByPushPreference,
  isPushThrottled,
  pushThrottleDocId,
  type PushMessage,
  type PushPlan,
} from './pushRouting';

if (getApps().length === 0) {
  initializeApp();
}

export const PUSH_TOKENS_SUBCOLLECTION = 'pushTokens';
/** Rate-limit markers `{eventId}_{uid}` = { at, expireAt }; server-only (no rule matches). */
export const PUSH_THROTTLE_COLLECTION = 'push_throttle';

/** FCM's limit for one sendEachForMulticast call. */
const MULTICAST_LIMIT = 500;

/** FCM error codes meaning "this token will never work again". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export interface StoredPushToken {
  token: string;
  /** Whatever deleteToken needs to remove it (a DocumentReference in production). */
  ref: unknown;
}

export interface MulticastMessage {
  tokens: string[];
  data: Record<string, string>;
  webpush: { headers: Record<string, string> };
}

export interface MulticastResult {
  responses: Array<{ success: boolean; error?: { code?: string } | null }>;
}

export interface PushDeps {
  loadTokens: (uid: string) => Promise<StoredPushToken[]>;
  sendEachForMulticast: (message: MulticastMessage) => Promise<MulticastResult>;
  deleteToken: (ref: unknown) => Promise<void>;
}

export interface PushResult {
  devices: number;
  sent: number;
  removed: number;
}

/** The FCM message: data only, shown by public/push-sw.js. */
export function buildMulticastMessage(tokens: string[], message: PushMessage): MulticastMessage {
  return {
    tokens,
    data: { title: message.title, body: message.body, link: message.link, tag: message.tag },
    // High urgency so phones wake up for it; dropped after a day if the device stays offline.
    webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
  };
}

/** Indexes of the tokens FCM rejected for good. */
export function deadTokenIndexes(result: MulticastResult): number[] {
  const out: number[] = [];
  result.responses.forEach((response, i) => {
    if (!response.success && DEAD_TOKEN_CODES.has(response.error?.code ?? '')) out.push(i);
  });
  return out;
}

/**
 * Sends `message` to every device of `uids` and deletes the dead tokens. A failing
 * batch is logged and counted as not sent; the other batches still go out.
 */
export async function sendPushToUids(
  uids: readonly string[],
  message: PushMessage,
  deps: PushDeps
): Promise<PushResult> {
  const tokens: StoredPushToken[] = [];
  const seen = new Set<string>();
  for (const uid of new Set(uids)) {
    for (const stored of await deps.loadTokens(uid)) {
      if (!stored.token || seen.has(stored.token)) continue;
      seen.add(stored.token);
      tokens.push(stored);
    }
  }
  const result: PushResult = { devices: tokens.length, sent: 0, removed: 0 };
  for (let i = 0; i < tokens.length; i += MULTICAST_LIMIT) {
    const chunk = tokens.slice(i, i + MULTICAST_LIMIT);
    let response: MulticastResult;
    try {
      response = await deps.sendEachForMulticast(
        buildMulticastMessage(
          chunk.map((t) => t.token),
          message
        )
      );
    } catch (err) {
      logger.error('Push send failed', { err, devices: chunk.length });
      continue;
    }
    result.sent += response.responses.filter((r) => r.success).length;
    for (const index of deadTokenIndexes(response)) {
      try {
        await deps.deleteToken(chunk[index].ref);
        result.removed += 1;
      } catch (err) {
        logger.warn('Could not delete a dead push token', { err });
      }
    }
  }
  return result;
}

export const firestorePushDeps = (): PushDeps => ({
  loadTokens: async (uid) => {
    const snap = await getFirestore()
      .collection('users')
      .doc(uid)
      .collection(PUSH_TOKENS_SUBCOLLECTION)
      .get();
    const out: StoredPushToken[] = [];
    for (const doc of snap.docs) {
      const token: unknown = doc.get('token');
      if (typeof token === 'string' && token.length > 0) out.push({ token, ref: doc.ref });
    }
    return out;
  },
  sendEachForMulticast: (message) => getMessaging().sendEachForMulticast(message),
  deleteToken: async (ref) => {
    await (ref as FirebaseFirestore.DocumentReference).delete();
  },
});

export interface PushPlanDeps {
  loadPreferences: (uids: string[]) => Promise<Map<string, NotificationPreferenceMap>>;
  push: PushDeps;
  /**
   * Rate limit: true = this person may get a push for this event now (and the
   * time is recorded), false = one went out within PUSH_THROTTLE_MS.
   */
  claimThrottle: (eventId: string, uid: string, nowMs: number) => Promise<boolean>;
}

/** Transaction on push_throttle/{eventId}_{uid}: read the last push, record this one. */
async function claimFirestoreThrottle(
  eventId: string,
  uid: string,
  nowMs: number
): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection(PUSH_THROTTLE_COLLECTION).doc(pushThrottleDocId(eventId, uid));
  return db.runTransaction(async (tx) => {
    const at = (await tx.get(ref)).get('at');
    const lastMs = at instanceof Timestamp ? at.toMillis() : null;
    if (isPushThrottled(lastMs, nowMs)) return false;
    tx.set(ref, {
      at: Timestamp.fromMillis(nowMs),
      // For a Firestore TTL policy on `expireAt`, if one is ever set up; harmless without.
      expireAt: Timestamp.fromMillis(nowMs + 24 * 60 * 60 * 1000),
    });
    return true;
  });
}

const defaultPlanDeps = (): PushPlanDeps => ({
  loadPreferences: getUsersNotificationPreferences,
  push: firestorePushDeps(),
  claimThrottle: claimFirestoreThrottle,
});

/** Keeps the uids not rate-limited for this event (all of them when the plan has no limit). */
async function applyThrottle(
  plan: PushPlan,
  uids: string[],
  deps: PushPlanDeps,
  nowMs: number
): Promise<string[]> {
  const eventId = plan.throttleEventId;
  if (!eventId) return uids;
  const allowed: string[] = [];
  for (const uid of uids) {
    if (await deps.claimThrottle(eventId, uid, nowMs)) allowed.push(uid);
  }
  return allowed;
}

/**
 * One routed push (pushRouting.ts): keeps the uids that opted in and sends.
 * Never throws; `context` goes into the logs.
 */
export async function sendPushPlan(
  plan: PushPlan | null,
  context: Record<string, unknown>,
  deps: PushPlanDeps = defaultPlanDeps(),
  nowMs: number = Date.now()
): Promise<PushResult | null> {
  if (!plan || plan.uids.length === 0) return null;
  try {
    const prefs = await deps.loadPreferences([...plan.uids]);
    const optedIn = filterUidsByPushPreference(plan.uids, plan.prefKey, prefs);
    const uids = await applyThrottle(plan, optedIn, deps, nowMs);
    if (uids.length === 0) return null;
    const result = await sendPushToUids(uids, plan.message, deps.push);
    logger.info('Push processed', { ...context, prefKey: plan.prefKey, ...result });
    return result;
  } catch (err) {
    logger.error('Push failed', { ...context, prefKey: plan.prefKey, err });
    return null;
  }
}
