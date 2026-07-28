#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FIRESTORE_EMULATOR = '127.0.0.1:8181';
const AUTH_EMULATOR = 'http://127.0.0.1:9199';
const PROJECT_ID = 'spirieventsvbg';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT_ID;

initializeApp({
  projectId: PROJECT_ID,
});

const db = getFirestore();

const TEST_USERS = [
  {
    email: 'admin@dev.local',
    password: 'devpassword123',
    displayName: 'Dev Admin',
    role: 'Admin',
  },
  {
    email: 'user@dev.local',
    password: 'devpassword123',
    displayName: 'Dev User',
    role: 'User',
  },
];

function makeDate(dayOffset, monthOffset = 0) {
  const d = new Date();
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
    description: 'Entspannter Yoga-Kurs für alle Levels.',
    categories: ['Yoga'],
    bezirk: 'Dornbirn',
    status: 'approved',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-tomorrow',
    title: 'Meditation morgen',
    date: makeDate(1),
    endDate: null,
    time: '07:00',
    endTime: '08:00',
    place: 'Meditationsraum Bregenz',
    description: 'Starten Sie den Tag mit geführter Meditation.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-this-week',
    title: 'Tanzworkshop diese Woche',
    date: makeDate(3),
    endDate: makeDate(5),
    time: '14:00',
    endTime: '18:00',
    place: 'Kulturhaus Feldkirch',
    description: 'Dreitägiger Tanzworkshop für alle.',
    categories: ['Tanz'],
    bezirk: 'Feldkirch',
    status: 'approved',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-next-week',
    title: 'Atemtherapie',
    date: makeDate(10),
    endDate: null,
    time: '09:00',
    endTime: '12:00',
    place: 'Gesundheitszentrum Bludenz',
    description: 'Bewusstes Atmen für mehr Energie.',
    categories: ['Atemarbeit'],
    bezirk: 'Bludenz',
    status: 'approved',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-multi-day',
    title: 'Meditationsretreat',
    date: makeDate(15),
    endDate: makeDate(17),
    time: '08:00',
    endTime: '17:00',
    place: 'Klosterhof Bregenz',
    description: 'Mehrtägiges Stille-Retreat.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'dev-admin-uid',
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
    createdBy: 'dev-admin-uid',
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
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-bregenz',
    title: 'Klangmeditation',
    date: makeDate(4),
    endDate: null,
    time: '18:00',
    endTime: '19:30',
    place: 'Klangstudio Bregenz',
    description: 'Entspannung mit Klangschalen.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-pending',
    title: 'Neues Event - Pending',
    date: makeDate(8),
    endDate: null,
    time: '10:00',
    endTime: '11:00',
    place: 'Test Ort',
    description: 'Dieses Event wartet auf Genehmigung.',
    categories: ['Sonstiges'],
    bezirk: 'Dornbirn',
    status: 'pending',
    createdBy: 'dev-admin-uid',
  },
  {
    id: 'test-event-recurring',
    title: 'Wöchentliche Meditation',
    date: makeDate(5),
    endDate: null,
    time: '18:00',
    endTime: '19:00',
    place: 'Online',
    description: 'Jeden Mittwoch.',
    categories: ['Meditation'],
    bezirk: 'Bregenz',
    status: 'approved',
    createdBy: 'dev-admin-uid',
    recurrence: 'weekly',
    recurrenceEndDate: makeDate(60),
  },
];

for (const event of TEST_EVENTS) {
  event.slug = generateSlug(event.title, event.place, event.date);
}

async function checkEmulatorReady() {
  try {
    const res = await fetch(`${AUTH_EMULATOR}/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForEmulator(timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkEmulatorReady()) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Emulator not ready');
}

async function createUser(user) {
  console.log(`Creating user: ${user.email}...`);

  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      displayName: user.displayName,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error?.message === 'EMAIL_EXISTS') {
      console.log(`  Already exists, skipping`);
      return null;
    }
    console.error(`  Error: ${JSON.stringify(data)}`);
    return null;
  }

  console.log(`  Created: ${user.email} (${data.localId})`);
  return data.localId;
}

async function clearTestData() {
  console.log('Clearing existing test data...');

  for (const event of TEST_EVENTS) {
    try {
      await db.collection('events').doc(event.id).delete();
    } catch {}
  }
  console.log('  Cleared test events');
}

async function seedEvent(event) {
  const ref = db.collection('events').doc(event.id);
  await ref.set(event);
  console.log(`  Seeded: ${event.title}`);
}

async function seedTestData() {
  console.log('\nSeeding test users...');
  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('\nSeeding test events...');
  for (const event of TEST_EVENTS) {
    await seedEvent(event);
  }

  console.log('\nTest data seeded successfully!');
  console.log('\nDev users:');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email} / ${user.password} (${user.role})`);
  }
}

async function main() {
  console.log('Waiting for emulators...');
  await waitForEmulator();
  console.log('Emulators ready!\n');

  await clearTestData();
  await seedTestData();

  console.log('\nDone! Refresh http://127.0.0.1:4040/ to see updated data.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
