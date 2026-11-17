import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp, type Query } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertAdmin } from './adminMembers';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { MODERATION_LOG_COLLECTION } from './moderationLog';
import {
  FUN_FACTS_COLLECTION,
  FUN_FACTS_DOC,
  computeFunFacts,
  shouldRecompute,
  type FunFactLogEntry,
  type FunFacts,
} from './funFacts';

export type FunFactsResponse = FunFacts & {
  users: number | null;
  favorites: number | null;
  computedAt: string;
};

const LOG_FIELDS = [
  'action',
  'eventId',
  'at',
  'eventTitle',
  'eventDate',
  'ownerUid',
  'actorUid',
  'actorName',
  'byStaff',
  'source',
  'statusFrom',
  'changedFields',
];

/** count() of a query, or null when it fails (the rest of the page still shows). */
async function safeCount(label: string, query: Query): Promise<number | null> {
  try {
    return (await query.count().get()).data().count;
  } catch (err) {
    logger.warn('adminFunFacts: count failed', { label, err: (err as Error)?.message });
    return null;
  }
}

async function computeAll(): Promise<Omit<FunFactsResponse, 'computedAt'>> {
  const db = getFirestore();
  const [logSnap, users, favorites] = await Promise.all([
    db
      .collection(MODERATION_LOG_COLLECTION)
      .select(...LOG_FIELDS)
      .get(),
    safeCount('users', db.collection('users')),
    safeCount('favorites', db.collectionGroup('favorites')),
  ]);
  const log: FunFactLogEntry[] = logSnap.docs.map((d) => {
    const data = d.data();
    const at = data.at as { toMillis?: () => number } | undefined;
    return {
      action: String(data.action ?? ''),
      eventId: String(data.eventId ?? ''),
      atMs: typeof at?.toMillis === 'function' ? at.toMillis() : null,
      eventTitle: data.eventTitle ?? null,
      eventDate: data.eventDate ?? null,
      ownerUid: data.ownerUid ?? null,
      actorUid: data.actorUid ?? null,
      actorName: data.actorName ?? null,
      byStaff: data.byStaff === true,
      source: data.source ?? null,
      statusFrom: data.statusFrom ?? null,
      changedFields: Array.isArray(data.changedFields) ? data.changedFields : [],
    };
  });
  return { ...computeFunFacts(log), users, favorites };
}

/**
 * Super-Admin tab "Fun Facts": numbers over the whole moderation log plus a
 * few counts. The result is stored in app_stats/fun_facts and recomputed at
 * most every 6 hours; `force: true` ("Aktualisieren") recomputes when the
 * stored result is at least a minute old.
 */
export const adminFunFacts = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<FunFactsResponse> => {
    logMissingAppCheck('adminFunFacts', request);
    await assertAdmin(request.auth?.uid);
    const force = (request.data as { force?: unknown } | undefined)?.force === true;

    try {
      const ref = getFirestore().collection(FUN_FACTS_COLLECTION).doc(FUN_FACTS_DOC);
      const cached = await ref.get();
      const cachedAt = cached.get('computedAt') as Timestamp | undefined;
      const cachedAtMs = cachedAt instanceof Timestamp ? cachedAt.toMillis() : null;
      const now = Date.now();
      if (cached.exists && !shouldRecompute(cachedAtMs, now, force)) {
        const data = cached.data() as Omit<FunFactsResponse, 'computedAt'>;
        return { ...data, computedAt: new Date(cachedAtMs ?? now).toISOString() };
      }
      const facts = await computeAll();
      const computedAt = Timestamp.fromMillis(now);
      await ref.set({ ...facts, computedAt });
      return { ...facts, computedAt: computedAt.toDate().toISOString() };
    } catch (err) {
      logger.error('adminFunFacts failed', { err: (err as Error)?.message });
      throw new HttpsError('internal', 'Die Fun Facts konnten nicht berechnet werden.');
    }
  }
);
