process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

async function getAdminUid() {
  const adminDoc = await db.collection('admin_users').limit(1).get();
  if (adminDoc.empty) return null;
  return adminDoc.docs[0].id;
}

async function getUserUid() {
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.contact === 'user@test.local') return d.id;
  }
  return null;
}

const adminUid = await getAdminUid();
const userUid = await getUserUid();
if (!userUid) {
  console.error('User fixture not found. Run scripts/seed-test-events.mjs first.');
  process.exit(1);
}

const today = new Date();
function makeDate(dayOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function generateSlug(title, place, date) {
  const normalize = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const titleSlug = normalize(title);
  const placeSlug = normalize(place);
  const dateSlug = date ? date.replace(/-/g, '') : '';
  return [titleSlug, placeSlug, dateSlug].filter(Boolean).join('-');
}

const fixtures = [
  {
    id: 'test-event-user-trashed',
    title: 'User Trashed Event',
    place: 'Trash Place Bregenz',
    ownerRole: 'user',
    dateOffset: 5,
    status: 'trashed',
    trashedDaysAgo: 5,
  },
  {
    id: 'test-event-user-trashed-old',
    title: 'User Trashed Event Old',
    place: 'Old Trash Place Bregenz',
    ownerRole: 'user',
    dateOffset: 10,
    status: 'trashed',
    trashedDaysAgo: 35,
  },
  {
    id: 'test-event-admin-trashed',
    title: 'Admin Trashed Event',
    place: 'Admin Trash Place Feldkirch',
    ownerRole: 'admin',
    dateOffset: 8,
    status: 'trashed',
    trashedDaysAgo: 2,
  },
];

for (const fx of fixtures) {
  const ref = db.collection('events').doc(fx.id);
  const existing = await ref.get();
  const ownerUid = fx.ownerRole === 'admin' ? adminUid : userUid;
  const date = makeDate(fx.dateOffset);
  const slug = generateSlug(fx.title, fx.place, date);
  const trashedAtMillis = Date.now() - fx.trashedDaysAgo * 24 * 60 * 60 * 1000;
  const baseData = {
    title: fx.title,
    date,
    endDate: null,
    time: '18:00',
    endTime: '19:00',
    place: fx.place,
    description: `Fixture for trash tests (${fx.title}).`,
    category: 'Sonstiges',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local', photoURL: null },
    kontakt: 'user@test.local',
    status: fx.status,
    trashedAt: Timestamp.fromMillis(trashedAtMillis),
    slug,
    bezirk: 'Bregenz',
    isOnline: false,
    createdBy: ownerUid || fx.id,
    createdAt: Timestamp.now(),
  };

  if (!existing.exists) {
    await ref.set(baseData);
    console.log(`Created ${fx.id} (status=${fx.status}, trashedDaysAgo=${fx.trashedDaysAgo})`);
  } else {
    await ref.update({
      status: fx.status,
      trashedAt: Timestamp.fromMillis(trashedAtMillis),
      place: fx.place,
      bezirk: 'Bregenz',
    });
    console.log(`Reset ${fx.id} (status=${fx.status}, trashedDaysAgo=${fx.trashedDaysAgo})`);
  }
}

const protectedIds = new Set(['test-event-user-trashed', 'test-event-user-trashed-old', 'test-event-admin-trashed']);

for (const [role, ownerUid] of Object.entries({ admin: adminUid, user: userUid })) {
  if (!ownerUid) continue;
  const ownerEvents = await db
    .collection('events')
    .where('createdBy', '==', ownerUid)
    .where('status', '==', 'trashed')
    .get();
  for (const doc of ownerEvents.docs) {
    if (protectedIds.has(doc.id)) continue;
    await doc.ref.delete();
    console.log(`Cleaned stale trash doc ${doc.id}`);
  }
}
