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

// Regions exist only in code: ids come from the static list in firestore.rules and the
// regions/{id} docs never get their name, slug or districts written from the client.

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-regions',
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

// A seeded region doc as scripts/seed-regions.mjs writes it (legacy keys included).
const tirolDoc = {
  name: 'Tirol',
  slug: 'tirol',
  order: 1,
  active: false,
  bezirke: ['Innsbruck'],
  contactEmail: '',
  seo: { title: '', description: '' },
  timezone: 'Europe/Vienna',
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/admin'), { role: 'Admin' });
    await setDoc(doc(db, 'admin_users/mod'), { role: 'RegionModerator', regionIds: ['tirol'] });
    await setDoc(doc(db, 'users/member'), { displayName: 'Member', bio: 'b' });
    await setDoc(doc(db, 'regions/tirol'), tirolDoc);
  });
});

const place = (regionId: string) => ({
  placeSelection: {
    label: 'Kempten',
    lat: 47.7,
    lon: 10.3,
    radiusKm: 25,
    regionId,
    source: 'search',
    updatedAt: 1,
  },
});
const member = () => env.authenticatedContext('member', { email_verified: true });

describe('region ids', () => {
  it('only the static ids are accepted as place selection and directory region', async () => {
    const db = member().firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/member'), place('tirol')));
    await assertSucceeds(
      updateDoc(doc(db, 'users/member'), { directoryRegionIds: ['vorarlberg', 'tirol'] })
    );
    await assertFails(updateDoc(doc(db, 'users/member'), place('allgaeu-schwaben')));
    await assertFails(
      updateDoc(doc(db, 'users/member'), { directoryRegionIds: ['allgaeu-schwaben'] })
    );
  });

  it('a client cannot invent a region document or a custom-region list', async () => {
    const admin = env.authenticatedContext('admin').firestore();
    await assertFails(setDoc(doc(admin, 'regions/erfunden'), { ...tirolDoc, slug: 'erfunden' }));
    await assertFails(setDoc(doc(admin, 'app_settings/customRegions'), { ids: ['erfunden'] }));
  });
});

describe('regions/{id} writes', () => {
  it('a Super-Admin can switch a region on and set its contact data', async () => {
    const db = env.authenticatedContext('admin').firestore();
    await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { active: true }));
    await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { contactEmail: 'a@b.at' }));
  });

  it('nobody writes name, slug, districts or the old mapping marker from the client', async () => {
    const db = env.authenticatedContext('admin').firestore();
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { name: 'Tirol neu' }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { bezirke: ['Innsbruck', 'Kufstein'] }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { mappingUpdatedAt: 5 }));
  });

  it('the keys of the custom regions are gone from the whitelist', async () => {
    const db = env.authenticatedContext('admin').firestore();
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { custom: true }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { country: 'AT' }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { subdivisionLabel: 'Bezirk' }));
  });

  it('the moderator of the region edits its "Über uns" text, nothing else', async () => {
    const db = env.authenticatedContext('mod').firestore();
    await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { aboutText: 'Hallo', updatedAt: 2 }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { active: true }));
    await assertFails(updateDoc(doc(db, 'regions/tirol'), { bezirke: [] }));
  });
});
