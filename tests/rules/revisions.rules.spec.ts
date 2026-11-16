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
    await setDoc(doc(db, 'events/e1/registrations/g1'), {
      name: 'Gast',
      contact: 'gast@example.com',
      contactType: 'email',
    });
    await setDoc(doc(db, 'events/e1/registration_mails/m1'), { createdAt: 1 });
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
    await setDoc(doc(db, 'app_stats/fun_facts'), { events: { published: 3 } });
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

describe('events/{id}/registrations', () => {
  it('lets the organizer and admins read', async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('owner').firestore(), 'events/e1/registrations/g1'))
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('adminDoc').firestore(), 'events/e1/registrations/g1'))
    );
  });

  it('hides registrations from other members and visitors', async () => {
    await assertFails(
      getDoc(doc(env.authenticatedContext('someone').firestore(), 'events/e1/registrations/g1'))
    );
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'events/e1/registrations/g1'))
    );
  });

  it('blocks every client write, even for the organizer and admins', async () => {
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(guest, 'events/e1/registrations/g2'), { name: 'X' }));
    const member = env.authenticatedContext('someone').firestore();
    await assertFails(setDoc(doc(member, 'events/e1/registrations/g2'), { name: 'X' }));
    const owner = env.authenticatedContext('owner').firestore();
    await assertFails(updateDoc(doc(owner, 'events/e1/registrations/g1'), { name: 'Y' }));
    await assertFails(deleteDoc(doc(owner, 'events/e1/registrations/g1')));
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(admin, 'events/e1/registrations/g3'), { name: 'X' }));
  });

  it('keeps the confirmation markers server-only', async () => {
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertFails(getDoc(doc(admin, 'events/e1/registration_mails/m1')));
    const member = env.authenticatedContext('someone').firestore();
    await assertFails(setDoc(doc(member, 'events/e1/registration_mails/m2'), { createdAt: 1 }));
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

describe('app_stats (Fun Facts)', () => {
  it('lets Super-Admins read it', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDoc(doc(db, 'app_stats/fun_facts')));
  });

  it('hides it from region moderators, organizers and anonymous visitors', async () => {
    for (const db of [
      env.authenticatedContext('tirolMod').firestore(),
      env.authenticatedContext('owner').firestore(),
      env.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(doc(db, 'app_stats/fun_facts')));
    }
  });

  it('blocks client writes, even for Super-Admins', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(db, 'app_stats/fun_facts'), { events: { published: 99 } }));
    await assertFails(updateDoc(doc(db, 'app_stats/fun_facts'), { events: {} }));
    await assertFails(deleteDoc(doc(db, 'app_stats/fun_facts')));
  });
});
