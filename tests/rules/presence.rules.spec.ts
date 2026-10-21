import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-presence',
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

const publicProfile = (uid: string) => `users/${uid}/publicProfile/data`;

async function setMode(mode: string | null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    if (mode === null) await deleteDoc(doc(db, 'app_settings/onlineStatus'));
    else await setDoc(doc(db, 'app_settings/onlineStatus'), { mode });
  });
}

// alice shares her status, bob has the default (off), carol has no profile doc.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, publicProfile('alice')), { displayName: 'Alice', showOnlineStatus: true });
    await setDoc(doc(db, publicProfile('bob')), { displayName: 'Bob', showOnlineStatus: false });
    await setDoc(doc(db, 'presence/old'), { lastSeen: Timestamp.now() });
    await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
  });
  await setMode('all');
});

const verified = (uid: string) => env.authenticatedContext(uid, { email_verified: true });
const unverified = (uid: string) => env.authenticatedContext(uid, { email_verified: false });
const anon = () => env.unauthenticatedContext();
const beat = () => ({ lastSeen: serverTimestamp() });

describe('presence: who may write', () => {
  it('a person who shares their status writes and removes their own heartbeat', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'presence/alice'), beat()));
    await assertSucceeds(deleteDoc(doc(db, 'presence/alice')));
  });

  it('nobody writes while the opt-in is off (default) or the profile does not exist', async () => {
    await assertFails(setDoc(doc(verified('bob').firestore(), 'presence/bob'), beat()));
    await assertFails(setDoc(doc(verified('carol').firestore(), 'presence/carol'), beat()));
  });

  it('nobody writes for somebody else, even if that person shares', async () => {
    await assertFails(setDoc(doc(verified('bob').firestore(), 'presence/alice'), beat()));
    await assertFails(setDoc(doc(anon().firestore(), 'presence/alice'), beat()));
  });

  it('only a server timestamp and nothing else is accepted', async () => {
    const db = verified('alice').firestore();
    await assertFails(setDoc(doc(db, 'presence/alice'), { lastSeen: Timestamp.now() }));
    await assertFails(setDoc(doc(db, 'presence/alice'), { ...beat(), extra: 1 }));
  });

  it('limits heartbeats to one per 20 seconds', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'presence/alice'), beat()));
    await assertFails(setDoc(doc(db, 'presence/alice'), beat()));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'presence/alice'), {
        lastSeen: Timestamp.fromMillis(Date.now() - 60_000),
      })
    );
    await assertSucceeds(updateDoc(doc(db, 'presence/alice'), beat()));
  });

  it('opting out blocks the next heartbeat', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), publicProfile('alice')), {
        displayName: 'Alice',
        showOnlineStatus: false,
      })
    );
    await assertFails(setDoc(doc(verified('alice').firestore(), 'presence/alice'), beat()));
  });

  it('deleting is only allowed for the owner', async () => {
    await assertFails(deleteDoc(doc(verified('bob').firestore(), 'presence/old')));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'presence/bob'), { lastSeen: Timestamp.now() })
    );
    await assertSucceeds(deleteDoc(doc(verified('bob').firestore(), 'presence/bob')));
  });
});

describe('presence: the feature flag', () => {
  const adminToken = () =>
    env.authenticatedContext('adminTok', { role: 'Admin', email_verified: true });

  it('a missing flag doc means "admins": only admins write and read', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), publicProfile('adminTok')), {
        displayName: 'Admin',
        showOnlineStatus: true,
      })
    );
    await setMode(null);
    await assertSucceeds(setDoc(doc(adminToken().firestore(), 'presence/adminTok'), beat()));
    await assertSucceeds(getDocs(collection(adminToken().firestore(), 'presence')));
    await assertFails(setDoc(doc(verified('alice').firestore(), 'presence/alice'), beat()));
    await assertFails(getDocs(collection(verified('alice').firestore(), 'presence')));
  });

  it('"off" closes it for everybody, "all" opens it', async () => {
    await setMode('off');
    await assertFails(setDoc(doc(verified('alice').firestore(), 'presence/alice'), beat()));
    await assertFails(getDocs(collection(adminToken().firestore(), 'presence')));
    await setMode('all');
    await assertSucceeds(setDoc(doc(verified('alice').firestore(), 'presence/alice'), beat()));
  });

  it('only admins write the flag, with a valid mode', async () => {
    await assertFails(
      setDoc(doc(verified('alice').firestore(), 'app_settings/onlineStatus'), { mode: 'all' })
    );
    await assertSucceeds(
      setDoc(doc(adminToken().firestore(), 'app_settings/onlineStatus'), {
        mode: 'admins',
        updatedAt: serverTimestamp(),
        updatedBy: 'adminTok',
      })
    );
    await assertFails(
      setDoc(doc(adminToken().firestore(), 'app_settings/onlineStatus'), { mode: 'everyone' })
    );
  });
});

describe('presence: who may read', () => {
  it('verified members read, logged-out visitors and unverified accounts do not', async () => {
    await assertSucceeds(getDocs(collection(verified('bob').firestore(), 'presence')));
    await assertFails(getDocs(collection(anon().firestore(), 'presence')));
    await assertFails(getDocs(collection(unverified('bob').firestore(), 'presence')));
  });
});

describe('profile: the showOnlineStatus option', () => {
  it('the owner sets it on the user doc and the public profile; it must be a boolean', async () => {
    const db = verified('carol').firestore();
    const base = { displayName: 'Carol', bio: 'b' };
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { ...base, showOnlineStatus: true }));
    await assertSucceeds(
      setDoc(doc(db, publicProfile('carol')), { ...base, showOnlineStatus: true })
    );
    await assertFails(setDoc(doc(db, 'users/carol'), { ...base, showOnlineStatus: 'yes' }));
    await assertFails(updateDoc(doc(db, publicProfile('carol')), { showOnlineStatus: 'yes' }));
    await assertSucceeds(updateDoc(doc(db, publicProfile('carol')), { showOnlineStatus: false }));
  });

  it('nobody can switch it on for somebody else', async () => {
    await assertFails(
      updateDoc(doc(verified('bob').firestore(), publicProfile('bob').replace('bob', 'alice')), {
        showOnlineStatus: false,
      })
    );
  });
});
