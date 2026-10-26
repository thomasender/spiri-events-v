import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-onboarding',
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

const base = { displayName: 'Alice', bio: '' };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), base);
  });
});

// The cross-device "onboarding dismissed" flag on the own user doc.
describe('users/{uid}.onboardingDismissed', () => {
  it('the owner can set it on update', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: true }));
  });

  it('the owner can set it when the doc is created', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { ...base, onboardingDismissed: true }));
  });

  it('rejects a non-boolean value', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: 'yes' }));
    await assertFails(
      setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), {
        ...base,
        onboardingDismissed: 1,
      })
    );
  });

  it('nobody else can set it on someone elses doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: true }));
  });

  it('other unknown fields are still rejected', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { somethingElse: true }));
  });
});

// "Onboarding finished" on the own user doc: false at registration, true once done.
describe('users/{uid}.onboardingCompleted', () => {
  it('the owner can set it at registration and on finishing', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(carol, 'users/carol'), { ...base, onboardingCompleted: false })
    );
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { onboardingCompleted: true }));
  });

  it('rejects a non-boolean value and other people', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/alice'), { onboardingCompleted: 'yes' }));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(bob, 'users/alice'), { onboardingCompleted: true }));
  });
});

// In-app alerts for admins, written only by the Cloud Function.
describe('users/{uid}/adminAlerts', () => {
  const alert = { eventId: 'e1', eventTitle: 'Yoga', read: false, changeCount: 1 };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/adminAlerts/e1'), alert);
    });
  });

  it('the owner reads, marks as read and deletes', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/adminAlerts/e1')));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: true }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/adminAlerts/e1')));
  });

  it('nobody else can read or change it', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/adminAlerts/e1')));
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: true }));
  });

  it('no client can create an alert, not even for themselves', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/adminAlerts/e2'), alert));
  });

  it('the owner cannot edit anything but read, nor set it back to unread', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { changeCount: 9 }));
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: false }));
  });
});
