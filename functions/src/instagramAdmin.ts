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
  lookupTagHandles,
  resolveInstagramAccessToken,
} from './instagramDeps';
import {
  previewWeeklyCarousels,
  runWeeklyCarousels,
  type CarouselPreview,
  type CarouselRunOutcome,
} from './instagram/instagramCarousel';
import {
  carouselBezirkeFor,
  isScheduledInstagramRegion,
  regionOrDefault,
} from './instagram/instagramRegionConfig';
import { runDailyStory, type StoryRunOutcome } from './instagram/instagramStory';
import {
  AdminActionError,
  archiveInstagramPost,
  assertEventId,
  isCarouselPostId,
  retryCarouselPost,
  retryInstagramPost,
  skipInstagramPost,
} from './instagram/instagramAdminLogic';
import type { TriggerOutcome } from './instagram/instagramPublish';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { DEFAULT_REGION_ID, resolveRegionId } from './regions';
import { isValidRegionId, type BackfillResult } from './instagram/instagramRegionAccounts';
import { resolveCredentialsForRegion, runRegionBackfill } from './instagramRegionStore';
import { canResolveOutdatedPost } from './instagram/instagramPostUpdate';
import { parseStaffRole, readRoleDoc } from './staffRoles';

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

/**
 * Region of a carousel/story callable: missing = Vorarlberg (the admin UI sends
 * none); otherwise one of the regions whose carousel/stories are switched on.
 */
function assertScheduledRegion(value: unknown): string {
  if (value === undefined || value === null || value === '') return DEFAULT_REGION_ID;
  if (!isScheduledInstagramRegion(value)) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }
  return value;
}

/** Account for a region (Vorarlberg: legacy secrets); throws when there is none. */
async function requireRegionCredentials(regionId: string) {
  const credentials = await resolveCredentialsForRegion(getFirestore(), regionId, {
    accessToken: IG_ACCESS_TOKEN.value(),
    userId: IG_USER_ID.value(),
  });
  if (!credentials) {
    throw new HttpsError('failed-precondition', 'Instagram is not configured.');
  }
  return credentials;
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
      const posts = db.collection('instagram_posts');
      const deletePost = async (postId: string) => {
        await posts.doc(postId).delete();
      };
      if (isCarouselPostId(eventId)) {
        // Weekly carousel: post this one group again with the account of the
        // record's region (records without regionId are Vorarlberg's).
        const record = await posts.doc(eventId).get();
        const { accessToken, userId } = await requireRegionCredentials(
          regionOrDefault(record.get('regionId'))
        );
        const outcome = await retryCarouselPost(
          {
            ...buildCarouselDeps(db, accessToken, userId),
            getPostStatus: readStatus,
            async getPost(postId) {
              const snap = await posts.doc(postId).get();
              return snap.exists ? (snap.data() ?? null) : null;
            },
            deletePost,
          },
          eventId
        );
        logger.info('Instagram carousel retried by admin', { postId: eventId, outcome });
        return { outcome };
      }
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
          deletePost,
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
          deletePost: async (postId) => {
            await col.doc(postId).delete();
          },
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
          deletePost: async (postId) => {
            await col.doc(postId).delete();
          },
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
// Optional `regionId` (default Vorarlberg).
export const adminPreviewWeeklyCarousels = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<CarouselPreview> => {
    logMissingAppCheck('adminPreviewWeeklyCarousels', request);
    await assertAdmin(request.auth?.uid);
    const regionId = assertScheduledRegion(
      (request.data as { regionId?: unknown } | null)?.regionId
    );
    const db = getFirestore();
    return previewWeeklyCarousels(
      {
        listEvents: (window) => listCarouselEvents(db, window),
        getOrganizerHandle: (ev) => lookupOrganizerHandle(db, ev),
        getTagHandles: (ev) => lookupTagHandles(db, ev),
        getPostStatus: readStatus,
      },
      regionId
    );
  }
);

// Posts the weekly carousels of one region (optional `regionId`, default
// Vorarlberg) now instead of waiting for Sunday. Respects the kill switch and
// the one-post-per-Bezirk-and-week guard, so the Sunday job afterwards skips
// whatever was posted here.
export const adminPostWeeklyCarousels = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 1800,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
    ...appCheckOptions(),
  },
  async (request): Promise<CarouselRunOutcome> => {
    logMissingAppCheck('adminPostWeeklyCarousels', request);
    await assertAdmin(request.auth?.uid);
    const regionId = assertScheduledRegion(
      (request.data as { regionId?: unknown } | null)?.regionId
    );
    const db = getFirestore();
    const { accessToken, userId } = await requireRegionCredentials(regionId);
    const outcome = await runWeeklyCarousels(buildCarouselDeps(db, accessToken, userId), regionId);
    logger.info('Instagram weekly carousels posted by admin', { regionId, outcome });
    return outcome;
  }
);

// Posts today's "Heute in <Bezirk>" story now. Optional `regionId` (default
// Vorarlberg); `bezirk` must be one of that region's Bezirke. Respects the kill
// switch and the one-story-per-Bezirk-day-and-part guard, so calling it twice posts once.
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
    const data = request.data as { bezirk?: unknown; regionId?: unknown } | undefined;
    const regionId = assertScheduledRegion(data?.regionId);
    const bezirk = data?.bezirk;
    if (typeof bezirk !== 'string' || !carouselBezirkeFor(regionId).includes(bezirk)) {
      throw new HttpsError('invalid-argument', 'Unknown Bezirk.');
    }
    const db = getFirestore();
    const { accessToken, userId } = await requireRegionCredentials(regionId);
    const outcome = await runDailyStory(buildStoryDeps(db, accessToken, userId), bezirk, regionId);
    logger.info('Instagram daily story posted by admin', { regionId, bezirk, outcome });
    return outcome;
  }
);

// "Erledigt" in the review tab: the team pasted the new caption on Instagram,
// so the feed post is no longer outdated. Super-Admins, and moderators of the
// post's region (Trello 6af4ca87).
export const markInstagramPostUpdated = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ outcome: 'updated' | 'unchanged' }> => {
    logMissingAppCheck('markInstagramPostUpdated', request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    try {
      const eventId = assertEventId((request.data as { eventId?: unknown } | null)?.eventId);
      const ref = getFirestore().collection('instagram_posts').doc(`feed_${eventId}`);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError('not-found', 'Post not found.');
      const role = parseStaffRole(await readRoleDoc(uid));
      if (!canResolveOutdatedPost(role, snap.get('regionId'))) {
        throw new HttpsError('permission-denied', 'Not allowed for this region.');
      }
      if (snap.get('outdated') !== true) return { outcome: 'unchanged' };
      await ref.update({
        outdated: false,
        outdatedFields: null,
        captionBaseline: null,
        captionUpdatedBy: uid,
        captionUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.info('Instagram post marked as updated', { eventId, uid });
      return { outcome: 'updated' };
    } catch (err) {
      return toHttpsError(err);
    }
  }
);
