#!/usr/bin/env node
// Test foundation for the regions epic (emulator ONLY, never production).
//
//   node scripts/seed-region-fixtures.mjs            regions only
//   node scripts/seed-region-fixtures.mjs --events   regions + [Region-Test] events
//
// Regions (`regions/vorarlberg`, `regions/tirol`, `regions/wien`) are loaded on
// every Playwright run by tests/globalSetup.ts; nothing reads them yet, so they
// cannot disturb existing specs.
//
// The [Region-Test] events are opt-in (--events): once the calendar filters by
// region (ticket 11) they would otherwise change counts in specs that read the
// shared calendar. A dedicated spec loads them through
// `loadRegionEventFixtures()` in tests/helpers/regionFixtures.ts.
//
// The admin_users entry of the region moderator test account
// (tirol-mod@test.local: role RegionModerator, regionIds ['tirol']) is
// reconciled on every run as well.
//
// Everything is written with set() in ONE batch (reconcile, never delete and
// re-create), so concurrent readers never see a half-populated state.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generateEventSlug } from '../src/lib/slug-helpers.js';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const REGION_FIXTURES = [
  {
    id: 'vorarlberg',
    name: 'Vorarlberg',
    order: 0,
    active: true,
    bezirke: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
  },
  {
    id: 'tirol',
    name: 'Tirol',
    order: 1,
    active: true,
    bezirke: ['Innsbruck', 'Kufstein', 'Imst', 'Lienz'],
  },
  // Inactive on purpose: tests region visibility (hidden from the switcher).
  { id: 'wien', name: 'Wien', order: 7, active: false, bezirke: [] },
];

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
};

const base = {
  endDate: null,
  category: 'Yoga',
  organizer: { firstName: 'Region', lastName: 'Test', email: 'admin@test.com', photoURL: null },
  kontakt: 'region-test@example.com',
  status: 'approved',
};

const REGION_EVENT_FIXTURES = [
  {
    ...base,
    id: 'region-test-tirol-innsbruck',
    title: '[Region-Test] Yoga Innsbruck',
    date: day(12),
    time: '18:00',
    endTime: '19:30',
    place: 'Yogaraum Innsbruck',
    description: 'Fixture-Event der Region Tirol.',
    bezirk: 'Innsbruck',
    regionId: 'tirol',
  },
  {
    ...base,
    id: 'region-test-tirol-kufstein',
    title: '[Region-Test] Meditation Kufstein',
    date: day(13),
    time: '19:00',
    endTime: '20:00',
    place: 'Meditationsraum Kufstein',
    description: 'Fixture-Event der Region Tirol.',
    category: 'Meditation',
    bezirk: 'Kufstein',
    regionId: 'tirol',
  },
  {
    ...base,
    id: 'region-test-tirol-online',
    title: '[Region-Test] Online Atemreise Tirol',
    date: day(14),
    time: '20:00',
    endTime: '21:00',
    place: '',
    description: 'Online-Event der Tirol-Moderation.',
    category: 'Meditation',
    bezirk: '',
    isOnline: true,
    regionId: 'tirol',
  },
  {
    ...base,
    id: 'region-test-vorarlberg-dornbirn',
    title: '[Region-Test] Yoga Dornbirn',
    date: day(12),
    time: '10:00',
    endTime: '11:30',
    place: 'Yogaraum Dornbirn',
    description: 'Fixture-Event mit explizitem regionId vorarlberg.',
    bezirk: 'Dornbirn',
    regionId: 'vorarlberg',
  },
];

async function findAdminUid() {
  const snap = await db.collection('admin_users').where('email', '==', 'admin@test.com').get();
  return snap.empty ? 'test-admin-uid' : snap.docs[0].id;
}

// Region moderator test account (created by import-test-users.mjs, which
// globalSetup runs first). Resolved through the Auth emulator REST API.
const REGION_MODERATOR_FIXTURE = { email: 'tirol-mod@test.local', regionIds: ['tirol'] };

async function findAuthUid(email) {
  try {
    const res = await fetch(
      'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/projects/spirieventsvbg/accounts:lookup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ email: [email] }),
      }
    );
    if (!res.ok) return null;
    return (await res.json())?.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

const withEvents = process.argv.includes('--events');
const batch = db.batch();

// admin_users entry of the moderator (role RegionModerator, Tirol). Scripts
// that need "the" admin filter admin_users by role == 'Admin'.
const moderatorUid = await findAuthUid(REGION_MODERATOR_FIXTURE.email);
if (moderatorUid) {
  batch.set(db.collection('admin_users').doc(moderatorUid), {
    role: 'RegionModerator',
    regionIds: REGION_MODERATOR_FIXTURE.regionIds,
    email: REGION_MODERATOR_FIXTURE.email,
  });
} else {
  console.warn(
    `region fixtures: ${REGION_MODERATOR_FIXTURE.email} not in the Auth emulator, ` +
      'no moderator entry (run scripts/import-test-users.mjs first)'
  );
}

// Two active regions make the required "Wo suchst du?" dialog block every page,
// so Tirol is only active while the dedicated region spec runs (--events);
// removeRegionEventFixtures() switches it off again.
for (const { id, ...region } of REGION_FIXTURES) {
  batch.set(
    db.collection('regions').doc(id),
    {
      ...region,
      ...(id === 'tirol' ? { active: withEvents } : {}),
      slug: id,
      contactEmail: '',
      seo: { title: '', description: '' },
      timezone: 'Europe/Vienna',
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

if (withEvents) {
  const adminUid = await findAdminUid();
  for (const { id, ...event } of REGION_EVENT_FIXTURES) {
    batch.set(db.collection('events').doc(id), {
      ...event,
      slug: generateEventSlug(event.title, event.category, event.bezirk, event.date),
      createdBy: adminUid,
      approvedBy: adminUid,
      approvedAt: Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)),
    });
  }
}

await batch.commit();
console.log(
  `region fixtures: ${REGION_FIXTURES.length} regions` +
    (moderatorUid ? `, moderator ${REGION_MODERATOR_FIXTURE.email}` : '') +
    (withEvents ? `, ${REGION_EVENT_FIXTURES.length} events` : ', events skipped (--events)')
);
