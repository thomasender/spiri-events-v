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
