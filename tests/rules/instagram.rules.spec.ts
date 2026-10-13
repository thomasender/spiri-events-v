import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
    await setDoc(doc(db, 'instagram_posts/p1'), { eventId: 'e1' });
    await setDoc(doc(db, 'instagram_private/token'), { accessToken: 'secret' });
    await setDoc(doc(db, 'calendarFeedTokens/owner'), { token: 'secret', createdAt: 1 });
    await setDoc(doc(db, 'app_settings/instagram'), {
      enabled: false,
      updatedAt: 1,
      updatedBy: 'x',
      tokenExpiresAt: 2,
      tokenRefreshedAt: 3,
      tokenRefreshError: null,
    });
    await setDoc(doc(db, 'app_settings/theme'), { createdBy: 'system' });
    await setDoc(doc(db, 'app_settings/last_build'), { at: 1 });
    await setDoc(doc(db, 'events/ev1'), {
      createdBy: 'owner',
      status: 'draft',
      description: 'd',
    });
    await setDoc(doc(db, 'users/owner'), {
      displayName: 'Owner',
      bio: 'b',
    });
  });
});

// Both ways the rules accept an admin: token claim, or admin_users/{uid} doc.
const adminVariants = {
  'admin (token claim)': () => env.authenticatedContext('adminTok', { role: 'Admin' }),
  'admin (admin_users doc)': () => env.authenticatedContext('adminDoc'),
};
const anon = () => env.unauthenticatedContext();
const user = () => env.authenticatedContext('someUser', { email_verified: true });

describe('instagram_posts', () => {
  it('anonymous and normal users cannot read or write', async () => {
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'instagram_posts/p1')));
      await assertFails(setDoc(doc(db, 'instagram_posts/new'), { a: 1 }));
    }
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('can read', async () => {
      await assertSucceeds(getDoc(doc(make().firestore(), 'instagram_posts/p1')));
    });
    it('cannot create, update or delete', async () => {
      const db = make().firestore();
      await assertFails(setDoc(doc(db, 'instagram_posts/new'), { a: 1 }));
      await assertFails(updateDoc(doc(db, 'instagram_posts/p1'), { a: 1 }));
      await assertFails(deleteDoc(doc(db, 'instagram_posts/p1')));
    });
  });
});

describe('app_settings/instagram', () => {
  it('non-admin cannot read or write', async () => {
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'app_settings/instagram')));
      await assertFails(updateDoc(doc(db, 'app_settings/instagram'), { enabled: true }));
      await assertFails(setDoc(doc(db, 'app_settings/instagram'), { enabled: true }));
    }
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('can read', async () => {
      await assertSucceeds(getDoc(doc(make().firestore(), 'app_settings/instagram')));
    });

    it('can toggle enabled on a doc holding server-owned fields', async () => {
      const db = make().firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'app_settings/instagram'), {
          enabled: true,
          updatedAt: 5,
          updatedBy: 'admin',
        })
      );
    });

    it('update rejects extra keys and non-bool enabled', async () => {
      const db = make().firestore();
      await assertFails(updateDoc(doc(db, 'app_settings/instagram'), { enabled: true, extra: 1 }));
      await assertFails(
        updateDoc(doc(db, 'app_settings/instagram'), { tokenRefreshError: 'client wrote this' })
      );
      await assertFails(updateDoc(doc(db, 'app_settings/instagram'), { enabled: 'yes' }));
    });

    it('create accepts only enabled/updatedAt/updatedBy with bool enabled', async () => {
      await env.withSecurityRulesDisabled((ctx) =>
        deleteDoc(doc(ctx.firestore(), 'app_settings/instagram'))
      );
      const db = make().firestore();
      const ref = doc(db, 'app_settings/instagram');
      await assertFails(setDoc(ref, { enabled: true, extra: 1 }));
      await assertFails(setDoc(ref, { enabled: 'true' }));
      await assertSucceeds(setDoc(ref, { enabled: true, updatedAt: 1, updatedBy: 'a' }));
    });
  });
});

describe('instagram_private', () => {
  it('nobody can read or write, admins included', async () => {
    const ctxs = [anon(), user(), ...Object.values(adminVariants).map((m) => m())];
    for (const ctx of ctxs) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'instagram_private/token')));
      await assertFails(setDoc(doc(db, 'instagram_private/token'), { accessToken: 'x' }));
      await assertFails(setDoc(doc(db, 'instagram_private/new'), { accessToken: 'x' }));
    }
  });
});

