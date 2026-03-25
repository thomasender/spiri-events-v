import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA",
  authDomain: "spirieventsvbg.firebaseapp.com",
  projectId: "spirieventsvbg",
  storageBucket: "spirieventsvbg.firebasestorage.app",
  messagingSenderId: "54424804895",
  appId: "1:54424804895:web:e9caf19748530550a63f2a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const events = [
  {
    title: "Morgen-Yoga im Park",
    date: "2026-03-26",
    time: "07:00",
    endDate: "",
    place: "Park am Bodensee, Seestraße 1, 6900 Bregenz",
    contribution: "free",
    fee: null,
    description: "Beginne deinen Tag mit einer sanften Yoga-Flow Sequenz im Freien. Geeignet für alle Level. Bitte eine Matte mitbringen. Bei jedem Wetter — bei Regen treffen wir uns im nahen Pavillon.",
    link: "https://yoga-vorarlberg.at",
    createdBy: "demo-user"
  },
  {
    title: "Herzöffnende Kirtan Nacht",
    date: "2026-03-26",
    time: "19:30",
    endDate: "",
    place: "Yoga Studio Mitte, Stadtstraße 12, 6900 Bregenz",
    contribution: "fee",
    fee: 18,
    description: "Eine magische Nacht voller Mantras und spiritueller Musik. Shanti Devi und ihre Band führen uns durch traditionelle und moderne Kirtans. Komm mit offenem Herzen und singe aus voller Kehle!",
    link: "https://kirtan-vorarlberg.at",
    createdBy: "demo-user"
  },
  {
    title: "Ecstatic Dance Bregenz",
    date: "2026-03-27",
    time: "20:00",
    endDate: "2026-03-28",
    place: "Kulturhaus Dornbirn, Rotes Haus, Marktstraße 5, 6850 Dornbirn",
    contribution: "fee",
    fee: 20,
    description: "Tanzen bis die Seele fliegt — eine achtsame Tanzreise durch verschiedene Rhythmen. Keine Choreografie, keine Bewertung. Lass deinen Körper führen. DJ Solar Flow eröffnet die Reise.",
    link: "",
    createdBy: "demo-user"
  },
  {
    title: "Singing Circle — Stimme & Stille",
    date: "2026-03-27",
    time: "10:00",
    endDate: "",
    place: "Atelier am See, Kirchstraße 8, 6911 Lochau",
    contribution: "fee",
    fee: 25,
    description: "Eine 3-stündige Reise in die Welt des spontanen Singens. Wir erkunden Vocal Impro, Overtones und gemeinsames Summen. Keine Singerfahrung nötig — nur der Mut, die eigene Stimme leben zu lassen.",
    link: "https://singingcircle.at",
    createdBy: "demo-user"
  },
  {
    title: "Achtsamkeits-Meditation für Anfänger",
    date: "2026-03-27",
    time: "17:30",
    endDate: "",
    place: "Meditationszentrum Feldkirch, Neustadt 22, 6800 Feldkirch",
    contribution: "free",
    fee: null,
    description: "Einführung in die Grundlagen der Achtsamkeitsmeditation. Atemübungen, Körper-Scan und geführte Meditation. Ideal für alle, die впер mit Meditation starten möchten.",
    link: "",
    createdBy: "demo-user"
  },
  {
    title: "Yin Yoga & Sound Healing",
    date: "2026-03-28",
    time: "16:00",
    endDate: "",
    place: "Gandhi Hall, Reichsstraße 100, 6800 Feldkirch",
    contribution: "fee",
    fee: 30,
    description: "Tiefe Dehnung in stillen Yin Yoga Positionen, während Kristall-Singingbowls und ein Rainmaker einen ambienten Klangteppich weben. Eine Stunde tiefer Entspannung für Körper und Geist.",
    link: "https://yinyoga-vorarlberg.at",
    createdBy: "demo-user"
  },
  {
    title: "Handpan Workshop für Einsteiger",
    date: "2026-03-28",
    time: "11:00",
    endDate: "",
    place: "Musikstudio Hohenems, Sparkassenstraße 5, 6845 Hohenems",
    contribution: "fee",
    fee: 45,
    description: "Lerne die magischen Klänge des Handpans kennen. Wir erkunden die Grundtöne, spielen einfache Rhythmen und improvisieren gemeinsam. Instrumente werden gestellt. Max. 8 Teilnehmer.",
    link: "https://handpan-vorarlberg.at",
    createdBy: "demo-user"
  },
  {
    title: "Full Moon Meditation am See",
    date: "2026-03-28",
    time: "20:30",
    endDate: "",
    place: "Uferpromenade Lindau, Bismarckplatz 1, 88131 Lindau (DE)",
    contribution: "free",
    fee: null,
    description: "Wir meditieren gemeinsam im Licht des fast-vollen Mondes. Geführte Visualisierung, Pranayama Atemübungen und gemeinsames OM-Singen. Decke und warme Getränke werden bereitgestellt.",
    link: "",
    createdBy: "demo-user"
  },
  {
    title: "Trauma-sensible Yoga Sequenz",
    date: "2026-03-26",
    time: "18:00",
    endDate: "",
    place: "Therapiepraxis am Berg, Haldenstraße 15, 6850 Dornbirn",
    contribution: "fee",
    fee: 22,
    description: "Ein achtsamer Yoga-Kurs für Menschen mit Trauma-Erfahrung. Sanfte, fließende Bewegungen, lange Haltezeiten und viel Raum für das Nervensystem. Angeleitet von einer zertifizierten Trauma-Yoga Therapeutin.",
    link: "https://trauma-yoga.at",
    createdBy: "demo-user"
  },
  {
    title: "Nia Tanz — Freude am Bewegen",
    date: "2026-03-27",
    time: "09:30",
    endDate: "",
    place: "Tanzstudio Bludenz,illerstraße 14, 6700 Bludenz",
    contribution: "fee",
    fee: 15,
    description: "Nia verbindet Tanz, Martial Arts und Healing Arts zu einem fließenden, freudvollen Workout. Barefoot Dance trifft auf Jazz, Contemporary und Blues. Für alle, die ihren Körper lieben lernen wollen.",
    link: "https://nia-vorarlberg.at",
    createdBy: "demo-user"
  }
];

async function addEvents() {
  try {
    // Sign in first
    await signInWithEmailAndPassword(auth, "thomas@blissofkundalini.yoga", "bhujanga");

    for (const event of events) {
      await addDoc(collection(db, "events"), {
        ...event,
        createdAt: serverTimestamp()
      });
      console.log(`Added: ${event.title}`);
    }

    console.log("\nAll 10 events added successfully!");
  } catch (err) {
    console.error("Error:", err.code, err.message);
    process.exit(1);
  }
}

addEvents();
