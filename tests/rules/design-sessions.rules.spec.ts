import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-design-sessions',
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
    await setDoc(doc(db, 'admin_users/adminA'), { role: 'Admin' });
    await setDoc(doc(db, 'admin_users/adminB'), { role: 'Admin' });
    await setDoc(doc(db, 'design_sessions/adminB'), {
      uid: 'adminB',
      name: 'B',
      lastSeen: Timestamp.now(),
    });
  });
});

const session = (uid: string) => ({ uid, name: 'Name', lastSeen: serverTimestamp() });

describe('design_sessions', () => {
  it('an admin writes and removes their own session', async () => {
    const db = env.authenticatedContext('adminA').firestore();
    await assertSucceeds(setDoc(doc(db, 'design_sessions/adminA'), session('adminA')));
    await assertSucceeds(deleteDoc(doc(db, 'design_sessions/adminA')));
  });

  it('an admin cannot write or remove the session of another admin', async () => {
    const db = env.authenticatedContext('adminA').firestore();
    await assertFails(setDoc(doc(db, 'design_sessions/adminB'), session('adminB')));
    await assertFails(deleteDoc(doc(db, 'design_sessions/adminB')));
  });

  it('rejects client timestamps, extra fields and a mismatching uid', async () => {
    const db = env.authenticatedContext('adminA').firestore();
    const ref = doc(db, 'design_sessions/adminA');
    await assertFails(setDoc(ref, { ...session('adminA'), lastSeen: Timestamp.now() }));
    await assertFails(setDoc(ref, { ...session('adminA'), extra: 1 }));
    await assertFails(setDoc(ref, session('adminB')));
  });

  it('admins read all sessions, everybody else nothing', async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('adminA').firestore(), 'design_sessions/adminB'))
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext('user1').firestore(), 'design_sessions/adminB'))
    );
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'design_sessions/adminB'))
    );
  });

  it('non-admins cannot write', async () => {
    const db = env.authenticatedContext('user1').firestore();
    await assertFails(setDoc(doc(db, 'design_sessions/user1'), session('user1')));
  });
});