describe('calendarFeedTokens', () => {
  it('nobody can read, list or write, not even the owner or admins', async () => {
    const owner = env.authenticatedContext('owner', { email_verified: true });
    const ctxs = [anon(), user(), owner, ...Object.values(adminVariants).map((m) => m())];
    for (const ctx of ctxs) {
      const db = ctx.firestore();
      const ref = doc(db, 'calendarFeedTokens/owner');
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, 'calendarFeedTokens')));
      await assertFails(setDoc(ref, { token: 'x' }));
      await assertFails(updateDoc(ref, { token: 'x' }));
      await assertFails(deleteDoc(ref));
    }
  });
});

describe('other app_settings stay public', () => {
  it('theme and last_build are readable without auth', async () => {
    const db = anon().firestore();
    await assertSucceeds(getDoc(doc(db, 'app_settings/theme')));
    await assertSucceeds(getDoc(doc(db, 'app_settings/last_build')));
  });
});

describe('events.instagramConsent', () => {
  const base = { createdBy: 'owner', status: 'draft', description: 'd' };
  const owner = () => env.authenticatedContext('owner', { email_verified: true });

  it('create: bool or absent OK, non-bool rejected', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'events/n1'), { ...base, instagramConsent: true }));
    await assertSucceeds(setDoc(doc(db, 'events/n2'), base));
    await assertFails(setDoc(doc(db, 'events/n3'), { ...base, instagramConsent: 'yes' }));
    await assertFails(setDoc(doc(db, 'events/n4'), { ...base, instagramConsent: 1 }));
  });

  it('update: bool OK, non-bool rejected', async () => {
    const db = owner().firestore();
    await assertSucceeds(updateDoc(doc(db, 'events/ev1'), { instagramConsent: false }));
    await assertFails(updateDoc(doc(db, 'events/ev1'), { instagramConsent: 'yes' }));
  });
});

