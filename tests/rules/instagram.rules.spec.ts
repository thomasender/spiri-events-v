import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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
