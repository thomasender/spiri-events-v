import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
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

// The remembered "Wo bist du?" choice (place + radius) on the own user doc.
describe('users/{uid}.placeSelection', () => {
  const valid = {
    label: 'Bregenz',
    lat: 47.503,
    lon: 9.747,
    radiusKm: 25,
    regionId: 'vorarlberg',
    source: 'search',
    updatedAt: 1760000000000,
  };

  it('the owner can save and clear it', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { placeSelection: valid }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { placeSelection: null }));
  });

  it('a place without a region is fine (outside every region)', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), { placeSelection: { ...valid, regionId: null } })
    );
  });

  it.each([
    ['an unknown region', { regionId: 'narnia' }],
    ['a radius of 0', { radiusKm: 0 }],
    ['a radius above 200 km', { radiusKm: 500 }],
    ['an impossible latitude', { lat: 91 }],
    ['an impossible longitude', { lon: 181 }],
    ['an empty label', { label: '' }],
    ['a very long label', { label: 'x'.repeat(81) }],
    ['an unknown source', { source: 'ip' }],
    ['a stored exact position', { accuracy: 12 }],
  ])('rejects %s', async (_name, patch) => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      updateDoc(doc(db, 'users/alice'), { placeSelection: { ...valid, ...patch } })
    );
  });

  it('rejects something that is not a map', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { placeSelection: 'Bregenz' }));
  });

  it('nobody else can set it on someone elses doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { placeSelection: valid }));
  });
});