// Moderation: an owner (any user with a verified e-mail) must not be able to
// publish their own event with a direct write. Each allowed case mirrors a
// write the app makes (src/hooks/useEvents.js, EventForm, utils/trashUpdates,
// utils/customSeriesUpdates).
describe('events: owners cannot approve their own events', () => {
  const owner = () => env.authenticatedContext('owner', { email_verified: true });
  const seed = (id: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `events/${id}`), {
        createdBy: 'owner',
        description: 'd',
        title: 'T',
        slug: 't-sonstiges-20261101',
        ...data,
      })
    );
  const ownerRef = (id: string) => doc(owner().firestore(), `events/${id}`);

  describe('attack: denied', () => {
    it.each(['draft', 'pending', 'trashed'])('%s -> approved', async (from) => {
      await seed('e', { status: from });
      await assertFails(updateDoc(ownerRef('e'), { status: 'approved' }));
    });

    it('pending -> approved with the bookkeeping the admin flow writes', async () => {
      await seed('e', { status: 'pending' });
      await assertFails(
        updateDoc(ownerRef('e'), { status: 'approved', approvedBy: 'owner', approvedAt: 1 })
      );
    });

    it('creating an event directly as approved', async () => {
      await assertFails(
        setDoc(ownerRef('new'), { createdBy: 'owner', description: 'd', status: 'approved' })
      );
    });

    it('faking review fields, also on an already approved event', async () => {
      for (const status of ['pending', 'approved']) {
        await seed('e', { status, approvedBy: 'adminDoc', approvedAt: 1 });
        for (const patch of [
          { approvedBy: 'owner' },
          { approvedAt: 2 },
          { unpublishedBy: 'owner' },
          { unpublishedAt: 2 },
          { slug: 'someone-elses-event' },
          { createdBy: 'mallory' },
          { trashReason: 'fake admin reason' },
          { trashedBy: 'adminDoc' },
        ]) {
          await assertFails(updateDoc(ownerRef('e'), patch));
        }
      }
    });

    it('trashing with a fake admin reason', async () => {
      await seed('e', { status: 'pending' });
      await assertFails(
        updateDoc(ownerRef('e'), {
          status: 'trashed',
          trashedAt: 1,
          trashedBy: 'owner',
          trashReason: 'Spam',
        })
      );
    });

    it('changing the content of an event that stays approved', async () => {
      for (const patch of [
        { title: 'Neuer Titel' },
        { description: '<p>anders</p>' },
        { date: '2026-12-24' },
        { place: 'Woanders' },
        { link: 'https://evil.example' },
        { organizer: { firstName: 'X', lastName: 'Y', email: 'x@y' } },
        { category: 'Yoga' },
        { title: 'Neuer Titel', instagramConsent: true },
        { recurrence: 'weekly' },
      ]) {
        await seed('e', { status: 'approved', approvedBy: 'adminDoc', approvedAt: 1 });
        await assertFails(updateDoc(ownerRef('e'), { ...patch, status: 'approved', updatedAt: 1 }));
        await assertFails(updateDoc(ownerRef('e'), patch));
      }
    });

    it('adding series dates to an approved event', async () => {
      await seed('e', {
        status: 'approved',
        recurrence: 'custom',
        customDates: ['2026-11-01'],
        recurrenceEndDate: '2026-12-31',
      });
      await assertFails(updateDoc(ownerRef('e'), { customDates: ['2026-11-01', '2026-11-15'] }));
      await assertFails(updateDoc(ownerRef('e'), { recurrenceEndDate: '2027-06-30' }));
      await assertFails(updateDoc(ownerRef('e'), { recurrenceEndDate: '' }));
    });

    it('other verified users cannot touch the event at all', async () => {
      await seed('e', { status: 'pending' });
      const db = env.authenticatedContext('mallory', { email_verified: true }).firestore();
      await assertFails(updateDoc(doc(db, 'events/e'), { status: 'draft' }));
    });
  });

  describe('legitimate owner writes: allowed', () => {
    it('creates as draft or pending', async () => {
      const base = { createdBy: 'owner', description: 'd' };
      await assertSucceeds(setDoc(ownerRef('n1'), { ...base, status: 'draft' }));
      await assertSucceeds(setDoc(ownerRef('n2'), { ...base, status: 'pending' }));
    });

    it('submits a draft for review and takes it back (draft <-> pending)', async () => {
      await seed('e', { status: 'draft' });
      await assertSucceeds(updateDoc(ownerRef('e'), { status: 'pending', updatedAt: 1 }));
      await assertSucceeds(updateDoc(ownerRef('e'), { status: 'draft', updatedAt: 2 }));
    });

    it('edits a draft / pending event and keeps its status', async () => {
      for (const status of ['draft', 'pending']) {
        await seed('e', { status });
        await assertSucceeds(
          updateDoc(ownerRef('e'), { title: 'New', description: 'x', status, updatedAt: 1 })
        );
      }
    });

    it('re-submits an edited approved event (approved -> pending), or saves it as draft', async () => {
      for (const target of ['pending', 'draft']) {
        await seed('e', { status: 'approved', approvedBy: 'adminDoc', approvedAt: 1 });
        await assertSucceeds(
          updateDoc(ownerRef('e'), { title: 'New', status: target, updatedAt: 1 })
        );
      }
    });

    it('keeps an approved event approved for Instagram-only edits (EventForm payload)', async () => {
      await seed('e', { status: 'approved', approvedBy: 'adminDoc', approvedAt: 1 });
      await assertSucceeds(
        updateDoc(ownerRef('e'), {
          status: 'approved',
          instagramConsent: true,
          instagramHandleOverride: 'my_handle',
          instagramImage: { url: 'https://x/y.jpg', focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 },
          updatedAt: 1,
        })
      );
      // Unchanged content fields sent along do not count as a change.
      await assertSucceeds(
        updateDoc(ownerRef('e'), { title: 'T', description: 'd', instagramConsent: false })
      );
      // Instagram photo uploaded after the save, and consent withdrawn.
      await assertSucceeds(
        updateDoc(ownerRef('e'), { instagramImage: { url: 'https://x/up.jpg' }, updatedAt: 2 })
      );
      await assertSucceeds(
        updateDoc(ownerRef('e'), { instagramConsent: false, status: 'approved', updatedAt: 3 })
      );
    });

    it('cuts a weekly approved series short and adds exception dates', async () => {
      for (const before of ['', '2026-12-31']) {
        await seed('e', {
          status: 'approved',
          recurrence: 'weekly',
          date: '2026-11-01',
          recurrenceEndDate: before,
        });
        await assertSucceeds(
          updateDoc(ownerRef('e'), { exceptionDates: arrayUnion('2026-11-08'), updatedAt: 1 })
        );
        await assertSucceeds(
          updateDoc(ownerRef('e'), { recurrenceEndDate: '2026-11-21', updatedAt: 2 })
        );
      }
    });

    it('sets image focal point and zoom on an approved event', async () => {
      await seed('e', { status: 'approved', imageUrl: 'https://x/a.jpg' });
      await assertSucceeds(
        updateDoc(ownerRef('e'), {
          imageUrl: 'https://x/b.jpg',
          imageFocalPoint: { x: 0.2, y: 0.8 },
          imageZoom: 1.5,
          updatedAt: 1,
        })
      );
    });

    it('patches series exceptions and images on an approved event without touching status', async () => {
      await seed('e', {
        status: 'approved',
        recurrence: 'custom',
        customDates: ['2026-11-01', '2026-11-08'],
      });
      await assertSucceeds(
        updateDoc(ownerRef('e'), {
          customDates: ['2026-11-01'],
          exceptionDates: ['2026-11-08'],
          updatedAt: 1,
        })
      );
      await assertSucceeds(updateDoc(ownerRef('e'), { imageUrl: 'https://x/new.jpg' }));
      await assertSucceeds(
        updateDoc(ownerRef('e'), { instagramImage: { url: 'https://x/ig.jpg' } })
      );
    });

    it('trashes (from any status) and restores to draft', async () => {
      for (const status of ['draft', 'pending', 'approved']) {
        await seed('e', { status });
        await assertSucceeds(
          updateDoc(ownerRef('e'), {
            status: 'trashed',
            trashedAt: 1,
            trashedBy: 'owner',
            trashReason: null,
            updatedAt: 1,
          })
        );
        await assertSucceeds(
          updateDoc(ownerRef('e'), {
            status: 'draft',
            trashedAt: null,
            trashedBy: null,
            trashReason: null,
            updatedAt: 2,
          })
        );
      }
    });

    it('restores an event an admin trashed with a reason (reason is cleared)', async () => {
      await seed('e', {
        status: 'trashed',
        trashedBy: 'adminDoc',
        trashReason: 'Spam',
        trashedAt: 1,
      });
      await assertSucceeds(
        updateDoc(ownerRef('e'), {
          status: 'draft',
          trashedAt: null,
          trashedBy: null,
          trashReason: null,
          updatedAt: 2,
        })
      );
    });

    it('deletes the event permanently', async () => {
      await seed('e', { status: 'trashed' });
      await assertSucceeds(deleteDoc(ownerRef('e')));
    });
  });

  describe.each(Object.entries(adminVariants))('%s (unchanged)', (_n, make) => {
    const adminRef = (id: string) => doc(make().firestore(), `events/${id}`);

    it('approves a pending event of another user, with bookkeeping and slug variant', async () => {
      await seed('e', { status: 'pending' });
      await assertSucceeds(
        updateDoc(adminRef('e'), {
          status: 'approved',
          approvedBy: 'adminDoc',
          approvedAt: 1,
          slug: 't-sonstiges-20261101-2',
          updatedAt: 1,
        })
      );
    });

    it("edits the content of another user's approved event and keeps it approved", async () => {
      await seed('e', { status: 'approved' });
      await assertSucceeds(
        updateDoc(adminRef('e'), { title: 'Korrigiert', status: 'approved', updatedAt: 1 })
      );
    });

    it('unpublishes, trashes with a reason and restores', async () => {
      await seed('e', { status: 'approved' });
      await assertSucceeds(
        updateDoc(adminRef('e'), { status: 'draft', unpublishedBy: 'adminDoc', unpublishedAt: 1 })
      );
      await assertSucceeds(
        updateDoc(adminRef('e'), {
          status: 'trashed',
          trashedBy: 'adminDoc',
          trashedAt: 1,
          trashReason: 'Spam',
        })
      );
      await assertSucceeds(
        updateDoc(adminRef('e'), { status: 'draft', trashedBy: null, trashReason: null })
      );
    });

    it('approves an event the admin created themselves', async () => {
      await env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), 'events/own'), {
          createdBy: 'adminDoc',
          description: 'd',
          status: 'pending',
        })
      );
      await assertSucceeds(
        updateDoc(adminRef('own'), { status: 'approved', approvedBy: 'adminDoc', approvedAt: 1 })
      );
    });
  });
});

