import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-faqs',
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

const stored = {
  question: 'Warum heißt die Plattform „dein tribe“?',
  answerHtml: '<p>Weil wir Menschen zusammenbringen.</p>',
  topic: 'Über die Plattform',
  order: 0,
  published: true,
  createdBy: 'adminDoc',
};

function newFaq(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    question: 'Wer darf Events eintragen?',
    answerHtml: '<p>Alle mit einem Konto.</p>',
    topic: 'Events',
    order: 100,
    published: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
    await setDoc(doc(db, 'admin_users/mod'), { role: 'RegionModerator', regionIds: ['tirol'] });
    await setDoc(doc(db, 'faqs/live'), stored);
    await setDoc(doc(db, 'faqs/draft'), { ...stored, order: 100, published: false });
  });
});

describe('faqs', () => {
  it('lets guests read published entries, also through the page query', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'faqs/live')));
    await assertSucceeds(getDocs(query(collection(db, 'faqs'), where('published', '==', true))));
  });

  it('hides drafts from guests and members', async () => {
    for (const db of [
      env.unauthenticatedContext().firestore(),
      env.authenticatedContext('someone').firestore(),
      env.authenticatedContext('mod').firestore(),
    ]) {
      await assertFails(getDoc(doc(db, 'faqs/draft')));
      await assertFails(getDocs(collection(db, 'faqs')));
    }
  });

  it('lets Super-Admins read everything, drafts included', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDoc(doc(db, 'faqs/draft')));
    await assertSucceeds(getDocs(collection(db, 'faqs')));
  });

  it.each([
    ['a guest', null],
    ['a logged-in member', 'someone'],
    ['a region moderator', 'mod'],
  ])('refuses every write by %s', async (_label, uid) => {
    const db = (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
    await assertFails(setDoc(doc(db, 'faqs/x'), newFaq(uid ?? 'anon')));
    await assertFails(updateDoc(doc(db, 'faqs/live'), { question: 'Gekapert?' }));
    await assertFails(deleteDoc(doc(db, 'faqs/live')));
  });

  it('lets Super-Admins create, update, reorder and delete', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(setDoc(doc(db, 'faqs/x'), newFaq('adminDoc')));
    await assertSucceeds(setDoc(doc(db, 'faqs/empty-topic'), newFaq('adminDoc', { topic: '' })));
    await assertSucceeds(
      updateDoc(doc(db, 'faqs/live'), {
        question: 'Neue Frage?',
        answerHtml: '<p>Neue Antwort.</p>',
        topic: 'Allgemein',
        published: false,
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'faqs/draft'), { order: 300, updatedAt: serverTimestamp() })
    );
    await assertSucceeds(deleteDoc(doc(db, 'faqs/live')));
  });

  it('refuses foreign fields, too long or empty texts and wrong types', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    const bad = [
      newFaq('adminDoc', { regionId: 'tirol' }),
      newFaq('adminDoc', { question: 'x'.repeat(201) }),
      newFaq('adminDoc', { question: '' }),
      newFaq('adminDoc', { answerHtml: '' }),
      newFaq('adminDoc', { answerHtml: 'x'.repeat(10001) }),
      newFaq('adminDoc', { topic: 'x'.repeat(61) }),
      newFaq('adminDoc', { published: 'yes' }),
      newFaq('adminDoc', { order: '1' }),
      newFaq('adminDoc', { order: -100 }),
      newFaq('adminDoc', { createdBy: 'someoneElse' }),
    ];
    for (const data of bad) {
      await assertFails(setDoc(doc(db, 'faqs/bad'), data));
    }
    const badUpdates = [
      { createdBy: 'adminDoc2' },
      { regionId: 'tirol' },
      { question: 'x'.repeat(201) },
      { published: 1 },
      { order: 1.5 },
    ];
    for (const patch of badUpdates) {
      await assertFails(
        updateDoc(doc(db, 'faqs/live'), { ...patch, updatedAt: serverTimestamp() })
      );
    }
  });
});

