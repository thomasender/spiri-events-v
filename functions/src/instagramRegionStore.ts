import { logger } from 'firebase-functions';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  backfillRegion,
  parseRegionAccount,
  regionAccountDocId,
  regionIdFromAccountDocId,
  resolveRegionCredentials,
  type BackfillCandidate,
  type BackfillResult,
  type Credentials,
  type RegionAccount,
  type RegionRefreshDeps,
} from './instagram/instagramRegionAccounts';
import { publishApprovedEvent } from './instagram/instagramPublish';
import { parseLaunchProgress, type LaunchDeps } from './instagram/instagramRegionLaunch';
import { buildPublishDeps, resolveInstagramAccessToken } from './instagramDeps';
import { notifyAdmins } from './adminNotify';

/** Firestore access for instagram_private/region_{id} (Admin SDK only). */

export async function readRegionAccount(
  db: Firestore,
  regionId: string
): Promise<RegionAccount | null> {
  const snap = await db.doc(`instagram_private/${regionAccountDocId(regionId)}`).get();
  return snap.exists ? parseRegionAccount(regionId, snap.data()) : null;
}

/** Credentials for a region: Vorarlberg via the legacy secrets, others via the region doc. */
export function resolveCredentialsForRegion(
  db: Firestore,
  regionId: string,
  legacySecrets: { accessToken: string; userId: string }
): Promise<Credentials | null> {
  return resolveRegionCredentials(
    {
      async legacy() {
        const accessToken = await resolveInstagramAccessToken(db, legacySecrets.accessToken);
        return accessToken && legacySecrets.userId
          ? { accessToken, userId: legacySecrets.userId }
          : null;
      },
      readRegionAccount: (id) => readRegionAccount(db, id),
      log: (message, data) => logger.warn(message, data),
    },
    regionId
  );
}

export function buildRegionRefreshDeps(db: Firestore): RegionRefreshDeps {
  const ref = (regionId: string) => db.doc(`instagram_private/${regionAccountDocId(regionId)}`);
  return {
    fetch,
    async listAccounts() {
      const snap = await db.collection('instagram_private').get();
      const accounts: RegionAccount[] = [];
      for (const doc of snap.docs) {
        const regionId = regionIdFromAccountDocId(doc.id);
        const account = regionId ? parseRegionAccount(regionId, doc.data()) : null;
        if (account) accounts.push(account);
      }
      return accounts;
    },
    async saveToken(regionId, token) {
      await ref(regionId).set(
        {
          accessToken: token.accessToken,
          expiresAt: Timestamp.fromDate(token.expiresAt),
          refreshedAt: Timestamp.fromDate(token.refreshedAt),
        },
        { merge: true }
      );
    },
    async writeStatus(regionId, patch) {
      const data: Record<string, unknown> = {};
      if (patch.tokenExpiresAt) data.tokenExpiresAt = Timestamp.fromDate(patch.tokenExpiresAt);
      if (patch.tokenRefreshedAt)
        data.tokenRefreshedAt = Timestamp.fromDate(patch.tokenRefreshedAt);
      if (patch.tokenRefreshError !== undefined) data.tokenRefreshError = patch.tokenRefreshError;
      if (Object.keys(data).length) await ref(regionId).set(data, { merge: true });
    },
    notifyAdmins,
    log: (message, data) => logger.info(message, data),
  };
}

/** Firestore wiring of the launch drip (pure logic: instagram/instagramRegionLaunch.ts). */
export function buildLaunchDeps(
  db: Firestore,
  regionId: string,
  credentials: Credentials
): LaunchDeps {
  const publishDeps = buildPublishDeps(db, credentials.userId);
  publishDeps.accessToken = credentials.accessToken;
  publishDeps.instagramRegionIds = [regionId];
  const ref = (id: string) => db.doc(`instagram_private/${regionAccountDocId(id)}`);
  return {
    isEnabled: publishDeps.isEnabled,
    async acquireLease(id, now, until) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(id));
        const lease = snap.get('launchLeaseUntil');
        const leaseUntil = lease && typeof lease.toDate === 'function' ? lease.toDate() : null;
        if (leaseUntil && leaseUntil.getTime() > now.getTime()) return null;
        tx.set(ref(id), { launchLeaseUntil: Timestamp.fromDate(until) }, { merge: true });
        return parseLaunchProgress(snap.data());
      });
    },
    async releaseLease(id) {
      await ref(id).set({ launchLeaseUntil: null }, { merge: true });
    },
    async saveProgress(id, patch) {
      const data: Record<string, unknown> = {};
      if (patch.startedAt) data.launchStartedAt = Timestamp.fromDate(patch.startedAt);
      if (patch.eventIds) data.launchEventIds = patch.eventIds;
      if (patch.total !== undefined) data.launchTotal = patch.total;
      if (patch.cursor !== undefined) data.launchCursor = patch.cursor;
      if (patch.posted !== undefined) data.launchPosted = patch.posted;
      if (patch.finishedAt) data.launchFinishedAt = Timestamp.fromDate(patch.finishedAt);
      if (patch.remaining !== undefined) data.launchRemaining = patch.remaining;
      if (Object.keys(data).length) await ref(id).set(data, { merge: true });
    },
    async listCandidates(id) {
      const snap = await db
        .collection('events')
        .where('status', '==', 'approved')
        .where('instagramConsent', '==', true)
        .where('regionId', '==', id)
        .get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    existingPostEventIds: (ids) => existingFeedPostIds(db, ids),
    async getEvent(eventId) {
      const snap = await db.collection('events').doc(eventId).get();
      return snap.exists ? (snap.data() ?? null) : null;
    },
    publish: (eventId, before, after) => publishApprovedEvent(publishDeps, eventId, before, after),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message, data) => logger.info(message, data),
  };
}

/** Ids (of `ids`) that already have an instagram_posts/feed_{id} doc. */
async function existingFeedPostIds(db: Firestore, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db.doc(`instagram_posts/feed_${id}`));
    if (!refs.length) continue;
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, idx) => {
      if (s.exists) found.add(ids[i + idx]);
    });
  }
  return found;
}

/** Runs one bounded backfill batch for a region that has usable credentials. */
export async function runRegionBackfill(
  db: Firestore,
  regionId: string,
  credentials: Credentials,
  options: { limit?: number } = {}
): Promise<BackfillResult> {
  const publishDeps = buildPublishDeps(db, credentials.userId);
  publishDeps.accessToken = credentials.accessToken;
  publishDeps.instagramRegionIds = [regionId];
  return backfillRegion(
    {
      async listCandidates(id): Promise<BackfillCandidate[]> {
        // Equality filters only: served by the automatic single-field indexes.
        const snap = await db
          .collection('events')
          .where('status', '==', 'approved')
          .where('instagramConsent', '==', true)
          .where('regionId', '==', id)
          .get();
        return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      },
      existingPostEventIds: (ids) => existingFeedPostIds(db, ids),
      publish: (eventId, before, after) =>
        publishApprovedEvent(publishDeps, eventId, before, after),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message, data) => logger.info(message, data),
    },
    regionId,
    options
  );
}
