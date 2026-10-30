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
  query,
  serverTimestamp,
  where,
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

describe('donors.comment (public donor comment)', () => {
  const adminDb = () => env.authenticatedContext('adminDoc').firestore();
  const donor = { name: 'Anna', amount: 10, frequency: 'one-time', note: null, order: 0 };

  it('admins may set, change and clear a comment up to 140 characters', async () => {
    const db = adminDb();
    await assertSucceeds(setDoc(doc(db, 'donors/c1'), { ...donor, comment: 'x'.repeat(140) }));
    await assertSucceeds(updateDoc(doc(db, 'donors/c1'), { comment: 'Danke!' }));
    await assertSucceeds(updateDoc(doc(db, 'donors/c1'), { comment: null }));
  });

  it('rejects a longer or non-string comment, and writes by non-admins', async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, 'donors/c2'), { ...donor, comment: 'x'.repeat(141) }));
    await assertSucceeds(setDoc(doc(db, 'donors/c3'), donor));
    await assertFails(updateDoc(doc(db, 'donors/c3'), { comment: 42 }));
    await assertFails(updateDoc(doc(user().firestore(), 'donors/c3'), { comment: 'Hallo' }));
  });
});

describe('other app_settings stay public', () => {
  it('theme and last_build are readable without auth', async () => {
    const db = anon().firestore();
    await assertSucceeds(getDoc(doc(db, 'app_settings/theme')));
    await assertSucceeds(getDoc(doc(db, 'app_settings/last_build')));
  });
});

describe('app_settings/districtColors (Bezirksfarben)', () => {
  const PATH = 'app_settings/districtColors';

  it('is readable by everyone', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), PATH)));
  });

  it('only admins write', async () => {
    await assertFails(setDoc(doc(anon().firestore(), PATH), { Bregenz: '#B97860' }));
    await assertFails(setDoc(doc(user().firestore(), PATH), { Bregenz: '#B97860' }));
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('can create, replace and delete the colours', async () => {
      const ref = doc(make().firestore(), PATH);
      await assertSucceeds(setDoc(ref, { Bregenz: '#B97860', Online: '#7C8792' }));
      await assertSucceeds(setDoc(ref, { Bregenz: '#111111' }));
      await assertSucceeds(deleteDoc(ref));
    });

    it('cannot write more than 300 entries', async () => {
      const ref = doc(make().firestore(), PATH);
      const many = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`B${i}`, '#B97860']));
      await assertFails(setDoc(ref, many));
      await assertSucceeds(setDoc(ref, Object.fromEntries(Object.entries(many).slice(0, 300))));
    });
  });
});

// Written only by scripts/migrate-region-ids.mjs (Admin SDK). Every visitor
// reads it to decide between region-scoped and full queries; no client may
// create or change it. Deleting is the safe direction (back to the full
// query) and stays possible for Super-Admins like every app_settings doc.
describe('app_settings/regionMigration (migration marker)', () => {
  const MARKER = 'app_settings/regionMigration';
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), MARKER), { complete: true, completedAt: 1, checkedDocs: 3 })
    );
  });

  it('anyone can read it, nobody can create or change it from a client', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), MARKER)));
    const ctxs = [anon(), user(), ...Object.values(adminVariants).map((m) => m())];
    for (const ctx of ctxs) {
      const db = ctx.firestore();
      await assertFails(updateDoc(doc(db, MARKER), { complete: false }));
      await assertFails(setDoc(doc(db, MARKER), { complete: true }));
    }
    for (const ctx of [anon(), user()]) {
      await assertFails(deleteDoc(doc(ctx.firestore(), MARKER)));
    }
  });

  it('a Super-Admin can delete it (switches the app back to full queries)', async () => {
    await assertSucceeds(
      deleteDoc(doc(adminVariants['admin (admin_users doc)']().firestore(), MARKER))
    );
    await assertFails(
      setDoc(doc(adminVariants['admin (token claim)']().firestore(), MARKER), { complete: true })
    );
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

describe('events.registration', () => {
  const base = { createdBy: 'owner', status: 'draft', description: 'd' };
  const owner = () => env.authenticatedContext('owner', { email_verified: true });

  it('create: absent, empty and up to 300 chars OK; longer or non-string rejected', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'events/r1'), base));
    await assertSucceeds(setDoc(doc(db, 'events/r2'), { ...base, registration: '' }));
    await assertSucceeds(setDoc(doc(db, 'events/r3'), { ...base, registration: 'a'.repeat(300) }));
    await assertFails(setDoc(doc(db, 'events/r4'), { ...base, registration: 'a'.repeat(301) }));
    await assertFails(setDoc(doc(db, 'events/r5'), { ...base, registration: 42 }));
  });

  it('update: up to 300 chars OK, longer rejected', async () => {
    const db = owner().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events/ev1'), { registration: 'Anmeldung unter a@b.at' })
    );
    await assertFails(updateDoc(doc(db, 'events/ev1'), { registration: 'a'.repeat(301) }));
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
  // A region doc as scripts/seed-regions.mjs creates it now: only switches (no name / slug /
  // districts; those come from the register in code).
  const validRegion = {
    order: 1,
    active: false,
    contactEmail: '',
    seo: { title: 't', description: 'd' },
    timezone: 'Europe/Vienna',
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'regions/vorarlberg'), validRegion);
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

    it('cannot create oesterreich (a combined view, not a region)', async () => {
      await assertFails(setDoc(doc(make().firestore(), 'regions/oesterreich'), validRegion));
    });

    it('rejects a slug outside the fixed list', async () => {
      const db = make().firestore();
      await assertFails(setDoc(doc(db, 'regions/mars'), validRegion));
    });

    it('rejects former regions (Germany, merged cantons), accepts the new ones', async () => {
      const db = make().firestore();
      for (const id of ['bayern', 'franken', 'luzern', 'basel-stadt', 'allgaeu']) {
        await assertFails(setDoc(doc(db, `regions/${id}`), validRegion));
      }
      for (const id of ['innerschweiz', 'basel', 'appenzell', 'liechtenstein']) {
        await assertSucceeds(setDoc(doc(db, `regions/${id}`), validRegion));
        await assertSucceeds(deleteDoc(doc(db, `regions/${id}`)));
      }
    });

    it('a new doc never carries name, slug, districts or the old mapping marker', async () => {
      const db = make().firestore();
      for (const extra of [
        { name: 'Tirol' },
        { slug: 'tirol' },
        { bezirke: [] },
        { mappingUpdatedAt: 1 },
      ]) {
        await assertFails(setDoc(doc(db, 'regions/tirol'), { ...validRegion, ...extra }));
      }
      await assertSucceeds(setDoc(doc(db, 'regions/tirol'), validRegion));
      await assertFails(updateDoc(doc(db, 'regions/tirol'), { name: 'Anders' }));
      await assertFails(updateDoc(doc(db, 'regions/tirol'), { bezirke: ['Imst'] }));
    });

    it('an old doc with a slug that differs from the doc id cannot be edited', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'regions/wien'), { ...validRegion, slug: 'tirol' });
      });
      await assertFails(updateDoc(doc(make().firestore(), 'regions/wien'), { active: true }));
    });

    it('rejects unknown fields', async () => {
      const db = make().firestore();
      await assertFails(setDoc(doc(db, 'regions/tirol'), { ...validRegion, extra: 1 }));
      await assertFails(updateDoc(doc(db, 'regions/vorarlberg'), { extra: 1 }));
    });

    it('texts.examples: strings up to 120 characters, known keys only', async () => {
      const db = make().firestore();
      const ref = doc(db, 'regions/vorarlberg');
      await assertSucceeds(
        updateDoc(ref, { texts: { examples: { place: 'Essen', contact: 'x' } } })
      );
      await assertSucceeds(updateDoc(ref, { texts: { examples: { place: 'a'.repeat(120) } } }));
      await assertSucceeds(updateDoc(ref, { texts: deleteField() }));
      await assertFails(updateDoc(ref, { texts: { examples: { place: 'a'.repeat(121) } } }));
      await assertFails(updateDoc(ref, { texts: { examples: { place: 5 } } }));
      await assertFails(updateDoc(ref, { texts: { examples: { bogus: 'x' } } }));
      await assertFails(updateDoc(ref, { texts: { headings: {} } }));
      await assertFails(updateDoc(ref, { texts: 'x' }));
    });
  });
});