describe('events: cancelling an event or single dates (Abgesagt)', () => {
  const owner = () => env.authenticatedContext('owner', { email_verified: true });
  const seed = (data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'events/c'), {
        createdBy: 'owner',
        description: 'd',
        title: 'T',
        slug: 't-sonstiges-20261101',
        status: 'approved',
        approvedBy: 'adminDoc',
        approvedAt: 1,
        recurrence: 'weekly',
        date: '2026-11-01',
        ...data,
      })
    );
  const ref = (ctx = owner()) => doc(ctx.firestore(), 'events/c');

  it('owner cancels and un-cancels the whole approved event, which stays approved', async () => {
    await seed({});
    await assertSucceeds(updateDoc(ref(), { cancelled: true, updatedAt: 1 }));
    await assertSucceeds(updateDoc(ref(), { cancelled: false, updatedAt: 2 }));
  });

  it('owner cancels and un-cancels single dates of an approved series', async () => {
    await seed({});
    await assertSucceeds(
      updateDoc(ref(), { cancelledDates: arrayUnion('2026-11-08'), updatedAt: 1 })
    );
    await assertSucceeds(
      updateDoc(ref(), { cancelledDates: arrayUnion('2026-11-15'), updatedAt: 2 })
    );
    await assertSucceeds(updateDoc(ref(), { cancelledDates: ['2026-11-15'], updatedAt: 3 }));
  });

  it('rejects malformed cancellation fields', async () => {
    await seed({});
    await assertFails(updateDoc(ref(), { cancelled: 'yes' }));
    await assertFails(updateDoc(ref(), { cancelledDates: '2026-11-08' }));
    await assertFails(updateDoc(ref(), { cancelledDates: [42] }));
  });

  it('attack: cancelling does not open the door to content changes', async () => {
    await seed({});
    await assertFails(updateDoc(ref(), { cancelled: true, title: 'Neuer Titel' }));
    await assertFails(
      updateDoc(ref(), { cancelledDates: ['2026-11-08'], date: '2026-12-24', updatedAt: 1 })
    );
  });

  it('attack: other users and visitors cannot cancel', async () => {
    await seed({});
    await assertFails(
      updateDoc(ref(env.authenticatedContext('mallory', { email_verified: true })), {
        cancelled: true,
      })
    );
    await assertFails(updateDoc(ref(anon()), { cancelledDates: ['2026-11-08'] }));
  });

  it('admins can cancel too', async () => {
    await seed({});
    for (const make of Object.values(adminVariants)) {
      await assertSucceeds(updateDoc(ref(make()), { cancelled: true }));
    }
  });
});

