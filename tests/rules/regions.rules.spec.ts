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
  deleteField,
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

// Event import (docs/event-import.md): curation data is Super-Admin only, and a
// curated event never goes public from the client before the organizer consented.
describe('event import (import_* collections, events.curation)', () => {
  const hash = 'a'.repeat(64);
  const organizer = {
    name: 'Yogaverein Tirol',
    website: 'https://yoga-tirol.at',
    contactEmail: 'info@yoga-tirol.at',
    legalForm: 'verein',
    regionId: 'tirol',
    consent: 'none',
    syncMode: 'curated_once',
  };
  const candidate = {
    regionId: 'tirol',
    organizerRef: 'org1',
    sourceUrl: 'https://yoga-tirol.at/kakao',
    sourceType: 'jsonld',
    status: 'found',
    imageUrl: 'https://yoga-tirol.at/kakao.jpg',
  };
  const curation = {
    organizerRef: 'org1',
    sourceUrl: 'https://yoga-tirol.at/kakao',
    importedAt: 1,
    claimable: true,
  };
  const event = (over: Record<string, unknown> = {}) => ({
    title: 'Kakao',
    description: 'd',
    regionId: 'tirol',
    slug: 'kakao',
    ...over,
  });
  const ctx = (uid: string) => env.authenticatedContext(uid, { email_verified: true }).firestore();

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'import_organizers/org1'), organizer);
      await setDoc(doc(db, 'import_organizers/org1/outreach/m1'), { status: 'sent' });
      await setDoc(doc(db, 'import_candidates/c1'), candidate);
      await setDoc(doc(db, 'import_runs/r1'), { region: 'tirol', source: 'jsonld' });
      await setDoc(doc(db, `import_blocklist/${hash}`), { kind: 'email', createdAt: 1 });
      await setDoc(doc(db, 'app_settings/import'), { curatorUid: 'curator' });
      await setDoc(
        doc(db, 'events/curated'),
        event({ status: 'pending', createdBy: 'curator', curation })
      );
      await setDoc(doc(db, 'events/own'), event({ status: 'pending', createdBy: 'owner' }));
    });
  });

  const paths = [
    'import_organizers/org1',
    'import_organizers/org1/outreach/m1',
    'import_candidates/c1',
    'import_runs/r1',
    `import_blocklist/${hash}`,
    'app_settings/import',
  ];

  it('anonymous users, members, owners and region moderators neither read nor write', async () => {
    const dbs = [
      env.unauthenticatedContext().firestore(),
      ctx('member'),
      ctx('owner'),
      ctx('curator'),
      ctx('mod'),
    ];
    for (const db of dbs) {
      for (const path of paths) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(updateDoc(doc(db, path), { touched: true }));
        await assertFails(deleteDoc(doc(db, path)));
      }
      await assertFails(getDocs(collection(db, 'import_organizers')));
      await assertFails(getDocs(collection(db, 'import_candidates')));
      await assertFails(setDoc(doc(db, 'import_organizers/new'), organizer));
      await assertFails(setDoc(doc(db, 'import_candidates/new'), candidate));
      await assertFails(setDoc(doc(db, 'import_runs/new'), { region: 'tirol' }));
      await assertFails(setDoc(doc(db, `import_blocklist/${'b'.repeat(64)}`), { kind: 'domain' }));
    }
  });

  it('a Super-Admin reads and writes all four collections', async () => {
    const db = env.authenticatedContext('admin').firestore();
    for (const path of paths) await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(getDocs(collection(db, 'import_candidates')));
    await assertSucceeds(setDoc(doc(db, 'import_organizers/org2'), organizer));
    await assertSucceeds(
      updateDoc(doc(db, 'import_organizers/org1'), {
        consent: 'asked',
        previewTokenHash: 'b'.repeat(64),
        previewTokenExpiresAt: 5,
      })
    );
    await assertSucceeds(setDoc(doc(db, 'import_organizers/org1/outreach/m2'), { status: 'sent' }));
    await assertSucceeds(setDoc(doc(db, 'import_candidates/c2'), candidate));
    await assertSucceeds(updateDoc(doc(db, 'import_candidates/c1'), { status: 'reviewed' }));
    // Fields the ingest script adds (pilotExcluded, duplicateOf, ...) are not refused.
    await assertSucceeds(
      setDoc(doc(db, 'import_candidates/c3'), {
        ...candidate,
        pilotExcluded: true,
        duplicateOf: { kind: 'event', id: 'e1' },
      })
    );
    await assertSucceeds(setDoc(doc(db, 'import_runs/r2'), { region: 'tirol', counts: {} }));
    await assertSucceeds(
      setDoc(doc(db, `import_blocklist/${'c'.repeat(64)}`), {
        kind: 'domain',
        reason: 'declined',
        createdAt: 1,
      })
    );
    await assertSucceeds(deleteDoc(doc(db, 'import_runs/r1')));
  });

  it('the preview log is readable by Super-Admins only and written by nobody', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'import_organizers/org1/previewViews/v1'), {
        at: 1,
        imageUrls: ['https://yoga-tirol.at/kakao.jpg'],
        eventCount: 1,
      });
    });
    const admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(getDoc(doc(admin, 'import_organizers/org1/previewViews/v1')));
    await assertFails(setDoc(doc(admin, 'import_organizers/org1/previewViews/v2'), { at: 2 }));
    await assertFails(deleteDoc(doc(admin, 'import_organizers/org1/previewViews/v1')));
    for (const db of [env.unauthenticatedContext().firestore(), ctx('member'), ctx('mod')]) {
      await assertFails(getDoc(doc(db, 'import_organizers/org1/previewViews/v1')));
      await assertFails(setDoc(doc(db, 'import_organizers/org1/previewViews/v3'), { at: 3 }));
    }
  });

  it('even a Super-Admin cannot break the privacy rules', async () => {
    const db = env.authenticatedContext('admin').firestore();
    // Plain preview token, consent record from the client, unknown enum values.
    await assertFails(updateDoc(doc(db, 'import_organizers/org1'), { previewToken: 'secret' }));
    await assertFails(updateDoc(doc(db, 'import_organizers/org1'), { previewTokenHash: 'abc' }));
    await assertFails(
      updateDoc(doc(db, 'import_organizers/org1'), { consentRecord: { at: 1, scopes: {} } })
    );
    await assertFails(
      setDoc(doc(db, 'import_organizers/org3'), { ...organizer, consentRecord: { at: 1 } })
    );
    await assertFails(updateDoc(doc(db, 'import_organizers/org1'), { legalForm: 'gmbh' }));
    await assertFails(updateDoc(doc(db, 'import_organizers/org1'), { consent: 'yes' }));
    await assertFails(updateDoc(doc(db, 'import_organizers/org1'), { regionId: 'atlantis' }));
    // Candidates keep a source URL only, never a storage copy.
    await assertFails(
      updateDoc(doc(db, 'import_candidates/c1'), {
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg',
      })
    );
    await assertFails(
      updateDoc(doc(db, 'import_candidates/c1'), { imageUrl: 'http://a.at/a.jpg' })
    );
    await assertFails(updateDoc(doc(db, 'import_candidates/c1'), { imageStoragePath: 'a/b.jpg' }));
    await assertFails(updateDoc(doc(db, 'import_candidates/c1'), { status: 'live' }));
    // Blocklist: hashed id, minimal fields.
    await assertFails(setDoc(doc(db, 'import_blocklist/info@yoga-tirol.at'), { kind: 'email' }));
    await assertFails(
      setDoc(doc(db, `import_blocklist/${'d'.repeat(64)}`), {
        kind: 'email',
        email: 'info@yoga-tirol.at',
      })
    );
    await assertFails(setDoc(doc(db, `import_blocklist/${'d'.repeat(64)}`), { kind: 'person' }));
    // app_settings/import is written by the script only.
    await assertFails(updateDoc(doc(db, 'app_settings/import'), { curatorUid: 'x' }));
  });

  it('a Super-Admin reads curated pending events (the region moderator too), nobody else', async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('admin').firestore(), 'events/curated'))
    );
    await assertSucceeds(getDoc(doc(ctx('mod'), 'events/curated')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'events/curated')));
    await assertFails(getDoc(doc(ctx('member'), 'events/curated')));
  });

  it('app_settings/importVisibility: everyone reads, only a Super-Admin writes bool + updatedAt', async () => {
    const path = 'app_settings/importVisibility';
    const admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(setDoc(doc(admin, path), { moderatorsSeeInReview: true, updatedAt: 1 }));
    await assertSucceeds(getDoc(doc(ctx('mod'), path)));
    await assertSucceeds(getDoc(doc(ctx('member'), path)));
    await assertSucceeds(updateDoc(doc(admin, path), { moderatorsSeeInReview: false }));
    await assertFails(updateDoc(doc(admin, path), { moderatorsSeeInReview: 'yes' }));
    await assertFails(updateDoc(doc(admin, path), { extra: 1 }));
    await assertFails(setDoc(doc(admin, path), { moderatorsSeeInReview: true, other: 1 }));
    for (const db of [ctx('mod'), ctx('member'), env.unauthenticatedContext().firestore()]) {
      await assertFails(updateDoc(doc(db, path), { moderatorsSeeInReview: true }));
      await assertFails(setDoc(doc(db, path), { moderatorsSeeInReview: true }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    // app_settings/import stays Super-Admin only.
    await assertFails(getDoc(doc(ctx('mod'), 'app_settings/import')));
  });

  it('owners cannot add, change or remove curation, nor change createdBy', async () => {
    const owner = ctx('owner');
    await assertFails(updateDoc(doc(owner, 'events/own'), { curation }));
    await assertFails(
      setDoc(doc(owner, 'events/new'), event({ status: 'pending', createdBy: 'owner', curation }))
    );
    await assertSucceeds(
      setDoc(doc(owner, 'events/new2'), event({ status: 'pending', createdBy: 'owner' }))
    );
    const curator = ctx('curator');
    await assertFails(
      updateDoc(doc(curator, 'events/curated'), { curation: { ...curation, consentAt: 1 } })
    );
    await assertFails(updateDoc(doc(curator, 'events/curated'), { 'curation.claimable': false }));
    await assertFails(updateDoc(doc(curator, 'events/curated'), { curation: deleteField() }));
    await assertFails(updateDoc(doc(curator, 'events/curated'), { createdBy: 'owner' }));
    await assertFails(updateDoc(doc(owner, 'events/own'), { createdBy: 'curator' }));
    // Ordinary edits without touching curation still work.
    await assertSucceeds(updateDoc(doc(curator, 'events/curated'), { title: 'Kakao-Abend' }));
  });

  it('nobody approves a curated event from the client before consent', async () => {
    const admin = env.authenticatedContext('admin').firestore();
    await assertFails(
      updateDoc(doc(admin, 'events/curated'), { curation: { ...curation, consentAt: 1 } })
    );
    await assertFails(
      updateDoc(doc(admin, 'events/curated'), {
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: serverTimestamp(),
      })
    );
    const mod = ctx('mod');
    await assertFails(
      updateDoc(doc(mod, 'events/curated'), {
        status: 'approved',
        approvedBy: 'mod',
        approvedAt: serverTimestamp(),
      })
    );
    // Other review actions stay possible (editing, rejecting).
    await assertSucceeds(updateDoc(doc(admin, 'events/curated'), { title: 'Kakao (geprüft)' }));
    await assertSucceeds(
      updateDoc(doc(mod, 'events/curated'), {
        status: 'trashed',
        trashedBy: 'mod',
        trashedAt: serverTimestamp(),
      })
    );
  });

  it('after consent (set by the backend) the event can be approved', async () => {
    await env.withSecurityRulesDisabled((c) =>
      updateDoc(doc(c.firestore(), 'events/curated'), { 'curation.consentAt': 2 })
    );
    const admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(
      updateDoc(doc(admin, 'events/curated'), {
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: serverTimestamp(),
      })
    );
    // An ordinary event is unaffected.
    await assertSucceeds(
      updateDoc(doc(ctx('mod'), 'events/own'), {
        status: 'approved',
        approvedBy: 'mod',
        approvedAt: serverTimestamp(),
      })
    );
  });

  it('claim requests: Super-Admins read them, nobody writes them from the client', async () => {
    const request = { uid: 'member', organizerId: 'org1', status: 'pending', createdAt: 1 };
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), 'import_claim_requests/org1_member'), request)
    );
    const path = 'import_claim_requests/org1_member';
    // The requester included: the callable answers them, the doc stays staff data.
    for (const db of [env.unauthenticatedContext().firestore(), ctx('member'), ctx('mod')]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(getDocs(collection(db, 'import_claim_requests')));
      await assertFails(setDoc(doc(db, 'import_claim_requests/org1_x'), request));
      await assertFails(updateDoc(doc(db, path), { status: 'approved' }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    const admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(getDoc(doc(admin, path)));
    await assertSucceeds(getDocs(collection(admin, 'import_claim_requests')));
    // Approving goes through approveClaimRequest (it moves the events).
    await assertFails(updateDoc(doc(admin, path), { status: 'approved' }));
    await assertFails(setDoc(doc(admin, 'import_claim_requests/org1_y'), request));
    await assertSucceeds(deleteDoc(doc(admin, path)));
  });

  it('after a claim the new owner edits the event but cannot hand it on or touch curation', async () => {
    const claimed = {
      ...curation,
      claimable: false,
      claimedAt: 2,
      claimedBy: 'claimer',
    };
    await env.withSecurityRulesDisabled((c) =>
      setDoc(
        doc(c.firestore(), 'events/claimed'),
        event({
          status: 'pending',
          createdBy: 'claimer',
          organizer: { name: 'Yogaverein Tirol', email: 'info@yoga-tirol.at' },
          curation: claimed,
        })
      )
    );
    const owner = ctx('claimer');
    await assertSucceeds(updateDoc(doc(owner, 'events/claimed'), { title: 'Kakao im Advent' }));
    await assertFails(updateDoc(doc(owner, 'events/claimed'), { createdBy: 'curator' }));
    await assertFails(updateDoc(doc(owner, 'events/claimed'), { createdBy: 'mallory' }));
    await assertFails(
      updateDoc(doc(owner, 'events/claimed'), { curation: { ...claimed, consentAt: 3 } })
    );
    // The curator account lost the event with the claim.
    await assertFails(updateDoc(doc(ctx('curator'), 'events/claimed'), { title: 'x' }));
    // Nobody else takes it over from the client either.
    await assertFails(updateDoc(doc(ctx('member'), 'events/claimed'), { createdBy: 'member' }));
  });
});