// lat / lng: the event's position for the radius filter ("Wo bist du?").
describe('events.lat / lng', () => {
  const owner = () => env.authenticatedContext('owner', { email_verified: true });
  const create = (extra: Record<string, unknown>) => ({
    title: 'T',
    description: 'd',
    category: 'Yoga',
    slug: 's',
    status: 'pending',
    createdBy: 'owner',
    createdAt: serverTimestamp(),
    ...extra,
  });

  it('accepts a position, null (unknown / online) and no position at all', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'events/p1'), create({ lat: 47.503, lng: 9.747 })));
    await assertSucceeds(setDoc(doc(db, 'events/p2'), create({ lat: null, lng: null })));
    await assertSucceeds(setDoc(doc(db, 'events/p3'), create({})));
  });

  it.each([
    ['latitude above 90', { lat: 91, lng: 9 }],
    ['longitude below -180', { lat: 47, lng: -181 }],
    ['text instead of numbers', { lat: '47.5', lng: '9.7' }],
  ])('rejects %s on create', async (_name, extra) => {
    await assertFails(setDoc(doc(owner().firestore(), 'events/bad'), create(extra)));
  });

  it('the owner can move an event on update, but not to an invalid position', async () => {
    const db = owner().firestore();
    await assertSucceeds(updateDoc(doc(db, 'events/ev1'), { lat: 47.2, lng: 9.6 }));
    await assertFails(updateDoc(doc(db, 'events/ev1'), { lat: 100, lng: 9.6 }));
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
    // customDates may only shrink while an event stays approved.
    'custom series dates': () => ({ customDates: [], exceptionDates: [] }),
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
      await setDoc(doc(db, 'events/oddRegion'), { ...stored, regionId: 'mars' });
    });
  });

  it('create: valid region or none accepted (wizard, form, duplicate as draft)', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'events/c1'), createPayload({ regionId: 'vorarlberg' })));
    await assertSucceeds(
      setDoc(doc(db, 'events/c2'), createPayload({ regionId: 'tirol', isOnline: true }))
    );
    await assertSucceeds(
      setDoc(doc(db, 'events/c3'), createPayload({ status: 'draft', regionId: 'steiermark' }))
    );
    // Clients cached before this change send no regionId.
    await assertSucceeds(setDoc(doc(db, 'events/c4'), createPayload()));
  });

  it('create: unknown or non-string region rejected', async () => {
    const db = owner().firestore();
    for (const regionId of ['mars', 'oesterreich', '', 'Vorarlberg', 5, null, ['tirol']]) {
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
    await assertFails(updateDoc(doc(db, 'events/legacy'), { ...formPayload, regionId: 'mars' }));
    await assertFails(updateDoc(doc(db, 'events/tirolEv'), { regionId: 7 }));
    await assertFails(updateDoc(doc(db, 'events/tirolEv'), { regionId: null }));
  });

  it('removing the region is allowed (falls back to Vorarlberg on read)', async () => {
    // An owner may not touch the region of an approved event (review guard).
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'events/tirolEv'), { status: 'draft' });
    });
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

  it('rejects unknown ids, non-lists and more than 10 entries', async () => {
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
      'zuerich',
    ];
    for (const directoryRegionIds of [
      ['mars'],
      ['oesterreich'],
      ['vorarlberg', 'Dornbirn'],
      'vorarlberg',
      [...all10, 'vorarlberg'],
    ]) {
      const db = ownerDb();
      await assertFails(setDoc(doc(db, 'users/owner'), { directoryRegionIds }, { merge: true }));
      await assertFails(
        setDoc(doc(db, 'users/owner/publicProfile/data'), { directoryRegionIds }, { merge: true })
      );
    }
    await assertSucceeds(
      setDoc(doc(ownerDb(), 'users/owner'), { directoryRegionIds: all10 }, { merge: true })
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

// ─── Region moderators (role 'RegionModerator' in admin_users) ─────────────
// A narrow extra right next to the Super-Admin: review actions on events of
// their own regions, the conversation on those events and hiding directory
// listings that lie entirely in their regions. Nothing else.
describe('region moderators', () => {
  const MOD_DOCS: Record<string, string[]> = {
    modTirol: ['tirol'],
    modSteiermark: ['steiermark'],
    modVorarlberg: ['vorarlberg'],
    modTwo: ['tirol', 'steiermark'],
  };
  const dbFor = (uid: string) =>
    env.authenticatedContext(uid, { email_verified: true }).firestore();

  // Actors of the ticket's matrix. `uid` is what the actor stamps into
  // approvedBy/trashedBy, so each payload is valid for its actor.
  const ACTORS = {
    'Super-Admin (admin_users doc)': { uid: 'adminDoc', db: () => dbFor('adminDoc') },
    'Super-Admin (token claim)': {
      uid: 'adminTok',
      db: () => env.authenticatedContext('adminTok', { role: 'Admin' }).firestore(),
    },
    'Moderator Tirol': { uid: 'modTirol', db: () => dbFor('modTirol') },
    'Moderator Steiermark': { uid: 'modSteiermark', db: () => dbFor('modSteiermark') },
    'Moderator Vorarlberg': { uid: 'modVorarlberg', db: () => dbFor('modVorarlberg') },
    'Moderator Tirol + Steiermark': { uid: 'modTwo', db: () => dbFor('modTwo') },
    'Veranstalter:in (not the owner)': { uid: 'organizer', db: () => dbFor('organizer') },
    anonym: { uid: 'anon', db: () => env.unauthenticatedContext().firestore() },
  } as const;
  type Actor = keyof typeof ACTORS;

  const eventBase = {
    title: 'T',
    description: 'd',
    slug: 'yoga-20261102',
    category: 'Yoga',
    createdBy: 'owner',
    isOnline: false,
  };
  const EVENTS: Record<string, Record<string, unknown>> = {
    tirolPending: { ...eventBase, status: 'pending', regionId: 'tirol' },
    vbPending: { ...eventBase, status: 'pending', regionId: 'vorarlberg' },
    legacyPending: { ...eventBase, status: 'pending' },
    stPending: { ...eventBase, status: 'pending', regionId: 'steiermark' },
    onlineTirol: { ...eventBase, status: 'pending', regionId: 'tirol', isOnline: true },
    tirolDraft: { ...eventBase, status: 'draft', regionId: 'tirol' },
    tirolApproved: { ...eventBase, status: 'approved', regionId: 'tirol', approvedBy: 'adminDoc' },
    tirolTrashed: {
      ...eventBase,
      status: 'trashed',
      regionId: 'tirol',
      trashedBy: 'adminDoc',
      trashedAt: 1,
      trashReason: 'x',
    },
    oddRegion: { ...eventBase, status: 'pending', regionId: 'mars' },
  };

  const approve = (uid: string, extra: Record<string, unknown> = {}) => ({
    status: 'approved',
    approvedBy: uid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const requestChanges = () => ({ status: 'draft', updatedAt: serverTimestamp() });
  const unpublish = (uid: string) => ({
    status: 'draft',
    unpublishedBy: uid,
    unpublishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const trash = (uid: string, reason: unknown = 'Passt nicht') => ({
    status: 'trashed',
    trashedAt: serverTimestamp(),
    trashedBy: uid,
    trashReason: reason,
    updatedAt: serverTimestamp(),
  });
  const restore = () => ({
    status: 'draft',
    trashedAt: null,
    trashedBy: null,
    trashReason: null,
    updatedAt: serverTimestamp(),
  });
  const message = (uid: string, authorRole = 'Admin') => ({
    text: '<p>Bitte Ort ergänzen</p>',
    authorUid: uid,
    authorRole,
    authorName: 'Mod',
    createdAt: serverTimestamp(),
    readByRecipient: false,
  });

  const PROFILES: Record<string, Record<string, unknown>> = {
    pTirol: { directoryRegionIds: ['tirol'] },
    pTirolWien: { directoryRegionIds: ['tirol', 'wien'] },
    pTirolSt: { directoryRegionIds: ['tirol', 'steiermark'] },
    pLegacy: {},
    pEmpty: { directoryRegionIds: [] },
    staffTirol: { directoryRegionIds: ['tirol'] },
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const [uid, regionIds] of Object.entries(MOD_DOCS)) {
        await setDoc(doc(db, `admin_users/${uid}`), { role: 'RegionModerator', regionIds });
      }
      // Malformed or look-alike role docs must grant nothing.
      await setDoc(doc(db, 'admin_users/modString'), {
        role: 'RegionModerator',
        regionIds: 'tirol',
      });
      await setDoc(doc(db, 'admin_users/modCase'), {
        role: 'regionmoderator',
        regionIds: ['tirol'],
      });
      await setDoc(doc(db, 'admin_users/modBogus'), {
        role: 'RegionModerator',
        regionIds: ['mars'],
      });
      // A staff member (moderator elsewhere) who is listed in Tirol.
      await setDoc(doc(db, 'admin_users/staffTirol'), {
        role: 'RegionModerator',
        regionIds: ['wien'],
      });
      for (const [id, data] of Object.entries(EVENTS)) {
        await setDoc(doc(db, `events/${id}`), data);
        await setDoc(doc(db, `events/${id}/messages/m1`), {
          ...message('owner', 'User'),
          createdAt: 1,
        });
      }
      for (const [uid, data] of Object.entries(PROFILES)) {
        await setDoc(doc(db, `users/${uid}`), { displayName: uid, bio: '', contact: 'secret' });
        await setDoc(doc(db, `users/${uid}/publicProfile/data`), {
          displayName: uid,
          bio: '',
          slug: uid.toLowerCase(),
          listedInDirectory: true,
          directoryCategories: ['Yoga'],
          ...data,
        });
      }
      await setDoc(doc(db, 'categories/yoga'), { name: 'Yoga', color: '#123456', order: 0 });
      await setDoc(doc(db, 'feedback/f1'), { description: 'x', status: 'new' });
      await setDoc(doc(db, 'member_lists/l1'), { name: 'L', memberUids: [] });
      await setDoc(doc(db, 'donors/d1'), { name: 'D', amount: 5 });
      await setDoc(doc(db, 'regions/tirol'), {
        name: 'Tirol',
        slug: 'tirol',
        order: 1,
        active: true,
        contactEmail: '',
      });
      await setDoc(doc(db, 'admin_audit_log/a1'), { action: 'setRegionModerator' });
    });
  });

  // ── The ticket's decision matrix ──────────────────────────────────────
  type Op = (a: (typeof ACTORS)[Actor]) => Promise<unknown>;
  const OPS: [string, Op][] = [
    ['approve a Tirol event', (a) => updateDoc(doc(a.db(), 'events/tirolPending'), approve(a.uid))],
    [
      'approve a Vorarlberg event',
      (a) => updateDoc(doc(a.db(), 'events/vbPending'), approve(a.uid)),
    ],
    [
      'approve a Steiermark event',
      (a) => updateDoc(doc(a.db(), 'events/stPending'), approve(a.uid)),
    ],
    [
      "change a Tirol event's region",
      (a) =>
        updateDoc(doc(a.db(), 'events/tirolPending'), {
          regionId: 'vorarlberg',
          updatedAt: serverTimestamp(),
        }),
    ],
    [
      'write a category',
      (a) =>
        updateDoc(doc(a.db(), 'categories/yoga'), {
          color: '#654321',
          updatedAt: serverTimestamp(),
        }),
    ],
    [
      'write the theme',
      (a) => updateDoc(doc(a.db(), 'app_settings/theme'), { '--bg-primary': '#ffffff' }),
    ],
    [
      'write its own admin_users doc',
      (a) => setDoc(doc(a.db(), `admin_users/${a.uid}`), { role: 'Admin' }),
    ],
    [
      'approve an online event (moderation region Tirol)',
      (a) => updateDoc(doc(a.db(), 'events/onlineTirol'), approve(a.uid)),
    ],
    ["read someone else's Tirol draft", (a) => getDoc(doc(a.db(), 'events/tirolDraft'))],
  ];

  const Y = true;
  const N = false;
  // One column per OPS entry, in order.
  const MATRIX: Record<Actor, boolean[]> = {
    'Super-Admin (admin_users doc)': [Y, Y, Y, Y, Y, Y, N, Y, Y],
    'Super-Admin (token claim)': [Y, Y, Y, Y, Y, Y, N, Y, Y],
    'Moderator Tirol': [Y, N, N, N, N, N, N, Y, N],
    'Moderator Steiermark': [N, N, Y, N, N, N, N, N, N],
    'Moderator Vorarlberg': [N, Y, N, N, N, N, N, N, N],
    'Moderator Tirol + Steiermark': [Y, N, Y, N, N, N, N, Y, N],
    'Veranstalter:in (not the owner)': [N, N, N, N, N, N, N, N, N],
    anonym: [N, N, N, N, N, N, N, N, N],
  };

  describe.each(Object.keys(MATRIX) as Actor[])('%s', (actor) => {
    it.each(OPS.map(([name, op], i) => [name, op, MATRIX[actor][i]] as const))(
      '%s',
      async (_name, op, allowed) => {
        const attempt = op(ACTORS[actor]);
        await (allowed ? assertSucceeds(attempt) : assertFails(attempt));
      }
    );
  });

  // ── Events: what exactly a moderator may do in her region ─────────────
  describe('events in her own region (Moderator Tirol)', () => {
    const mod = () => dbFor('modTirol');
    const ev = (id: string) => doc(mod(), `events/${id}`);

    it('reads pending, approved, trashed and online events of Tirol', async () => {
      for (const id of ['tirolPending', 'tirolApproved', 'tirolTrashed', 'onlineTirol']) {
        await assertSucceeds(getDoc(ev(id)));
      }
    });

    it('cannot read other regions, legacy (= Vorarlberg) or unknown-region events', async () => {
      for (const id of ['vbPending', 'legacyPending', 'stPending', 'oddRegion']) {
        await assertFails(getDoc(ev(id)));
      }
    });

    it('lists only with a query restricted to her region and non-draft statuses', async () => {
      const events = collection(mod(), 'events');
      await assertSucceeds(
        getDocs(query(events, where('regionId', '==', 'tirol'), where('status', '==', 'pending')))
      );
      await assertSucceeds(
        getDocs(
          query(
            events,
            where('regionId', 'in', ['tirol']),
            where('status', 'in', ['pending', 'approved', 'trashed'])
          )
        )
      );
      // No region filter, a foreign region, or drafts possibly included.
      await assertFails(getDocs(query(events, where('status', '==', 'pending'))));
      await assertFails(
        getDocs(
          query(events, where('regionId', '==', 'vorarlberg'), where('status', '==', 'pending'))
        )
      );
      await assertFails(getDocs(query(events, where('regionId', '==', 'tirol'))));
    });

    it('approves (also with a collision slug) and requests changes on pending events', async () => {
      await assertSucceeds(
        updateDoc(ev('tirolPending'), approve('modTirol', { slug: 'yoga-20261102-2' }))
      );
      await assertSucceeds(updateDoc(ev('onlineTirol'), requestChanges()));
    });

    it('may only change the slug to its collision variant on approval', async () => {
      await env.withSecurityRulesDisabled((ctx) =>
        updateDoc(doc(ctx.firestore(), 'events/tirolPending'), { slug: 'yoga-20261102-2' })
      );
      // "-2" taken too: resolveSlugForApproval moves on to "-3".
      await assertSucceeds(
        updateDoc(ev('tirolPending'), approve('modTirol', { slug: 'yoga-20261102-3' }))
      );
      for (const slug of [
        'foreign-event-20261102',
        'yoga-20261103',
        'yoga-20261102-2x',
        'xyoga-20261102-2',
        '',
      ]) {
        await assertFails(updateDoc(ev('onlineTirol'), approve('modTirol', { slug })));
      }
    });

    it('unpublishes approved events', async () => {
      await assertSucceeds(updateDoc(ev('tirolApproved'), unpublish('modTirol')));
    });

    it('moves pending and approved events to the trash (reject) and restores them', async () => {
      await assertSucceeds(updateDoc(ev('tirolPending'), trash('modTirol')));
      await assertSucceeds(updateDoc(ev('tirolApproved'), trash('modTirol', null)));
      await assertSucceeds(updateDoc(ev('tirolTrashed'), restore()));
    });

    it('cannot stamp somebody else as approver/unpublisher/trasher', async () => {
      await assertFails(updateDoc(ev('tirolPending'), approve('adminDoc')));
      await assertFails(updateDoc(ev('tirolApproved'), unpublish('adminDoc')));
      await assertFails(updateDoc(ev('tirolPending'), trash('adminDoc')));
    });

    it('cannot use client timestamps for the review fields', async () => {
      await assertFails(
        updateDoc(ev('tirolPending'), { ...approve('modTirol'), approvedAt: new Date(0) })
      );
      await assertFails(
        updateDoc(ev('tirolPending'), { ...trash('modTirol'), trashedAt: new Date(0) })
      );
    });

    it('cannot edit content, category, owner or region along with a review action', async () => {
      for (const extra of [
        { title: 'Neu' },
        { description: 'x' },
        { category: 'Tanz' },
        { createdBy: 'modTirol' },
        { regionId: 'vorarlberg' },
        { regionId: deleteField() },
        { instagramConsent: true },
        { slug: 'Evil Slug!' },
      ]) {
        await assertFails(updateDoc(ev('tirolPending'), approve('modTirol', extra)));
      }
      await assertFails(updateDoc(ev('tirolPending'), { title: 'Neu' }));
      await assertFails(updateDoc(ev('tirolApproved'), { slug: 'other-slug' }));
      await assertFails(updateDoc(ev('tirolPending'), { ...requestChanges(), slug: 'x-2' }));
    });

    it('cannot make transitions the review flow does not have', async () => {
      await assertFails(updateDoc(ev('tirolTrashed'), approve('modTirol')));
      await assertFails(
        updateDoc(ev('tirolApproved'), { status: 'pending', updatedAt: serverTimestamp() })
      );
      await assertFails(
        updateDoc(ev('tirolTrashed'), { status: 'pending', updatedAt: serverTimestamp() })
      );
      // A no-op status write is not a review action either.
      await assertFails(updateDoc(ev('tirolPending'), { updatedAt: serverTimestamp() }));
      // Restore must clear the trash fields.
      await assertFails(
        updateDoc(ev('tirolTrashed'), { status: 'draft', updatedAt: serverTimestamp() })
      );
      // Overlong rejection reason.
      await assertFails(updateDoc(ev('tirolPending'), trash('modTirol', 'x'.repeat(2001))));
      await assertFails(updateDoc(ev('tirolPending'), trash('modTirol', 5)));
    });

    it('cannot touch drafts of other people (no read, approve or submit)', async () => {
      await assertFails(updateDoc(ev('tirolDraft'), approve('modTirol')));
      await assertFails(
        updateDoc(ev('tirolDraft'), { status: 'pending', updatedAt: serverTimestamp() })
      );
      await assertFails(updateDoc(ev('tirolDraft'), trash('modTirol')));
    });

    it('cannot delete permanently (Super-Admin only)', async () => {
      for (const id of ['tirolPending', 'tirolTrashed', 'tirolApproved']) {
        await assertFails(deleteDoc(ev(id)));
      }
      await assertSucceeds(deleteDoc(doc(dbFor('adminDoc'), 'events/tirolTrashed')));
    });

    it('cannot act on events of foreign, legacy or unknown regions', async () => {
      for (const id of ['vbPending', 'legacyPending', 'stPending', 'oddRegion']) {
        await assertFails(updateDoc(ev(id), approve('modTirol')));
        await assertFails(updateDoc(ev(id), trash('modTirol')));
      }
    });

    it('creates events only like any verified organizer (pending/draft, own uid)', async () => {
      await assertSucceeds(
        setDoc(ev('modOwn'), {
          ...eventBase,
          createdBy: 'modTirol',
          status: 'pending',
          regionId: 'tirol',
        })
      );
      await assertFails(
        setDoc(ev('modApproved'), {
          ...eventBase,
          createdBy: 'modTirol',
          status: 'approved',
          regionId: 'tirol',
        })
      );
    });
  });

  it('legacy events without regionId are moderated by Vorarlberg', async () => {
    const db = dbFor('modVorarlberg');
    await assertSucceeds(getDoc(doc(db, 'events/legacyPending')));
    await assertSucceeds(updateDoc(doc(db, 'events/legacyPending'), approve('modVorarlberg')));
    // Approving does not let her write a region onto it.
    await assertFails(
      updateDoc(doc(db, 'events/legacyPending'), {
        regionId: 'vorarlberg',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('malformed or look-alike moderator docs and a bare token claim grant nothing', async () => {
    const ctxs = [
      dbFor('modString'),
      dbFor('modCase'),
      dbFor('modBogus'),
      env.authenticatedContext('noDoc', { role: 'RegionModerator' }).firestore(),
    ];
    for (const db of ctxs) {
      await assertFails(getDoc(doc(db, 'events/tirolPending')));
      await assertFails(updateDoc(doc(db, 'events/tirolPending'), approve('x')));
      await assertFails(getDoc(doc(db, 'events/oddRegion')));
    }
  });

  it('a revoked moderator (doc deleted) loses access immediately', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), 'admin_users/modTirol'))
    );
    await assertFails(getDoc(doc(dbFor('modTirol'), 'events/tirolPending')));
  });

  // ── Event messages ───────────────────────────────────────────────────
  describe('event messages', () => {
    const msgs = (uid: string, id: string) => collection(dbFor(uid), `events/${id}/messages`);

    it('Moderator Tirol reads, writes (as staff), marks read and clears Tirol conversations', async () => {
      await assertSucceeds(getDocs(msgs('modTirol', 'tirolPending')));
      await assertSucceeds(setDoc(doc(msgs('modTirol', 'tirolPending')), message('modTirol')));
      await assertSucceeds(
        updateDoc(doc(msgs('modTirol', 'tirolPending'), 'm1'), { readByRecipient: true })
      );
      await assertSucceeds(deleteDoc(doc(msgs('modTirol', 'tirolPending'), 'm1')));
      await assertSucceeds(getDocs(msgs('modTirol', 'onlineTirol')));
    });

    it("cannot write in the organizer's name or as someone else", async () => {
      await assertFails(setDoc(doc(msgs('modTirol', 'tirolPending')), message('modTirol', 'User')));
      await assertFails(setDoc(doc(msgs('modTirol', 'tirolPending')), message('owner')));
      await assertFails(
        updateDoc(doc(msgs('modTirol', 'tirolPending'), 'm1'), { text: 'changed' })
      );
    });

    it('no access to conversations of foreign regions or of drafts', async () => {
      for (const id of ['vbPending', 'stPending', 'legacyPending', 'tirolDraft']) {
        await assertFails(getDocs(msgs('modTirol', id)));
        await assertFails(setDoc(doc(msgs('modTirol', id)), message('modTirol')));
        await assertFails(deleteDoc(doc(msgs('modTirol', id), 'm1')));
      }
    });

    it('the organizer and the Super-Admin keep their access', async () => {
      await assertSucceeds(getDocs(msgs('owner', 'tirolDraft')));
      await assertSucceeds(setDoc(doc(msgs('owner', 'tirolPending')), message('owner', 'User')));
      await assertSucceeds(getDocs(msgs('adminDoc', 'vbPending')));
      await assertSucceeds(deleteDoc(doc(msgs('adminDoc', 'vbPending'), 'm1')));
    });
  });

  // ── Directory listings ───────────────────────────────────────────────
  describe('directory listings', () => {
    const hide = (uid: string, profile: string, value = true) =>
      updateDoc(doc(dbFor(uid), `users/${profile}/publicProfile/data`), {
        directoryHidden: value,
      });

    it('hide/unhide only when every listed region is hers', async () => {
      await assertSucceeds(hide('modTirol', 'pTirol'));
      await assertSucceeds(hide('modTirol', 'pTirol', false));
      await assertSucceeds(hide('modTwo', 'pTirol'));
      await assertSucceeds(hide('modTwo', 'pTirolSt'));
      await assertSucceeds(hide('modVorarlberg', 'pLegacy'));

      await assertFails(hide('modTirol', 'pTirolWien'));
      await assertFails(hide('modTwo', 'pTirolWien'));
      await assertFails(hide('modTirol', 'pTirolSt'));
      await assertFails(hide('modVorarlberg', 'pTirol'));
      await assertFails(hide('modTirol', 'pLegacy'));
    });

    it('listings with an empty region list and staff accounts are off limits', async () => {
      for (const mod of Object.keys(MOD_DOCS)) {
        await assertFails(hide(mod, 'pEmpty'));
      }
      await assertFails(hide('modTirol', 'staffTirol'));
      await assertSucceeds(hide('adminDoc', 'staffTirol'));
    });

    it('reads public listings but no private profile docs, and changes nothing else', async () => {
      const db = dbFor('modTirol');
      await assertSucceeds(getDoc(doc(db, 'users/pTirolWien/publicProfile/data')));
      await assertFails(getDoc(doc(db, 'users/pTirol')));
      for (const change of [
        { directoryRegionIds: ['tirol', 'wien'] },
        { displayName: 'x' },
        { listedInDirectory: false },
        { directoryHidden: 'yes' },
      ]) {
        await assertFails(updateDoc(doc(db, 'users/pTirol/publicProfile/data'), change));
      }
      await assertFails(updateDoc(doc(db, 'users/pTirol'), { displayName: 'x' }));
      await assertFails(deleteDoc(doc(db, 'users/pTirol/publicProfile/data')));
    });
  });

  // ── Explicitly NOT allowed (ticket task 3) ───────────────────────────
  describe('everything else stays Super-Admin only', () => {
    const allMods = () => Object.keys(MOD_DOCS).map(dbFor);

    it('categories, theme, saved themes, active theme', async () => {
      for (const db of allMods()) {
        await assertFails(
          setDoc(doc(db, 'categories/tanz'), { name: 'Tanz', color: '#123456', createdBy: 'm' })
        );
        await assertFails(deleteDoc(doc(db, 'categories/yoga')));
        await assertFails(updateDoc(doc(db, 'app_settings/theme'), { '--border': '#000000' }));
        await assertFails(
          setDoc(doc(db, 'app_settings/activeTheme'), { themeId: 't1', activatedBy: 'modTirol' })
        );
        await assertFails(deleteDoc(doc(db, 'themes/t1')));
      }
    });

    it('instagram settings, posts and token', async () => {
      for (const db of allMods()) {
        await assertFails(getDoc(doc(db, 'app_settings/instagram')));
        await assertFails(updateDoc(doc(db, 'app_settings/instagram'), { enabled: true }));
        await assertFails(getDoc(doc(db, 'instagram_posts/p1')));
        await assertFails(getDoc(doc(db, 'instagram_private/token')));
      }
    });

    it('donations, feedback, member lists', async () => {
      for (const db of allMods()) {
        await assertFails(setDoc(doc(db, 'donors/d2'), { name: 'X', amount: 1 }));
        await assertFails(updateDoc(doc(db, 'donors/d1'), { amount: 1000 }));
        await assertFails(getDoc(doc(db, 'feedback/f1')));
        await assertFails(getDocs(collection(db, 'feedback')));
        await assertFails(updateDoc(doc(db, 'feedback/f1'), { status: 'done' }));
        await assertFails(getDoc(doc(db, 'member_lists/l1')));
        await assertFails(setDoc(doc(db, 'member_lists/l2'), { name: 'L', memberUids: [] }));
      }
    });

    it('region config, also contactEmail/seo of her own region', async () => {
      const db = dbFor('modTirol');
      await assertFails(updateDoc(doc(db, 'regions/tirol'), { contactEmail: 'a@b.at' }));
      await assertFails(updateDoc(doc(db, 'regions/tirol'), { seo: { title: 't' } }));
      await assertFails(deleteDoc(doc(db, 'regions/tirol')));
    });

    it('admin_users: own doc read-only, nothing else readable or writable', async () => {
      const db = dbFor('modTirol');
      await assertSucceeds(getDoc(doc(db, 'admin_users/modTirol')));
      await assertFails(getDoc(doc(db, 'admin_users/adminDoc')));
      await assertFails(getDoc(doc(db, 'admin_users/modVorarlberg')));
      await assertFails(getDocs(collection(db, 'admin_users')));
      await assertFails(
        updateDoc(doc(db, 'admin_users/modTirol'), { regionIds: ['tirol', 'wien'] })
      );
      await assertFails(updateDoc(doc(db, 'admin_users/modTirol'), { role: 'Admin' }));
      await assertFails(deleteDoc(doc(db, 'admin_users/modTirol')));
      await assertFails(
        setDoc(doc(db, 'admin_users/organizer'), { role: 'RegionModerator', regionIds: ['tirol'] })
      );
    });

    it('the audit log: Super-Admins read, nobody writes', async () => {
      for (const db of allMods()) {
        await assertFails(getDoc(doc(db, 'admin_audit_log/a1')));
        await assertFails(getDocs(collection(db, 'admin_audit_log')));
      }
      for (const make of Object.values(adminVariants)) {
        const db = make().firestore();
        await assertSucceeds(getDoc(doc(db, 'admin_audit_log/a1')));
        await assertSucceeds(getDocs(collection(db, 'admin_audit_log')));
        await assertFails(setDoc(doc(db, 'admin_audit_log/a2'), { action: 'x' }));
        await assertFails(updateDoc(doc(db, 'admin_audit_log/a1'), { action: 'y' }));
        await assertFails(deleteDoc(doc(db, 'admin_audit_log/a1')));
      }
      await assertFails(getDoc(doc(user().firestore(), 'admin_audit_log/a1')));
      await assertFails(getDoc(doc(anon().firestore(), 'admin_audit_log/a1')));
    });
  });

  // ── Super-Admins keep every right they had ───────────────────────────
  describe('Super-Admin behaviour is unchanged', () => {
    it.each(Object.keys(adminVariants))('%s', async (name) => {
      const db = adminVariants[name as keyof typeof adminVariants]().firestore();
      for (const id of Object.keys(EVENTS)) {
        await assertSucceeds(getDoc(doc(db, `events/${id}`)));
      }
      await assertSucceeds(
        getDocs(query(collection(db, 'events'), where('status', '==', 'pending')))
      );
      await assertSucceeds(getDocs(collection(db, 'events')));
      await assertSucceeds(updateDoc(doc(db, 'events/tirolDraft'), { title: 'Admin edit' }));
      await assertSucceeds(updateDoc(doc(db, 'events/oddRegion'), { regionId: 'wien' }));
      await assertSucceeds(getDocs(collection(db, 'feedback')));
      await assertSucceeds(getDoc(doc(db, 'member_lists/l1')));
      await assertSucceeds(deleteDoc(doc(db, 'events/tirolApproved')));
    });
  });
});

// "Über uns" page of a region: its moderators pick the helpers and the header
// photo of their own region, nothing else on the region doc.
describe('regions.instagramHandle (display-only, Super-Admin only)', () => {
  const region = {
    name: 'Tirol',
    slug: 'tirol',
    order: 1,
    active: false,
    bezirke: [],
    updatedAt: 1,
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'regions/tirol'), region);
      await setDoc(doc(db, 'admin_users/modTirol'), {
        role: 'RegionModerator',
        regionIds: ['tirol'],
      });
    });
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('can set a valid handle and clear it with null', async () => {
      const db = make().firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'regions/tirol'), { instagramHandle: '@tribe.tirol_1', updatedAt: 2 })
      );
      await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { instagramHandle: null }));
    });

    it('rejects a malformed handle', async () => {
      const db = make().firestore();
      for (const bad of ['tribetirol', '@', '@a b', '@tribe-tirol', `@${'a'.repeat(31)}`, 5]) {
        await assertFails(updateDoc(doc(db, 'regions/tirol'), { instagramHandle: bad }));
      }
    });
  });

  it('a moderator cannot write the handle, not even on her own region', async () => {
    const db = env.authenticatedContext('modTirol', { email_verified: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { instagramHandle: '@tribetirol', updatedAt: 2 })
    );
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { instagramHandle: null, updatedAt: 2 }));
  });

  it('a moderator can still edit other fields when a handle is stored', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'regions/tirol'), { instagramHandle: '@tribetirol' });
    });
    const db = env.authenticatedContext('modTirol', { email_verified: true }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'regions/tirol'), { aboutText: '<p>Hallo</p>', updatedAt: 3 })
    );
  });
});