describe('users.notifyOnFavoriteCancelled', () => {
  it('owner can switch the favorite-cancelled e-mail off and on', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/owner'), { notifyOnFavoriteCancelled: false }));
    await assertSucceeds(updateDoc(doc(db, 'users/owner'), { notifyOnFavoriteCancelled: true }));
  });
});

describe('users.instagramConsentDefault', () => {
  it('owner can set a bool, not a non-bool', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/owner'), { instagramConsentDefault: true }));
    await assertFails(updateDoc(doc(db, 'users/owner'), { instagramConsentDefault: 'true' }));
  });

  it('owner can create the profile with a bool, not a non-bool', async () => {
    const db = env.authenticatedContext('fresh').firestore();
    const profile = { displayName: 'F', bio: 'b' };
    await assertFails(setDoc(doc(db, 'users/fresh'), { ...profile, instagramConsentDefault: 'x' }));
    await assertSucceeds(
      setDoc(doc(db, 'users/fresh'), { ...profile, instagramConsentDefault: false })
    );
  });

  it('other users cannot write it', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(updateDoc(doc(db, 'users/owner'), { instagramConsentDefault: true }));
  });
});

describe('users/{uid}/favorites', () => {
  const fav = (uid: string) =>
    doc(env.authenticatedContext(uid).firestore(), `users/owner/favorites/ev1`);

  it('owner can add, read and remove a favorite', async () => {
    const ref = fav('owner');
    await assertSucceeds(setDoc(ref, { createdAt: 1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('only a createdAt field is accepted', async () => {
    await assertFails(setDoc(fav('owner'), { createdAt: 1, note: 'x' }));
  });

  it('other users and visitors cannot read or write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/owner/favorites/ev1'), { createdAt: 1 });
    });
    await assertFails(getDoc(fav('mallory')));
    await assertFails(setDoc(fav('mallory'), { createdAt: 1 }));
    await assertFails(deleteDoc(fav('mallory')));
    const anonRef = doc(env.unauthenticatedContext().firestore(), 'users/owner/favorites/ev1');
    await assertFails(getDoc(anonRef));
  });
});

