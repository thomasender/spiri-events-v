#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA',
  authDomain: 'spirieventsvbg.firebaseapp.com',
  projectId: 'spirieventsvbg',
  storageBucket: 'spirieventsvbg.firebasestorage.app',
  messagingSenderId: '54424804895',
  appId: '1:54424804895:web:e9caf19748530550a63f2a',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

const ORGANIZERS = [
  { firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.com' },
  { firstName: 'Max', lastName: 'Mustermann', email: 'max@example.com' },
  { firstName: 'Lisa', lastName: 'Weber', email: 'lisa@example.com' },
  { firstName: 'Thomas', lastName: 'Fischer', email: 'thomas@example.com' },
];

const TEST_EVENTS = [
  { title: 'Yoga Grundkurs', category: 'Yoga', description: 'Einsteigerfreundlicher Yoga Kurs.', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 2, contribution: 'free' },
  { title: 'Meditation für Anfänger', category: 'Meditation', description: 'Einfache Meditationstechniken.', place: 'Meditationsraum Dornbirn', bezirk: 'Dornbirn', dayOffset: 3, contribution: 'free' },
  { title: 'Tanzworkshop Mittelstufe', category: 'Tanz', description: 'Für Teilnehmer mit Vorerfahrung.', place: 'Tanzschule Feldkirch', bezirk: 'Feldkirch', dayOffset: 4, contribution: 'fee', fee: 25 },
  { title: 'Mantrasingen Abend', category: 'Singen', description: 'Entspannendes Singen von Mantras.', place: 'Gemeinschaftsraum Bludenz', bezirk: 'Bludenz', dayOffset: 5, contribution: 'free' },
  { title: 'Atemtherapie Workshop', category: 'Atemarbeit', description: 'Bewusste Atemarbeit für mehr Energie.', place: 'Gesundheitszentrum Bregenz', bezirk: 'Bregenz', dayOffset: 6, contribution: 'fee', fee: 45 },
  { title: 'Vielseitiger Kurs', category: 'Sonstiges', description: 'Ein Kurs für alle, die etwas Neues probieren möchten.', place: 'Kulturhaus Dornbirn', bezirk: 'Dornbirn', dayOffset: 7, contribution: 'fee', fee: 15 },
  { title: 'Yoga in Bregenz', category: 'Yoga', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 8, contribution: 'free' },
  { title: 'Yoga in Dornbirn', category: 'Yoga', place: 'Yoga Loft Dornbirn', bezirk: 'Dornbirn', dayOffset: 9, contribution: 'free' },
  { title: 'Yoga in Feldkirch', category: 'Yoga', place: 'Yogahaus Feldkirch', bezirk: 'Feldkirch', dayOffset: 10, contribution: 'fee', fee: 12 },
  { title: 'Yoga in Bludenz', category: 'Yoga', place: 'Yogaraum Bludenz', bezirk: 'Bludenz', dayOffset: 11, contribution: 'free' },
  { title: 'Yoga Grenznahe', category: 'Yoga', place: 'Yoga am See', bezirk: 'Grenznahe', dayOffset: 12, contribution: 'fee', fee: 18 },
  { title: 'Kostenloser Meditationsabend', category: 'Meditation', place: 'Meditationsraum Bregenz', bezirk: 'Bregenz', dayOffset: 13, contribution: 'free', description: 'Kostenlose Teilnahme, Spenden willkommen.' },
  { title: 'Meditation mit Spende', category: 'Meditation', place: 'Meditationsraum Dornbirn', bezirk: 'Dornbirn', dayOffset: 14, contribution: 'fee', fee: 10, description: 'Empfohlene Spende 10€.' },
  { title: 'Premium Yogakurs', category: 'Yoga', place: 'Premium Yoga Studio Bregenz', bezirk: 'Bregenz', dayOffset: 15, contribution: 'fee', fee: 30, description: 'Hochwertiger Kurs mit persönlicher Betreuung.' },
  { title: 'Meditationsreihe 5er Karte', category: 'Meditation', place: 'Meditationszentrum Feldkirch', bezirk: 'Feldkirch', dayOffset: 16, contribution: 'fee', fee: 50, description: '5er Karte für regelmäßige Teilnahme.' },
  { title: 'Yoga 60 Minuten', category: 'Yoga', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 17, time: '10:00', endTime: '11:00', contribution: 'free' },
  { title: 'Yoga 90 Minuten', category: 'Yoga', place: 'Yogastudio Dornbirn', bezirk: 'Dornbirn', dayOffset: 18, time: '17:30', endTime: '19:00', contribution: 'free' },
  { title: 'Meditation nur Startzeit', category: 'Meditation', place: 'Meditationsraum Bregenz', bezirk: 'Bregenz', dayOffset: 19, time: '07:00', contribution: 'free', description: 'Meditation bis wir fertig sind.' },
  { title: 'Wochenend Yoga Retreat', category: 'Yoga', place: 'Berghütte Bregenz', bezirk: 'Bregenz', dayOffset: 20, endDateOffset: 2, time: '09:00', endTime: '17:00', contribution: 'fee', fee: 150, description: 'Zwei Tage Yoga und Entspannung in den Bergen.' },
  { title: 'Meditationswoche', category: 'Meditation', place: 'Kloster Feldkirch', bezirk: 'Feldkirch', dayOffset: 30, endDateOffset: 4, time: '08:00', endTime: '18:00', contribution: 'fee', fee: 300, description: 'Intensive Meditationswoche mit einfachen Mahlzeiten.' },
  { title: 'Wöchentlicher Yogakurs', category: 'Yoga', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 21, time: '18:00', endTime: '19:30', recurrence: 'weekly', recurrenceEndDateOffset: 70, contribution: 'fee', fee: 80, description: 'Jeden Dienstag, 10 Termine.' },
  { title: 'Zweiwöchentliche Meditation', category: 'Meditation', place: 'Meditationsraum Dornbirn', bezirk: 'Dornbirn', dayOffset: 22, time: '19:00', recurrence: 'biweekly', recurrenceEndDateOffset: 84, contribution: 'free', description: 'Alle zwei Wochen mittwochs.' },
  { title: 'Monatlicher Singkreis', category: 'Singen', place: 'Gemeinschaftsraum Bludenz', bezirk: 'Bludenz', dayOffset: 23, time: '18:30', recurrence: 'monthly', recurrenceEndDateOffset: 90, contribution: 'free', description: 'Monatlicher Treff zum gemeinsamen Singen.' },
  { title: 'Yoga mit Ticketlink', category: 'Yoga', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 24, time: '10:00', contribution: 'fee', fee: 20, link: 'https://tickets.example.com/yoga-bregenz', description: 'Bitte Ticket vorab online buchen.' },
  { title: 'Yoga ohne Link', category: 'Yoga', place: 'Yogastudio Dornbirn', bezirk: 'Dornbirn', dayOffset: 25, time: '10:00', contribution: 'free', description: 'Freie Plätze verfügbar, einfach vorbeikommen.' },
  { title: 'Yoga mit Beschreibung', category: 'Yoga', place: 'Yogastudio Feldkirch', bezirk: 'Feldkirch', dayOffset: 26, time: '17:00', contribution: 'free', description: 'Dieser Kurs bietet eine Einführung in verschiedene Yoga-Stile. Geeignet für alle Level.' },
  { title: 'Yoga ohne Beschreibung', category: 'Yoga', place: 'Yogastudio Bludenz', bezirk: 'Bludenz', dayOffset: 27, time: '17:00', contribution: 'free' },
  { title: 'Yoga Pending', category: 'Yoga', place: 'Yogastudio Bregenz', bezirk: 'Bregenz', dayOffset: 28, contribution: 'free', status: 'pending' },
  { title: 'Meditation Pending', category: 'Meditation', place: 'Meditationsraum Dornbirn', bezirk: 'Dornbirn', dayOffset: 29, contribution: 'fee', fee: 15, status: 'pending', description: 'Wartet auf Genehmigung.' },
  { title: 'Bregenz Veranstaltung', category: 'Meditation', place: 'Bregenz Stadtzentrum', bezirk: 'Bregenz', dayOffset: 35, contribution: 'free' },
  { title: 'Dornbirn Veranstaltung', category: 'Yoga', place: 'Dornbirn Marktplatz', bezirk: 'Dornbirn', dayOffset: 36, contribution: 'free' },
  { title: 'Feldkirch Veranstaltung', category: 'Tanz', place: 'Feldkirch Altstadt', bezirk: 'Feldkirch', dayOffset: 37, contribution: 'fee', fee: 10 },
  { title: 'Bludenz Veranstaltung', category: 'Singen', place: 'Bludenz Stadtpark', bezirk: 'Bludenz', dayOffset: 38, contribution: 'free' },
  { title: 'Grenznahe Veranstaltung', category: 'Atemarbeit', place: 'Lindau Hafen', bezirk: 'Grenznahe', dayOffset: 39, contribution: 'fee', fee: 25 },
  { title: 'Kurzfrist Event Morgen', category: 'Sonstiges', place: 'Zentrum Bregenz', bezirk: 'Bregenz', dayOffset: 1, time: '14:00', contribution: 'free', description: 'Kurzfristig organisierter Treff.' },
  { title: 'Langfrist Planung', category: 'Meditation', place: 'Kloster Bregenz', bezirk: 'Bregenz', dayOffset: 60, endDateOffset: 62, time: '09:00', endTime: '16:00', contribution: 'fee', fee: 200, description: 'Mehrtägiges Retreat, frühzeitige Anmeldung empfohlen.' },
  { title: 'Tanz Event Grenznahe', category: 'Tanz', place: 'Lindau Yachtclub', bezirk: 'Grenznahe', dayOffset: 40, time: '20:00', endTime: '23:00', contribution: 'fee', fee: 35, description: 'Tanzabend am See mit Live Musik.' },
];

function buildEvent(template, index) {
  const date = makeDate(template.dayOffset);
  const endDate = template.endDateOffset ? makeDate(template.endDateOffset) : null;
  const recurrenceEndDate = template.recurrenceEndDateOffset ? makeDate(template.recurrenceEndDateOffset) : null;
  const organizer = ORGANIZERS[index % ORGANIZERS.length];

  return {
    title: template.title,
    date,
    time: template.time || null,
    endTime: template.endTime || null,
    endDate: endDate || null,
    place: template.place,
    contribution: template.contribution || 'free',
    fee: template.fee || null,
    description: template.description || null,
    link: template.link || null,
    category: template.category,
    bezirk: template.bezirk,
    recurrence: template.recurrence || 'none',
    recurrenceEndDate: recurrenceEndDate || null,
    organizer,
    kontakt: organizer.email,
    status: template.status || 'approved',
  };
}

async function deleteAllEvents() {
  console.log('Deleting all existing events from production...');
  const snapshot = await getDocs(collection(db, 'events'));

  if (snapshot.empty) {
    console.log('No existing events found.');
    return;
  }

  let deleted = 0;
  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(db, 'events', docSnap.id));
    deleted++;
  }
  console.log(`Deleted ${deleted} events.`);
}

