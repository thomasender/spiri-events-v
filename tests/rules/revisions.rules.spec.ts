import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-revisions',
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
    await setDoc(doc(db, 'events/e1'), { status: 'pending', createdBy: 'owner' });
    await setDoc(doc(db, 'events/e1/revisions/r1'), { byRole: 'User', changes: {} });
  });
});

describe('events/{id}/revisions', () => {
  it('lets admins read', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDoc(doc(db, 'events/e1/revisions/r1')));
  });

  it('hides the history from the event owner', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertFails(getDoc(doc(db, 'events/e1/revisions/r1')));
  });

  it('hides the history from anonymous visitors', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'events/e1/revisions/r1')));
  });

  it('blocks client writes, even for admins', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(db, 'events/e1/revisions/r2'), { byRole: 'Admin' }));
  });
});
