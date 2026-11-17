import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

// Pre-entered events (Trello 6afb1116, docs/pre-entries.md): contact data and token
// hashes are server-only; the pre-entered event belongs to the system account and a
// Regions-Moderator:in changes it only through the functions (check-out / check-in).
describe('pre-entries', () => {
  const SYSTEM_UID = 'system-dein-tribe';
  const preEntryEvent = {
    title: 'Klangreise',
    description: '<p>x</p>',
    status: 'draft',
    createdBy: SYSTEM_UID,
    preEntry: true,
    regionId: 'tirol',
    organizer: { name: 'Studio Klang', email: '' },
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'events/pre1'), preEntryEvent);
      await setDoc(doc(db, 'pre_entries/pre1'), {
        status: 'draft',
        regionId: 'tirol',
        contact: { email: 'studio@example.test' },
      });
      await setDoc(doc(db, 'pre_entry_tokens/abc'), { eventId: 'pre1', kind: 'preview' });
    });
  });

  it('pre_entries and pre_entry_tokens are closed to every client, Super-Admins included', async () => {
    for (const ctx of [
      env.authenticatedContext('admin'),
      env.authenticatedContext('mod', { email_verified: true }),
      member(),
      env.unauthenticatedContext(),
    ]) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'pre_entries/pre1')));
      await assertFails(getDoc(doc(db, 'pre_entry_tokens/abc')));
      await assertFails(setDoc(doc(db, 'pre_entries/new'), { status: 'draft' }));
      await assertFails(updateDoc(doc(db, 'pre_entries/pre1'), { status: 'published' }));
      await assertFails(deleteDoc(doc(db, 'pre_entry_tokens/abc')));
    }
  });

  it('a moderator neither reads nor changes the system draft directly, even in her region', async () => {
    const db = env.authenticatedContext('mod', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, 'events/pre1')));
    await assertFails(updateDoc(doc(db, 'events/pre1'), { title: 'Anders' }));
    await assertFails(updateDoc(doc(db, 'events/pre1'), { status: 'approved' }));
    await assertFails(updateDoc(doc(db, 'events/pre1'), { createdBy: 'mod' }));
  });

  it('nobody but the system account can create an event in its name', async () => {
    const db = member().firestore();
    await assertFails(setDoc(doc(db, 'events/fake'), { ...preEntryEvent, createdBy: SYSTEM_UID }));
  });

  it('only a Super-Admin writes the flag and the defaults, and only valid values', async () => {
    const admin = env.authenticatedContext('admin').firestore();
    const mod = env.authenticatedContext('mod', { email_verified: true }).firestore();
    const ok = {
      mode: 'admins',
      validDays: 14,
      reminderDays: 4,
      autoDeleteDays: 30,
      templates: { initial: { subject: 'Hallo', text: 'Hallo {ansprechperson}' } },
    };
    await assertFails(setDoc(doc(mod, 'app_settings/preEntries'), ok));
    await assertFails(setDoc(doc(member().firestore(), 'app_settings/preEntries'), ok));
    await assertSucceeds(setDoc(doc(admin, 'app_settings/preEntries'), ok));
    await assertSucceeds(updateDoc(doc(admin, 'app_settings/preEntries'), { mode: 'all' }));
    await assertFails(updateDoc(doc(admin, 'app_settings/preEntries'), { mode: 'everyone' }));
    await assertFails(updateDoc(doc(admin, 'app_settings/preEntries'), { validDays: 0 }));
    await assertFails(updateDoc(doc(admin, 'app_settings/preEntries'), { autoDeleteDays: 400 }));
    await assertFails(
      updateDoc(doc(admin, 'app_settings/preEntries'), { templates: { andere: { text: 'x' } } })
    );
    await assertFails(updateDoc(doc(admin, 'app_settings/preEntries'), { secret: true }));
    // Public read: the preview page and the wizard need the flag.
    await assertSucceeds(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'app_settings/preEntries'))
    );
  });
});