async function main() {
  console.log('Seeding events to PRODUCTION Firestore...');
  console.log(`Current date: ${today.toISOString().split('T')[0]}`);
  console.log('');

  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'thomas@blissofkundalini.yoga', 'thegreatbhujanga');
  console.log('Signed in successfully.\n');

  await deleteAllEvents();
  console.log('');

  console.log('Seeding new events...');
  const builtEvents = TEST_EVENTS.map((template, i) => buildEvent(template, i));

  for (let i = 0; i < builtEvents.length; i++) {
    const event = builtEvents[i];
    const slug = generateSlug(event.title, event.place, event.date);
    await addDoc(collection(db, 'events'), {
      ...event,
      slug,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    const feeStr = event.contribution === 'free' ? 'free' : `${event.fee}€`;
    const recStr = event.recurrence !== 'none' ? ` [${event.recurrence}]` : '';
    const multiStr = event.endDate ? ' (multi-day)' : '';
    console.log(`  [${i + 1}/${builtEvents.length}] ${event.title} (${event.date}) - ${event.category} / ${event.bezirk} - ${feeStr}${recStr}${multiStr}`);
  }

  console.log(`\nDone! ${builtEvents.length} events seeded to production.`);
}

main().catch((err) => {
  console.error('Error:', err.code, err.message);
  process.exit(1);
});
