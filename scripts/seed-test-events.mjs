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
    photoURL:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%237a8a5f"/><text x="32" y="40" font-family="sans-serif" font-size="28" font-weight="600" fill="white" text-anchor="middle">A</text></svg>',
  },
  {
    email: 'user@test.local',
    password: 'testpassword123',
    displayName: 'Test User',
    role: 'User',
    photoURL:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23c48e6a"/><text x="32" y="40" font-family="sans-serif" font-size="28" font-weight="600" fill="white" text-anchor="middle">T</text></svg>',
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
    category: 'Yoga',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: '0676 1234567',
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
    category: 'Meditation',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
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
    category: 'Tanz',
    bezirk: 'Feldkirch',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: '0676 7654321',
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
    category: 'Breathwork',
    bezirk: 'Bludenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'admin@test.com',
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
    category: 'Meditation',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: '0676 1112233',
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
    category: 'Yoga',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
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
    category: 'Singen',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: '0676 9876543',
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
    category: 'Meditation',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'klang@example.com',
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
    category: 'Sonstiges',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: '0676 1234567',
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
    category: 'Sonstiges',
    bezirk: 'Bludenz',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local' },
    kontakt: '0676 5556677',
    status: 'pending',
  },
  {
    id: 'test-event-user-draft',
    title: 'User Draft Event',
    date: makeDate(20),
    endDate: null,
    time: '16:00',
    endTime: '17:30',
    place: 'User Draft Place Dornbirn',
    description: 'Draft event owned by a regular user, not yet submitted.',
    category: 'Meditation',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local' },
    kontakt: '0676 5550011',
    status: 'draft',
  },
  {
    id: 'test-event-user-approved',
    title: 'User Approved Event',
    date: makeDate(9),
    endDate: null,
    time: '11:00',
    endTime: '12:30',
    place: 'User Place Bregenz',
    description: 'Approved event owned by a regular user, not admin.',
    category: 'Yoga',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local' },
    kontakt: '0676 5558899',
    status: 'approved',
  },
  {
    id: 'test-event-recurring-weekly',
    title: 'Test Weekly Yoga Series',
    date: makeDate(7),
    endDate: null,
    time: '18:00',
    endTime: '19:00',
    place: 'Yogastudio Test',
    description: 'Wöchentlicher Yoga-Kurs für Tests der wiederkehrenden Anzeige.',
    category: 'Yoga',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
    status: 'approved',
    recurrence: 'weekly',
    recurrenceEndDate: makeDate(75),
  },
  {
    id: 'test-event-recurring-custom',
    title: 'Test Custom Dates Workshop',
    date: makeDate(7),
    endDate: null,
    time: '17:00',
    endTime: '19:00',
    place: 'Workshop Raum Test',
    description: 'Workshopreihe mit individuellen Terminen für Tests der Custom-Dates-Funktion.',
    category: 'Yoga',
    bezirk: 'Dornbirn',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
    status: 'approved',
    recurrence: 'custom',
    customDates: [makeDate(7), makeDate(21), makeDate(35), makeDate(63)],
  },
  {
    id: 'test-event-soundhealing',
    title: 'Klangreise mit Bowls',
    date: makeDate(11),
    endDate: null,
    time: '19:00',
    endTime: '20:30',
    place: 'Klangraum Bregenz',
    description: 'Sanfte Klangreise mit Kristall-Singingbowls.',
    category: 'Soundhealing',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
    status: 'approved',
  },
  {
    id: 'test-event-admin-draft',
    title: 'Admin Draft Event',
    date: makeDate(15),
    endDate: null,
    time: '09:00',
    endTime: '10:00',
    place: 'Admin Draft Place Feldkirch',
    description: 'Draft event owned by an admin, used to test the Entwürfe tab.',
    category: 'Sonstiges',
    bezirk: 'Feldkirch',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
    status: 'draft',
  },
  {
    id: 'test-event-admin-draft-second',
    title: 'Second Admin Draft',
    date: makeDate(25),
    endDate: null,
    time: '18:00',
    endTime: '19:30',
    place: 'Admin Draft Place Bregenz',
    description: 'Second admin-owned draft used for duplicate-testing in the Entwürfe tab.',
    category: 'Yoga',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
    kontakt: 'anna@example.com',
    status: 'draft',
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

  const messagesSnapshot = await ref.collection('messages').get();
  await Promise.all(messagesSnapshot.docs.map((docSnap) => docSnap.ref.delete()));

  await ref.set({ ...event, createdBy });
  console.log(`  Seeded: ${event.title} (${event.date}) [${event.id}] slug: ${event.slug}`);
}

async function seedAdminUser(uid, email) {
  const ref = db.collection('admin_users').doc(uid);
  await ref.set({ role: 'Admin', email: email });
  console.log(`  Created admin user: ${email} (${uid})`);
}

async function seedUserProfile(uid, user) {
  const ref = db.collection('users').doc(uid);
  await ref.set(
    {
      displayName: user.displayName || '',
      bio: '',
      website: '',
      contact: user.email || '',
      photoURL: user.photoURL || null,
    },
    { merge: true }
  );
  console.log(`  Created user profile: ${user.email} (${uid})`);
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

  for (const user of TEST_USERS) {
    const uid = createdUsers[user.email];
    if (uid) {
      await seedUserProfile(uid, user);
    }
  }

  for (const event of TEST_EVENTS) {
    let createdBy;
    let organizerPhotoURL;
    if (
      event.id === 'test-event-foreign-pending' ||
      event.id === 'test-event-user-approved' ||
      event.id === 'test-event-user-draft'
    ) {
      createdBy = userUid || 'test-user-uid';
      organizerPhotoURL = TEST_USERS.find((u) => u.email === 'user@test.local')?.photoURL || null;
    } else {
      createdBy = adminUid || 'test-admin-uid';
      organizerPhotoURL = TEST_USERS.find((u) => u.email === 'admin@test.com')?.photoURL || null;
    }
    await seedEvent(
      {
        ...event,
        organizer: { ...event.organizer, photoURL: organizerPhotoURL },
      },
      createdBy
    );
  }

  console.log(`\nDone! ${TEST_EVENTS.length} events seeded.`);
  console.log(`Admin UID: ${adminUid}`);
  console.log(`User UID: ${userUid}`);
}

main().catch(console.error);