describe('region about page (moderators)', () => {
  const region = {
    name: 'Tirol',
    slug: 'tirol',
    order: 1,
    active: false,
    bezirke: [],
    updatedAt: 1,
  };
  const dbFor = (uid: string) =>
    env.authenticatedContext(uid, { email_verified: true }).firestore();

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'regions/tirol'), region);
      await setDoc(doc(db, 'regions/wien'), { ...region, name: 'Wien', slug: 'wien' });
      await setDoc(doc(db, 'admin_users/modTirol'), {
        role: 'RegionModerator',
        regionIds: ['tirol'],
      });
    });
  });

  it('a moderator sets helpers and header photo of her own region', async () => {
    const db = dbFor('modTirol');
    await assertSucceeds(
      updateDoc(doc(db, 'regions/tirol'), {
        aboutHelperIds: ['h1', 'h2'],
        aboutHeaderImage: 'https://example.com/header.jpg',
        updatedAt: 2,
      })
    );
  });

  it('a moderator sets the text of the "Deine Heimat" section; too long is rejected', async () => {
    const db = dbFor('modTirol');
    await assertSucceeds(
      updateDoc(doc(db, 'regions/tirol'), { aboutText: '<p>Hallo Tirol</p>', updatedAt: 2 })
    );
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { aboutText: 'x'.repeat(20001), updatedAt: 3 })
    );
    await assertFails(updateDoc(doc(db, 'regions/wien'), { aboutText: '<p>x</p>', updatedAt: 2 }));
  });

  it('a moderator cannot set or clear example texts (Super-Admin only)', async () => {
    const db = dbFor('modTirol');
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), {
        texts: { examples: { place: 'Innsbruck' } },
        updatedAt: 2,
      })
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'regions/tirol'), {
        texts: { examples: { place: 'x' } },
      });
    });
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { texts: { examples: { place: 'y' } }, updatedAt: 4 })
    );
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { texts: deleteField(), updatedAt: 3 }));
  });

  it('a moderator cannot touch another region or other fields', async () => {
    const db = dbFor('modTirol');
    await assertFails(updateDoc(doc(db, 'regions/wien'), { aboutHelperIds: ['h1'], updatedAt: 2 }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { active: true, updatedAt: 2 }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { name: 'Tirol 2', updatedAt: 2 }));
    await assertFails(deleteDoc(doc(db, 'regions/tirol')));
  });

  it('rejects an invalid header photo or a too long helper list', async () => {
    const db = dbFor('modTirol');
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { aboutHeaderImage: 'javascript:alert(1)', updatedAt: 2 })
    );
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), {
        aboutHelperIds: Array.from({ length: 61 }, (_, i) => `h${i}`),
        updatedAt: 2,
      })
    );
  });

  it('a moderator sets the header slogan until an admin saved it, then it is locked', async () => {
    const db = dbFor('modTirol');
    await assertSucceeds(
      updateDoc(doc(db, 'regions/tirol'), {
        aboutSlogan1: 'Dein Tiroler Kalender',
        aboutSlogan2: 'für bewusste Events',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { aboutSlogan1: 'x'.repeat(31), updatedAt: 3 })
    );
    await assertFails(
      updateDoc(doc(db, 'regions/tirol'), { aboutSloganLocked: true, updatedAt: 3 })
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'regions/tirol'), { aboutSloganLocked: true });
    });
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { aboutSlogan2: 'neu', updatedAt: 4 }));
    // Other About fields stay editable while the slogan is locked.
    await assertSucceeds(
      updateDoc(doc(db, 'regions/tirol'), { aboutText: '<p>x</p>', updatedAt: 5 })
    );
  });

  it('ordinary users cannot set them', async () => {
    await assertFails(
      updateDoc(doc(dbFor('someone'), 'regions/tirol'), { aboutHelperIds: ['h1'], updatedAt: 2 })
    );
  });
});

