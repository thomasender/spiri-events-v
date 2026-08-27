process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

async function getUserUid() {
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.contact === 'user@test.local') return d.id;
  }
  return null;
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

const today = new Date();
function makeDate(dayOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

const userUid = await getUserUid();
if (!userUid) {
  console.error('User fixture not found. Run scripts/seed-test-events.mjs first.');
  process.exit(1);
}

// admin-event-edit-delete.spec.ts permanently deletes this shared seed fixture as
// part of its "admin can delete a user-owned approved event" test. Several other
// specs (event-fields, event-detail-page-access, event-draft) also read it, so
// recreate it here rather than assuming the global seed from the start of the
// Playwright run is still intact.
const date = makeDate(9);
const ref = db.collection('events').doc('test-event-user-approved');
await ref.set({
  title: 'User Approved Event',
  slug: generateSlug('User Approved Event', 'User Place Bregenz', date),
  date,
  endDate: null,
  time: '11:00',
  endTime: '12:30',
  place: 'User Place Bregenz',
  description: 'Approved event owned by a regular user, not admin.',
  category: 'Yoga',
  bezirk: 'Bregenz',
  organizer: {
    firstName: 'Test',
    lastName: 'User',
    email: 'user@test.local',
    photoURL:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23c48e6a"/><text x="32" y="40" font-family="sans-serif" font-size="28" font-weight="600" fill="white" text-anchor="middle">T</text></svg>',
  },
  kontakt: '0676 5558899',
  status: 'approved',
  createdBy: userUid,
});

console.log('Reset test-event-user-approved fixture');
