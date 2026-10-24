import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ADMIN_MAIL_SECRETS } from './adminNotify';
import {
  buildCarouselDeps,
  buildPublishDeps,
  buildStoryDeps,
  listCarouselEvents,
  lookupOrganizerHandle,
  resolveInstagramAccessToken,
} from './instagramDeps';
import {
  previewWeeklyCarousels,
  runWeeklyCarousels,
  type CarouselPreview,
  type CarouselRunOutcome,
} from './instagram/instagramCarousel';
import { CAROUSEL_BEZIRKE } from './instagram/instagramCarousel';
import { runDailyStory, type StoryRunOutcome } from './instagram/instagramStory';
import {
  AdminActionError,
  archiveInstagramPost,
  assertEventId,
  retryInstagramPost,
  skipInstagramPost,
} from './instagram/instagramAdminLogic';
import type { TriggerOutcome } from './instagram/instagramPublish';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { DEFAULT_REGION_ID, resolveRegionId } from './regions';
import { isValidRegionId, type BackfillResult } from './instagram/instagramRegionAccounts';
import { resolveCredentialsForRegion, runRegionBackfill } from './instagramRegionStore';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const snap = await getFirestore().collection('admin_users').doc(uid).get();
  if (!snap.exists || snap.data()?.role !== 'Admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}

function toHttpsError(err: unknown): never {
  if (err instanceof AdminActionError) throw new HttpsError(err.code, err.message);
  throw err;
}

async function readStatus(postId: string): Promise<string | null> {
  const snap = await getFirestore().collection('instagram_posts').doc(postId).get();
  if (!snap.exists) return null;
  const status = snap.get('status');
  return typeof status === 'string' ? status : null;
}

export const adminRetryInstagramPost = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
    ...appCheckOptions(),
  },
  async (request): Promise<{ outcome: TriggerOutcome }> => {
    logMissingAppCheck('adminRetryInstagramPost', request);
    await assertAdmin(request.auth?.uid);
    try {
      const data = request.data as { eventId?: unknown; force?: unknown } | null;
      const eventId = assertEventId(data?.eventId);
      const force = data?.force === true;
      const db = getFirestore();
      const publishDeps = buildPublishDeps(db, IG_USER_ID.value());
      // The event's region decides the account: Vorarlberg uses the legacy
      // secrets (unchanged), other regions their own instagram_private doc.
      const eventSnap = await db.collection('events').doc(eventId).get();
      const regionId = eventSnap.exists ? resolveRegionId(eventSnap.data()) : DEFAULT_REGION_ID;
      if (regionId === DEFAULT_REGION_ID) {
        publishDeps.accessToken = await resolveInstagramAccessToken(db, IG_ACCESS_TOKEN.value());
      } else {
        const credentials = await resolveCredentialsForRegion(db, regionId, {
          accessToken: '',
          userId: '',
        });
        if (credentials) {
          publishDeps.accessToken = credentials.accessToken;
          publishDeps.userId = credentials.userId;
          publishDeps.instagramRegionIds = [regionId];
        }
      }
      if (!publishDeps.accessToken || !publishDeps.userId) {
        throw new HttpsError('failed-precondition', 'Instagram is not configured.');
      }
      // Manual "Jetzt posten" ignores the automation kill switch.
      publishDeps.isEnabled = async () => true;
      const outcome = await retryInstagramPost(
        {
          publishDeps,
          getPostStatus: readStatus,
          deletePost: async (postId) => {
            await db.collection('instagram_posts').doc(postId).delete();
          },
          async getEvent(id) {
            const snap = await db.collection('events').doc(id).get();
            return snap.exists ? (snap.data() ?? null) : null;
          },
        },
        eventId,
        { force }
      );
      logger.info('Instagram post retried by admin', { eventId, force, outcome });
      return { outcome };
    } catch (err) {
      return toHttpsError(err);
    }
  }
);

// Publishes a region's already approved events (consent given, not past, no
// post record yet) in one bounded batch; call again until `remaining` is 0.
// Same Admin check as the other callables. Respects the global kill switch.
export const adminBackfillInstagramRegion = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
    ...appCheckOptions(),
  },
  async (request): Promise<BackfillResult> => {
    logMissingAppCheck('adminBackfillInstagramRegion', request);
    await assertAdmin(request.auth?.uid);
    const data = request.data as { regionId?: unknown; limit?: unknown } | null;
    const regionId = data?.regionId;
    if (!isValidRegionId(regionId)) {
      throw new HttpsError('invalid-argument', 'regionId is required.');
    }
    const db = getFirestore();
    const credentials = await resolveCredentialsForRegion(db, regionId, {
      accessToken: IG_ACCESS_TOKEN.value(),
      userId: IG_USER_ID.value(),
    });
    if (!credentials) {
      throw new HttpsError('failed-precondition', 'Instagram is not configured for this region.');
    }
    const limit = typeof data?.limit === 'number' ? data.limit : undefined;
    const result = await runRegionBackfill(db, regionId, credentials, { limit });
    logger.info('Instagram region backfill run by admin', { ...result });
    return result;
  }
);