describe('regions', () => {
  const validRegion = {
    name: 'Tirol',
    slug: 'tirol',
    order: 1,
    active: false,
    bezirke: [],
    contactEmail: '',
    seo: { title: 't', description: 'd' },
    timezone: 'Europe/Vienna',
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'regions/vorarlberg'), {
        ...validRegion,
        slug: 'vorarlberg',
      });
    });
  });

  it('anonymous visitors can read', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), 'regions/vorarlberg')));
    await assertSucceeds(getDocs(collection(anon().firestore(), 'regions')));
  });

  it('non-admins cannot write or delete', async () => {
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore();
      await assertFails(setDoc(doc(db, 'regions/tirol'), validRegion));
      await assertFails(updateDoc(doc(db, 'regions/vorarlberg'), { active: false }));
      await assertFails(deleteDoc(doc(db, 'regions/vorarlberg')));
    }
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('can create, update and delete a valid region', async () => {
      const db = make().firestore();
      await assertSucceeds(setDoc(doc(db, 'regions/tirol'), validRegion));
      await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { active: true }));
      await assertSucceeds(deleteDoc(doc(db, 'regions/tirol')));
    });

    it('can create the national region', async () => {
      await assertSucceeds(
        setDoc(doc(make().firestore(), 'regions/oesterreich'), {
          ...validRegion,
          name: 'Österreich',
          slug: 'oesterreich',
        })
      );
    });

    it('rejects a slug outside the fixed list', async () => {
      const db = make().firestore();
      await assertFails(setDoc(doc(db, 'regions/bayern'), { ...validRegion, slug: 'bayern' }));
    });

    it('rejects a slug that differs from the doc id', async () => {
      await assertFails(setDoc(doc(make().firestore(), 'regions/wien'), validRegion));
    });

    it('rejects unknown fields', async () => {
      const db = make().firestore();
      await assertFails(setDoc(doc(db, 'regions/tirol'), { ...validRegion, extra: 1 }));
      await assertFails(updateDoc(doc(db, 'regions/vorarlberg'), { extra: 1 }));
    });
  });
});

