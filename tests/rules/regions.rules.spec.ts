import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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

// A region doc seeded before the CSV register (legacy keys name / slug / bezirke included):
// it must stay editable until scripts/cleanup-region-docs.mjs removes them.
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
    await assertFails(updateDoc(doc(db, 'users/member'), place('bayern')));
  });

  it('German regions of deutschland.csv are valid region ids (incl. reused old ids)', async () => {
    const db = member().firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/member'), place('allgaeu')));
    await assertSucceeds(updateDoc(doc(db, 'users/member'), place('lauenburg')));
    // Ten ids (the maximum), the last ones of the long list: hasOnly() stays within budget.
    await assertSucceeds(
      updateDoc(doc(db, 'users/member'), {
        directoryRegionIds: [
          'vorarlberg',
          'luebecker-bucht',
          'region-neumuenster',
          'unterelbe',
          'kiel-foerde',
          'flensburger-foerde',
          'westkueste',
          'lauenburg',
          'zuerich',
          'liechtenstein',
        ],
      })
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

  it('a cleaned doc without name / slug / bezirke stays editable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'regions/tirol'), {
        order: 1,
        active: false,
        contactEmail: '',
        seo: { title: '', description: '' },
        timezone: 'Europe/Vienna',
      });
    });
    const db = env.authenticatedContext('admin').firestore();
    await assertSucceeds(updateDoc(doc(db, 'regions/tirol'), { active: true }));
    const mod = env.authenticatedContext('mod').firestore();
    await assertSucceeds(updateDoc(doc(mod, 'regions/tirol'), { aboutText: '<p>Hallo</p>' }));
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

// Moderator applications and team notes (Trello 6afc59ed): only the functions write.
describe('moderator_applications and staff_notifications', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const application = { name: 'Maria', email: 'maria@x.at', message: 'Hallo', status: 'open' };
      await setDoc(doc(db, 'moderator_applications/tirolApp'), {
        ...application,
        regionId: 'tirol',
      });
      await setDoc(doc(db, 'moderator_applications/vbgApp'), {
        ...application,
        regionId: 'vorarlberg',
      });
      await setDoc(doc(db, 'moderator_applications/noRegion'), { ...application, regionId: null });
      const note = { kind: 'application', applicationId: 'tirolApp', name: 'Maria', readAt: null };
      await setDoc(doc(db, 'staff_notifications/modNote'), { ...note, recipientUid: 'mod' });
      await setDoc(doc(db, 'staff_notifications/adminNote'), { ...note, recipientUid: 'admin' });
      await setDoc(doc(db, 'staff_notifications/memberNote'), { ...note, recipientUid: 'member' });
    });
  });

  it('applications: Super-Admin reads all, a moderator only those of her regions', async () => {
    const admin = env.authenticatedContext('admin').firestore();
    for (const id of ['tirolApp', 'vbgApp', 'noRegion']) {
      await assertSucceeds(getDoc(doc(admin, `moderator_applications/${id}`)));
    }
    const mod = env.authenticatedContext('mod').firestore();
    await assertSucceeds(getDoc(doc(mod, 'moderator_applications/tirolApp')));
    await assertFails(getDoc(doc(mod, 'moderator_applications/vbgApp')));
    await assertFails(getDoc(doc(mod, 'moderator_applications/noRegion')));
    const member = env.authenticatedContext('member').firestore();
    await assertFails(getDoc(doc(member, 'moderator_applications/tirolApp')));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'moderator_applications/tirolApp'))
    );
  });

  it('applications: nobody writes from the client', async () => {
    for (const uid of ['admin', 'mod']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(updateDoc(doc(db, 'moderator_applications/tirolApp'), { status: 'done' }));
      await assertFails(setDoc(doc(db, 'moderator_applications/new'), { regionId: 'tirol' }));
      await assertFails(deleteDoc(doc(db, 'moderator_applications/tirolApp')));
    }
  });

  it('notes: staff read only their own, also as a query', async () => {
    const mod = env.authenticatedContext('mod').firestore();
    await assertSucceeds(getDoc(doc(mod, 'staff_notifications/modNote')));
    await assertFails(getDoc(doc(mod, 'staff_notifications/adminNote')));
    await assertSucceeds(
      getDocs(query(collection(mod, 'staff_notifications'), where('recipientUid', '==', 'mod')))
    );
    await assertFails(getDocs(collection(mod, 'staff_notifications')));
    // Someone who is no longer staff cannot read old notes.
    const member = env.authenticatedContext('member').firestore();
    await assertFails(getDoc(doc(member, 'staff_notifications/memberNote')));
  });

  it('notes: the recipient only marks her own as read, once', async () => {
    const mod = env.authenticatedContext('mod').firestore();
    await assertFails(updateDoc(doc(mod, 'staff_notifications/modNote'), { readAt: 123 }));
    await assertFails(
      updateDoc(doc(mod, 'staff_notifications/modNote'), {
        readAt: serverTimestamp(),
        name: 'Eve',
      })
    );
    await assertFails(
      updateDoc(doc(mod, 'staff_notifications/adminNote'), { readAt: serverTimestamp() })
    );
    await assertSucceeds(
      updateDoc(doc(mod, 'staff_notifications/modNote'), { readAt: serverTimestamp() })
    );
    await assertFails(
      updateDoc(doc(mod, 'staff_notifications/modNote'), { readAt: serverTimestamp() })
    );
    await assertFails(
      setDoc(doc(mod, 'staff_notifications/forged'), { recipientUid: 'mod', readAt: null })
    );
    await assertFails(deleteDoc(doc(mod, 'staff_notifications/modNote')));
  });
});
