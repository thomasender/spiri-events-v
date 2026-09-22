process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generateEventSlug } from '../src/lib/slug-helpers.js';

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

const FIXTURE_TITLE = 'Test Weekly Yoga Series';
const FIXTURE_PLACE = 'Yogastudio Test';
const FIXTURE_CATEGORY = 'Yoga';
const FIXTURE_BEZIRK = 'Bregenz';
const fixtureDate = makeDate(7);

// Recreates the shared recurring-event fixture used by multiple specs
// (recurring-event-deletion-detail-page.spec.ts, recurring-event-deletion-edit-form.spec.ts,
// recurring-events-card-list.spec.ts). Those deletion specs delete/mutate this single
// document, so any read-only spec that depends on it must reset it first rather than
// assuming the global seed from the start of the Playwright run is still intact.
const ref = db.collection('events').doc('test-event-recurring-weekly');
await ref.set({
  title: FIXTURE_TITLE,
  slug: generateEventSlug(FIXTURE_TITLE, FIXTURE_CATEGORY, FIXTURE_BEZIRK, fixtureDate),
  date: fixtureDate,
  endDate: null,
  time: '18:00',
  endTime: '19:00',
  place: FIXTURE_PLACE,
  description: 'Wöchentlicher Yoga-Kurs für Tests der wiederkehrenden Anzeige.',
  category: FIXTURE_CATEGORY,
  bezirk: FIXTURE_BEZIRK,
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