describe('events.regionId', () => {
  const owner = () => env.authenticatedContext('owner', { email_verified: true });
  // What EventForm / the wizard send on create and on a full edit.
  const formPayload = {
    title: 'T',
    date: '2026-11-02',
    time: '10:00',
    endTime: '',
    endDate: '',
    place: 'P',
    contribution: 'free',
    fee: null,
    feeMax: null,
    priceCurrency: null,
    feeNote: '',
    description: 'd',
    link: '',
    recurrence: 'weekly',
    recurrenceEndDate: '2026-12-31',
    customDates: [],
    category: 'Yoga',
    bezirk: 'Bregenz',
    isOnline: false,
    organizer: { firstName: 'A', lastName: 'B', email: 'a@b.c', photoURL: null },
    kontakt: 'k',
    instagramConsent: false,
    imageUrl: null,
    imageFocalPoint: null,
    imageZoom: null,
  };
  const createPayload = (extra: Record<string, unknown> = {}) => ({
    ...formPayload,
    slug: 's',
    status: 'pending',
    createdBy: 'owner',
    createdAt: serverTimestamp(),
    ...extra,
  });

  // Every partial update the app sends to an existing event.
  const partialUpdates: Record<string, () => Record<string, unknown>> = {
    'submit for review': () => ({ status: 'pending', updatedAt: serverTimestamp() }),
    'revert to draft': () => ({ status: 'draft', updatedAt: serverTimestamp() }),
    trash: () => ({
      status: 'trashed',
      trashedAt: serverTimestamp(),
      trashedBy: 'owner',
      trashReason: null,
      updatedAt: serverTimestamp(),
    }),
    restore: () => ({
      status: 'draft',
      trashedAt: null,
      trashedBy: null,
      trashReason: null,
      updatedAt: serverTimestamp(),
    }),
    'series exception': () => ({ exceptionDates: arrayUnion('2026-11-09') }),
    'series end': () => ({ recurrenceEndDate: '2026-11-20' }),
    'custom series dates': () => ({ customDates: ['2026-11-02'], exceptionDates: [] }),
    'image patch': () => ({ imageUrl: 'https://x/y.jpg', imageFocalPoint: { x: 0.2, y: 0.3 } }),
    'instagram image patch': () => ({ instagramImage: { url: 'https://x/y.jpg', zoom: 1 } }),
  };
  const adminOnlyUpdates: Record<string, () => Record<string, unknown>> = {
    approve: () => ({
      slug: 's-2',
      status: 'approved',
      approvedBy: 'adminDoc',
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    unpublish: () => ({
      status: 'draft',
      unpublishedBy: 'adminDoc',
      unpublishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    'category rename': () => ({ category: 'Yoga Neu', updatedAt: serverTimestamp() }),
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const stored = { ...formPayload, slug: 's', status: 'approved', createdBy: 'owner' };
      await setDoc(doc(db, 'events/legacy'), stored);
      await setDoc(doc(db, 'events/tirolEv'), { ...stored, regionId: 'tirol' });
      // Written by the Admin SDK with a value the rules would not accept.
      await setDoc(doc(db, 'events/oddRegion'), { ...stored, regionId: 'bayern' });
    });
  });

  it('create: valid region or none accepted (wizard, form, duplicate as draft)', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'events/c1'), createPayload({ regionId: 'vorarlberg' })));
    await assertSucceeds(
      setDoc(doc(db, 'events/c2'), createPayload({ regionId: 'tirol', isOnline: true }))
    );
    await assertSucceeds(
      setDoc(doc(db, 'events/c3'), createPayload({ status: 'draft', regionId: 'oesterreich' }))
    );
    // Clients cached before this change send no regionId.
    await assertSucceeds(setDoc(doc(db, 'events/c4'), createPayload()));
  });

  it('create: unknown or non-string region rejected', async () => {
    const db = owner().firestore();
    for (const regionId of ['bayern', '', 'Vorarlberg', 5, null, ['tirol']]) {
      await assertFails(setDoc(doc(db, 'events/bad'), createPayload({ regionId })));
    }
  });

  it('admin create with a region accepted', async () => {
    const adminUids = { 'admin (token claim)': 'adminTok', 'admin (admin_users doc)': 'adminDoc' };
    for (const [name, make] of Object.entries(adminVariants)) {
      const createdBy = adminUids[name as keyof typeof adminUids];
      await assertSucceeds(
        setDoc(
          doc(make().firestore(), `events/a-${createdBy}`),
          createPayload({ createdBy, regionId: 'wien' })
        )
      );
    }
  });

  it('full edit: legacy event gets a region, existing region kept or changed', async () => {
    const db = owner().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events/legacy'), {
        ...formPayload,
        regionId: 'vorarlberg',
        status: 'pending',
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'events/tirolEv'), { ...formPayload, regionId: 'tirol', status: 'pending' })
    );
    await assertSucceeds(updateDoc(doc(db, 'events/tirolEv'), { regionId: 'salzburg' }));
  });

  it('full edit: changing to an unknown region rejected', async () => {
    const db = owner().firestore();
    await assertFails(updateDoc(doc(db, 'events/legacy'), { ...formPayload, regionId: 'bayern' }));
    await assertFails(updateDoc(doc(db, 'events/tirolEv'), { regionId: 7 }));
    await assertFails(updateDoc(doc(db, 'events/tirolEv'), { regionId: null }));
  });

  it('removing the region is allowed (falls back to Vorarlberg on read)', async () => {
    await assertSucceeds(
      updateDoc(doc(owner().firestore(), 'events/tirolEv'), { regionId: deleteField() })
    );
  });

  describe.each(['legacy', 'tirolEv', 'oddRegion'])('stored event %s', (id) => {
    it.each(Object.keys(partialUpdates))('owner: %s still works', async (name) => {
      await assertSucceeds(
        updateDoc(doc(owner().firestore(), `events/${id}`), partialUpdates[name]())
      );
    });

    it.each(Object.keys({ ...partialUpdates, ...adminOnlyUpdates }))(
      'admin: %s still works',
      async (name) => {
        const all = { ...partialUpdates, ...adminOnlyUpdates };
        for (const make of Object.values(adminVariants)) {
          await assertSucceeds(updateDoc(doc(make().firestore(), `events/${id}`), all[name]()));
        }
      }
    );

    it('admin full edit keeps working', async () => {
      for (const make of Object.values(adminVariants)) {
        await assertSucceeds(
          updateDoc(doc(make().firestore(), `events/${id}`), {
            ...formPayload,
            regionId: 'vorarlberg',
            status: 'approved',
          })
        );
      }
    });
  });

  it('other users still cannot write a region onto foreign events', async () => {
    await assertFails(updateDoc(doc(user().firestore(), 'events/legacy'), { regionId: 'tirol' }));
  });
});

