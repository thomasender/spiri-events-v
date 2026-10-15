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
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