describe('app_settings/layout and layout_history (Design-Modus)', () => {
  const uidOf = (n: string) => (n.includes('token') ? 'adminTok' : 'adminDoc');

  it('everyone can read the live layout, only admins write it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'app_settings/layout'), { '--card-padding': '20px' });
    });
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore();
      await assertSucceeds(getDoc(doc(db, 'app_settings/layout')));
      await assertFails(
        setDoc(doc(db, 'app_settings/layout'), {
          '--card-padding': '24px',
          updatedAt: serverTimestamp(),
          updatedBy: 'someUser',
        })
      );
    }
  });

  describe.each(Object.entries(adminVariants))('%s', (name, make) => {
    const uid = uidOf(name);

    it('can publish a layout, but not as someone else or oversized', async () => {
      const db = make().firestore();
      const ref = doc(db, 'app_settings/layout');
      await assertSucceeds(
        setDoc(ref, { '--card-padding': '24px', updatedAt: serverTimestamp(), updatedBy: uid })
      );
      await assertFails(
        setDoc(ref, { '--card-padding': '24px', updatedAt: serverTimestamp(), updatedBy: 'other' })
      );
      const huge = Object.fromEntries(Array.from({ length: 201 }, (_v, i) => [`--t${i}`, '1px']));
      await assertFails(setDoc(ref, { ...huge, updatedAt: serverTimestamp(), updatedBy: uid }));
    });

    it('can append history entries, never edit or delete them', async () => {
      const db = make().firestore();
      const entry = {
        values: { '--card-padding': '24px' },
        changes: [{ token: '--card-padding', from: '16px', to: '24px' }],
        note: 'Karten luftiger',
        publishedBy: uid,
        publishedByName: 'Jana',
        publishedAt: serverTimestamp(),
      };
      const ref = doc(collection(db, 'layout_history'));
      await assertSucceeds(setDoc(ref, entry));
      await assertFails(updateDoc(ref, { note: 'umgeschrieben' }));
      await assertFails(deleteDoc(ref));
      await assertFails(
        setDoc(doc(collection(db, 'layout_history')), { ...entry, publishedBy: 'x' })
      );
      await assertFails(setDoc(doc(collection(db, 'layout_history')), { ...entry, extra: 1 }));
      await assertSucceeds(getDocs(collection(db, 'layout_history')));
    });
  });

  it('non-admins cannot read or write the history', async () => {
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore();
      await assertFails(getDocs(collection(db, 'layout_history')));
      await assertFails(
        setDoc(doc(collection(db, 'layout_history')), {
          values: {},
          changes: [],
          note: '',
          publishedBy: 'someUser',
          publishedByName: '',
          publishedAt: serverTimestamp(),
        })
      );
    }
  });
});

