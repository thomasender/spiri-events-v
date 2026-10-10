import { logger } from 'firebase-functions';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { generateAndStoreEventImage } from './instagram/instagramImage';
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
