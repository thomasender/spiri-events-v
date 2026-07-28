#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FIRESTORE_EMULATOR = '127.0.0.1:8181';
const PROJECT_ID = 'spirieventsvbg';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT_ID;

initializeApp({
  projectId: PROJECT_ID,
});

const db = getFirestore();

const today = new Date();

function makeDate(dayOffset, monthOffset = 0) {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  d.setMonth(d.getMonth() + monthOffset);
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

  const parts = [titleSlug, placeSlug, dateSlug].filter(Boolean);
  return parts.join('-');
}

const TEST_EVENTS = [
  {
    id: 'test-event-today',
    title: 'Yoga heute',
    date: makeDate(0),
    endDate: null,
    time: '10:00',
    endTime: '11:30',
    place: 'Yogastudio Dornbirn',
    description: 'Yoga Kurs heute.',
    categories: ['Yoga'],
    bezirk: 'Dornbirn',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-tomorrow',
    title: 'Meditation morgen',
    date: makeDate(1),
    endDate: null,
    time: '07:00',
    endTime: '08:00',
    place: 'Meditationsraum Bregenz',
    description: 'Meditation morgen früh.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-this-week',
    title: 'Tanzworkshop diese Woche',
    date: makeDate(3),
    endDate: makeDate(5),
    time: '14:00',
    endTime: '18:00',
    place: 'Kulturhaus Feldkirch',
    description: 'Tanzworkshop.',
    categories: ['Tanz'],
    bezirk: 'Feldkirch',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-next-week',
    title: 'Atemtherapie',
    date: makeDate(10),
    endDate: null,
    time: '09:00',
    endTime: '12:00',
    place: 'Gesundheitszentrum Bludenz',
    description: 'Atemtherapie Workshop.',
    categories: ['Atemarbeit'],
    bezirk: 'Bludenz',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-multi-day',
    title: 'Meditationsretreat',
    date: makeDate(15),
    endDate: makeDate(17),
    time: '08:00',
    endTime: '17:00',
    place: 'Klosterhof Bregenz',
    description: 'Mehrtägiges Retreat.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-yoga',
    title: 'Vinyasa Flow Yoga',
    date: makeDate(7),
    endDate: null,
    time: '17:30',
    endTime: '19:00',
    place: 'Yoga Loft Dornbirn',
    description: 'Dynamischer Yoga-Flow.',
    categories: ['Yoga'],
    bezirk: 'Dornbirn',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-singen',
    title: 'Mantrasingen',
    date: makeDate(2),
    endDate: null,
    time: '19:00',
    endTime: '20:30',
    place: 'Gemeinschaftsraum Bregenz',
    description: 'Gemeinsames Singen von Mantras.',
    categories: ['Singen'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-bregenz',
    title: 'Klangmeditation',
    date: makeDate(4),
    endDate: null,
    time: '18:00',
    endTime: '19:30',
    place: 'Klangstudio Bregenz',
    description: 'Entspannende Meditation.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'test-admin-uid',
  },
  {
    id: 'test-event-pending',
    title: 'Pending Event',
    date: makeDate(8),
    endDate: null,
    time: '10:00',
    endTime: '11:00',
    place: 'Test Place',
    description: 'This event is pending.',
    categories: ['Sonstiges'],
    bezirk: 'Dornbirn',
    status: 'pending',
    createdBy: 'test-admin-uid',
  },
];

for (const event of TEST_EVENTS) {
  event.slug = generateSlug(event.title, event.place, event.date);
}

async function seedEvent(event) {
  const ref = db.collection('events').doc(event.id);
  await ref.set(event);
  console.log(`  Seeded: ${event.title} (${event.date}) [${event.id}] slug: ${event.slug}`);
}

async function main() {
  console.log('Seeding test events to Firestore Emulator...');
  console.log(`Emulator: ${FIRESTORE_EMULATOR}`);
  console.log(`Current date: ${today.toISOString().split('T')[0]}`);
  console.log('');

  for (const event of TEST_EVENTS) {
    await seedEvent(event);
  }

  console.log(`\nDone! ${TEST_EVENTS.length} events seeded.`);
}

main().catch(console.error);
