import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'admin_users/tirolMod'), {
      role: 'RegionModerator',
      regionIds: ['tirol'],
    });
    await setDoc(doc(db, 'moderation_log/m1'), {
      action: 'approved',
      eventId: 'e1',
      regionId: 'tirol',
      actorUid: 'tirolMod',
      actorRole: 'RegionModerator',
      byStaff: true,
    });
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

describe('moderation_log', () => {
  it('lets Super-Admins read and list it', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDoc(doc(db, 'moderation_log/m1')));
    await assertSucceeds(getDocs(collection(db, 'moderation_log')));
  });

  it('hides it from region moderators, even for their own entries', async () => {
    const db = env.authenticatedContext('tirolMod').firestore();
    await assertFails(getDoc(doc(db, 'moderation_log/m1')));
    await assertFails(getDocs(collection(db, 'moderation_log')));
  });

  it('hides it from organizers and anonymous visitors', async () => {
    await assertFails(
      getDoc(doc(env.authenticatedContext('owner').firestore(), 'moderation_log/m1'))
    );
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'moderation_log/m1')));
  });

  it('blocks client writes, even for Super-Admins', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(db, 'moderation_log/m2'), { action: 'approved' }));
    await assertFails(updateDoc(doc(db, 'moderation_log/m1'), { action: 'rejected' }));
    await assertFails(deleteDoc(doc(db, 'moderation_log/m1')));
  });
});
