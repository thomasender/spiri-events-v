// Tribe-Weihnachtsfeier page (`/weihnachtsfeier`). Pure logic, no Firebase imports.
//
// Data: `site_pages/weihnachtsfeier` { published, content, updatedAt, updatedBy } and
// `site_pages/weihnachtsfeier/registrations/{id}`. While `published` is false only
// Super-Admins can read the page (everybody else gets the normal "not found" page) and
// nothing on the site links to it.

export const CHRISTMAS_PAGE_ID = 'weihnachtsfeier';
export const CHRISTMAS_PATH = '/weihnachtsfeier';
export const CHRISTMAS_CAPACITY = 80;

export const MAX_PERSONS = 10;
export const MAX_BRING_ITEMS = 10;
export const MAX_STEPS = 12;
export const MAX_IDEAS = 16;

const SHORT = 120;
const LONG = 1200;

export const DEFAULT_CONTENT = {
  eyebrow: 'Dein Tribe · Get-together',
  title: 'Tribe-Weihnachtsfeier',
  intro:
    'Eine gemeinsame Weihnachtsfeier für den gesamten Tribe: Veranstalter und Teilnehmer begegnen einander, teilen Essen und erleben Gemeinschaft.',
  dateLabel: 'Sonntag, 13. Dezember 2026',
  timeLabel: '14:00–18:00 Uhr',
  place: 'Gelbe Fabrik',
  placeNote: 'Widagasse 11, 6850 Dornbirn',
  capacityLabel: 'Maximal 80 Personen',
  capacityNote:
    'Das ist eine vorläufige Grenze. Anmeldung erforderlich. Je nach Anmeldezahlen und bestätigter Ausstattung kann die Grenze überprüft werden.',
  flyerUrl: '',
  bringTitle: 'Potpourri & Mitbringliste',
  bringText:
    'Jeder bringt nach Möglichkeit etwas zum gemeinsamen Potpourri mit. Bei der Anmeldung trägst du ein, was du mitbringen möchtest, damit ein Überblick entsteht. Eigene Ideen sind willkommen.',
  bringIdeas: ['Hummus', 'Brot', 'Kekse', 'Salat'],
  scheduleTitle: 'Ablauf',
  steps: [
    {
      title: 'Ankommen',
      text: 'Begrüßung, lockerer Einstieg, Getränke und Buffetbeiträge abstellen.',
    },
    {
      title: 'Begegnung',
      text: 'Gesprächsrunden in Gruppen von vier Personen mit zwei bis drei Impulsfragen, z. B. „Was nimmst du aus 2026 mit?“ oder „Welche Begegnung hat dich dieses Jahr bereichert?“',
    },
    {
      title: 'Gemeinsame Wertschätzung im Plenum',
      text: 'Danach stellen jeweils zwei Personen ihren Gesprächspartner vor der gesamten Gruppe in drei Worten vor.',
    },
    {
      title: 'Tribe-Moment',
      text: 'Peter, Thomas und Jana präsentieren gemeinsam die Entstehung von Dein Tribe, einen Rückblick auf die letzten Monate, die Vision und die nächsten Entwicklungsschritte.',
    },
    {
      title: 'Gemeinsames Essen',
      text: 'Offenes Potpourri, Musik im Hintergrund, freier Austausch und entspanntes Zusammensein.',
    },
  ],
  travelTitle: 'Anreise',
  addressText: 'Die Gelbe Fabrik\nWidagasse 11\n6850 Dornbirn',
  trainTitle: 'Mit dem Zug',
  trainText: 'Vom Bahnhof Dornbirn sind es zu Fuß etwa 10 Minuten.',
  carTitle: 'Mit dem Auto',
  carText: 'Kostenlose Parkplätze gibt es direkt am Haus. Bildet gern Fahrgemeinschaften.',
  travelNote:
    'Du suchst eine Mitfahrgelegenheit oder hast noch Platz im Auto? Schreib es bei der Anmeldung in die Anmerkung.',
  formTitle: 'Anmeldung',
  formIntro: 'Sag uns kurz, wer kommt und was du zum Potpourri mitbringst.',
  thanksTitle: 'Danke für deine Anmeldung!',
  // Shown only after the registration (not on the flyer / the page itself).
  thanksText:
    'Bitte bring zusätzlich deine eigenen Getränke, einen Teller oder eine Schüssel, ein Glas oder eine Trinkflasche sowie Besteck mit. Alle weiteren Details bekommst du von uns.',
};

const STRING_KEYS = [
  'eyebrow',
  'title',
  'dateLabel',
  'timeLabel',
  'place',
  'placeNote',
  'capacityLabel',
  'bringTitle',
  'scheduleTitle',
  'travelTitle',
  'trainTitle',
  'carTitle',
  'formTitle',
  'thanksTitle',
];
const TEXT_KEYS = [
  'intro',
  'capacityNote',
  'bringText',
  'addressText',
  'trainText',
  'carText',
  'travelNote',
  'formIntro',
  'thanksText',
];

