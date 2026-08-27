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

const adminUid = await getAdminUid();

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

const FIXTURE_TITLE = 'Test Weekly Yoga Series';
const FIXTURE_PLACE = 'Yogastudio Test';
const fixtureDate = makeDate(7);

// Recreates the shared recurring-event fixture used by multiple specs
// (recurring-event-deletion-detail-page.spec.ts, recurring-event-deletion-edit-form.spec.ts,
// recurring-events-card-list.spec.ts). Those deletion specs delete/mutate this single
// document, so any read-only spec that depends on it must reset it first rather than
// assuming the global seed from the start of the Playwright run is still intact.
const ref = db.collection('events').doc('test-event-recurring-weekly');
await ref.set({
  title: FIXTURE_TITLE,
  slug: generateSlug(FIXTURE_TITLE, FIXTURE_PLACE, fixtureDate),
  date: fixtureDate,
  endDate: null,
  time: '18:00',
  endTime: '19:00',
  place: FIXTURE_PLACE,
  description: 'Wöchentlicher Yoga-Kurs für Tests der wiederkehrenden Anzeige.',
  category: 'Yoga',
  bezirk: 'Bregenz',
  organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
  kontakt: 'anna@example.com',
  status: 'approved',
  recurrence: 'weekly',
  recurrenceEndDate: makeDate(75),
  exceptionDates: [],
  createdBy: adminUid || 'test-event-recurring-weekly',
  createdAt: Timestamp.now(),
});

console.log('Reset test-event-recurring-weekly fixture');