// Weihnachtsfeier page (`site_pages/weihnachtsfeier`): invisible until published.
describe('site_pages/weihnachtsfeier', () => {
  const content = { title: 'Tribe-Weihnachtsfeier', bringIdeas: ['Brot'], steps: [] };
  const page = (published: boolean, uid = 'adminDoc') => ({
    published,
    content,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  const registration = (overrides: Record<string, unknown> = {}) => ({
    name: 'Gast',
    contact: 'gast@example.com',
    persons: 2,
    bring: ['Brot'],
    note: '',
    createdAt: serverTimestamp(),
    ...overrides,
  });

  async function seed(published: boolean | null) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
      if (published !== null) {
        await setDoc(doc(db, 'site_pages/weihnachtsfeier'), { published, content });
      }
    });
  }

  it('hides an unpublished page from guests and members, shows it to admins', async () => {
    await seed(false);
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'site_pages/weihnachtsfeier'))
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext('member').firestore(), 'site_pages/weihnachtsfeier'))
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('adminDoc').firestore(), 'site_pages/weihnachtsfeier'))
    );
  });

  it('shows a published page to everybody', async () => {
    await seed(true);
    await assertSucceeds(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'site_pages/weihnachtsfeier'))
    );
  });

  it('lets only admins write the page, with known fields only', async () => {
    await seed(null);
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertFails(
      setDoc(
        doc(env.authenticatedContext('member').firestore(), 'site_pages/weihnachtsfeier'),
        page(true, 'member')
      )
    );
    await assertFails(setDoc(doc(admin, 'site_pages/other'), page(false)));
    await assertFails(
      setDoc(doc(admin, 'site_pages/weihnachtsfeier'), {
        ...page(false),
        content: { ...content, evil: 1 },
      })
    );
    await assertFails(setDoc(doc(admin, 'site_pages/weihnachtsfeier'), page(false, 'someoneElse')));
    await assertSucceeds(setDoc(doc(admin, 'site_pages/weihnachtsfeier'), page(false)));
  });

  it('accepts registrations only while published, validated, and reads them for admins only', async () => {
    const guestPath = 'site_pages/weihnachtsfeier/registrations/r1';
    await seed(false);
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(guest, guestPath), registration()));
    await assertSucceeds(
      setDoc(doc(env.authenticatedContext('adminDoc').firestore(), guestPath), registration())
    );

    await seed(true);
    await assertSucceeds(setDoc(doc(guest, guestPath), registration()));
    for (const bad of [
      registration({ persons: 0 }),
      registration({ persons: 11 }),
      registration({ name: '' }),
      registration({ contact: 'x' }),
      registration({ bring: Array(11).fill('a') }),
      registration({ note: 'x'.repeat(501) }),
      registration({ extra: true }),
      registration({ createdAt: new Date(0) }),
    ]) {
      await assertFails(setDoc(doc(guest, 'site_pages/weihnachtsfeier/registrations/bad'), bad));
    }
    await assertFails(getDoc(doc(guest, guestPath)));
    await assertFails(getDocs(collection(guest, 'site_pages/weihnachtsfeier/registrations')));
    await assertFails(updateDoc(doc(guest, guestPath), { persons: 3 }));
    await assertFails(deleteDoc(doc(guest, guestPath)));
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDocs(collection(admin, 'site_pages/weihnachtsfeier/registrations')));
    await assertSucceeds(deleteDoc(doc(admin, guestPath)));
  });

  it('shows the anonymous bring summary only once published, and never lets clients write it', async () => {
    const path = 'site_pages/weihnachtsfeier/summary/bring';
    await seed(false);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), { items: [{ label: 'Brot', count: 1 }] });
    });
    const guest = env.unauthenticatedContext().firestore();
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertFails(getDoc(doc(guest, path)));
    await assertSucceeds(getDoc(doc(admin, path)));
    await assertFails(setDoc(doc(admin, path), { items: [] }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'site_pages/weihnachtsfeier'), {
        published: true,
        content,
      });
    });
    await assertSucceeds(getDoc(doc(guest, path)));
    await assertFails(setDoc(doc(guest, path), { items: [] }));
  });

  it('lets a signed-in person register under their own uid, see and withdraw only that one', async () => {
    await seed(true);
    const me = env.authenticatedContext('member').firestore();
    const other = env.authenticatedContext('other').firestore();
    const own = 'site_pages/weihnachtsfeier/registrations/member';
    await assertSucceeds(setDoc(doc(me, own), registration({ uid: 'member' })));
    await assertFails(setDoc(doc(me, own), registration({ uid: 'member', persons: 3 }))); // no update
    await assertSucceeds(getDoc(doc(me, own)));
    await assertFails(getDoc(doc(other, own)));
    await assertFails(getDocs(collection(me, 'site_pages/weihnachtsfeier/registrations')));
    await assertFails(
      setDoc(doc(me, 'site_pages/weihnachtsfeier/registrations/x'), registration({ uid: 'other' }))
    );
    await assertFails(
      setDoc(
        doc(env.unauthenticatedContext().firestore(), 'site_pages/weihnachtsfeier/registrations/y'),
        registration({ uid: 'member' })
      )
    );
    await assertFails(deleteDoc(doc(other, own)));
    await assertSucceeds(deleteDoc(doc(me, own)));
  });
});