// Mithelfer per region: Super-Admins everywhere, moderators in their regions.
// A helper without regionId belongs to Vorarlberg; regionId never changes.
describe('helpers per region', () => {
  const dbFor = (uid: string) =>
    env.authenticatedContext(uid, { email_verified: true }).firestore();
  const helper = (regionId: string) => ({
    name: 'H',
    profileSlug: null,
    website: null,
    photoURL: null,
    description: null,
    order: 0,
    createdBy: 'x',
    regionId,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'admin_users/modTirol'), {
        role: 'RegionModerator',
        regionIds: ['tirol'],
      });
      await setDoc(doc(db, 'admin_users/modVorarlberg'), {
        role: 'RegionModerator',
        regionIds: ['vorarlberg'],
      });
      await setDoc(doc(db, 'helpers/tirolH'), helper('tirol'));
      await setDoc(doc(db, 'helpers/wienH'), helper('wien'));
      await setDoc(doc(db, 'helpers/legacyH'), { name: 'Alt', order: 0 });
    });
  });

  it('a moderator manages the helpers of her own region', async () => {
    const db = dbFor('modTirol');
    await assertSucceeds(setDoc(doc(db, 'helpers/new'), helper('tirol')));
    await assertSucceeds(updateDoc(doc(db, 'helpers/tirolH'), { name: 'Neu', order: 100 }));
    await assertSucceeds(deleteDoc(doc(db, 'helpers/tirolH')));
  });

  it('a moderator cannot touch helpers of a foreign region', async () => {
    const db = dbFor('modTirol');
    await assertFails(setDoc(doc(db, 'helpers/new'), helper('wien')));
    await assertFails(updateDoc(doc(db, 'helpers/wienH'), { name: 'Neu' }));
    await assertFails(deleteDoc(doc(db, 'helpers/wienH')));
    await assertFails(updateDoc(doc(db, 'helpers/legacyH'), { name: 'Neu' }));
    await assertFails(deleteDoc(doc(db, 'helpers/legacyH')));
  });

  it('a helper without regionId belongs to Vorarlberg', async () => {
    const db = dbFor('modVorarlberg');
    await assertSucceeds(updateDoc(doc(db, 'helpers/legacyH'), { name: 'Neu', order: 100 }));
    await assertSucceeds(deleteDoc(doc(db, 'helpers/legacyH')));
  });

  it('nobody signed in as a visitor or organizer can write; everybody can read', async () => {
    for (const db of [env.unauthenticatedContext().firestore(), dbFor('organizer')]) {
      await assertSucceeds(getDoc(doc(db, 'helpers/tirolH')));
      await assertFails(setDoc(doc(db, 'helpers/new'), helper('tirol')));
      await assertFails(updateDoc(doc(db, 'helpers/tirolH'), { name: 'Neu' }));
    }
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('manages helpers of every region, but only with a valid regionId', async () => {
      const db = make().firestore();
      await assertSucceeds(setDoc(doc(db, 'helpers/new'), helper('wien')));
      await assertSucceeds(updateDoc(doc(db, 'helpers/tirolH'), { name: 'Neu' }));
      await assertSucceeds(updateDoc(doc(db, 'helpers/legacyH'), { name: 'Neu' }));
      await assertSucceeds(deleteDoc(doc(db, 'helpers/wienH')));
      const { regionId: _omit, ...noRegion } = helper('wien');
      await assertFails(setDoc(doc(db, 'helpers/noRegion'), noRegion));
      await assertFails(setDoc(doc(db, 'helpers/badRegion'), helper('atlantis')));
    });
  });

  it('regionId can neither be changed, added nor removed (not even by admins)', async () => {
    for (const db of [dbFor('modTirol'), dbFor('adminDoc')]) {
      await assertFails(updateDoc(doc(db, 'helpers/tirolH'), { regionId: 'wien' }));
      await assertFails(updateDoc(doc(db, 'helpers/tirolH'), { regionId: deleteField() }));
    }
    await assertFails(
      updateDoc(doc(dbFor('modVorarlberg'), 'helpers/legacyH'), { regionId: 'tirol' })
    );
    await assertFails(
      updateDoc(doc(dbFor('adminDoc'), 'helpers/legacyH'), { regionId: 'vorarlberg' })
    );
  });
});