describe('users / publicProfile directoryRegionIds', () => {
  const ownerDb = () => env.authenticatedContext('owner').firestore();
  // What ProfileForm sends through useProfile.save (merge writes in one batch).
  const privateSave = (extra: Record<string, unknown> = {}) => ({
    displayName: 'Owner',
    username: 'owner',
    bio: 'b',
    bioHtml: '<p>b</p>',
    website: '',
    contact: '',
    photoURL: null,
    photoFocalPoint: null,
    photoZoom: null,
    socialMedia: { facebook: '', instagram: '', sharePublicly: false },
    listedInDirectory: true,
    directoryCategories: ['Yoga'],
    directoryRegions: ['Dornbirn'],
    directoryRegionIds: ['vorarlberg'],
    slug: 'owner',
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const publicSave = (extra: Record<string, unknown> = {}) => {
    const { contact: _c, socialMedia: _s, ...pub } = privateSave(extra);
    return pub;
  };

  async function saveProfile(db: ReturnType<typeof ownerDb>, extra: Record<string, unknown> = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/owner'), privateSave(extra), { merge: true });
    batch.set(doc(db, 'users/owner/publicProfile/data'), publicSave(extra), { merge: true });
    return batch.commit();
  }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Legacy profile without directoryRegionIds (users/owner from the outer beforeEach).
      await setDoc(doc(ctx.firestore(), 'users/owner/publicProfile/data'), {
        displayName: 'Owner',
        bio: 'b',
        slug: 'owner',
        listedInDirectory: true,
        directoryCategories: ['Yoga'],
        directoryRegions: ['Dornbirn'],
      });
    });
  });

  it('profile save on a legacy profile adds directoryRegionIds to both docs', async () => {
    await assertSucceeds(saveProfile(ownerDb()));
    await assertSucceeds(saveProfile(ownerDb(), { directoryRegionIds: ['tirol', 'wien'] }));
  });

  it('first save of a brand-new profile (create) accepts directoryRegionIds', async () => {
    const db = env.authenticatedContext('fresh').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/fresh'), privateSave({ createdAt: serverTimestamp() }), {
      merge: true,
    });
    batch.set(doc(db, 'users/fresh/publicProfile/data'), publicSave(), { merge: true });
    await assertSucceeds(batch.commit());
  });

  it('rejects unknown ids, non-lists and more than 9 entries', async () => {
    const all10 = [
      'vorarlberg',
      'tirol',
      'salzburg',
      'kaernten',
      'steiermark',
      'oberoesterreich',
      'niederoesterreich',
      'wien',
      'burgenland',
      'oesterreich',
    ];
    for (const directoryRegionIds of [
      ['bayern'],
      ['vorarlberg', 'Dornbirn'],
      'vorarlberg',
      all10,
    ]) {
      const db = ownerDb();
      await assertFails(setDoc(doc(db, 'users/owner'), { directoryRegionIds }, { merge: true }));
      await assertFails(
        setDoc(doc(db, 'users/owner/publicProfile/data'), { directoryRegionIds }, { merge: true })
      );
    }
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), 'users/owner'),
        { directoryRegionIds: all10.slice(0, 9) },
        { merge: true }
      )
    );
  });

  it('legacy profiles stay updatable through every other path', async () => {
    const db = ownerDb();
    // Notification preferences, Instagram default, Google-login seed merge.
    await assertSucceeds(updateDoc(doc(db, 'users/owner'), { notifyOnPublished: false }));
    await assertSucceeds(updateDoc(doc(db, 'users/owner'), { instagramConsentDefault: true }));
    await assertSucceeds(
      setDoc(
        doc(db, 'users/owner'),
        { displayName: 'Owner', bio: '', website: '', contact: '', photoURL: null, slug: 'owner' },
        { merge: true }
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, 'users/owner/publicProfile/data'),
        { displayName: 'Owner', bio: '', website: '', photoURL: null, slug: 'owner' },
        { merge: true }
      )
    );
  });

  it('admin hide/unhide works with and without directoryRegionIds', async () => {
    for (const make of Object.values(adminVariants)) {
      const db = make().firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'users/owner/publicProfile/data'), { directoryHidden: true })
      );
      await assertFails(
        updateDoc(doc(db, 'users/owner/publicProfile/data'), { directoryRegionIds: ['tirol'] })
      );
    }
    await saveProfile(ownerDb());
    await assertSucceeds(
      updateDoc(
        doc(
          adminVariants['admin (admin_users doc)']().firestore(),
          'users/owner/publicProfile/data'
        ),
        {
          directoryHidden: false,
        }
      )
    );
  });

  it('other users cannot write directoryRegionIds', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'users/owner'), { directoryRegionIds: ['tirol'] }, { merge: true })
    );
    await assertFails(
      setDoc(
        doc(db, 'users/owner/publicProfile/data'),
        { directoryRegionIds: ['tirol'] },
        { merge: true }
      )
    );
  });
});