export const adminSkipInstagramPost = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ outcome: 'skipped' }> => {
    logMissingAppCheck('adminSkipInstagramPost', request);
    await assertAdmin(request.auth?.uid);
    try {
      const eventId = assertEventId((request.data as { eventId?: unknown } | null)?.eventId);
      const col = getFirestore().collection('instagram_posts');
      const outcome = await skipInstagramPost(
        {
          getPostStatus: readStatus,
          async setSkipped(postId, skipReason) {
            await col
              .doc(postId)
              .update({ status: 'skipped', skipReason, updatedAt: FieldValue.serverTimestamp() });
          },
          async createSkipped(postId, record) {
            await col.doc(postId).set({
              ...record,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          },
        },
        eventId
      );
      logger.info('Instagram post skipped by admin', { eventId });
      return { outcome };
    } catch (err) {
      return toHttpsError(err);
    }
  }
);

// Moves a skipped post into the archive. The record stays in `instagram_posts`,
// and posting only creates a record when none exists, so an archived event is
// never posted again.
export const adminArchiveInstagramPost = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ outcome: 'archived' }> => {
    logMissingAppCheck('adminArchiveInstagramPost', request);
    await assertAdmin(request.auth?.uid);
    try {
      const eventId = assertEventId((request.data as { eventId?: unknown } | null)?.eventId);
      const col = getFirestore().collection('instagram_posts');
      const outcome = await archiveInstagramPost(
        {
          getPostStatus: readStatus,
          async setArchived(postId) {
            await col
              .doc(postId)
              .update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
          },
        },
        eventId
      );
      logger.info('Instagram post archived by admin', { eventId });
      return { outcome };
    } catch (err) {
      return toHttpsError(err);
    }
  }
);

// Dry run of the weekly carousels: same window, eligibility and caption as the
// Sunday job, but nothing is rendered, written or posted. No secrets needed.
export const adminPreviewWeeklyCarousels = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<CarouselPreview> => {
    logMissingAppCheck('adminPreviewWeeklyCarousels', request);
    await assertAdmin(request.auth?.uid);
    const db = getFirestore();
    return previewWeeklyCarousels({
      listEvents: (window) => listCarouselEvents(db, window),
      getOrganizerHandle: (ev) => lookupOrganizerHandle(db, ev),
      getPostStatus: readStatus,
    });
  }
);

// Posts the weekly carousels now instead of waiting for Sunday. Respects the
// kill switch and the one-post-per-Bezirk-and-week guard, so the Sunday job
// afterwards skips whatever was posted here.
export const adminPostWeeklyCarousels = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
    ...appCheckOptions(),
  },
  async (request): Promise<CarouselRunOutcome> => {
    logMissingAppCheck('adminPostWeeklyCarousels', request);
    await assertAdmin(request.auth?.uid);
    const db = getFirestore();
    const accessToken = await resolveInstagramAccessToken(db, IG_ACCESS_TOKEN.value());
    const userId = IG_USER_ID.value();
    if (!accessToken || !userId) {
      throw new HttpsError('failed-precondition', 'Instagram is not configured.');
    }
    const outcome = await runWeeklyCarousels(buildCarouselDeps(db, accessToken, userId));
    logger.info('Instagram weekly carousels posted by admin', outcome);
    return outcome;
  }
);

// Posts today's "Heute in <Bezirk>" story now. Respects the kill switch and the
// one-story-per-Bezirk-day-and-part guard, so calling it twice posts once.
export const adminPostDailyStory = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
    ...appCheckOptions(),
  },
  async (request): Promise<StoryRunOutcome> => {
    logMissingAppCheck('adminPostDailyStory', request);
    await assertAdmin(request.auth?.uid);
    const bezirk = (request.data as { bezirk?: unknown } | undefined)?.bezirk;
    if (typeof bezirk !== 'string' || !(CAROUSEL_BEZIRKE as readonly string[]).includes(bezirk)) {
      throw new HttpsError('invalid-argument', 'Unknown Bezirk.');
    }
    const db = getFirestore();
    const accessToken = await resolveInstagramAccessToken(db, IG_ACCESS_TOKEN.value());
    const userId = IG_USER_ID.value();
    if (!accessToken || !userId) {
      throw new HttpsError('failed-precondition', 'Instagram is not configured.');
    }
    const outcome = await runDailyStory(buildStoryDeps(db, accessToken, userId), bezirk);
    logger.info('Instagram daily story posted by admin', { bezirk, outcome });
    return outcome;
  }
);