export const CONTENT_KEYS = [...STRING_KEYS, ...TEXT_KEYS, 'flyerUrl', 'bringIdeas', 'steps'];

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Stored content merged over the defaults: a missing or malformed field falls
 * back to the default so the page can never render broken.
 */
export function mergeContent(stored) {
  const src = stored && typeof stored === 'object' ? stored : {};
  const out = { ...DEFAULT_CONTENT };
  for (const key of STRING_KEYS) {
    if (typeof src[key] === 'string') out[key] = src[key].slice(0, SHORT);
  }
  for (const key of TEXT_KEYS) {
    if (typeof src[key] === 'string') out[key] = src[key].slice(0, LONG);
  }
  if (typeof src.flyerUrl === 'string') out.flyerUrl = src.flyerUrl;
  if (Array.isArray(src.bringIdeas)) {
    out.bringIdeas = src.bringIdeas
      .filter((x) => typeof x === 'string')
      .map((x) => x.slice(0, 60))
      .slice(0, MAX_IDEAS);
  }
  if (Array.isArray(src.steps)) {
    out.steps = src.steps
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        title: typeof s.title === 'string' ? s.title.slice(0, SHORT) : '',
        text: typeof s.text === 'string' ? s.text.slice(0, LONG) : '',
      }))
      .slice(0, MAX_STEPS);
  }
  return out;
}

/** What is written to Firestore: trimmed, limited, empty ideas / steps dropped. */
export function sanitizeContent(content) {
  const c = mergeContent(content);
  const out = {};
  for (const key of STRING_KEYS) out[key] = clean(c[key], SHORT);
  for (const key of TEXT_KEYS) out[key] = clean(c[key], LONG);
  out.flyerUrl = typeof c.flyerUrl === 'string' ? c.flyerUrl : '';
  out.bringIdeas = c.bringIdeas.map((x) => clean(x, 60)).filter(Boolean);
  out.steps = c.steps
    .map((s) => ({ title: clean(s.title, SHORT), text: clean(s.text, LONG) }))
    .filter((s) => s.title || s.text);
  return out;
}

export function contentEquals(a, b) {
  return JSON.stringify(sanitizeContent(a)) === JSON.stringify(sanitizeContent(b));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d][\d\s()/.-]{5,}$/;

/**
 * Validates the registration form. Returns { ok, errors, value }; `value` is
 * exactly what is stored (and what the Firestore rule accepts).
 */
export function validateRegistration(input) {
  const errors = {};
  const name = clean(input?.name, 100);
  const contact = clean(input?.contact, 200);
  const persons = Number(input?.persons);
  const note = clean(input?.note, 500);
  const seen = new Set();
  const bring = (Array.isArray(input?.bring) ? input.bring : [])
    .map((x) => clean(x, 80))
    .filter((x) => {
      const key = x.toLowerCase();
      if (!x || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_BRING_ITEMS);

  if (!name) errors.name = 'Bitte gib deinen Namen an.';
  if (!contact) errors.contact = 'Bitte gib eine E-Mail-Adresse oder Telefonnummer an.';
  else if (!EMAIL.test(contact) && !PHONE.test(contact)) {
    errors.contact = 'Das sieht nicht nach einer E-Mail-Adresse oder Telefonnummer aus.';
  }
  if (!Number.isInteger(persons) || persons < 1 || persons > MAX_PERSONS) {
    errors.persons = `Bitte wähle 1 bis ${MAX_PERSONS} Personen.`;
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, contact, persons, bring, note },
  };
}

/** Total head count and, per item, who brings what. */
export function summarizeRegistrations(list) {
  const persons = list.reduce((sum, r) => sum + (Number(r.persons) || 0), 0);
  const bring = new Map();
  for (const r of list) {
    for (const item of r.bring || []) {
      const key = String(item).trim().toLowerCase();
      if (!key) continue;
      const entry = bring.get(key) || { label: item, count: 0 };
      entry.count += 1;
      bring.set(key, entry);
    }
  }
  return {
    registrations: list.length,
    persons,
    bring: [...bring.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

const csvCell = (v) => {
  let s = String(v ?? '');
  // Spreadsheet formula injection: a cell never starts with = + - @.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function registrationsToCsv(list) {
  const rows = [['Name', 'Kontakt', 'Personen', 'Bringt mit', 'Anmerkung', 'Angemeldet am']];
  for (const r of list) {
    const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('de-AT') : '';
    rows.push([r.name, r.contact, r.persons, (r.bring || []).join(', '), r.note || '', date]);
  }
  return rows.map((row) => row.map(csvCell).join(';')).join('\n');
}
