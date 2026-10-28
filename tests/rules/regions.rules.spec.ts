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

// Regions created in the Verwaltung (adminCreateRegion) are accepted as ids only
// once app_settings/customRegions lists them; the built-in ids need no lookup.

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

const customRegionDoc = {
  name: 'Allgäu-Schwaben',
  slug: 'allgaeu-schwaben',
  order: 100.001,
  active: false,
  bezirke: [],
  custom: true,
  country: 'DE',
  inPhrase: 'im Allgäu',
  forPhrase: 'Allgäu-Schwaben',
  demonym: '',
  subdivisionLabel: 'Landkreis',
  timezone: 'Europe/Berlin',
};

async function seed({ listed }: { listed: boolean }) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/admin'), { role: 'Admin' });
    await setDoc(doc(db, 'admin_users/mod'), {
      role: 'RegionModerator',
      regionIds: ['allgaeu-schwaben'],
    });
    await setDoc(doc(db, 'users/member'), { displayName: 'Member', bio: 'b' });
    await setDoc(doc(db, 'regions/allgaeu-schwaben'), customRegionDoc);
    if (listed) await setDoc(doc(db, 'app_settings/customRegions'), { ids: ['allgaeu-schwaben'] });
  });
}

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

describe('custom region ids', () => {
  describe('listed in app_settings/customRegions', () => {
    beforeEach(() => seed({ listed: true }));

    it('are accepted as place selection and directory region', async () => {
      const db = member().firestore();
      await assertSucceeds(updateDoc(doc(db, 'users/member'), place('allgaeu-schwaben')));
      await assertSucceeds(
        updateDoc(doc(db, 'users/member'), {
          directoryRegionIds: ['vorarlberg', 'allgaeu-schwaben'],
        })
      );
    });

    it('still reject ids nobody created', async () => {
      const db = member().firestore();
      await assertFails(updateDoc(doc(db, 'users/member'), place('erfunden')));
      await assertFails(updateDoc(doc(db, 'users/member'), { directoryRegionIds: ['erfunden'] }));
    });

    it('let the moderator of the region edit its "Über uns" text, nothing else', async () => {
      const db = env.authenticatedContext('mod').firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'regions/allgaeu-schwaben'), { aboutText: 'Hallo', updatedAt: 2 })
      );
      await assertFails(updateDoc(doc(db, 'regions/allgaeu-schwaben'), { active: true }));
    });

    it('let a Super-Admin rename the region and keep its wording valid', async () => {
      const db = env.authenticatedContext('admin').firestore();
      await assertSucceeds(updateDoc(doc(db, 'regions/allgaeu-schwaben'), { name: 'Allgäu' }));
      await assertFails(updateDoc(doc(db, 'regions/allgaeu-schwaben'), { country: 'FR' }));
      await assertFails(
        updateDoc(doc(db, 'regions/allgaeu-schwaben'), { subdivisionLabel: 'Kreis' })
      );
    });
  });

  describe('not listed', () => {
    beforeEach(() => seed({ listed: false }));

    it('are rejected as place selection and directory region', async () => {
      const db = member().firestore();
      await assertFails(updateDoc(doc(db, 'users/member'), place('allgaeu-schwaben')));
      await assertFails(
        updateDoc(doc(db, 'users/member'), { directoryRegionIds: ['allgaeu-schwaben'] })
      );
    });

    it('built-in ids need no lookup', async () => {
      const db = member().firestore();
      await assertSucceeds(updateDoc(doc(db, 'users/member'), place('tirol')));
    });

    it('cannot be written to the id list by the client', async () => {
      const admin = env.authenticatedContext('admin').firestore();
      await assertFails(
        setDoc(doc(admin, 'app_settings/customRegions'), { ids: ['allgaeu-schwaben'] })
      );
    });
  });

  it('a client cannot invent a region document with a made-up slug', async () => {
    await seed({ listed: true });
    const admin = env.authenticatedContext('admin').firestore();
    await assertFails(
      setDoc(doc(admin, 'regions/erfunden'), { ...customRegionDoc, slug: 'erfunden' })
    );
  });
});
