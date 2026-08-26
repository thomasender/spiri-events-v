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

const fixtures = [
  {
    id: 'test-event-user-draft',
    title: 'User Draft Event',
    date: '2099-12-31',
    endDate: null,
    time: '16:00',
    endTime: '17:30',
    place: 'User Draft Place Dornbirn',
    description: 'Draft event owned by a regular user, not yet submitted.',
    category: 'Meditation',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local', photoURL: null },
    kontakt: '0676 5550011',
    status: 'draft',
    ownerRole: 'user',
    dateOffset: 20,
  },
  {
    id: 'test-event-foreign-pending',
    title: 'User Pending Event',
    date: '2099-12-31',
    endDate: null,
    time: '14:00',
    endTime: '15:30',
    place: 'Test Place Bludenz',
    description: 'Pending event owned by a regular user, not admin.',
    category: 'Sonstiges',
    bezirk: 'Bludenz',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local', photoURL: null },
    kontakt: '0676 5556677',
    status: 'pending',
    ownerRole: 'user',
    dateOffset: 8,
  },
  {
    id: 'test-event-admin-draft',
    title: 'Admin Draft Event',
    date: '2099-12-31',
    endDate: null,
    time: '09:00',
    endTime: '10:00',
    place: 'Admin Draft Place Feldkirch',
    description: 'Draft event owned by an admin, used to test the Entwürfe tab.',
    category: 'Sonstiges',
    bezirk: 'Feldkirch',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com', photoURL: null },
    kontakt: 'anna@example.com',
    status: 'draft',
    ownerRole: 'admin',
    dateOffset: 15,
  },
  {
    id: 'test-event-admin-draft-second',
    title: 'Second Admin Draft',
    date: '2099-12-31',
    endDate: null,
    time: '18:00',
    endTime: '19:30',
    place: 'Admin Draft Place Bregenz',
    description: 'Second admin-owned draft used for duplicate-testing in the Entwürfe tab.',
    category: 'Yoga',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com', photoURL: null },
    kontakt: 'anna@example.com',
    status: 'draft',
    ownerRole: 'admin',
    dateOffset: 25,
  },
];

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

const fixtureTitlesByOwner = new Map();
for (const fx of fixtures) {
  const key = fx.ownerRole;
  if (!fixtureTitlesByOwner.has(key)) {
    fixtureTitlesByOwner.set(key, new Set());
  }
  fixtureTitlesByOwner.get(key).add(fx.title);
}

const ownerUids = {
  admin: adminUid,
  user: userUid,
};

for (const [role, ownerUid] of Object.entries(ownerUids)) {
  if (!ownerUid) continue;
  const titles = fixtureTitlesByOwner.get(role) || new Set();
  const ownerEvents = await db
    .collection('events')
    .where('createdBy', '==', ownerUid)
    .get();
  for (const doc of ownerEvents.docs) {
    const data = doc.data();
    if (fixtures.some((f) => f.id === doc.id)) continue;
    if (titles.has(data.title)) {
      await doc.ref.delete();
      console.log(`Deleted duplicate ${role} event ${doc.id} (${data.title})`);
    }
  }
}

for (const fx of fixtures) {
  const ref = db.collection('events').doc(fx.id);
  const doc = await ref.get();
  const ownerUid = fx.ownerRole === 'admin' ? adminUid : userUid;
  if (!doc.exists) {
    const date = makeDate(fx.dateOffset);
    const slug = generateSlug(fx.title, fx.place, date);
    await ref.set({
      ...fx,
      date,
      slug,
      createdBy: ownerUid || fx.id,
      createdAt: Timestamp.now(),
    });
    console.log(`Created ${fx.id} (status=${fx.status})`);
  } else {
    await ref.update({ status: fx.status });
    console.log(`Reset ${fx.id} status=${fx.status}`);
  }
}
