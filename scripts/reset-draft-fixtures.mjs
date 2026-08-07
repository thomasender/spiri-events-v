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

for (const fx of fixtures) {
  const ref = db.collection('events').doc(fx.id);
  const doc = await ref.get();
  if (!doc.exists) {
    const date = fx.id === 'test-event-user-draft' ? makeDate(20) : makeDate(8);
    const slug = generateSlug(fx.title, fx.place, date);
    await ref.set({
      ...fx,
      date,
      slug,
      createdBy: userUid,
      createdAt: Timestamp.now(),
    });
    console.log(`Created ${fx.id} (status=${fx.status})`);
  } else {
    await ref.update({ status: fx.status });
    console.log(`Reset ${fx.id} status=${fx.status}`);
  }
}
