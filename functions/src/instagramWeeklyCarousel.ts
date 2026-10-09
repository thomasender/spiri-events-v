import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  renderCoverImage,
  renderEventImage,
  uploadInstagramImage,
} from './instagram/instagramImage';
import { normalizeInstagramHandle } from './instagram/instagramContent';
import { runWeeklyCarousels, type CarouselDeps } from './instagram/instagramCarousel';
import { getInstagramAccessToken } from './instagram/instagramToken';
import { readStoredInstagramToken } from './instagramTokenStore';
import { notifyAdmins, ADMIN_MAIL_SECRETS } from './adminNotify';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

export const instagramWeeklyCarousel = onSchedule(
  {
    schedule: '0 10 * * 0',
    timeZone: 'Europe/Vienna',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [IG_ACCESS_TOKEN, IG_USER_ID, ...ADMIN_MAIL_SECRETS],
  },
  async () => {
    const db = getFirestore();
    const bucket = getStorage().bucket() as never;

    // Respect the kill switch before touching secrets or the network.
    const settings = await db.doc('app_settings/instagram').get();
    if (!(settings.exists && settings.get('enabled') === true)) {
      logger.info('Instagram posting disabled via app_settings/instagram; skipping carousels');
      return;
    }

    const accessToken = await getInstagramAccessToken({
      secretToken: IG_ACCESS_TOKEN.value(),
      readStoredToken: () => readStoredInstagramToken(db),
      log: (message, data) => logger.info(message, data),
    });
    const userId = IG_USER_ID.value();
    if (!accessToken || !userId) {
      logger.warn('IG_ACCESS_TOKEN or IG_USER_ID is not configured; skipping carousels');
      return;
    }

    let colors: Record<string, string> | null = null;
    const loadColors = async () => {
      if (colors) return colors;
      const loaded: Record<string, string> = {};
      const categories = await db.collection('categories').get();
      categories.forEach((doc) => {
        const color = doc.get('color');
        const name = doc.get('name');
        if (typeof color === 'string' && typeof name === 'string') loaded[name] = color;
      });
      colors = loaded;
      return loaded;
    };

    const deps: CarouselDeps = {
      fetch,
      accessToken,
      userId,
      isEnabled: async () => true,
      async listEvents() {
        // A date-range query would miss recurring series, which store only their
        // first date. Load all approved events (single-field query, no composite
        // index); runWeeklyCarousels() expands the occurrences inside the window
        // and isCarouselEligible() filters consent and Bezirk.
        const snap = await db.collection('events').where('status', '==', 'approved').get();
        return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
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
        const uid = typeof ev.createdBy === 'string' ? ev.createdBy : '';
        if (!uid) return null;
        const snap = await db.doc(`users/${uid}`).get();
        return normalizeInstagramHandle(snap.get('socialMedia.instagram'));
      },
      async generateCoverImage(name, cover) {
        return uploadInstagramImage(bucket, name, await renderCoverImage(cover, 'carousel'));
      },
      async generateEventImage(name, ev) {
        const jpeg = await renderEventImage(ev, 'carousel', {
          categoryColors: await loadColors(),
        });
        return uploadInstagramImage(bucket, name, jpeg);
      },
      notifyAdmins,
      log: (message, data) => logger.info(message, data),
    };

    const outcome = await runWeeklyCarousels(deps);
    logger.info('Instagram weekly carousels processed', outcome);
  }
);
