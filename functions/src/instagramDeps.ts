import { logger } from 'firebase-functions';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  generateAndStoreEventImage,
  renderCoverImage,
  renderEventImage,
  uploadInstagramImage,
} from './instagram/instagramImage';
import type { CarouselDeps } from './instagram/instagramCarousel';
import { normalizeInstagramHandle } from './instagram/instagramContent';
import type { PublishDeps } from './instagram/instagramPublish';
import { getInstagramAccessToken } from './instagram/instagramToken';
import { readStoredInstagramToken } from './instagramTokenStore';
import { notifyAdmins } from './adminNotify';

/**
 * Shared PublishDeps construction for the approval trigger and the admin
 * callables (retry). accessToken starts empty; call resolveInstagramAccessToken
 * once the cheap gates have passed.
 */
export function buildPublishDeps(db: Firestore, userId: string): PublishDeps {
  return {
    fetch,
    accessToken: '',
    userId,
    async isEnabled() {
      const snap = await db.doc('app_settings/instagram').get();
      return snap.exists && snap.get('enabled') === true;
    },
    async createPost(id, record) {
      try {
        await db
          .collection('instagram_posts')
          .doc(id)
          .create({
            ...record,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        return true;
      } catch (err) {
        // gRPC ALREADY_EXISTS
        if ((err as { code?: unknown }).code === 6) return false;
        throw err;
      }
    },
    async updatePost(id, patch) {
      await db
        .collection('instagram_posts')
        .doc(id)
        .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
    },
    async getOrganizerHandle(ev) {
      // Event-level override typed in the create form wins over the profile.
      const override = normalizeInstagramHandle(ev.instagramHandleOverride);
      if (override) return override;
      const uid = typeof ev.createdBy === 'string' ? ev.createdBy : '';
      if (!uid) return null;
      const snap = await db.doc(`users/${uid}`).get();
      return normalizeInstagramHandle(snap.get('socialMedia.instagram'));
    },
    async generateImage(id, ev) {
      const colors: Record<string, string> = {};
      const categories = await db.collection('categories').get();
      categories.forEach((doc) => {
        const color = doc.get('color');
        const name = doc.get('name');
        if (typeof color === 'string' && typeof name === 'string') colors[name] = color;
      });
      return generateAndStoreEventImage(getStorage().bucket() as never, `feed_${id}`, ev, 'feed', {
        categoryColors: colors,
      });
    },
    notifyAdmins,
    log: (message, data) => logger.info(message, data),
  };
}

/** The secret stays the fallback until the refresh job stored a newer token. */
export function resolveInstagramAccessToken(db: Firestore, secretToken: string): Promise<string> {
  return getInstagramAccessToken({
    secretToken,
    readStoredToken: () => readStoredInstagramToken(db),
    log: (message, data) => logger.info(message, data),
  });
}

async function loadCategoryColors(db: Firestore): Promise<Record<string, string>> {
  const colors: Record<string, string> = {};
  const categories = await db.collection('categories').get();
  categories.forEach((doc) => {
    const color = doc.get('color');
    const name = doc.get('name');
    if (typeof color === 'string' && typeof name === 'string') colors[name] = color;
  });
  return colors;
}

/** Organizer handle: event-level override wins over the profile handle. */
export async function lookupOrganizerHandle(
  db: Firestore,
  ev: { instagramHandleOverride?: unknown; createdBy?: unknown }
): Promise<string | null> {
  const override = normalizeInstagramHandle(ev.instagramHandleOverride);
  if (override) return override;
  const uid = typeof ev.createdBy === 'string' ? ev.createdBy : '';
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return normalizeInstagramHandle(snap.get('socialMedia.instagram'));
}

/** Events whose start date lies in the window; eligibility is checked by the logic. */
export async function listCarouselEvents(db: Firestore, window: { start: string; end: string }) {
  // Single-field range query (no composite index); status, consent and
  // Bezirk are filtered by isCarouselEligible().
  const snap = await db
    .collection('events')
    .where('date', '>=', window.start)
    .where('date', '<=', window.end)
    .get();
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

/**
 * CarouselDeps shared by the weekly schedule and the admin "post now" callable.
 * isEnabled reads the kill switch; the caller supplies the resolved token.
 */
export function buildCarouselDeps(
  db: Firestore,
  accessToken: string,
  userId: string
): CarouselDeps {
  const bucket = getStorage().bucket() as never;
  let colors: Record<string, string> | null = null;
  const loadColors = async () => (colors ??= await loadCategoryColors(db));

  return {
    fetch,
    accessToken,
    userId,
    async isEnabled() {
      const snap = await db.doc('app_settings/instagram').get();
      return snap.exists && snap.get('enabled') === true;
    },
    listEvents: (window) => listCarouselEvents(db, window),
    async createPost(id, record) {
      try {
        await db
          .collection('instagram_posts')
          .doc(id)
          .create({
            ...record,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        return true;
      } catch (err) {
        // gRPC ALREADY_EXISTS
        if ((err as { code?: unknown }).code === 6) return false;
        throw err;
      }
    },
    async updatePost(id, patch) {
      await db
        .collection('instagram_posts')
        .doc(id)
        .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
    },
    getOrganizerHandle: (ev) => lookupOrganizerHandle(db, ev),
    async generateCoverImage(name, cover) {
      return uploadInstagramImage(bucket, name, await renderCoverImage(cover, 'carousel'));
    },
    async generateEventImage(name, ev) {
      const jpeg = await renderEventImage(ev, 'carousel', { categoryColors: await loadColors() });
      return uploadInstagramImage(bucket, name, jpeg);
    },
    notifyAdmins,
    log: (message, data) => logger.info(message, data),
  };
}
