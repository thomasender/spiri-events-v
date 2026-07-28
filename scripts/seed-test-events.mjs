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

const TEST_USERS = [
  {
    email: 'admin@test.com',
    password: 'testpassword123',
    displayName: 'Test Admin',
    role: 'Admin',
  },
  {
    email: 'user@test.local',
    password: 'testpassword123',
    displayName: 'Test User',
    role: 'User',
  },
];

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
  },
  {
    id: 'test-event-foreign-pending',
    title: 'User Pending Event',
    date: makeDate(8),
    endDate: null,
    time: '14:00',
    endTime: '15:30',
    place: 'Test Place Bludenz',
    description: 'Pending event owned by a regular user, not admin.',
    categories: ['Sonstiges'],
    bezirk: 'Bludenz',
    status: 'pending',
  },
];

for (const event of TEST_EVENTS) {
  event.slug = generateSlug(event.title, event.place, event.date);
}

let createdUsers = {};

async function getUserUid(user) {
  const signUpUrl = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const signUpResponse = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      displayName: user.displayName,
    }),
  });

  const signUpData = await signUpResponse.json();

  if (signUpResponse.ok) {
    console.log(`  Created: ${signUpData.localId}`);
    return signUpData.localId;
  }

  if (signUpData.error?.message === 'EMAIL_EXISTS') {
    console.log(`  Already exists, looking up UID...`);
    const signInUrl = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const signInResponse = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        returnSecureToken: true,
      }),
    });
    const signInData = await signInResponse.json();
    if (signInResponse.ok) {
      console.log(`  Found UID: ${signInData.localId}`);
      return signInData.localId;
    }
    console.error(`  Sign in failed: ${JSON.stringify(signInData)}`);
    return null;
  }

  console.error(`  Error: ${JSON.stringify(signUpData)}`);
  return null;
}

async function createUser(user) {
  console.log(`Creating user: ${user.email}...`);
  const uid = await getUserUid(user);
  if (uid) {
    createdUsers[user.email] = uid;
  }
  return uid;
}

async function seedEvent(event, createdBy) {
  const ref = db.collection('events').doc(event.id);
  await ref.set({ ...event, createdBy });
  console.log(`  Seeded: ${event.title} (${event.date}) [${event.id}] slug: ${event.slug}`);
}

async function seedAdminUser(uid, email) {
  const ref = db.collection('admin_users').doc(uid);
  await ref.set({ role: 'Admin', email: email });
  console.log(`  Created admin user: ${email} (${uid})`);
}

async function main() {
  console.log('Seeding test events to Firestore Emulator...');
  console.log(`Emulator: ${FIRESTORE_EMULATOR}`);
  console.log(`Current date: ${today.toISOString().split('T')[0]}`);
  console.log('');

  for (const user of TEST_USERS) {
    await createUser(user);
  }

  const adminUid = createdUsers['admin@test.com'];
  const userUid = createdUsers['user@test.local'];

  if (adminUid) {
    await seedAdminUser(adminUid, 'admin@test.com');
  }

  for (const event of TEST_EVENTS) {
    if (event.id === 'test-event-foreign-pending') {
      await seedEvent(event, userUid || 'test-user-uid');
    } else {
      await seedEvent(event, adminUid || 'test-admin-uid');
    }
  }

  console.log(`\nDone! ${TEST_EVENTS.length} events seeded.`);
  console.log(`Admin UID: ${adminUid}`);
  console.log(`User UID: ${userUid}`);
}

main().catch(console.error);