// Donors per region: only Super-Admins write; unlike helpers they may move a
// donor to another region. A donor without regionId belongs to Vorarlberg.
describe('donors per region', () => {
  const donor = { name: 'D', amount: 5, frequency: null, note: null, order: 0 };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'admin_users/modTirol'), {
        role: 'RegionModerator',
        regionIds: ['tirol'],
      });
      await setDoc(doc(db, 'donors/tirolD'), { ...donor, regionId: 'tirol' });
      await setDoc(doc(db, 'donors/legacyD'), donor);
    });
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('creates donors with a valid or without regionId, never with an unknown one', async () => {
      const db = make().firestore();
      await assertSucceeds(setDoc(doc(db, 'donors/new1'), { ...donor, regionId: 'wien' }));
      await assertSucceeds(setDoc(doc(db, 'donors/new2'), donor));
      await assertFails(setDoc(doc(db, 'donors/new3'), { ...donor, regionId: 'atlantis' }));
      await assertFails(setDoc(doc(db, 'donors/new4'), { ...donor, regionId: 42 }));
    });

    it('moves a donor to another valid region, but cannot remove or break it', async () => {
      const db = make().firestore();
      await assertSucceeds(updateDoc(doc(db, 'donors/tirolD'), { regionId: 'wien' }));
      await assertSucceeds(updateDoc(doc(db, 'donors/legacyD'), { regionId: 'tirol' }));
      await assertFails(updateDoc(doc(db, 'donors/tirolD'), { regionId: 'atlantis' }));
      await assertFails(updateDoc(doc(db, 'donors/tirolD'), { regionId: deleteField() }));
    });
  });

  it('a moderator cannot write donors, not even of her own region', async () => {
    const db = env.authenticatedContext('modTirol', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'donors/new'), { ...donor, regionId: 'tirol' }));
    await assertFails(updateDoc(doc(db, 'donors/tirolD'), { amount: 10 }));
    await assertFails(updateDoc(doc(db, 'donors/tirolD'), { regionId: 'wien' }));
    await assertFails(deleteDoc(doc(db, 'donors/tirolD')));
  });
});
